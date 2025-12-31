import 'dotenv/config';
import express from 'express';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth, MessageMedia } = pkg;
import QRCode from 'qrcode';
import fs from 'fs';
import sqlite3 from 'sqlite3';
import multer from 'multer';
import nodemailer from 'nodemailer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Configuração de diretórios
const DATA_DIR = process.env.DATA_PATH || path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const AUTH_DIR = path.join(DATA_DIR, 'whatsapp_auth');
const DB_PATH = path.join(DATA_DIR, 'consultas.db');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

// Configuração Multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, UPLOADS_DIR) },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const cleanName = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
    cb(null, uniqueSuffix + '-' + cleanName)
  }
})
const upload = multer({ storage: storage });

const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS companies (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, docNumber TEXT, type TEXT, email TEXT, whatsapp TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT, status TEXT, priority TEXT, color TEXT, dueDate TEXT, companyId INTEGER, recurrence TEXT, dayOfWeek TEXT, recurrenceDate TEXT, targetCompanyType TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS document_status (id INTEGER PRIMARY KEY AUTOINCREMENT, companyId INTEGER, category TEXT, competence TEXT, status TEXT, UNIQUE(companyId, category, competence))`);
  db.run(`CREATE TABLE IF NOT EXISTS sent_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, companyName TEXT, docName TEXT, category TEXT, sentAt TEXT, channels TEXT, status TEXT)`);
});

// Configuração Nodemailer (Exatamente como seu Python: SSL na porta 465)
const emailTransporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, // true para porta 465
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// WhatsApp Config
const puppeteerExecutablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: AUTH_DIR }),
  puppeteer: {
    headless: true,
    executablePath: puppeteerExecutablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-accelerated-2d-canvas', '--no-first-run', '--no-zygote', '--disable-gpu'],
  },
  webVersionCache: { type: "remote", remotePath: "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html" }
});

let qrCodeData = null;
let clientReady = false;

client.on('qr', (qr) => { QRCode.toDataURL(qr, (err, url) => { qrCodeData = url; }); });
client.on('ready', () => { clientReady = true; qrCodeData = null; console.log("WhatsApp Pronto"); });
client.on('disconnected', () => { clientReady = false; console.log("WhatsApp Desconectado"); });
client.initialize().catch((err) => console.error("Erro WhatsApp:", err));

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'dist')));

// --- API ---

app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo' });
    res.json({ filename: req.file.filename, originalName: req.file.originalname });
});

app.post('/api/send-documents', async (req, res) => {
    const { documents, subject, messageBody, channels } = req.body;
    let successCount = 0;
    let errors = [];
    let sentIds = []; // Array para armazenar IDs dos documentos enviados com sucesso

    console.log(`Iniciando envio de ${documents.length} documentos...`);

    for (const doc of documents) {
        try {
            // Verifica arquivo físico
            const filePath = path.join(UPLOADS_DIR, doc.serverFilename);
            if (!fs.existsSync(filePath)) {
                const msg = `Arquivo não encontrado no servidor: ${doc.serverFilename}`;
                console.error(msg);
                errors.push(msg);
                continue;
            }

            const company = await new Promise((resolve, reject) => {
                db.get("SELECT * FROM companies WHERE id = ?", [doc.companyId], (err, row) => {
                    if (err) reject(err); else resolve(row);
                });
            });

            if (!company) {
                errors.push(`Empresa ID ${doc.companyId} não encontrada.`);
                continue;
            }

            // 1. E-mail (Lógica Python portada)
            if (channels.email && company.email) {
                try {
                    await emailTransporter.sendMail({
                        from: process.env.EMAIL_USER,
                        to: company.email,
                        subject: subject,
                        text: messageBody,
                        html: messageBody.replace(/\n/g, '<br>'),
                        attachments: [{ filename: doc.docName, path: filePath }]
                    });
                    console.log(`E-mail enviado para ${company.email}`);
                } catch (e) {
                    const msg = `Erro Email ${company.name}: ${e.message}`;
                    console.error(msg);
                    errors.push(msg);
                    // Se falhar o email mas tiver whatsapp, tentamos o whatsapp. 
                    // Se falhar ambos ou só tinha email, considera erro no envio do doc?
                    // Por enquanto, se o canal foi solicitado e falhou, loga erro.
                }
            }

            // 2. WhatsApp
            if (channels.whatsapp && company.whatsapp && clientReady) {
                try {
                    let number = company.whatsapp.replace(/\D/g, '');
                    if (!number.startsWith('55')) number = '55' + number;
                    const media = MessageMedia.fromFilePath(filePath);
                    media.filename = doc.docName;
                    await client.sendMessage(`${number}@c.us`, media, { caption: subject });
                    console.log(`WhatsApp enviado para ${number}`);
                } catch (e) {
                    const msg = `Erro Zap ${company.name}: ${e.message}`;
                    console.error(msg);
                    errors.push(msg);
                }
            }

            // Registrar Log
            db.run(`INSERT INTO sent_logs (companyName, docName, category, sentAt, channels, status) VALUES (?, ?, ?, datetime('now', 'localtime'), ?, 'success')`, 
                [company.name, doc.docName, doc.category, JSON.stringify(channels)]);
            
            // Atualizar status
            db.run(`INSERT INTO document_status (companyId, category, competence, status) VALUES (?, ?, ?, 'sent') ON CONFLICT(companyId, category, competence) DO UPDATE SET status='sent'`, 
                [doc.companyId, doc.category, doc.competence]);

            // Assume sucesso se pelo menos tentou processar e não explodiu antes
            // (Melhoria: considerar sucesso apenas se enviou por pelo menos 1 canal solicitado)
            successCount++;
            
            // Se o documento veio do frontend, ele pode ter um ID temporário ou real.
            // Retornamos o ID que o frontend nos enviou para ele dar baixa na lista.
            if (doc.id) {
                sentIds.push(doc.id);
            }

        } catch (e) {
            console.error(`Erro fatal processando doc:`, e);
            errors.push(e.message);
        }
    }

    res.json({ success: true, sent: successCount, sentIds, errors });
});

// Endpoint corrigido para retornar apenas os ultimos 5
app.get('/api/recent-sends', (req, res) => {
    db.all("SELECT * FROM sent_logs ORDER BY id DESC LIMIT 5", (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

// Tasks
app.get('/api/tasks', (req, res) => {
    db.all('SELECT * FROM tasks', (err, rows) => res.json(rows || []));
});
app.post('/api/tasks', (req, res) => {
    const t = req.body;
    if (t.id && t.id < 1000000000000) {
        db.run(`UPDATE tasks SET title=?, description=?, status=?, priority=?, color=?, dueDate=?, companyId=?, recurrence=?, dayOfWeek=?, recurrenceDate=?, targetCompanyType=? WHERE id=?`, 
        [t.title, t.description, t.status, t.priority, t.color, t.dueDate, t.companyId, t.recurrence, t.dayOfWeek, t.recurrenceDate, t.targetCompanyType, t.id], 
        function(err) { res.json({ success: !err, id: t.id }); });
    } else {
        db.run(`INSERT INTO tasks (title, description, status, priority, color, dueDate, companyId, recurrence, dayOfWeek, recurrenceDate, targetCompanyType) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
        [t.title, t.description, t.status, t.priority, t.color, t.dueDate, t.companyId, t.recurrence, t.dayOfWeek, t.recurrenceDate, t.targetCompanyType], 
        function(err) { res.json({ success: !err, id: this.lastID }); });
    }
});
app.delete('/api/tasks/:id', (req, res) => { db.run('DELETE FROM tasks WHERE id = ?', [req.params.id], (err) => res.json({ success: !err })); });

// Companies
app.get('/api/companies', (req, res) => { db.all('SELECT * FROM companies ORDER BY name ASC', (err, rows) => res.json(rows || [])); });
app.post('/api/companies', (req, res) => {
    const { id, name, docNumber, type, email, whatsapp } = req.body;
    if (id) db.run(`UPDATE companies SET name=?, docNumber=?, type=?, email=?, whatsapp=? WHERE id=?`, [name, docNumber, type, email, whatsapp, id], function() { res.json({success: true, id}) });
    else db.run(`INSERT INTO companies (name, docNumber, type, email, whatsapp) VALUES (?, ?, ?, ?, ?)`, [name, docNumber, type, email, whatsapp], function() { res.json({success: true, id: this.lastID}) });
});
app.delete('/api/companies/:id', (req, res) => { db.run('DELETE FROM companies WHERE id = ?', [req.params.id], (err) => res.json({ success: !err })); });

// Docs Status
app.get('/api/documents/status', (req, res) => {
    const sql = req.query.competence ? 'SELECT * FROM document_status WHERE competence = ?' : 'SELECT * FROM document_status';
    db.all(sql, req.query.competence ? [req.query.competence] : [], (err, rows) => res.json(rows || []));
});
app.post('/api/documents/status', (req, res) => {
    const { companyId, category, competence, status } = req.body;
    db.run(`INSERT INTO document_status (companyId, category, competence, status) VALUES (?, ?, ?, ?) ON CONFLICT(companyId, category, competence) DO UPDATE SET status = excluded.status`, [companyId, category, competence, status], (err) => res.json({ success: !err }));
});

// WA Status
app.get('/api/whatsapp/status', (req, res) => { res.json({ status: clientReady ? 'connected' : 'disconnected', qr: qrCodeData, info: client.info }); });
app.post('/api/whatsapp/disconnect', async (req, res) => { try { await client.logout(); await client.initialize(); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); } });

app.get(/.*/, (req, res) => {
    if (!req.path.startsWith('/api')) res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(port, () => console.log(`Server running at http://localhost:${port}`));