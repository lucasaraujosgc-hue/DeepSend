
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

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// --- MULTI-TENANCY: Database Management ---
const dbInstances = {};

const getDb = (username) => {
    if (!username) return null;
    if (dbInstances[username]) return dbInstances[username];

    const userDbPath = path.join(DATA_DIR, `${username}.db`);
    const db = new sqlite3.Database(userDbPath);
    
    // Initialize tables for this specific user
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS companies (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, docNumber TEXT, type TEXT, email TEXT, whatsapp TEXT)`);
        db.run(`CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT, status TEXT, priority TEXT, color TEXT, dueDate TEXT, companyId INTEGER, recurrence TEXT, dayOfWeek TEXT, recurrenceDate TEXT, targetCompanyType TEXT)`);
        db.run(`CREATE TABLE IF NOT EXISTS document_status (id INTEGER PRIMARY KEY AUTOINCREMENT, companyId INTEGER, category TEXT, competence TEXT, status TEXT, UNIQUE(companyId, category, competence))`);
        db.run(`CREATE TABLE IF NOT EXISTS sent_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, companyName TEXT, docName TEXT, category TEXT, sentAt TEXT, channels TEXT, status TEXT)`);
        db.run(`CREATE TABLE IF NOT EXISTS user_settings (id INTEGER PRIMARY KEY CHECK (id = 1), settings TEXT)`);
        db.run(`CREATE TABLE IF NOT EXISTS scheduled_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, message TEXT, nextRun TEXT, recurrence TEXT, active INTEGER, type TEXT, channels TEXT, targetType TEXT, selectedCompanyIds TEXT, attachmentFilename TEXT, attachmentOriginalName TEXT, documentsPayload TEXT, createdBy TEXT)`);
        
        // --- MIGRATION CHECK ---
        db.all("PRAGMA table_info(scheduled_messages)", [], (err, rows) => {
            if (err) return;
            if (rows && rows.length > 0) {
                const hasColumn = rows.some(col => col.name === 'documentsPayload');
                if (!hasColumn) {
                    db.run("ALTER TABLE scheduled_messages ADD COLUMN documentsPayload TEXT");
                }
            }
        });
    });

    dbInstances[username] = db;
    return db;
};

// --- MULTI-TENANCY: WhatsApp Management ---
const waClients = {};

const cleanPuppeteerLocks = (authPath) => {
    const lockFiles = ['SingletonLock', 'SingletonCookie', 'SingletonSocket'];
    const defaultProfilePath = path.join(authPath, 'Default');
    
    [authPath, defaultProfilePath].forEach(p => {
        if (fs.existsSync(p)) {
            lockFiles.forEach(file => {
                const lockPath = path.join(p, file);
                if (fs.existsSync(lockPath)) {
                    try {
                        fs.unlinkSync(lockPath);
                        console.log(`[Cleaner] Removida trava: ${lockPath}`);
                    } catch (e) {
                        console.error(`[Cleaner] Falha ao remover trava: ${lockPath}`, e.message);
                    }
                }
            });
        }
    });
};

const getWaClientWrapper = (username) => {
    if (!username) return null;
    
    if (!waClients[username]) {
        waClients[username] = {
            client: null,
            qr: null,
            status: 'disconnected',
            info: null
        };

        const authPath = path.join(DATA_DIR, `whatsapp_auth_${username}`);
        if (!fs.existsSync(authPath)) fs.mkdirSync(authPath, { recursive: true });

        // IMPORTANTE: Limpar travas antes de iniciar
        cleanPuppeteerLocks(authPath);

        const puppeteerExecutablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
        
        const client = new Client({
            authStrategy: new LocalAuth({ clientId: username, dataPath: DATA_DIR }), 
            puppeteer: {
                headless: true,
                executablePath: puppeteerExecutablePath,
                handleSIGINT: false,
                args: [
                    '--no-sandbox', 
                    '--disable-setuid-sandbox', 
                    '--disable-dev-shm-usage', 
                    '--disable-accelerated-2d-canvas', 
                    '--no-first-run', 
                    '--no-zygote', 
                    '--disable-gpu',
                    '--single-process'
                ],
            }
        });

        client.on('qr', (qr) => { 
            QRCode.toDataURL(qr, (err, url) => { 
                waClients[username].qr = url; 
                waClients[username].status = 'ready';
            }); 
        });
        
        client.on('ready', () => { 
            waClients[username].status = 'connected';
            waClients[username].qr = null;
            waClients[username].info = client.info;
            console.log(`[WA] ${username} Conectado.`); 
        });
        
        client.on('disconnected', () => { 
            waClients[username].status = 'disconnected';
            waClients[username].info = null;
            waClients[username].qr = null;
        });

        client.initialize().catch((err) => {
            console.error(`[WA Error] ${username}:`, err.message);
            waClients[username].status = 'error';
        });
        
        waClients[username].client = client;
    }

    return waClients[username];
};

// --- RESTO DO SERVER (Simplificado para o exemplo) ---
const sendDailySummaryToUser = async (user) => {
    const db = getDb(user);
    if (!db) return;
    const waWrapper = getWaClientWrapper(user);
    if (waWrapper.status !== 'connected') return { success: false, message: 'WhatsApp desconectado' };

    return new Promise((resolve) => {
        db.get("SELECT settings FROM user_settings WHERE id = 1", (e, r) => {
            if (e || !r) return resolve({ success: false });
            const settings = JSON.parse(r.settings);
            const sql = `SELECT t.*, c.name as companyName FROM tasks t LEFT JOIN companies c ON t.companyId = c.id WHERE t.status != 'concluida'`;
            db.all(sql, [], async (err, tasks) => {
                if (err || !tasks.length) return resolve({ success: true });
                let message = `*📅 Resumo Diário de Tarefas*\n\n`;
                tasks.forEach(task => {
                    let icon = task.priority === 'alta' ? '🔴' : (task.priority === 'media' ? '🟡' : '🔵');
                    message += `${icon} *${task.title}*\n${task.companyName ? `   🏢 ${task.companyName}\n` : ''}${task.dueDate ? `   📅 Vence: ${task.dueDate}\n` : ''}\n`;
                });
                try {
                    let number = settings.dailySummaryNumber.replace(/\D/g, '');
                    if (!number.startsWith('55')) number = '55' + number;
                    await waWrapper.client.sendMessage(`${number}@c.us`, message);
                    resolve({ success: true });
                } catch (sendErr) { resolve({ success: false }); }
            });
        });
    });
};

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Token não fornecido' });
    const parts = token.split('-');
    const user = parts.slice(2).join('-'); 
    req.user = user;
    next();
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9.]/g, '_'))
});
const upload = multer({ storage });

const emailTransporter = nodemailer.createTransport({
    host: 'smtp.gmail.com', port: 465, secure: true,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'dist')));

app.post('/api/login', (req, res) => {
    const { user, password } = req.body;
    const envUsers = (process.env.USERS || 'admin').split(',');
    const envPasss = (process.env.PASSWORDS || 'admin').split(',');
    const idx = envUsers.indexOf(user);
    if (idx !== -1 && envPasss[idx] === password) {
        getWaClientWrapper(user);
        res.json({ success: true, token: `session-${Date.now()}-${user}` });
    } else res.status(401).json({ error: 'Incorreto' });
});

app.use('/api', authenticateToken);

app.post('/api/upload', upload.single('file'), (req, res) => res.json({ filename: req.file.filename }));

app.get('/api/settings', (req, res) => {
    getDb(req.user).get("SELECT settings FROM user_settings WHERE id = 1", (err, row) => res.json(row ? JSON.parse(row.settings) : null));
});

app.post('/api/settings', (req, res) => {
    getDb(req.user).run("INSERT INTO user_settings (id, settings) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET settings=excluded.settings", [JSON.stringify(req.body)], () => res.json({ success: true }));
});

app.get('/api/companies', (req, res) => getDb(req.user).all('SELECT * FROM companies ORDER BY name ASC', (err, rows) => res.json(rows || [])));
app.post('/api/companies', (req, res) => {
    const { id, name, docNumber, type, email, whatsapp } = req.body;
    const db = getDb(req.user);
    if (id) db.run(`UPDATE companies SET name=?, docNumber=?, type=?, email=?, whatsapp=? WHERE id=?`, [name, docNumber, type, email, whatsapp, id], () => res.json({ success: true }));
    else db.run(`INSERT INTO companies (name, docNumber, type, email, whatsapp) VALUES (?, ?, ?, ?, ?)`, [name, docNumber, type, email, whatsapp], function() { res.json({ success: true, id: this.lastID }); });
});

app.get('/api/tasks', (req, res) => getDb(req.user).all('SELECT * FROM tasks', (err, rows) => res.json(rows || [])));
app.post('/api/tasks', (req, res) => {
    const t = req.body;
    const db = getDb(req.user);
    if (t.id && t.id < 1000000000000) db.run(`UPDATE tasks SET title=?, description=?, status=?, priority=?, color=?, dueDate=?, companyId=? WHERE id=?`, [t.title, t.description, t.status, t.priority, t.color, t.dueDate, t.companyId, t.id], () => res.json({ success: true }));
    else db.run(`INSERT INTO tasks (title, description, status, priority, color, dueDate, companyId) VALUES (?, ?, ?, ?, ?, ?, ?)`, [t.title, t.description, t.status, t.priority, t.color, t.dueDate, t.companyId], function() { res.json({ success: true, id: this.lastID }); });
});

app.get('/api/whatsapp/status', (req, res) => {
    const w = getWaClientWrapper(req.user);
    res.json({ status: w.status, qr: w.qr, info: w.info });
});

app.post('/api/whatsapp/disconnect', async (req, res) => {
    const w = getWaClientWrapper(req.user);
    if (w.client) await w.client.logout();
    w.status = 'disconnected'; w.qr = null;
    res.json({ success: true });
});

app.get(/.*/, (req, res) => {
    if (!req.path.startsWith('/api')) res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(port, () => console.log(`Server running at http://localhost:${port}`));
