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
import { GoogleGenAI, Type } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Configuração de diretórios
const DATA_DIR = process.env.DATA_PATH || path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const LOG_FILE = path.join(DATA_DIR, 'debug_whatsapp.log');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// --- SYSTEM: Logger ---
const log = (message, error = null) => {
    const timestamp = new Date().toISOString();
    let errorDetail = '';
    
    if (error) {
        errorDetail = `\nERROR: ${error.message}`;
        if (error.stack) errorDetail += `\nSTACK: ${error.stack}`;
    }

    const logMessage = `[${timestamp}] ${message}${errorDetail}\n`;
    console.log(`[APP] ${message}`);
    if (error) console.error(error);

    try {
        fs.appendFileSync(LOG_FILE, logMessage);
    } catch (e) {
        console.error("Falha crítica ao escrever no arquivo de log:", e);
    }
};

log("Servidor iniciando...");
log(`Diretório de dados: ${DATA_DIR}`);

// --- AI CONFIGURATION ---
let ai = null;
if (process.env.GEMINI_API_KEY) {
    ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    log("AI: Google GenAI (v3 Flash Preview) inicializado.");
} else {
    log("AI: GEMINI_API_KEY não encontrada. O assistente inteligente estará desativado.");
}

// --- HELPER: Puppeteer Lock Cleaner ---
const cleanPuppeteerLocks = (dir) => {
    const locks = ['SingletonLock', 'SingletonCookie', 'SingletonSocket'];
    if (fs.existsSync(dir)) {
        locks.forEach(lock => {
            const lockPath = path.join(dir, lock);
            if (fs.existsSync(lockPath)) {
                try {
                    fs.unlinkSync(lockPath);
                    log(`[Puppeteer Fix] Trava removida: ${lockPath}`);
                } catch (e) {}
            }
        });
        const defaultDir = path.join(dir, 'Default');
        if (fs.existsSync(defaultDir)) {
             locks.forEach(lock => {
                const lockPath = path.join(defaultDir, lock);
                if (fs.existsSync(lockPath)) {
                    try { fs.unlinkSync(lockPath); } catch (e) {}
                }
            });
        }
    }
};

// --- HELPER: Robust WhatsApp Send ---
const safeSendMessage = async (client, chatId, content, options = {}) => {
    log(`[WhatsApp] Tentando enviar mensagem para: ${chatId}`);
    try {
        if (!client) throw new Error("Client é null");

        const safeOptions = { 
            ...options, 
            sendSeen: false 
        };

        let finalChatId = chatId;
        
        if (!finalChatId.includes('@')) {
             if (/^\d+$/.test(finalChatId)) {
                 finalChatId = `${finalChatId}@c.us`;
             } else {
                 throw new Error("ChatId mal formatado: " + chatId);
             }
        }

        try {
            if (finalChatId.endsWith('@c.us')) {
                const numberPart = finalChatId.replace('@c.us', '').replace(/\D/g, '');
                const contactId = await client.getNumberId(numberPart);
                
                if (contactId && contactId._serialized) {
                    finalChatId = contactId._serialized;
                }
            }
        } catch (idErr) {
            log(`[WhatsApp] Erro não bloqueante ao resolver getNumberId: ${idErr.message}`);
        }

        try {
            const chat = await client.getChatById(finalChatId);
            const msg = await chat.sendMessage(content, safeOptions);
            return msg;
        } catch (chatError) {
            const msg = await client.sendMessage(finalChatId, content, safeOptions);
            return msg;
        }

    } catch (error) {
        log(`[WhatsApp] FALHA CRÍTICA NO ENVIO para ${chatId}`, error);
        throw error;
    }
};

// --- MULTI-TENANCY: Database Management ---
const dbInstances = {};

const getDb = (username) => {
    if (!username) return null;
    if (dbInstances[username]) return dbInstances[username];

    const userDbPath = path.join(DATA_DIR, `${username}.db`);
    const db = new sqlite3.Database(userDbPath);
    
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS companies (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, docNumber TEXT, type TEXT, email TEXT, whatsapp TEXT)`);
        db.run(`CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT, status TEXT, priority TEXT, color TEXT, dueDate TEXT, companyId INTEGER, recurrence TEXT, dayOfWeek TEXT, recurrenceDate TEXT, targetCompanyType TEXT, createdAt TEXT)`);
        db.run(`CREATE TABLE IF NOT EXISTS document_status (id INTEGER PRIMARY KEY AUTOINCREMENT, companyId INTEGER, category TEXT, competence TEXT, status TEXT, UNIQUE(companyId, category, competence))`);
        db.run(`CREATE TABLE IF NOT EXISTS sent_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, companyName TEXT, docName TEXT, category TEXT, sentAt TEXT, channels TEXT, status TEXT)`);
        db.run(`CREATE TABLE IF NOT EXISTS user_settings (id INTEGER PRIMARY KEY CHECK (id = 1), settings TEXT)`);
        db.run(`CREATE TABLE IF NOT EXISTS scheduled_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, message TEXT, nextRun TEXT, recurrence TEXT, active INTEGER, type TEXT, channels TEXT, targetType TEXT, selectedCompanyIds TEXT, attachmentFilename TEXT, attachmentOriginalName TEXT, documentsPayload TEXT, createdBy TEXT)`);
        
        // Tabelas para RAG e Histórico do Assistente
        db.run(`CREATE TABLE IF NOT EXISTS chat_history (id INTEGER PRIMARY KEY AUTOINCREMENT, role TEXT, content TEXT, timestamp TEXT)`);
        db.run(`CREATE TABLE IF NOT EXISTS personal_notes (id INTEGER PRIMARY KEY AUTOINCREMENT, topic TEXT, content TEXT, created_at TEXT, updated_at TEXT)`);

        db.all("PRAGMA table_info(scheduled_messages)", [], (err, rows) => {
            if (rows && !rows.some(col => col.name === 'documentsPayload')) {
                db.run("ALTER TABLE scheduled_messages ADD COLUMN documentsPayload TEXT", () => {});
            }
        });
        db.all("PRAGMA table_info(tasks)", [], (err, rows) => {
            if (rows && !rows.some(col => col.name === 'createdAt')) {
                const today = new Date().toISOString().split('T')[0];
                db.run("ALTER TABLE tasks ADD COLUMN createdAt TEXT", () => db.run("UPDATE tasks SET createdAt = ?", [today]));
            }
        });
    });

    dbInstances[username] = db;
    return db;
};

// --- AI LOGIC: Tools & Handler (Reformulada) ---

const assistantTools = [
    {
        name: "consult_tasks",
        description: "Consulta suas tarefas existentes. Use para saber o que tem pendente.",
        parameters: {
            type: Type.OBJECT,
            properties: {
                status: { type: Type.STRING, enum: ["pendente", "em_andamento", "concluida"], description: "Filtrar por status. Padrão: pendente" },
                limit: { type: Type.INTEGER, description: "Máximo de tarefas. Padrão 5." }
            }
        }
    },
    {
        name: "add_task",
        description: "Adiciona uma nova tarefa rápida ao sistema.",
        parameters: {
            type: Type.OBJECT,
            properties: {
                title: { type: Type.STRING, description: "Título da tarefa" },
                description: { type: Type.STRING, description: "Detalhes da tarefa" },
                priority: { type: Type.STRING, enum: ["alta", "media", "baixa"] }
            },
            required: ["title"]
        }
    },
    {
        name: "search_company",
        description: "Consulta dados de uma empresa cadastrada (Nome, CNPJ, Email, Zap).",
        parameters: {
            type: Type.OBJECT,
            properties: {
                name_or_doc: { type: Type.STRING, description: "Nome ou parte do CNPJ/CPF para buscar." }
            },
            required: ["name_or_doc"]
        }
    },
    {
        name: "manage_memory",
        description: "SISTEMA DE MEMÓRIA PESSOAL. Use para SALVAR conhecimentos gerados (treinos, estudos, receitas) ou BUSCAR informações passadas que não sejam tarefas/empresas.",
        parameters: {
            type: Type.OBJECT,
            properties: {
                action: { type: Type.STRING, enum: ["save", "search"], description: "Use 'save' para guardar algo novo útil. Use 'search' para lembrar de algo." },
                topic: { type: Type.STRING, description: "Tópico chave (ex: 'treino_a', 'dieta', 'resumo_ingles')" },
                content: { type: Type.STRING, description: "O conteúdo COMPLETO a ser salvo ou o termo de busca." }
            },
            required: ["action", "topic"]
        }
    }
];

// Execução das Tools
const executeTool = async (name, args, db, username) => {
    log(`[AI Tool] Executando ${name} com args: ${JSON.stringify(args)}`);
    
    if (name === "consult_tasks") {
        return new Promise((resolve) => {
            const status = args.status || 'pendente';
            const limit = args.limit || 5;
            db.all("SELECT id, title, priority, dueDate FROM tasks WHERE status = ? ORDER BY id DESC LIMIT ?", [status, limit], (err, rows) => {
                if (err) resolve("Erro ao listar: " + err.message);
                if (!rows || rows.length === 0) resolve("Nenhuma tarefa encontrada com este status.");
                else resolve(JSON.stringify(rows));
            });
        });
    }

    if (name === "add_task") {
        const today = new Date().toISOString().split('T')[0];
        return new Promise(resolve => {
            db.run(`INSERT INTO tasks (title, description, status, priority, color, recurrence, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)`, 
            [args.title, args.description || '', 'pendente', args.priority || 'media', '#45B7D1', 'nenhuma', today], 
            function(err) { resolve(err ? "Erro: " + err.message : `Tarefa criada (ID ${this.lastID}).`); });
        });
    }

    if (name === "search_company") {
        return new Promise(resolve => {
            db.all("SELECT id, name, docNumber, email, whatsapp FROM companies WHERE name LIKE ? OR docNumber LIKE ? LIMIT 5",
            [`%${args.name_or_doc}%`, `%${args.name_or_doc}%`], (err, rows) => {
                if(err) resolve("Erro na busca.");
                else resolve(rows.length ? JSON.stringify(rows) : "Nenhuma empresa encontrada.");
            });
        });
    }

    if (name === "manage_memory") {
        if (args.action === "save") {
            const now = new Date().toISOString();
            return new Promise(resolve => {
                // Remove duplicatas exatas do mesmo tópico recente para economizar espaço
                db.run("INSERT INTO personal_notes (topic, content, created_at, updated_at) VALUES (?, ?, ?, ?)",
                [args.topic, args.content, now, now], (err) => resolve(err ? "Erro ao salvar memória." : "Informação salva na memória permanente com sucesso!"));
            });
        }
        if (args.action === "search") {
            return new Promise(resolve => {
                const term = args.content || args.topic || "";
                db.all("SELECT topic, content, created_at FROM personal_notes WHERE topic LIKE ? OR content LIKE ? ORDER BY created_at DESC LIMIT 3",
                [`%${term}%`, `%${term}%`], (err, rows) => {
                    if (rows && rows.length > 0) {
                        // Formata para o LLM entender melhor
                        const context = rows.map(r => `[Tópico: ${r.topic} | Data: ${r.created_at}]\n${r.content}`).join("\n---\n");
                        resolve(context);
                    } else {
                        resolve("Nada encontrado na memória sobre isso.");
                    }
                });
            });
        }
    }

    return "Ferramenta desconhecida.";
};

// --- HELPER: Retry Logic for 429 Errors ---
const runWithRetry = async (fn, retries = 3, delay = 2000) => {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (error) {
            const isRateLimit = error.message?.includes('429') || error.status === 429;
            if (!isRateLimit || i === retries - 1) throw error;
            const waitTime = delay * Math.pow(2, i);
            log(`[AI Retry] Aguardando ${waitTime/1000}s...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
    }
};

// Processador Central de IA
const processAI = async (username, userMessage, mediaPart = null) => {
    const db = getDb(username);
    if (!db || !ai) return "Sistema de IA indisponível.";

    // OTIMIZAÇÃO: Zero Token para "Oi"
    const greetingRegex = /^(oi|ola|olá|bom dia|boa tarde|boa noite|opa|eai|tudo bem|ajuda)\??$/i;
    if (!mediaPart && greetingRegex.test(userMessage.trim())) {
        return "Olá! Sou seu assistente. Posso consultar empresas, anotar tarefas ou acessar sua memória pessoal (treinos, estudos). Como ajudo?";
    }

    // 2. Recuperar contexto (MUITO CURTO para economizar - Apenas 4 últimas)
    const history = await new Promise(resolve => {
        db.all("SELECT role, content FROM chat_history ORDER BY id DESC LIMIT 4", (err, rows) => {
            resolve(rows ? rows.reverse().map(r => ({ role: r.role === 'user' ? 'user' : 'model', parts: [{ text: r.content }] })) : []);
        });
    });

    // 3. System Instruction OTIMIZADA PARA RAG E ECONOMIA
    const systemInstruction = `Você é um assistente pessoal inteligente e eficiente.
    
    SEUS OBJETIVOS:
    1. **Dados Empresariais (Read-Only/Light Write):** 
       - Use 'search_company' para consultar dados de clientes. Não invente dados.
       - Use 'consult_tasks' ou 'add_task' para gerenciar afazeres do dia a dia.
    
    2. **Memória Pessoal (RAG - CRÍTICO):**
       - Se o usuário pedir para CRIAR algo duradouro (ex: "Monte um treino", "Lista de estudos", "Receita"), você DEVE:
         a) Gerar o conteúdo.
         b) AUTOMATICAMENTE chamar a tool 'manage_memory' (action='save') para salvar esse conteúdo gerado.
       - Se o usuário perguntar algo pessoal do passado (ex: "Qual meu treino?", "O que estou estudando?"), use 'manage_memory' (action='search') PRIMEIRO antes de responder.

    3. **Economia de Tokens:**
       - Seja direto. Não repita a pergunta do usuário.
       - Se não encontrar dados no banco, diga apenas "Não encontrei".`;

    const currentParts = [];
    if (mediaPart) currentParts.push(mediaPart);
    if (userMessage) currentParts.push({ text: userMessage });

    try {
        // USANDO MODELO MAIS RECENTE CONFORME SOLICITADO
        const chat = ai.chats.create({ 
            model: "gemini-3-flash-preview", 
            config: {
                systemInstruction: systemInstruction,
                tools: [{ functionDeclarations: assistantTools }]
            },
            history: history
        });

        let response = await runWithRetry(() => chat.sendMessage({
            message: currentParts
        }));

        let functionCalls = response.functionCalls;
        let loopCount = 0;

        // Loop de execução de Tools
        while (functionCalls && functionCalls.length > 0 && loopCount < 5) {
            loopCount++;
            const call = functionCalls[0];
            
            // Feedback visual no log
            log(`[AI Thinking] Chamando ferramenta: ${call.name}`);

            const result = await executeTool(call.name, call.args, db, username);
            
            response = await runWithRetry(() => chat.sendMessage({
                message: [{
                    functionResponse: {
                        name: call.name,
                        response: { result: result }
                    }
                }]
            }));
            functionCalls = response.functionCalls;
        }

        const finalResponseText = response.text || "Feito.";

        // Salvar histórico curto
        db.run("INSERT INTO chat_history (role, content, timestamp) VALUES (?, ?, ?)", ['user', userMessage, new Date().toISOString()]);
        db.run("INSERT INTO chat_history (role, content, timestamp) VALUES (?, ?, ?)", ['model', finalResponseText, new Date().toISOString()]);

        return finalResponseText;

    } catch (e) {
        log("[AI Error]", e);
        if (e.message?.includes('404')) return "Erro: O modelo gemini-3-flash-preview ainda não está disponível na sua região ou chave. Tente reverter para gemini-2.0-flash.";
        return "Tive um problema momentâneo. Tente novamente.";
    }
};

// --- MULTI-TENANCY: WhatsApp Management ---
const waClients = {}; 

const getWaClientWrapper = (username) => {
    if (!username) return null;
    
    if (!waClients[username]) {
        log(`[WhatsApp Init] Inicializando cliente para usuário: ${username}`);
        
        waClients[username] = {
            client: null,
            qr: null,
            status: 'disconnected',
            info: null
        };

        const authPath = path.join(DATA_DIR, `whatsapp_auth_${username}`);
        if (!fs.existsSync(authPath)) fs.mkdirSync(authPath, { recursive: true });

        const sessionPath = path.join(authPath, `session-${username}`);
        cleanPuppeteerLocks(sessionPath);

        const puppeteerExecutablePath = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser';
        
        const client = new Client({
            authStrategy: new LocalAuth({ clientId: username, dataPath: authPath }), 
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
                    '--disable-gpu', 
                    '--disable-software-rasterizer',
                    '--single-process'
                ],
            }
        });

        // --- INTERCEPTADOR DE MENSAGENS (IA) ---
        client.on('message', async (msg) => {
            const sender = msg.from;
            log(`[WhatsApp Inbound] Mensagem recebida de: ${sender} | Body: ${msg.body?.substring(0, 30)}...`);

            try {
                if (msg.from.includes('@g.us') || msg.isStatus) {
                    return;
                }

                const db = getDb(username);
                const settings = await new Promise(resolve => {
                    db.get("SELECT settings FROM user_settings WHERE id = 1", (e, r) => resolve(r ? JSON.parse(r.settings) : null));
                });

                if (!settings || !settings.dailySummaryNumber) {
                    log(`[WhatsApp Auth] FALHA: Configuração 'dailySummaryNumber' não encontrada.`);
                    return;
                }

                const authorizedNumber = settings.dailySummaryNumber.replace(/\D/g, ''); 
                const senderNumber = msg.from.replace('@c.us', '').replace(/\D/g, '');

                if (!senderNumber.endsWith(authorizedNumber)) {
                    log(`[WhatsApp Auth] BLOQUEADO: Número ${senderNumber} não é autorizado.`);
                    return; 
                }

                log(`[AI Trigger] ACESSO PERMITIDO! Iniciando processamento IA...`);

                let mediaPart = null;
                let textContent = msg.body;

                if (msg.hasMedia) {
                    try {
                        const media = await msg.downloadMedia();
                        if (media) {
                            mediaPart = {
                                inlineData: {
                                    mimeType: media.mimetype,
                                    data: media.data
                                }
                            };
                            if (media.mimetype.startsWith('audio/')) {
                                textContent = "Por favor, analise este áudio. " + (msg.body || "");
                            } else {
                                textContent += " [Mídia anexa]";
                            }
                        }
                    } catch (mediaErr) {
                        log("Erro download media", mediaErr);
                    }
                }

                const response = await processAI(username, textContent, mediaPart);
                await safeSendMessage(client, msg.from, response);

            } catch (e) {
                log("Erro no handler de mensagem IA", e);
            }
        });

        client.on('qr', (qr) => { 
            log(`[WhatsApp Event] QR Code gerado para ${username}`);
            QRCode.toDataURL(qr, (err, url) => { 
                if (err) log(`[WhatsApp Event] Erro QR`, err);
                waClients[username].qr = url; 
                waClients[username].status = 'generating_qr';
            }); 
        });
        
        client.on('ready', () => { 
            log(`[WhatsApp Event] CLIENTE PRONTO (${username})`);
            waClients[username].status = 'connected';
            waClients[username].qr = null;
            waClients[username].info = client.info;
        });
        
        client.on('authenticated', () => {
            log(`[WhatsApp Event] Autenticado (${username})`);
        });

        client.on('auth_failure', (msg) => {
            log(`[WhatsApp Event] FALHA DE AUTENTICAÇÃO (${username}): ${msg}`);
            waClients[username].status = 'error';
        });
        
        client.on('disconnected', (reason) => { 
            log(`[WhatsApp Event] Desconectado (${username}). Razão: ${reason}`);
            waClients[username].status = 'disconnected';
            waClients[username].info = null;
        });

        client.initialize().catch((err) => {
            log(`[WhatsApp Init] ERRO FATAL (${username})`, err);
            waClients[username].status = 'error';
        });
        
        waClients[username].client = client;
    }

    return waClients[username];
};

// --- LOGIC: Send Daily Summary Helper ---
const sendDailySummaryToUser = async (user) => {
    const db = getDb(user);
    if (!db) return;

    const waWrapper = getWaClientWrapper(user);
    if (waWrapper.status !== 'connected') {
        return { success: false, message: 'WhatsApp desconectado' };
    }

    return new Promise((resolve, reject) => {
        db.get("SELECT settings FROM user_settings WHERE id = 1", (e, r) => {
            if (e || !r) { resolve({ success: false, message: 'Configurações não encontradas' }); return; }
            
            const settings = JSON.parse(r.settings);
            if (!settings.dailySummaryNumber) { resolve({ success: false, message: 'Número para resumo não configurado' }); return; }

            const sql = `SELECT t.*, c.name as companyName FROM tasks t LEFT JOIN companies c ON t.companyId = c.id WHERE t.status != 'concluida'`;

            db.all(sql, [], async (err, tasks) => {
                if (err) { resolve({ success: false, message: 'Erro ao buscar tarefas' }); return; }
                if (!tasks || tasks.length === 0) { resolve({ success: true, message: 'Nenhuma tarefa pendente' }); return; }

                const priorityMap = { 'alta': 1, 'media': 2, 'baixa': 3 };
                const sortedTasks = tasks.sort((a, b) => (priorityMap[a.priority] || 99) - (priorityMap[b.priority] || 99));

                let message = `*📅 Resumo Diário de Tarefas*\n\nVocê tem *${sortedTasks.length}* tarefas pendentes.\n\n`;
                sortedTasks.forEach(task => {
                    let icon = task.priority === 'alta' ? '🔴' : task.priority === 'media' ? '🟡' : '🔵';
                    message += `${icon} *${task.title}*\n`;
                    if (task.companyName) message += `   🏢 ${task.companyName}\n`;
                    if (task.dueDate) message += `   📅 Vence: ${task.dueDate}\n`;
                    message += `\n`;
                });
                message += `_Gerado automaticamente pelo Contábil Manager Pro_`;

                try {
                    let number = settings.dailySummaryNumber.replace(/\D/g, '');
                    if (!number.startsWith('55')) number = '55' + number;
                    const chatId = `${number}@c.us`;
                    
                    await safeSendMessage(waWrapper.client, chatId, message);
                    resolve({ success: true, message: 'Enviado com sucesso' });
                } catch (sendErr) {
                    log(`[Summary] Erro envio`, sendErr);
                    resolve({ success: false, message: 'Erro no envio do WhatsApp' });
                }
            });
        });
    });
};

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; 
    if (!token) return res.status(401).json({ error: 'Token não fornecido' });
    const parts = token.split('-');
    if (parts.length < 3) return res.status(403).json({ error: 'Token inválido' });
    const user = parts.slice(2).join('-'); 
    const envUsers = (process.env.USERS || '').split(',');
    if (!envUsers.includes(user)) return res.status(403).json({ error: 'Usuário não autorizado' });
    req.user = user;
    next();
};

const storage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, UPLOADS_DIR) },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const cleanName = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
    cb(null, uniqueSuffix + '-' + cleanName)
  }
})
const upload = multer({ storage: storage });

const emailPort = parseInt(process.env.EMAIL_PORT || '465');
const emailTransporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: emailPort,
    secure: emailPort === 465,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'dist')));

// --- HTML Builder Helper --- (Mantido igual)
const buildEmailHtml = (messageBody, documents, emailSignature) => {
    let docsTable = '';
    if (documents && documents.length > 0) {
        const sortedDocs = [...documents].sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
        let rows = '';
        sortedDocs.forEach(doc => {
            rows += `<tr style="border-bottom: 1px solid #eee;"><td style="padding: 10px; color: #333;">${doc.docName}</td><td style="padding: 10px; color: #555;">${doc.category}</td><td style="padding: 10px; color: #555;">${doc.dueDate || 'N/A'}</td><td style="padding: 10px; color: #555;">${doc.competence}</td></tr>`;
        });
        docsTable = `<h3 style="color: #2c3e50; border-bottom: 2px solid #eff6ff; padding-bottom: 10px; margin-top: 30px; font-size: 16px;">Documentos em Anexo:</h3><table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px;"><thead><tr style="background-color: #f8fafc; color: #64748b;"><th style="padding: 10px; text-align: left; border-bottom: 2px solid #e2e8f0;">Documento</th><th style="padding: 10px; text-align: left; border-bottom: 2px solid #e2e8f0;">Categoria</th><th style="padding: 10px; text-align: left; border-bottom: 2px solid #e2e8f0;">Vencimento</th><th style="padding: 10px; text-align: left; border-bottom: 2px solid #e2e8f0;">Competência</th></tr></thead><tbody>${rows}</tbody></table>`;
    }
    return `<html><body style="font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f4; margin: 0; padding: 20px;"><div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);"><div style="background-color: #f8f9fa; padding: 20px; border-radius: 6px; border-left: 4px solid #2563eb; margin-bottom: 25px;">${messageBody.replace(/\n/g, '<br>')}</div>${docsTable}<div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 14px; color: #64748b;">${emailSignature || ''}</div></div></body></html>`;
};

// --- ROUTES ---

app.post('/api/login', (req, res) => {
    const { user, password } = req.body;
    const envUsers = (process.env.USERS || 'admin').split(',');
    const envPasss = (process.env.PASSWORDS || 'admin').split(',');
    const userIndex = envUsers.indexOf(user);

    if (userIndex !== -1 && envPasss[userIndex] === password) {
        getWaClientWrapper(user);
        res.json({ success: true, token: `session-${Date.now()}-${user}` });
    } else {
        res.status(401).json({ error: 'Credenciais inválidas' });
    }
});

app.use('/api', authenticateToken);

app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo' });
    res.json({ filename: req.file.filename, originalName: req.file.originalname });
});

app.get('/api/settings', (req, res) => {
    const db = getDb(req.user);
    if (!db) return res.status(500).json({ error: 'Database error' });
    db.get("SELECT settings FROM user_settings WHERE id = 1", (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(row ? JSON.parse(row.settings) : null);
    });
});

app.post('/api/settings', (req, res) => {
    const db = getDb(req.user);
    if (!db) return res.status(500).json({ error: 'Database error' });
    const settingsJson = JSON.stringify(req.body);
    db.run("INSERT INTO user_settings (id, settings) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET settings=excluded.settings", [settingsJson], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.post('/api/trigger-daily-summary', async (req, res) => {
    try {
        const result = await sendDailySummaryToUser(req.user);
        if (result && result.success) {
            res.json({ success: true });
        } else {
            res.status(400).json({ error: result ? result.message : "Falha desconhecida" });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/companies', (req, res) => { 
    const db = getDb(req.user);
    if (!db) return res.status(500).json({ error: 'Database error' });
    db.all('SELECT * FROM companies ORDER BY name ASC', (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    }); 
});

app.post('/api/companies', (req, res) => {
    const { id, name, docNumber, type, email, whatsapp } = req.body;
    const db = getDb(req.user);
    if (!db) return res.status(500).json({ error: 'Database error' });

    if (id) {
        db.run(`UPDATE companies SET name=?, docNumber=?, type=?, email=?, whatsapp=? WHERE id=?`, 
            [name, docNumber, type, email, whatsapp, id], 
            function(err) { 
                if (err) return res.status(500).json({ error: err.message });
                res.json({success: true, id});
            });
    } else {
        db.run(`INSERT INTO companies (name, docNumber, type, email, whatsapp) VALUES (?, ?, ?, ?, ?)`, 
            [name, docNumber, type, email, whatsapp], 
            function(err) { 
                if (err) return res.status(500).json({ error: err.message });
                res.json({success: true, id: this.lastID});
            });
    }
});

app.delete('/api/companies/:id', (req, res) => { 
    const db = getDb(req.user);
    if (!db) return res.status(500).json({ error: 'Database error' });
    db.run('DELETE FROM companies WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.get('/api/tasks', (req, res) => {
    getDb(req.user).all('SELECT * FROM tasks', (err, rows) => res.json(rows || []));
});
app.post('/api/tasks', (req, res) => {
    const t = req.body;
    const db = getDb(req.user);
    const today = new Date().toISOString().split('T')[0];
    const createdAt = t.createdAt || today;

    if (t.id && t.id < 1000000000000) {
        // Update
        db.run(`UPDATE tasks SET title=?, description=?, status=?, priority=?, color=?, dueDate=?, companyId=?, recurrence=?, dayOfWeek=?, recurrenceDate=?, targetCompanyType=?, createdAt=? WHERE id=?`, 
        [t.title, t.description, t.status, t.priority, t.color, t.dueDate, t.companyId, t.recurrence, t.dayOfWeek, t.recurrenceDate, t.targetCompanyType, createdAt, t.id], 
        function(err) { res.json({ success: !err, id: t.id }); });
    } else {
        // Insert
        db.run(`INSERT INTO tasks (title, description, status, priority, color, dueDate, companyId, recurrence, dayOfWeek, recurrenceDate, targetCompanyType, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
        [t.title, t.description, t.status, t.priority, t.color, t.dueDate, t.companyId, t.recurrence, t.dayOfWeek, t.recurrenceDate, t.targetCompanyType, createdAt], 
        function(err) { res.json({ success: !err, id: this.lastID }); });
    }
});
app.delete('/api/tasks/:id', (req, res) => { getDb(req.user).run('DELETE FROM tasks WHERE id = ?', [req.params.id], (err) => res.json({ success: !err })); });

app.get('/api/documents/status', (req, res) => {
    const sql = req.query.competence ? 'SELECT * FROM document_status WHERE competence = ?' : 'SELECT * FROM document_status';
    getDb(req.user).all(sql, req.query.competence ? [req.query.competence] : [], (err, rows) => res.json(rows || []));
});
app.post('/api/documents/status', (req, res) => {
    const { companyId, category, competence, status } = req.body;
    getDb(req.user).run(`INSERT INTO document_status (companyId, category, competence, status) VALUES (?, ?, ?, ?) ON CONFLICT(companyId, category, competence) DO UPDATE SET status = excluded.status`, [companyId, category, competence, status], (err) => res.json({ success: !err }));
});

// --- Scheduled Messages Routes ---
app.get('/api/scheduled', (req, res) => {
    getDb(req.user).all("SELECT * FROM scheduled_messages", (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows.map(row => ({
            ...row, 
            active: !!row.active, 
            channels: JSON.parse(row.channels || '{}'),
            selectedCompanyIds: row.selectedCompanyIds ? JSON.parse(row.selectedCompanyIds) : [],
            documentsPayload: row.documentsPayload || null
        })) || []);
    });
});

app.post('/api/scheduled', (req, res) => {
    const { id, title, message, nextRun, recurrence, active, type, channels, targetType, selectedCompanyIds, attachmentFilename, attachmentOriginalName, documentsPayload } = req.body;
    const db = getDb(req.user);
    const channelsStr = JSON.stringify(channels);
    const companyIdsStr = JSON.stringify(selectedCompanyIds || []);

    if (id) {
        db.run(`UPDATE scheduled_messages SET title=?, message=?, nextRun=?, recurrence=?, active=?, type=?, channels=?, targetType=?, selectedCompanyIds=?, attachmentFilename=?, attachmentOriginalName=?, documentsPayload=? WHERE id=?`,
        [title, message, nextRun, recurrence, active ? 1 : 0, type, channelsStr, targetType, companyIdsStr, attachmentFilename, attachmentOriginalName, documentsPayload, id],
        function(err) { if (err) return res.status(500).json({error: err.message}); res.json({success: true, id}); });
    } else {
        db.run(`INSERT INTO scheduled_messages (title, message, nextRun, recurrence, active, type, channels, targetType, selectedCompanyIds, attachmentFilename, attachmentOriginalName, documentsPayload, createdBy) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [title, message, nextRun, recurrence, active ? 1 : 0, type, channelsStr, targetType, companyIdsStr, attachmentFilename, attachmentOriginalName, documentsPayload, req.user],
        function(err) { if (err) return res.status(500).json({error: err.message}); res.json({success: true, id: this.lastID}); });
    }
});

app.delete('/api/scheduled/:id', (req, res) => {
    getDb(req.user).run('DELETE FROM scheduled_messages WHERE id = ?', [req.params.id], (err) => res.json({ success: !err }));
});

app.get('/api/whatsapp/status', (req, res) => { 
    const wrapper = getWaClientWrapper(req.user);
    res.json({ 
        status: wrapper.status, 
        qr: wrapper.qr, 
        info: wrapper.info 
    }); 
});
app.post('/api/whatsapp/disconnect', async (req, res) => { 
    try { 
        const wrapper = getWaClientWrapper(req.user);
        if (wrapper.client) {
            await wrapper.client.logout(); 
            wrapper.status = 'disconnected';
            wrapper.qr = null;
        }
        res.json({ success: true }); 
    } catch (e) { res.status(500).json({ error: e.message }); } 
});

// --- NEW ROUTE: HARD RESET ---
app.post('/api/whatsapp/reset', async (req, res) => {
    try {
        const username = req.user;
        log(`[WhatsApp Reset] Solicitado reset forçado para: ${username}`);
        
        // 1. Destruir cliente atual se existir
        if (waClients[username] && waClients[username].client) {
            try {
                await waClients[username].client.destroy();
                log(`[WhatsApp Reset] Cliente destruído.`);
            } catch (e) {
                log(`[WhatsApp Reset] Erro ao destruir cliente (ignorado): ${e.message}`);
            }
            delete waClients[username];
        }

        // 2. Apagar pasta de autenticação
        const authPath = path.join(DATA_DIR, `whatsapp_auth_${username}`);
        if (fs.existsSync(authPath)) {
            try {
                fs.rmSync(authPath, { recursive: true, force: true });
                log(`[WhatsApp Reset] Pasta de autenticação removida: ${authPath}`);
            } catch (e) {
                log(`[WhatsApp Reset] Erro ao remover pasta: ${e.message}`);
                return res.status(500).json({ error: "Falha ao limpar arquivos de sessão. Tente reiniciar o servidor." });
            }
        }

        // 3. Reiniciar wrapper (vai gerar novo QR Code na próxima chamada de status)
        getWaClientWrapper(username);

        res.json({ success: true, message: "Sessão resetada. Aguarde o novo QR Code." });

    } catch (e) {
        log(`[WhatsApp Reset] Erro fatal: ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});


app.post('/api/send-documents', async (req, res) => {
    const { documents, subject, messageBody, channels, emailSignature, whatsappTemplate } = req.body;
    
    log(`[API send-documents] Iniciando envio de ${documents.length} documentos. Channels: ${JSON.stringify(channels)}`);
    
    const db = getDb(req.user);
    const waWrapper = getWaClientWrapper(req.user);
    const client = waWrapper.client;
    const clientReady = waWrapper.status === 'connected';

    if (channels.whatsapp && !clientReady) {
        log(`[API send-documents] AVISO: Tentativa de envio via WhatsApp, mas cliente não está conectado.`);
    }

    let successCount = 0;
    let errors = [];
    let sentIds = [];

    const docsByCompany = documents.reduce((acc, doc) => {
        if (!acc[doc.companyId]) acc[doc.companyId] = [];
        acc[doc.companyId].push(doc);
        return acc;
    }, {});

    const companyIds = Object.keys(docsByCompany);

    for (const companyId of companyIds) {
        const companyDocs = docsByCompany[companyId];
        
        try {
            const company = await new Promise((resolve, reject) => {
                db.get("SELECT * FROM companies WHERE id = ?", [companyId], (err, row) => {
                    if (err) reject(err); else resolve(row);
                });
            });

            if (!company) { errors.push(`Empresa ID ${companyId} não encontrada.`); continue; }

            const sortedDocs = [...companyDocs].sort((a, b) => {
                const dateA = a.dueDate ? a.dueDate.split('/').reverse().join('') : '99999999';
                const dateB = b.dueDate ? b.dueDate.split('/').reverse().join('') : '99999999';
                return dateA.localeCompare(dateB);
            });

            const validAttachments = [];
            for (const doc of sortedDocs) {
                if (doc.serverFilename) {
                    const filePath = path.join(UPLOADS_DIR, doc.serverFilename);
                    if (fs.existsSync(filePath)) {
                        validAttachments.push({
                            filename: doc.docName,
                            path: filePath,
                            contentType: 'application/pdf',
                            docData: doc
                        });
                    } else {
                        log(`[API send-documents] Arquivo físico não encontrado: ${filePath}`);
                        errors.push(`Arquivo sumiu do servidor: ${doc.docName}`);
                    }
                }
            }

            if (channels.email && company.email) {
                try {
                    const finalHtml = buildEmailHtml(messageBody, companyDocs, emailSignature);
                    const finalSubject = `${subject} - Competência: ${companyDocs[0].competence || 'N/A'}`; 
                    
                    const emailList = company.email.split(',').map(e => e.trim()).filter(e => e);
                    const mainEmail = emailList[0];
                    const ccEmails = emailList.slice(1).join(', ');

                    if (mainEmail) {
                        const senderName = process.env.EMAIL_FROM_NAME || 'Contabilidade';
                        const senderEmail = process.env.EMAIL_FROM_EMAIL || process.env.EMAIL_USER;
                        const fromAddress = `"${senderName}" <${senderEmail}>`;

                        await emailTransporter.sendMail({
                            from: fromAddress,
                            to: mainEmail,
                            cc: ccEmails, 
                            subject: finalSubject,
                            html: finalHtml,
                            attachments: validAttachments.map(a => ({ filename: a.filename, path: a.path, contentType: a.contentType }))
                        });
                        log(`[Email] Enviado para ${company.name} (${mainEmail})`);
                    }
                } catch (e) { 
                    log(`[Email] Erro envio ${company.name}`, e);
                    errors.push(`Erro Email ${company.name}: ${e.message}`); 
                }
            }

            if (channels.whatsapp && company.whatsapp && clientReady) {
                try {
                    let number = company.whatsapp.replace(/\D/g, '');
                    if (!number.startsWith('55')) number = '55' + number;
                    const chatId = `${number}@c.us`;

                    const listaArquivos = validAttachments.map(att => 
                        `• ${att.docData.docName} (${att.docData.category || 'Anexo'}, Venc: ${att.docData.dueDate || 'N/A'})`
                    ).join('\n');
                    
                    const whatsappSignature = whatsappTemplate || "_Esses arquivos também foram enviados por e-mail_\n\nAtenciosamente,\nContabilidade";
                    let mensagemCompleta = `*📄 Olá!* \n\n${messageBody}`;
                    
                    if (listaArquivos) {
                        mensagemCompleta += `\n\n*Arquivos enviados:*\n${listaArquivos}`;
                    }
                    
                    mensagemCompleta += `\n\n${whatsappSignature}`;

                    // --- USANDO O HELPER SEGURO ---
                    await safeSendMessage(client, chatId, mensagemCompleta);
                    
                    for (const att of validAttachments) {
                        try {
                            const fileData = fs.readFileSync(att.path).toString('base64');
                            const media = new MessageMedia(att.contentType, fileData, att.filename);
                            
                            await safeSendMessage(client, chatId, media);
                            
                            // Delay para evitar flood
                            await new Promise(r => setTimeout(r, 3000));
                        } catch (mediaErr) {
                            log(`[WhatsApp] Erro envio mídia ${att.filename}`, mediaErr);
                            errors.push(`Erro mídia WhatsApp (${att.filename}): ${mediaErr.message}`);
                        }
                    }
                } catch (e) { 
                    log(`[WhatsApp] Erro envio ${company.name}`, e);
                    errors.push(`Erro Zap ${company.name}: ${e.message}`); 
                }
            } else if (channels.whatsapp && !clientReady) {
                 errors.push(`WhatsApp não conectado. Não foi possível enviar para ${company.name}`);
            }

            for (const doc of companyDocs) {
                if (doc.category) { 
                    db.run(`INSERT INTO sent_logs (companyName, docName, category, sentAt, channels, status) VALUES (?, ?, ?, datetime('now', 'localtime'), ?, 'success')`, 
                        [company.name, doc.docName, doc.category, JSON.stringify(channels)]);
                    
                    db.run(`INSERT INTO document_status (companyId, category, competence, status) VALUES (?, ?, ?, 'sent') ON CONFLICT(companyId, category, competence) DO UPDATE SET status='sent'`, 
                        [doc.companyId, doc.category, doc.competence]);
                }
                if (doc.id) sentIds.push(doc.id);
                successCount++;
            }
        } catch (e) { 
            log(`[API send-documents] Falha geral empresa ${companyId}`, e);
            errors.push(`Falha geral empresa ${companyId}: ${e.message}`); 
        }
    }
    
    res.json({ success: true, sent: successCount, sentIds, errors });
});

app.get('/api/recent-sends', (req, res) => {
    getDb(req.user).all("SELECT * FROM sent_logs ORDER BY id DESC LIMIT 3", (err, rows) => res.json(rows || []));
});

app.get(/.*/, (req, res) => {
    if (!req.path.startsWith('/api')) res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// --- CRON JOB ---
setInterval(() => {
    const envUsers = (process.env.USERS || '').split(',');
    envUsers.forEach(user => {
        const db = getDb(user);
        if (!db) return;

        const now = new Date();
        const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
        const brazilTime = new Date(utc - (3600000 * 3)); 
        const nowStr = brazilTime.toISOString().slice(0, 16); 

        db.all("SELECT * FROM scheduled_messages WHERE active = 1 AND nextRun <= ?", [nowStr], async (err, rows) => {
            if (err || !rows || rows.length === 0) return;

            log(`[CRON ${user}] Processando ${rows.length} agendamentos... Hora Server(BRT): ${nowStr}`);
            
            const waWrapper = getWaClientWrapper(user);
            const clientReady = waWrapper.status === 'connected';

            const settings = await new Promise(resolve => {
                db.get("SELECT settings FROM user_settings WHERE id = 1", (e, r) => resolve(r ? JSON.parse(r.settings) : null));
            });

            for (const msg of rows) {
                try {
                    const channels = JSON.parse(msg.channels || '{}');
                    const selectedIds = JSON.parse(msg.selectedCompanyIds || '[]');
                    
                    let targetCompanies = [];
                    if (msg.targetType === 'selected') {
                       if (selectedIds.length > 0) {
                            const placeholders = selectedIds.map(() => '?').join(',');
                            targetCompanies = await new Promise(resolve => db.all(`SELECT * FROM companies WHERE id IN (${placeholders})`, selectedIds, (e, r) => resolve(r || [])));
                       }
                    } else {
                        const operator = msg.targetType === 'mei' ? '=' : '!=';
                        targetCompanies = await new Promise(resolve => db.all(`SELECT * FROM companies WHERE type ${operator} 'MEI'`, (e, r) => resolve(r || [])));
                    }
                    
                    let specificDocs = [];
                    if (msg.documentsPayload) {
                        try { specificDocs = JSON.parse(msg.documentsPayload); } catch(e) { log('[CRON] Erro parse docs payload', e); }
                    }

                    for (const company of targetCompanies) {
                        let attachmentsToSend = [];
                        let companySpecificDocs = [];

                        if (specificDocs.length > 0) {
                            companySpecificDocs = specificDocs.filter(d => d.companyId === company.id);
                            if (companySpecificDocs.length === 0) continue;
                            
                            for (const doc of companySpecificDocs) {
                                 if (doc.serverFilename) {
                                     const p = path.join(UPLOADS_DIR, doc.serverFilename);
                                     if (fs.existsSync(p)) {
                                         attachmentsToSend.push({ filename: doc.docName, path: p, contentType: 'application/pdf', docData: doc });
                                     }
                                 }
                            }
                        } else if (msg.attachmentFilename) {
                            const p = path.join(UPLOADS_DIR, msg.attachmentFilename);
                            if (fs.existsSync(p)) {
                                attachmentsToSend.push({ filename: msg.attachmentOriginalName, path: p, contentType: 'application/pdf' });
                            }
                        }

                        if (channels.email && company.email) {
                           try {
                                const htmlContent = specificDocs.length > 0 
                                ? buildEmailHtml(msg.message, companySpecificDocs, settings?.emailSignature)
                                : buildEmailHtml(msg.message, [], settings?.emailSignature);

                                const emailList = company.email.split(',').map(e => e.trim()).filter(e => e);
                                const mainEmail = emailList[0];
                                const ccEmails = emailList.slice(1).join(', ');

                                if (mainEmail) {
                                    const senderName = process.env.EMAIL_FROM_NAME || 'Contabilidade';
                                    const senderEmail = process.env.EMAIL_FROM_EMAIL || process.env.EMAIL_USER;
                                    const fromAddress = `"${senderName}" <${senderEmail}>`;

                                    await emailTransporter.sendMail({
                                        from: fromAddress,
                                        to: mainEmail,
                                        cc: ccEmails,
                                        subject: msg.title,
                                        html: htmlContent,
                                        attachments: attachmentsToSend.map(a => ({ filename: a.filename, path: a.path, contentType: a.contentType }))
                                    });
                                }
                           } catch(e) { log(`[CRON] Erro email ${company.name}`, e); }
                        }

                        if (channels.whatsapp && company.whatsapp && clientReady) {
                            try {
                                let number = company.whatsapp.replace(/\D/g, '');
                                if (!number.startsWith('55')) number = '55' + number;
                                const chatId = `${number}@c.us`;
                                
                                let waBody = `*${msg.title}*\n\n${msg.message}`;

                                if (specificDocs.length > 0) {
                                    waBody = `*📄 Olá!* \n\n${msg.message}\n\n*Arquivos enviados:*`;
                                    const listaArquivos = attachmentsToSend.map(att => 
                                        `• ${att.docData?.docName || att.filename} (${att.docData?.category || 'Anexo'}, Venc: ${att.docData?.dueDate || 'N/A'})`
                                    ).join('\n');
                                    waBody += `\n${listaArquivos}`;
                                } else if (attachmentsToSend.length > 0) {
                                    waBody += `\n\n*Arquivo enviado:* ${attachmentsToSend[0].filename}`;
                                }
                                
                                waBody += `\n\n${settings?.whatsappTemplate || ''}`;

                                await safeSendMessage(waWrapper.client, chatId, waBody);
                                
                                for (const att of attachmentsToSend) {
                                    try {
                                        const fileData = fs.readFileSync(att.path).toString('base64');
                                        const media = new MessageMedia(att.contentType, fileData, att.filename);
                                        await safeSendMessage(waWrapper.client, chatId, media);
                                        await new Promise(r => setTimeout(r, 3000));
                                    } catch (err) {
                                        log(`[CRON] Erro media zap ${att.filename}`, err);
                                    }
                                }
                            } catch(e) { log(`[CRON] Erro zap ${company.name}`, e); }
                        }
                        
                        if (companySpecificDocs.length > 0) {
                            for (const doc of companySpecificDocs) {
                                if (doc.category) {
                                    db.run(`INSERT INTO sent_logs (companyName, docName, category, sentAt, channels, status) VALUES (?, ?, ?, datetime('now', 'localtime'), ?, 'success')`, 
                                        [company.name, doc.docName, doc.category, JSON.stringify(channels)]);
                                    
                                    db.run(`INSERT INTO document_status (companyId, category, competence, status) VALUES (?, ?, ?, 'sent') ON CONFLICT(companyId, category, competence) DO UPDATE SET status='sent'`, 
                                        [doc.companyId, doc.category, doc.competence]);
                                }
                            }
                        }
                    } 

                    if (msg.recurrence === 'unico') {
                        db.run("UPDATE scheduled_messages SET active = 0 WHERE id = ?", [msg.id]);
                    } else {
                        const nextDate = new Date(msg.nextRun);
                        if (msg.recurrence === 'mensal') nextDate.setMonth(nextDate.getMonth() + 1);
                        else if (msg.recurrence === 'trimestral') nextDate.setMonth(nextDate.getMonth() + 3);
                        else if (msg.recurrence === 'anual') nextDate.setFullYear(nextDate.getFullYear() + 1);
                        const nextRunStr = nextDate.toISOString().slice(0, 16);
                        db.run("UPDATE scheduled_messages SET nextRun = ? WHERE id = ?", [nextRunStr, msg.id]);
                    }
                } catch(e) {
                    log(`[CRON] Erro crítico processando msg ID ${msg.id}`, e);
                }
            } 
        });
    });
}, 60000); 

app.listen(port, () => log(`Server running at http://localhost:${port}`));