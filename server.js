
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
    
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS companies (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, docNumber TEXT, type TEXT, email TEXT, whatsapp TEXT)`);
        db.run(`CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT, status TEXT, priority TEXT, color TEXT, dueDate TEXT, companyId INTEGER, recurrence TEXT, dayOfWeek TEXT, recurrenceDate TEXT, targetCompanyType TEXT)`);
        db.run(`CREATE TABLE IF NOT EXISTS document_status (id INTEGER PRIMARY KEY AUTOINCREMENT, companyId INTEGER, category TEXT, competence TEXT, status TEXT, UNIQUE(companyId, category, competence))`);
        db.run(`CREATE TABLE IF NOT EXISTS sent_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, companyName TEXT, docName TEXT, category TEXT, sentAt TEXT, channels TEXT, status TEXT)`);
        db.run(`CREATE TABLE IF NOT EXISTS user_settings (id INTEGER PRIMARY KEY CHECK (id = 1), settings TEXT)`);
        db.run(`CREATE TABLE IF NOT EXISTS scheduled_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, message TEXT, nextRun TEXT, recurrence TEXT, active INTEGER, type TEXT, channels TEXT, targetType TEXT, selectedCompanyIds TEXT, attachmentFilename TEXT, attachmentOriginalName TEXT, documentsPayload TEXT, createdBy TEXT)`);
        
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

const getWaClientWrapper = (username) => {
    if (!username) return null;
    if (!waClients[username]) {
        waClients[username] = { client: null, qr: null, status: 'disconnected', info: null };
        const authPath = path.join(DATA_DIR, `whatsapp_auth_${username}`);
        if (!fs.existsSync(authPath)) fs.mkdirSync(authPath, { recursive: true });

        const client = new Client({
            authStrategy: new LocalAuth({ clientId: username, dataPath: authPath }), 
            puppeteer: {
                headless: true,
                executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
            }
        });

        client.on('qr', (qr) => { 
            QRCode.toDataURL(qr, (err, url) => { 
                waClients[username].qr = url; 
                waClients[username].status = 'generating_qr';
            }); 
        });
        client.on('ready', () => { 
            waClients[username].status = 'connected';
            waClients[username].qr = null;
            waClients[username].info = client.info;
        });
        client.on('disconnected', () => { 
            waClients[username].status = 'disconnected';
            waClients[username].info = null;
        });
        client.initialize().catch(() => { waClients[username].status = 'error'; });
        waClients[username].client = client;
    }
    return waClients[username];
};

// --- LOGIC: Send Daily Summary ---
const sendDailySummaryToUser = async (user) => {
    const db = getDb(user);
    const waWrapper = getWaClientWrapper(user);
    if (waWrapper.status !== 'connected') return { success: false, message: 'WhatsApp desconectado' };

    return new Promise((resolve) => {
        db.get("SELECT settings FROM user_settings WHERE id = 1", (e, r) => {
            if (e || !r) return resolve({ success: false, message: 'Configurações não encontradas' });
            const settings = JSON.parse(r.settings);
            if (!settings.dailySummaryNumber) return resolve({ success: false, message: 'Número não configurado' });

            const sql = `SELECT t.*, c.name as companyName FROM tasks t LEFT JOIN companies c ON t.companyId = c.id WHERE t.status != 'concluida'`;
            db.all(sql, [], async (err, tasks) => {
                if (err || !tasks || tasks.length === 0) return resolve({ success: true, message: 'Sem tarefas' });

                const priorityMap = { 'alta': 1, 'media': 2, 'baixa': 3 };
                const sortedTasks = tasks.sort((a, b) => (priorityMap[a.priority] || 99) - (priorityMap[b.priority] || 99));

                let message = `*📅 Resumo Diário de Tarefas*\n\n`;
                message += `Você tem *${sortedTasks.length}* tarefas pendentes.\n\n`;

                sortedTasks.forEach(task => {
                    let icon = task.priority === 'alta' ? '🔴' : (task.priority === 'media' ? '🟡' : '🔵');
                    message += `${icon} *${task.title}*\n`;
                    if (task.companyName) message += `   🏢 ${task.companyName}\n`;
                    if (task.dueDate) message += `   📅 Vence: ${task.dueDate}\n`;
                    message += `\n`;
                });

                try {
                    let number = settings.dailySummaryNumber.replace(/\D/g, '');
                    if (!number.startsWith('55')) number = '55' + number;
                    await waWrapper.client.sendMessage(`${number}@c.us`, message);
                    resolve({ success: true });
                } catch (sendErr) {
                    resolve({ success: false, message: sendErr.message });
                }
            });
        });
    });
};

// --- EMAIL CONFIGURATION (DYNAMIC FROM ENV) ---
const emailTransporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT || '465'),
    secure: (process.env.EMAIL_PORT === '465'), // true para 465, false para outras
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// --- Middleware & Auth ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Token não fornecido' });
    const parts = token.split('-');
    const user = parts.slice(2).join('-'); 
    const envUsers = (process.env.USERS || '').split(',');
    if (!envUsers.includes(user)) return res.status(403).json({ error: 'Não autorizado' });
    req.user = user;
    next();
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9.]/g, '_'))
});
const upload = multer({ storage });

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'dist')));

const buildEmailHtml = (messageBody, documents, emailSignature) => {
    let docsTable = '';
    if (documents && documents.length > 0) {
        let rows = documents.map(doc => `<tr><td>${doc.docName}</td><td>${doc.category}</td><td>${doc.dueDate || 'N/A'}</td></tr>`).join('');
        docsTable = `<table border="1" style="width:100%; border-collapse:collapse;"><tr><th>Doc</th><th>Cat</th><th>Venc</th></tr>${rows}</table>`;
    }
    return `<div>${messageBody.replace(/\n/g, '<br>')}${docsTable}<br>${emailSignature || ''}</div>`;
};

// --- API ROUTES ---
app.post('/api/login', (req, res) => {
    const { user, password } = req.body;
    const envUsers = (process.env.USERS || 'admin').split(',');
    const envPasss = (process.env.PASSWORDS || 'admin').split(',');
    const idx = envUsers.indexOf(user);
    if (idx !== -1 && envPasss[idx] === password) {
        getWaClientWrapper(user);
        res.json({ success: true, token: `session-${Date.now()}-${user}` });
    } else res.status(401).json({ error: 'Inválido' });
});

app.use('/api', authenticateToken);

app.get('/api/settings', (req, res) => {
    getDb(req.user).get("SELECT settings FROM user_settings WHERE id = 1", (err, row) => res.json(row ? JSON.parse(row.settings) : null));
});
app.post('/api/settings', (req, res) => {
    getDb(req.user).run("INSERT INTO user_settings (id, settings) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET settings=excluded.settings", [JSON.stringify(req.body)], () => res.json({ success: true }));
});
app.post('/api/trigger-daily-summary', async (req, res) => {
    const result = await sendDailySummaryToUser(req.user);
    res.json(result);
});

app.get('/api/companies', (req, res) => getDb(req.user).all('SELECT * FROM companies ORDER BY name ASC', (err, rows) => res.json(rows || [])));
app.post('/api/companies', (req, res) => {
    const c = req.body;
    const db = getDb(req.user);
    if (c.id) db.run(`UPDATE companies SET name=?, docNumber=?, type=?, email=?, whatsapp=? WHERE id=?`, [c.name, c.docNumber, c.type, c.email, c.whatsapp, c.id], () => res.json({success: true}));
    else db.run(`INSERT INTO companies (name, docNumber, type, email, whatsapp) VALUES (?, ?, ?, ?, ?)`, [c.name, c.docNumber, c.type, c.email, c.whatsapp], function() { res.json({success: true, id: this.lastID}); });
});
app.delete('/api/companies/:id', (req, res) => getDb(req.user).run('DELETE FROM companies WHERE id = ?', [req.params.id], () => res.json({ success: true })));

app.get('/api/tasks', (req, res) => getDb(req.user).all('SELECT * FROM tasks', (err, rows) => res.json(rows || [])));
app.post('/api/tasks', (req, res) => {
    const t = req.body;
    const db = getDb(req.user);
    if (t.id && t.id < 1000000000000) db.run(`UPDATE tasks SET title=?, description=?, status=?, priority=?, color=?, dueDate=?, companyId=?, recurrence=?, dayOfWeek=?, recurrenceDate=?, targetCompanyType=? WHERE id=?`, [t.title, t.description, t.status, t.priority, t.color, t.dueDate, t.companyId, t.recurrence, t.dayOfWeek, t.recurrenceDate, t.targetCompanyType, t.id], () => res.json({ success: true }));
    else db.run(`INSERT INTO tasks (title, description, status, priority, color, dueDate, companyId, recurrence, dayOfWeek, recurrenceDate, targetCompanyType) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [t.title, t.description, t.status, t.priority, t.color, t.dueDate, t.companyId, t.recurrence, t.dayOfWeek, t.recurrenceDate, t.targetCompanyType], function() { res.json({ success: true, id: this.lastID }); });
});
app.delete('/api/tasks/:id', (req, res) => getDb(req.user).run('DELETE FROM tasks WHERE id = ?', [req.params.id], () => res.json({ success: true })));

app.post('/api/upload', upload.single('file'), (req, res) => res.json({ filename: req.file.filename, originalName: req.file.originalname }));

app.post('/api/send-documents', async (req, res) => {
    const { documents, subject, messageBody, channels, emailSignature, whatsappTemplate } = req.body;
    const db = getDb(req.user);
    const waWrapper = getWaClientWrapper(req.user);
    const clientReady = waWrapper.status === 'connected';

    const docsByCompany = documents.reduce((acc, d) => { (acc[d.companyId] = acc[d.companyId] || []).push(d); return acc; }, {});
    let successCount = 0;
    let sentIds = [];

    for (const companyId of Object.keys(docsByCompany)) {
        const companyDocs = docsByCompany[companyId];
        const company = await new Promise(r => db.get("SELECT * FROM companies WHERE id = ?", [companyId], (e, row) => r(row)));
        if (!company) continue;

        const attachments = companyDocs.map(d => ({ filename: d.docName, path: path.join(UPLOADS_DIR, d.serverFilename) })).filter(a => fs.existsSync(a.path));

        if (channels.email && company.email) {
            try {
                await emailTransporter.sendMail({
                    from: process.env.EMAIL_USER,
                    to: company.email,
                    subject: `${subject} - ${companyDocs[0].competence}`,
                    html: buildEmailHtml(messageBody, companyDocs, emailSignature),
                    attachments
                });
            } catch (e) { console.error("Email error", e); }
        }

        if (channels.whatsapp && company.whatsapp && clientReady) {
            try {
                let num = company.whatsapp.replace(/\D/g, '');
                if (!num.startsWith('55')) num = '55' + num;
                const chatId = `${num}@c.us`;
                await waWrapper.client.sendMessage(chatId, `*📄 Arquivos:* \n${messageBody}\n\n${whatsappTemplate || ''}`);
                for (const att of attachments) {
                    await waWrapper.client.sendMessage(chatId, MessageMedia.fromFilePath(att.path));
                }
            } catch (e) { console.error("WA error", e); }
        }

        companyDocs.forEach(d => {
            if (d.id) sentIds.push(d.id);
            db.run(`INSERT INTO sent_logs (companyName, docName, category, sentAt, channels, status) VALUES (?, ?, ?, datetime('now'), ?, 'success')`, [company.name, d.docName, d.category, JSON.stringify(channels)]);
            db.run(`INSERT INTO document_status (companyId, category, competence, status) VALUES (?, ?, ?, 'sent') ON CONFLICT DO UPDATE SET status='sent'`, [d.companyId, d.category, d.competence]);
            successCount++;
        });
    }
    res.json({ success: true, sent: successCount, sentIds });
});

app.get('/api/whatsapp/status', (req, res) => { 
    const w = getWaClientWrapper(req.user);
    res.json({ status: w.status, qr: w.qr, info: w.info }); 
});

app.get(/.*/, (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

app.listen(port, () => console.log(`Server: ${port}`));
