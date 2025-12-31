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

// Configuração Nodemailer
const emailTransporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
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

// --- Helper HTML Builder ---
const buildEmailHtml = (messageBody, documents, emailSignature) => {
    let docsTable = '';
    
    if (documents && documents.length > 0) {
        // Sort by dueDate roughly
        const sortedDocs = [...documents].sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
        
        let rows = '';
        sortedDocs.forEach(doc => {
            rows += `
                <tr style="border-bottom: 1px solid #eee;">
                    <td style="padding: 10px; color: #333;">${doc.docName}</td>
                    <td style="padding: 10px; color: #555;">${doc.category}</td>
                    <td style="padding: 10px; color: #555;">${doc.dueDate || 'N/A'}</td>
                    <td style="padding: 10px; color: #555;">${doc.competence}</td>
                </tr>
            `;
        });

        docsTable = `
            <h3 style="color: #2c3e50; border-bottom: 2px solid #eff6ff; padding-bottom: 10px; margin-top: 30px; font-size: 16px;">Documentos em Anexo:</h3>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px;">
                <thead>
                    <tr style="background-color: #f8fafc; color: #64748b;">
                        <th style="padding: 10px; text-align: left; border-bottom: 2px solid #e2e8f0;">Documento</th>
                        <th style="padding: 10px; text-align: left; border-bottom: 2px solid #e2e8f0;">Categoria</th>
                        <th style="padding: 10px; text-align: left; border-bottom: 2px solid #e2e8f0;">Vencimento</th>
                        <th style="padding: 10px; text-align: left; border-bottom: 2px solid #e2e8f0;">Competência</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
        `;
    }

    return `
    <html>
        <body style="font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f4; margin: 0; padding: 20px;">
            <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
                
                <div style="background-color: #f8f9fa; padding: 20px; border-radius: 6px; border-left: 4px solid #2563eb; margin-bottom: 25px;">
                    ${messageBody.replace(/\n/g, '<br>')}
                </div>
                
                ${docsTable}
                
                <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 14px; color: #64748b;">
                    ${emailSignature || ''}
                </div>
            </div>
        </body>
    </html>
    `;
};

// --- API ---

app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo' });
    res.json({ filename: req.file.filename, originalName: req.file.originalname });
});

app.post('/api/send-documents', async (req, res) => {
    const { documents, subject, messageBody, channels, emailSignature } = req.body;
    let successCount = 0;
    let errors = [];
    let sentIds = [];

    console.log(`Iniciando envio. ${documents.length} documentos recebidos.`);

    // 1. Agrupar documentos por CompanyID para enviar 1 email por empresa
    const docsByCompany = documents.reduce((acc, doc) => {
        if (!acc[doc.companyId]) acc[doc.companyId] = [];
        acc[doc.companyId].push(doc);
        return acc;
    }, {});

    const companyIds = Object.keys(docsByCompany);
    console.log(`Empresas distintas para envio: ${companyIds.length}`);

    for (const companyId of companyIds) {
        const companyDocs = docsByCompany[companyId];
        
        try {
            // Buscar dados da empresa
            const company = await new Promise((resolve, reject) => {
                db.get("SELECT * FROM companies WHERE id = ?", [companyId], (err, row) => {
                    if (err) reject(err); else resolve(row);
                });
            });

            if (!company) {
                errors.push(`Empresa ID ${companyId} não encontrada.`);
                continue;
            }

            // Preparar Anexos físicos
            const validAttachments = [];
            for (const doc of companyDocs) {
                const filePath = path.join(UPLOADS_DIR, doc.serverFilename);
                if (fs.existsSync(filePath)) {
                    validAttachments.push({
                        filename: doc.docName,
                        path: filePath,
                        contentType: 'application/pdf' // Assume PDF based on prompt logic, or auto-detect
                    });
                } else {
                    console.error(`Arquivo físico não encontrado: ${filePath}`);
                    errors.push(`Arquivo sumiu: ${doc.docName} (${company.name})`);
                }
            }

            if (validAttachments.length === 0 && companyDocs.length > 0) {
                 errors.push(`Sem anexos válidos para ${company.name}, pulando envio.`);
                 continue;
            }

            // --- Envio E-MAIL ---
            if (channels.email && company.email) {
                try {
                    const finalHtml = buildEmailHtml(messageBody, companyDocs, emailSignature);
                    const finalSubject = `${subject} - Competência: ${companyDocs[0].competence}`; // Usa competência do primeiro doc

                    await emailTransporter.sendMail({
                        from: process.env.EMAIL_USER,
                        to: company.email,
                        subject: finalSubject,
                        html: finalHtml,
                        attachments: validAttachments
                    });
                    console.log(`E-mail (agrupado) enviado para ${company.email}`);
                } catch (e) {
                    const msg = `Erro Email ${company.name}: ${e.message}`;
                    console.error(msg);
                    errors.push(msg);
                }
            }

            // --- Envio WHATSAPP ---
            // WhatsApp Web.js não suporta envio de múltiplos arquivos em 1 mensagem facilmente como anexo agrupado.
            // Enviaremos 1 mensagem de texto + N arquivos.
            if (channels.whatsapp && company.whatsapp && clientReady) {
                try {
                    let number = company.whatsapp.replace(/\D/g, '');
                    if (!number.startsWith('55')) number = '55' + number;
                    const chatId = `${number}@c.us`;

                    // 1. Mensagem de texto
                    await client.sendMessage(chatId, `${subject}\n\n${messageBody}`);

                    // 2. Arquivos
                    for (const att of validAttachments) {
                        const media = MessageMedia.fromFilePath(att.path);
                        media.filename = att.filename;
                        await client.sendMessage(chatId, media);
                        // Pequeno delay para evitar flood/block
                        await new Promise(r => setTimeout(r, 1000));
                    }
                    console.log(`WhatsApp enviado para ${number}`);
                } catch (e) {
                    const msg = `Erro Zap ${company.name}: ${e.message}`;
                    console.error(msg);
                    errors.push(msg);
                }
            }

            // --- PÓS ENVIO (Logs e Status) ---
            for (const doc of companyDocs) {
                // Registrar Log Individual
                db.run(`INSERT INTO sent_logs (companyName, docName, category, sentAt, channels, status) VALUES (?, ?, ?, datetime('now', 'localtime'), ?, 'success')`, 
                    [company.name, doc.docName, doc.category, JSON.stringify(channels)]);
                
                // Atualizar status
                db.run(`INSERT INTO document_status (companyId, category, competence, status) VALUES (?, ?, ?, 'sent') ON CONFLICT(companyId, category, competence) DO UPDATE SET status='sent'`, 
                    [doc.companyId, doc.category, doc.competence]);

                if (doc.id) sentIds.push(doc.id);
                successCount++;
            }

        } catch (e) {
            console.error(`Erro processando empresa ${companyId}:`, e);
            errors.push(`Falha geral empresa ${companyId}: ${e.message}`);
        }
    }

    res.json({ success: true, sent: successCount, sentIds, errors });
});

app.get('/api/recent-sends', (req, res) => {
    db.all("SELECT * FROM sent_logs ORDER BY id DESC LIMIT 5", (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

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

app.get('/api/companies', (req, res) => { db.all('SELECT * FROM companies ORDER BY name ASC', (err, rows) => res.json(rows || [])); });
app.post('/api/companies', (req, res) => {
    const { id, name, docNumber, type, email, whatsapp } = req.body;
    if (id) db.run(`UPDATE companies SET name=?, docNumber=?, type=?, email=?, whatsapp=? WHERE id=?`, [name, docNumber, type, email, whatsapp, id], function() { res.json({success: true, id}) });
    else db.run(`INSERT INTO companies (name, docNumber, type, email, whatsapp) VALUES (?, ?, ?, ?, ?)`, [name, docNumber, type, email, whatsapp], function() { res.json({success: true, id: this.lastID}) });
});
app.delete('/api/companies/:id', (req, res) => { db.run('DELETE FROM companies WHERE id = ?', [req.params.id], (err) => res.json({ success: !err })); });

app.get('/api/documents/status', (req, res) => {
    const sql = req.query.competence ? 'SELECT * FROM document_status WHERE competence = ?' : 'SELECT * FROM document_status';
    db.all(sql, req.query.competence ? [req.query.competence] : [], (err, rows) => res.json(rows || []));
});
app.post('/api/documents/status', (req, res) => {
    const { companyId, category, competence, status } = req.body;
    db.run(`INSERT INTO document_status (companyId, category, competence, status) VALUES (?, ?, ?, ?) ON CONFLICT(companyId, category, competence) DO UPDATE SET status = excluded.status`, [companyId, category, competence, status], (err) => res.json({ success: !err }));
});

app.get('/api/whatsapp/status', (req, res) => { res.json({ status: clientReady ? 'connected' : 'disconnected', qr: qrCodeData, info: client.info }); });
app.post('/api/whatsapp/disconnect', async (req, res) => { try { await client.logout(); await client.initialize(); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); } });

app.get(/.*/, (req, res) => {
    if (!req.path.startsWith('/api')) res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(port, () => console.log(`Server running at http://localhost:${port}`));