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
import { v4 as uuidv4 } from 'uuid';
import nodemailer from 'nodemailer';
import multer from 'multer';

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

const db = new sqlite3.Database(DB_PATH);

// Configuração Multer para uploads temporários
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    docNumber TEXT,
    type TEXT,
    email TEXT,
    whatsapp TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT,
    priority TEXT,
    color TEXT,
    dueDate TEXT,
    companyId INTEGER,
    recurrence TEXT,
    dayOfWeek TEXT,
    recurrenceDate TEXT,
    targetCompanyType TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS document_status (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    companyId INTEGER,
    category TEXT,
    competence TEXT,
    status TEXT,
    UNIQUE(companyId, category, competence)
  )`);
});

// Configuração Nodemailer (Gmail)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// WhatsApp Client
const puppeteerExecutablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: AUTH_DIR }),
  puppeteer: {
    headless: true,
    executablePath: puppeteerExecutablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  }
});

let qrCodeData = null;
let clientReady = false;

client.on('qr', (qr) => {
    QRCode.toDataURL(qr, (err, url) => { qrCodeData = url; });
});

client.on('ready', () => { 
    clientReady = true; 
    qrCodeData = null;
});

client.on('disconnected', () => { clientReady = false; });
client.initialize();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'dist')));

// --- API ENDPOINTS ---

// Companies (CRUD)
app.get('/api/companies', (req, res) => {
    db.all('SELECT * FROM companies ORDER BY name ASC', (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/companies', (req, res) => {
    const { id, name, docNumber, type, email, whatsapp } = req.body;
    if (id) {
        db.run(`UPDATE companies SET name = ?, docNumber = ?, type = ?, email = ?, whatsapp = ? WHERE id = ?`, 
        [name, docNumber, type, email, whatsapp, id], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, id });
        });
    } else {
        db.run(`INSERT INTO companies (name, docNumber, type, email, whatsapp) VALUES (?, ?, ?, ?, ?)`, 
        [name, docNumber, type, email, whatsapp], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, id: this.lastID });
        });
    }
});

app.delete('/api/companies/:id', (req, res) => {
    db.run('DELETE FROM companies WHERE id = ?', [req.params.id], (err) => res.json({ success: !err }));
});

// Tasks
app.get('/api/tasks', (req, res) => db.all('SELECT * FROM tasks', (err, rows) => res.json(rows || [])));
app.post('/api/tasks', (req, res) => {
    const t = req.body;
    if (t.id && typeof t.id === 'number' && t.id < 1000000000000) {
        db.run(`UPDATE tasks SET title=?, description=?, status=?, priority=?, color=?, dueDate=?, companyId=?, recurrence=?, dayOfWeek=?, recurrenceDate=?, targetCompanyType=? WHERE id=?`,
        [t.title, t.description, t.status, t.priority, t.color, t.dueDate, t.companyId, t.recurrence, t.dayOfWeek, t.recurrenceDate, t.targetCompanyType, t.id], () => res.json({ success: true }));
    } else {
        db.run(`INSERT INTO tasks (title, description, status, priority, color, dueDate, companyId, recurrence, dayOfWeek, recurrenceDate, targetCompanyType) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [t.title, t.description, t.status, t.priority, t.color, t.dueDate, t.companyId, t.recurrence, t.dayOfWeek, t.recurrenceDate, t.targetCompanyType], function() { res.json({ success: true, id: this.lastID }); });
    }
});
app.delete('/api/tasks/:id', (req, res) => db.run('DELETE FROM tasks WHERE id = ?', [req.params.id], () => res.json({ success: true })));

// Document Status
app.get('/api/documents/status', (req, res) => {
    const { competence } = req.query;
    db.all('SELECT * FROM document_status WHERE competence = ?', [competence], (err, rows) => res.json(rows || []));
});
app.post('/api/documents/status', (req, res) => {
    const { companyId, category, competence, status } = req.body;
    db.run(`INSERT INTO document_status (companyId, category, competence, status) VALUES (?, ?, ?, ?) ON CONFLICT(companyId, category, competence) DO UPDATE SET status = excluded.status`,
    [companyId, category, competence, status], () => res.json({ success: true }));
});

// WhatsApp Status
app.get('/api/whatsapp/status', (req, res) => res.json({ status: clientReady ? 'connected' : 'disconnected', qr: qrCodeData }));
app.post('/api/whatsapp/disconnect', async (req, res) => {
    try { await client.logout(); await client.initialize(); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- NOVOS ENDPOINTS DE ENVIO ---

// Envio de E-mail
app.post('/api/send-email', upload.array('attachments'), async (req, res) => {
    const { to, subject, text, html } = req.body;
    const attachments = req.files.map(file => ({
        filename: file.originalname,
        path: file.path
    }));

    try {
        await transporter.sendMail({ from: process.env.EMAIL_USER, to, subject, text, html, attachments });
        // Limpar arquivos após envio
        attachments.forEach(file => fs.unlinkSync(file.path));
        res.json({ success: true });
    } catch (error) {
        console.error("Erro ao enviar e-mail:", error);
        res.status(500).json({ error: error.message });
    }
});

// Envio de WhatsApp
app.post('/api/whatsapp/send', upload.array('attachments'), async (req, res) => {
    const { to, message } = req.body;
    if (!clientReady) return res.status(400).json({ error: "WhatsApp não conectado" });

    try {
        const formattedTo = to.replace(/\D/g, '') + '@c.us';
        
        // Enviar mensagem de texto
        if (message) {
            await client.sendMessage(formattedTo, message);
        }

        // Enviar anexos
        for (const file of req.files) {
            const media = MessageMedia.fromFilePath(file.path);
            await client.sendMessage(formattedTo, media, { caption: file.originalname });
            fs.unlinkSync(file.path);
        }

        res.json({ success: true });
    } catch (error) {
        console.error("Erro ao enviar WhatsApp:", error);
        res.status(500).json({ error: error.message });
    }
});

// Envio em Massa
app.post('/api/bulk-send', async (req, res) => {
    const { companyIds, subject, message, channels } = req.body;
    
    db.all(`SELECT * FROM companies WHERE id IN (${companyIds.join(',')})`, async (err, companies) => {
        if (err) return res.status(500).json({ error: err.message });

        const results = { email: 0, whatsapp: 0, errors: [] };

        for (const company of companies) {
            if (channels.email && company.email) {
                try {
                    await transporter.sendMail({ from: process.env.EMAIL_USER, to: company.email, subject, text: message });
                    results.email++;
                } catch (e) { results.errors.push(`Email para ${company.name}: ${e.message}`); }
            }

            if (channels.whatsapp && company.whatsapp && clientReady) {
                try {
                    const formattedTo = company.whatsapp.replace(/\D/g, '') + '@c.us';
                    await client.sendMessage(formattedTo, message);
                    results.whatsapp++;
                } catch (e) { results.errors.push(`WhatsApp para ${company.name}: ${e.message}`); }
            }
        }
        res.json(results);
    });
});

app.get(/.*/, (req, res) => {
    if (!req.path.startsWith('/api')) res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(port, () => console.log(`Server running at port ${port}`));