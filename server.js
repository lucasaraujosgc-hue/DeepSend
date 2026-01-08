
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
// Porta do servidor web (Express)
const port = process.env.PORT || 3000;

// Configuração de diretórios
const DATA_DIR = process.env.DATA_PATH || path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// --- CONFIGURAÇÃO DE E-MAIL (NODEMAILER) ---
// Utiliza as variáveis definidas no seu .env
const emailPort = parseInt(process.env.EMAIL_PORT || '465');

const emailTransporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST, // smtp.hostinger.com
  port: emailPort,              // 465
  secure: emailPort === 465,    // true para porta 465
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

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

const cleanPuppeteerLocks = (sessionDir) => {
    // Estrutura do LocalAuth: DATA_DIR/session-{username}/Default
    // Precisamos limpar as travas tanto na raiz da sessão quanto na pasta Default
    const dirsToClean = [sessionDir, path.join(sessionDir, 'Default')];
    const lockFiles = ['SingletonLock', 'SingletonCookie', 'SingletonSocket'];
    
    dirsToClean.forEach(dir => {
        if (fs.existsSync(dir)) {
            lockFiles.forEach(file => {
                const lockPath = path.join(dir, file);
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

        // Caminho real usado pelo LocalAuth
        const sessionPath = path.join(DATA_DIR, `session-${username}`);
        
        // IMPORTANTE: Limpar travas antes de iniciar se a pasta existir
        if (fs.existsSync(sessionPath)) {
            cleanPuppeteerLocks(sessionPath);
        }

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

// --- ROTA DE ENVIO DE DOCUMENTOS ---
app.post('/api/send-documents', async (req, res) => {
    const { documents, subject, messageBody, channels, emailSignature, whatsappTemplate } = req.body;
    const db = getDb(req.user);
    const waWrapper = getWaClientWrapper(req.user);
    
    let sentCount = 0;
    let errors = [];
    let sentIds = [];

    // Agrupa documentos por empresa
    const docsByCompany = documents.reduce((acc, doc) => {
        if (!acc[doc.companyId]) acc[doc.companyId] = [];
        acc[doc.companyId].push(doc);
        return acc;
    }, {});

    for (const companyId in docsByCompany) {
        const companyDocs = docsByCompany[companyId];
        // Busca dados da empresa para ter email/zap atualizados
        const company = await new Promise((resolve) => {
            db.get("SELECT * FROM companies WHERE id = ?", [companyId], (err, row) => resolve(row));
        });

        if (!company) continue;

        // Prepara Anexos
        const attachments = companyDocs.map(doc => ({
            filename: doc.docName,
            path: path.join(UPLOADS_DIR, doc.serverFilename)
        })).filter(a => fs.existsSync(a.path));

        let sentToCompany = false;

        // 1. Envio por E-mail
        if (channels.email && company.email) {
            try {
                let htmlBody = messageBody.replace(/\n/g, '<br>');
                if (emailSignature) {
                    htmlBody += `<br><br>${emailSignature.replace('{mensagem_html}', '')}`;
                }

                await emailTransporter.sendMail({
                    from: `"Contábil Manager" <${process.env.EMAIL_USER}>`,
                    to: company.email,
                    subject: subject,
                    html: htmlBody,
                    attachments: attachments
                });
                sentToCompany = true;
            } catch (e) {
                console.error(`Erro envio email ${company.name}:`, e);
                errors.push(`Email falhou para ${company.name}: ${e.message}`);
            }
        }

        // 2. Envio por WhatsApp
        if (channels.whatsapp && company.whatsapp && waWrapper.status === 'connected') {
            try {
                let number = company.whatsapp.replace(/\D/g, '');
                if (!number.startsWith('55')) number = '55' + number;
                const chatId = `${number}@c.us`;

                let waMessage = `*${subject}*\n\n${messageBody}`;
                if (whatsappTemplate) {
                    waMessage += `\n\n${whatsappTemplate}`;
                }

                await waWrapper.client.sendMessage(chatId, waMessage);

                // Envia arquivos
                for (const att of attachments) {
                    const media = MessageMedia.fromFilePath(att.path);
                    media.filename = att.filename;
                    await waWrapper.client.sendMessage(chatId, media);
                }
                sentToCompany = true;
            } catch (e) {
                console.error(`Erro envio whats ${company.name}:`, e);
                errors.push(`WhatsApp falhou para ${company.name}`);
            }
        }

        // Atualiza status se enviou por pelo menos um canal
        if (sentToCompany) {
            sentCount++;
            companyDocs.forEach(doc => {
                sentIds.push(doc.id);
                // Log
                db.run(`INSERT INTO sent_logs (companyName, docName, category, sentAt, channels, status) VALUES (?, ?, ?, ?, ?, ?)`, 
                    [company.name, doc.docName, doc.category, new Date().toISOString(), JSON.stringify(channels), 'success']);
                
                // Atualiza status do documento
                if (doc.category && doc.competence) {
                    db.run(`INSERT INTO document_status (companyId, category, competence, status) VALUES (?, ?, ?, ?) ON CONFLICT(companyId, category, competence) DO UPDATE SET status='sent'`,
                        [companyId, doc.category, doc.competence, 'sent']);
                }
            });
        }
    }

    res.json({ success: true, sent: sentCount, sentIds, errors });
});

app.get(/.*/, (req, res) => {
    if (!req.path.startsWith('/api')) res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(port, () => console.log(`Server running at http://localhost:${port}`));
