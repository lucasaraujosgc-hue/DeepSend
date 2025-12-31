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
import multer from 'multer';
import nodemailer from 'nodemailer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Configuração de diretórios para persistência no Docker
const DATA_DIR = process.env.DATA_PATH || path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const AUTH_DIR = path.join(DATA_DIR, 'whatsapp_auth');
const DB_PATH = path.join(DATA_DIR, 'consultas.db');

console.log(`[INIT] Diretório de Dados: ${DATA_DIR}`);
console.log(`[INIT] Banco de Dados: ${DB_PATH}`);

// Garantir que diretórios existam
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

// Configuração do Multer para Uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOADS_DIR)
  },
  filename: function (req, file, cb) {
    // Sanitiza nome e adiciona timestamp para evitar colisão
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const cleanName = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
    cb(null, uniqueSuffix + '-' + cleanName)
  }
})
const upload = multer({ storage: storage });

const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
  // Tabelas Originais do seu sistema de Prospecção (mantidas)
  db.run(`CREATE TABLE IF NOT EXISTS consulta (id TEXT PRIMARY KEY, filename TEXT, total INTEGER, processed INTEGER, status TEXT, start_time TEXT, end_time TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS campaign (id TEXT PRIMARY KEY, name TEXT, description TEXT, initial_message TEXT, ai_persona TEXT, status TEXT, created_at TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS resultado (id INTEGER PRIMARY KEY AUTOINCREMENT, consulta_id TEXT, campaign_id TEXT, inscricao_estadual TEXT, cnpj TEXT, razao_social TEXT, nome_fantasia TEXT, unidade_fiscalizacao TEXT, logradouro TEXT, bairro_distrito TEXT, municipio TEXT, uf TEXT, cep TEXT, telefone TEXT, wa_id TEXT, email TEXT, atividade_economica_principal TEXT, condicao TEXT, forma_pagamento TEXT, situacao_cadastral TEXT, data_situacao_cadastral TEXT, motivo_situacao_cadastral TEXT, nome_contador TEXT, status TEXT, campaign_status TEXT DEFAULT 'pending', last_contacted TEXT, ai_active INTEGER DEFAULT 1, FOREIGN KEY(consulta_id) REFERENCES consulta(id), FOREIGN KEY(campaign_id) REFERENCES campaign(id))`);

  // --- NOVAS TABELAS PARA O CONTÁBIL MANAGER PRO ---
  db.run(`CREATE TABLE IF NOT EXISTS companies (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, docNumber TEXT, type TEXT, email TEXT, whatsapp TEXT)`);
  
  db.run(`CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT, status TEXT, priority TEXT, color TEXT, dueDate TEXT, companyId INTEGER, recurrence TEXT, dayOfWeek TEXT, recurrenceDate TEXT, targetCompanyType TEXT)`);

  db.run(`CREATE TABLE IF NOT EXISTS document_status (id INTEGER PRIMARY KEY AUTOINCREMENT, companyId INTEGER, category TEXT, competence TEXT, status TEXT, UNIQUE(companyId, category, competence))`);

  // Tabela para Histórico de Envios (Dashboard)
  db.run(`CREATE TABLE IF NOT EXISTS sent_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, companyName TEXT, docName TEXT, category TEXT, sentAt TEXT, channels TEXT, status TEXT)`);
});

// Configuração do Email (Nodemailer) - Substituindo smtplib do Python
const emailTransporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, // true for 465, false for other ports
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Configuração do Cliente WhatsApp para Docker (Puppeteer)
const puppeteerExecutablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: AUTH_DIR }),
  puppeteer: {
    headless: true,
    executablePath: puppeteerExecutablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-accelerated-2d-canvas', '--no-first-run', '--no-zygote', '--disable-gpu'],
  },
  webVersionCache: {
    type: "remote",
    remotePath: "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html",
  }
});

let qrCodeData = null;
let clientReady = false;

client.on('qr', (qr) => {
    QRCode.toDataURL(qr, (err, url) => {
        qrCodeData = url;
    });
});

client.on('ready', () => { clientReady = true; qrCodeData = null; console.log("WhatsApp Pronto"); });
client.on('disconnected', () => { clientReady = false; console.log("WhatsApp Desconectado"); });

client.initialize().catch((err) => console.error("Erro ao inicializar WhatsApp:", err));

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'dist'))); 

// --- API ENDPOINTS ---

// 1. Upload de Arquivo
app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    res.json({ filename: req.file.filename, originalName: req.file.originalname });
});

// 2. Envio de Documentos (Email + WhatsApp)
app.post('/api/send-documents', async (req, res) => {
    const { documents, subject, messageBody, channels } = req.body;
    // documents: [{ companyId, companyName, serverFilename, docName, category, ... }]
    
    if (!documents || documents.length === 0) return res.status(400).json({ error: 'Sem documentos' });

    let successCount = 0;
    let errors = [];

    // Agrupar por empresa para enviar e-mail único se possível (opcional, aqui faremos 1 por doc ou grupo simples)
    // Para simplificar a migração do seu python, vamos processar documento por documento ou agrupar na lógica.
    // Vamos iterar sobre os documentos.

    for (const doc of documents) {
        try {
            // Buscar dados frescos da empresa (email/zap)
            const company = await new Promise((resolve, reject) => {
                db.get("SELECT * FROM companies WHERE id = ?", [doc.companyId], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });

            if (!company) {
                errors.push(`Empresa não encontrada: ID ${doc.companyId}`);
                continue;
            }

            const filePath = path.join(UPLOADS_DIR, doc.serverFilename);
            if (!fs.existsSync(filePath)) {
                errors.push(`Arquivo não encontrado no servidor: ${doc.docName}`);
                continue;
            }

            // 1. Enviar E-mail
            if (channels.email && company.email) {
                try {
                    await emailTransporter.sendMail({
                        from: process.env.EMAIL_USER,
                        to: company.email,
                        subject: subject,
                        text: messageBody, // Versão texto simples
                        html: messageBody.replace(/\n/g, '<br>'), // HTML básico
                        attachments: [{
                            filename: doc.docName,
                            path: filePath
                        }]
                    });
                    console.log(`[EMAIL] Enviado para ${company.email}`);
                } catch (emailErr) {
                    console.error(`[EMAIL ERROR] ${emailErr.message}`);
                    errors.push(`Erro Email (${company.name}): ${emailErr.message}`);
                }
            }

            // 2. Enviar WhatsApp
            if (channels.whatsapp && company.whatsapp && clientReady) {
                try {
                    // Formatar número (Assumindo BR 55 + DDD + Numero). Remove não dígitos.
                    let number = company.whatsapp.replace(/\D/g, '');
                    if (!number.startsWith('55')) number = '55' + number;
                    const chatId = `${number}@c.us`;

                    const media = MessageMedia.fromFilePath(filePath);
                    media.filename = doc.docName; // Importante para aparecer como arquivo com nome

                    await client.sendMessage(chatId, media, { caption: subject });
                    console.log(`[WHATSAPP] Enviado para ${number}`);
                } catch (wppErr) {
                    console.error(`[WHATSAPP ERROR] ${wppErr.message}`);
                    errors.push(`Erro WhatsApp (${company.name}): ${wppErr.message}`);
                }
            }

            // Log de Sucesso no Banco
            db.run(`INSERT INTO sent_logs (companyName, docName, category, sentAt, channels, status) VALUES (?, ?, ?, datetime('now', 'localtime'), ?, 'success')`, 
                [company.name, doc.docName, doc.category, JSON.stringify(channels)]);
            
            // Atualizar status na matriz
            db.run(`INSERT INTO document_status (companyId, category, competence, status) VALUES (?, ?, ?, 'sent') ON CONFLICT(companyId, category, competence) DO UPDATE SET status='sent'`, 
                [doc.companyId, doc.category, doc.competence]);

            successCount++;

        } catch (err) {
            console.error(err);
            errors.push(`Erro geral ao processar ${doc.docName}: ${err.message}`);
        }
    }

    res.json({ 
        success: true, 
        processed: documents.length, 
        sent: successCount, 
        errors: errors 
    });
});

// 3. Histórico Recente (para o Dashboard)
app.get('/api/recent-sends', (req, res) => {
    db.all("SELECT * FROM sent_logs ORDER BY id DESC LIMIT 5", (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// --- Endpoints Existentes (Mantidos) ---

app.get('/api/companies', (req, res) => {
    db.all('SELECT * FROM companies ORDER BY name ASC', (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/companies', (req, res) => {
    const { id, name, docNumber, type, email, whatsapp } = req.body;
    if (id) {
        db.run(`UPDATE companies SET name = ?, docNumber = ?, type = ?, email = ?, whatsapp = ? WHERE id = ?`, [name, docNumber, type, email, whatsapp, id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, id });
        });
    } else {
        db.run(`INSERT INTO companies (name, docNumber, type, email, whatsapp) VALUES (?, ?, ?, ?, ?)`, [name, docNumber, type, email, whatsapp], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, id: this.lastID });
        });
    }
});

app.delete('/api/companies/:id', (req, res) => {
    db.run('DELETE FROM companies WHERE id = ?', [req.params.id], (err) => res.json({ success: !err }));
});

app.get('/api/tasks', (req, res) => {
    db.all('SELECT * FROM tasks', (err, rows) => res.json(rows || []));
});

app.post('/api/tasks', (req, res) => {
    const task = req.body;
    if (task.id && typeof task.id === 'number' && task.id < 1000000000000) { 
         const sql = `UPDATE tasks SET title=?, description=?, status=?, priority=?, color=?, dueDate=?, companyId=?, recurrence=?, dayOfWeek=?, recurrenceDate=?, targetCompanyType=? WHERE id=?`;
         db.run(sql, [task.title, task.description, task.status, task.priority, task.color, task.dueDate, task.companyId, task.recurrence, task.dayOfWeek, task.recurrenceDate, task.targetCompanyType, task.id], function(err) {
            res.json({ success: true, id: task.id });
         });
    } else {
         const sql = `INSERT INTO tasks (title, description, status, priority, color, dueDate, companyId, recurrence, dayOfWeek, recurrenceDate, targetCompanyType) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
         db.run(sql, [task.title, task.description, task.status, task.priority, task.color, task.dueDate, task.companyId, task.recurrence, task.dayOfWeek, task.recurrenceDate, task.targetCompanyType], function(err) {
            res.json({ success: true, id: this.lastID });
         });
    }
});

app.delete('/api/tasks/:id', (req, res) => {
    db.run('DELETE FROM tasks WHERE id = ?', [req.params.id], (err) => res.json({ success: !err }));
});

app.get('/api/documents/status', (req, res) => {
    const { competence } = req.query;
    let sql = 'SELECT * FROM document_status';
    const params = [];
    if (competence) {
        sql += ' WHERE competence = ?';
        params.push(competence);
    }
    db.all(sql, params, (err, rows) => res.json(rows || []));
});

app.post('/api/documents/status', (req, res) => {
    const { companyId, category, competence, status } = req.body;
    db.run(`INSERT INTO document_status (companyId, category, competence, status) VALUES (?, ?, ?, ?) ON CONFLICT(companyId, category, competence) DO UPDATE SET status = excluded.status`, [companyId, category, competence, status], (err) => {
        res.json({ success: !err });
    });
});

app.get('/api/whatsapp/status', (req, res) => {
    res.json({ 
        status: clientReady ? 'connected' : 'disconnected', 
        qr: qrCodeData,
        info: clientReady && client.info ? { pushname: client.info.pushname, wid: client.info.wid, platform: client.info.platform } : null
    });
});

app.post('/api/whatsapp/disconnect', async (req, res) => {
    try { await client.logout(); await client.initialize(); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get(/.*/, (req, res) => {
    if (!req.path.startsWith('/api')) res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(port, () => console.log(`Server running at http://localhost:${port}`));