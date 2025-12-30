import 'dotenv/config';
import express from 'express';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import QRCode from 'qrcode';
import fs from 'fs';
import sqlite3 from 'sqlite3';
import { v4 as uuidv4 } from 'uuid';

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

const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
  // Tabelas Originais do seu sistema de Prospecção
  db.run(`CREATE TABLE IF NOT EXISTS consulta (
    id TEXT PRIMARY KEY,
    filename TEXT,
    total INTEGER,
    processed INTEGER,
    status TEXT,
    start_time TEXT,
    end_time TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS campaign (
    id TEXT PRIMARY KEY,
    name TEXT,
    description TEXT,
    initial_message TEXT,
    ai_persona TEXT,
    status TEXT,
    created_at TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS resultado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    consulta_id TEXT,
    campaign_id TEXT,
    inscricao_estadual TEXT,
    cnpj TEXT,
    razao_social TEXT,
    nome_fantasia TEXT,
    unidade_fiscalizacao TEXT,
    logradouro TEXT,
    bairro_distrito TEXT,
    municipio TEXT,
    uf TEXT,
    cep TEXT,
    telefone TEXT,
    wa_id TEXT,
    email TEXT,
    atividade_economica_principal TEXT,
    condicao TEXT,
    forma_pagamento TEXT,
    situacao_cadastral TEXT,
    data_situacao_cadastral TEXT,
    motivo_situacao_cadastral TEXT,
    nome_contador TEXT,
    status TEXT,
    campaign_status TEXT DEFAULT 'pending',
    last_contacted TEXT,
    ai_active INTEGER DEFAULT 1, 
    FOREIGN KEY(consulta_id) REFERENCES consulta(id),
    FOREIGN KEY(campaign_id) REFERENCES campaign(id)
  )`);

  // --- NOVAS TABELAS PARA O CONTÁBIL MANAGER PRO ---

  // Tabela de Empresas (Cadastro fixo do sistema)
  db.run(`CREATE TABLE IF NOT EXISTS companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    docNumber TEXT,
    type TEXT,
    email TEXT,
    whatsapp TEXT
  )`);

  // Tabela de Tarefas (Kanban)
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

  // Tabela de Status dos Documentos (Matriz)
  db.run(`CREATE TABLE IF NOT EXISTS document_status (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    companyId INTEGER,
    category TEXT,
    competence TEXT,
    status TEXT,
    UNIQUE(companyId, category, competence)
  )`);
});

// --- SISTEMA DE LOGS EM MEMÓRIA (RAM) ---
const memoryLogs = [];

function logSystem(type, source, message, meta = {}) {
    const timestamp = new Date().toISOString();
    console.log(`[${type.toUpperCase()}] ${message}`);
    
    memoryLogs.unshift({
        id: uuidv4(),
        timestamp,
        type,
        source,
        message,
        meta: JSON.stringify(meta)
    });

    if (memoryLogs.length > 200) {
        memoryLogs.pop();
    }
}

// Configuração do Cliente WhatsApp para Docker (Puppeteer)
// Importante: No Docker precisamos apontar para o executável do Chromium instalado
const puppeteerExecutablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
console.log(`[INIT] Puppeteer Executable Path: ${puppeteerExecutablePath || 'Padrão (Local)'}`);

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: AUTH_DIR }),
  puppeteer: {
    headless: true,
    executablePath: puppeteerExecutablePath,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu'
    ],
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
        logSystem('info', 'whatsapp', 'Novo QR Code gerado');
    });
});

client.on('ready', () => { 
    clientReady = true; 
    qrCodeData = null; // Clear QR code on success
    logSystem('info', 'whatsapp', 'Cliente WhatsApp conectado e pronto'); 
});

client.on('disconnected', () => {
    clientReady = false;
    logSystem('warning', 'whatsapp', 'Cliente WhatsApp desconectado');
});

client.initialize().catch((err) => {
    console.error("Erro ao inicializar WhatsApp:", err);
});

app.use(cors());
app.use(express.json());
// Serve static files from React build
app.use(express.static(path.join(__dirname, 'dist'))); 

// --- API ENDPOINTS PARA O CONTÁBIL MANAGER PRO ---

// 1. Empresas (CRUD)
app.get('/api/companies', (req, res) => {
    db.all('SELECT * FROM companies ORDER BY name ASC', (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/companies', (req, res) => {
    const { id, name, docNumber, type, email, whatsapp } = req.body;
    
    if (id) {
        // Update
        const sql = `UPDATE companies SET name = ?, docNumber = ?, type = ?, email = ?, whatsapp = ? WHERE id = ?`;
        db.run(sql, [name, docNumber, type, email, whatsapp, id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, id });
        });
    } else {
        // Create
        const sql = `INSERT INTO companies (name, docNumber, type, email, whatsapp) VALUES (?, ?, ?, ?, ?)`;
        db.run(sql, [name, docNumber, type, email, whatsapp], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, id: this.lastID });
        });
    }
});

app.delete('/api/companies/:id', (req, res) => {
    db.run('DELETE FROM companies WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// 2. Tarefas (CRUD)
app.get('/api/tasks', (req, res) => {
    db.all('SELECT * FROM tasks', (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/tasks', (req, res) => {
    const task = req.body;
    
    // Check if ID is a valid database ID (integer) or needs insertion
    if (task.id && typeof task.id === 'number' && task.id < 1000000000000) { 
         const sql = `UPDATE tasks SET title=?, description=?, status=?, priority=?, color=?, dueDate=?, companyId=?, recurrence=?, dayOfWeek=?, recurrenceDate=?, targetCompanyType=? WHERE id=?`;
         db.run(sql, [task.title, task.description, task.status, task.priority, task.color, task.dueDate, task.companyId, task.recurrence, task.dayOfWeek, task.recurrenceDate, task.targetCompanyType, task.id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, id: task.id });
         });
    } else {
         const sql = `INSERT INTO tasks (title, description, status, priority, color, dueDate, companyId, recurrence, dayOfWeek, recurrenceDate, targetCompanyType) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
         db.run(sql, [task.title, task.description, task.status, task.priority, task.color, task.dueDate, task.companyId, task.recurrence, task.dayOfWeek, task.recurrenceDate, task.targetCompanyType], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, id: this.lastID });
         });
    }
});

app.delete('/api/tasks/:id', (req, res) => {
    db.run('DELETE FROM tasks WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// 3. Status de Documentos (Matriz)
app.get('/api/documents/status', (req, res) => {
    const { competence } = req.query;
    let sql = 'SELECT * FROM document_status';
    const params = [];
    
    if (competence) {
        sql += ' WHERE competence = ?';
        params.push(competence);
    }
    
    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/documents/status', (req, res) => {
    const { companyId, category, competence, status } = req.body;
    const sql = `INSERT INTO document_status (companyId, category, competence, status) 
                 VALUES (?, ?, ?, ?) 
                 ON CONFLICT(companyId, category, competence) 
                 DO UPDATE SET status = excluded.status`;
    
    db.run(sql, [companyId, category, competence, status], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// 4. WhatsApp Status (Expor QR Code Real)
app.get('/api/whatsapp/status', (req, res) => {
    res.json({ 
        status: clientReady ? 'connected' : 'disconnected', 
        qr: qrCodeData,
        info: clientReady && client.info ? {
            pushname: client.info.pushname,
            wid: client.info.wid,
            platform: client.info.platform
        } : null
    });
});

app.post('/api/whatsapp/disconnect', async (req, res) => {
    try {
        await client.logout();
        await client.initialize(); // Restart to generate new QR
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/logs', (req, res) => res.json(memoryLogs));

// Handle React Routing - serve index.html for unknown routes
app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    }
});

app.listen(port, () => console.log(`Server running at http://localhost:${port}`));
