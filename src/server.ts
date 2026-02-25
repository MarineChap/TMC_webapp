import express, { Request, Response } from 'express';
import cors from 'cors';
import multer from 'multer';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs/promises';
import { networkInterfaces } from 'os';

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8001;
const DB_FILE = path.join(__dirname, '../data/db.json');
const LOG_FILE = path.join(__dirname, '../data/logs.json');
const UPLOAD_DIR = path.join(__dirname, '../assets/images');

// Supabase config
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const supabase = SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

// Middleware
app.use(cors());
app.use(express.json());

// Ensure directories exist
fs.mkdir(UPLOAD_DIR, { recursive: true }).catch(console.error);

// Static file serving - Ensure the path is correct from dist/server.js
app.use('/assets', express.static(path.join(__dirname, '../assets')));
app.use('/css', express.static(path.join(__dirname, '../css')));
app.use('/js', express.static(path.join(__dirname, '../js')));
app.use('/data', express.static(path.join(__dirname, '../data')));

// Upload configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname);
    }
});
const upload = multer({ storage });

// Synchronous-like file lock mechanism (simple for Node)
let isWriting = false;

async function loadDb() {
    try {
        const data = await fs.readFile(DB_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (e: any) {
        if (e.code === 'ENOENT') {
            return { chiefMessages: [], amicalistMessages: [], recruits: [], events: [], flashNews: [] };
        }
        throw e;
    }
}

async function saveDb(data: any) {
    while (isWriting) {
        await new Promise(r => setTimeout(r, 50));
    }
    isWriting = true;
    try {
        await fs.writeFile(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } finally {
        isWriting = false;
    }
}

async function addLog(action: string, metadata: any = {}) {
    try {
        let logs = [];
        try {
            const data = await fs.readFile(LOG_FILE, 'utf-8');
            logs = JSON.parse(data);
        } catch (e: any) {
            if (e.code !== 'ENOENT') console.error("Error reading logs:", e);
        }

        const newLog = {
            timestamp: new Date().toISOString(),
            action,
            ...metadata
        };

        logs.push(newLog);
        await fs.writeFile(LOG_FILE, JSON.stringify(logs, null, 2), 'utf-8');
        console.log(`Log added: ${action}`);
    } catch (e) {
        console.error("Failed to add log:", e);
    }
}

// Background Task: Cleanup expired flashNews
setInterval(async () => {
    try {
        const dbData = await loadDb();
        if (dbData.flashNews) {
            const now = new Date();
            const originalCount = dbData.flashNews.length;
            const activeNews = dbData.flashNews.filter((item: any) => {
                if (item.endTime) {
                    const endTime = new Date(item.endTime);
                    return endTime.getTime() > now.getTime();
                }
                return true;
            });

            if (activeNews.length !== originalCount) {
                dbData.flashNews = activeNews;
                await saveDb(dbData);
                console.log('Cleaned up expired flash news');
            }
        }
    } catch (e) {
        console.error("Cleanup error:", e);
    }
}, 10000);

// --- API Endpoints ---

app.post('/api/auth/login', async (req: Request, res: Response) => {
    if (!supabase) return res.status(500).json({ detail: "Supabase not configured" });

    const { username, password } = req.body;
    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email: `${username}@tmc.com`,
            password
        });

        if (error) throw error;

        // Get profile
        const profileRes = await supabase.from('profiles').select('username, is_validated').eq('id', data.user.id).single();
        const profileData = profileRes.data || { username, is_validated: false };

        res.json({
            access_token: data.session.access_token,
            user: {
                id: data.user.id,
                email: data.user.email,
                username: profileData.username,
                is_validated: profileData.is_validated
            }
        });

        addLog('login', { username: profileData.username || username });
    } catch (e: any) {
        res.status(401).json({ detail: e.message || String(e) });
    }
});

app.post('/api/auth/signup', async (req: Request, res: Response) => {
    if (!supabase) return res.status(500).json({ detail: "Supabase not configured" });

    const { username, password } = req.body;
    try {
        const { data, error } = await supabase.auth.signUp({
            email: `${username}@tmc.com`,
            password
        });

        if (error) throw error;

        if (data.user) {
            try {
                await supabase.from('profiles').insert([
                    { id: data.user.id, username, is_validated: false }
                ]);
            } catch (profileError) {
                console.error("Profile creation error:", profileError);
            }
        }

        res.json({ message: "Signup successful! Admin validation required." });
        addLog('signup', { username });
    } catch (e: any) {
        const errorMsg = String(e.message || e).toLowerCase();
        if (errorMsg.includes("rate limit") || errorMsg.includes("too many requests")) {
            return res.status(429).json({ detail: "Trop de tentatives d'inscription. Veuillez réessayer plus tard." });
        }
        res.status(400).json({ detail: e.message || String(e) });
    }
});

app.get('/api/auth/session', async (req: Request, res: Response) => {
    if (!supabase) return res.status(500).json({ detail: "Supabase not configured" });

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ detail: "Missing or invalid token" });
    }

    const token = authHeader.split(" ")[1];
    try {
        const { data, error } = await supabase.auth.getUser(token);
        if (error || !data.user) throw new Error("Invalid token");

        const profileRes = await supabase.from('profiles').select('username, is_validated').eq('id', data.user.id).single();
        const profileData = profileRes.data || { username: data.user.email?.split("@")[0], is_validated: false };

        res.json({
            user: {
                id: data.user.id,
                email: data.user.email,
                username: profileData.username,
                is_validated: profileData.is_validated
            }
        });
    } catch (e: any) {
        res.status(401).json({ detail: e.message || String(e) });
    }
});

app.get('/api/last-modified', async (req, res) => {
    try {
        const stats = await fs.stat(DB_FILE);
        res.json({ last_modified: stats.mtimeMs / 1000 });
    } catch (e) {
        res.status(404).json({ detail: "DB not found" });
    }
});

app.post('/api/save', async (req, res) => {
    try {
        const { category, item } = req.body;
        const dbData = await loadDb();

        if (!dbData[category]) {
            return res.status(400).json({ detail: "Invalid category" });
        }

        if (category === 'flashNews') {
            dbData[category] = [];
        }

        dbData[category].push(item);
        await saveDb(dbData);

        if (['chiefMessages', 'amicalistMessages'].includes(category)) {
            addLog('message_created', { category, author: item.author, text: item.text?.substring(0, 50) });
        } else {
            addLog('item_added', { category, name: item.name || item.title });
        }

        res.json({ status: "success" });
    } catch (e: any) {
        res.status(500).json({ detail: e.message || String(e) });
    }
});

app.post('/api/delete', async (req, res) => {
    try {
        const { category, item } = req.body;
        const dbData = await loadDb();

        if (!dbData[category]) {
            return res.status(404).json({ detail: "Category not found" });
        }

        // Simple deep equality check to find the item
        const itemIndex = dbData[category].findIndex((dbItem: any) => JSON.stringify(dbItem) === JSON.stringify(item));

        if (itemIndex === -1) {
            return res.status(404).json({ detail: "Item not found" });
        }

        dbData[category].splice(itemIndex, 1);

        const imgPath = item.image;
        if (imgPath) {
            const normPath = path.join(__dirname, '..', imgPath);
            try {
                await fs.unlink(normPath);
            } catch (e) {
                // Ignore if file doesn't exist
            }
        }

        await saveDb(dbData);

        if (['chiefMessages', 'amicalistMessages'].includes(category)) {
            addLog('message_deleted', { category, author: item.author, text: item.text?.substring(0, 50) });
        } else {
            addLog('item_deleted', { category, name: item.name || item.title });
        }

        res.json({ status: "success" });
    } catch (e: any) {
        res.status(500).json({ detail: e.message || String(e) });
    }
});

app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ detail: "No file uploaded" });
    res.json({ path: `assets/images/${req.file.originalname}` });
});

app.get('/api/logs', async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ detail: "Missing or invalid token" });
    }

    const token = authHeader.split(" ")[1];
    try {
        if (!supabase) throw new Error("Supabase not configured");
        const { data, error } = await supabase.auth.getUser(token);
        if (error || !data.user) throw new Error("Invalid token");

        // Optional: restriction à l'admin ou user validé
        const profileRes = await supabase.from('profiles').select('is_validated').eq('id', data.user.id).single();
        if (!profileRes.data?.is_validated) {
            return res.status(403).json({ detail: "Accès refusé" });
        }

        const logsData = await fs.readFile(LOG_FILE, 'utf-8');
        res.json(JSON.parse(logsData));
    } catch (e: any) {
        res.status(401).json({ detail: e.message || String(e) });
    }
});

app.get('/api/sdmis-rss', async (req, res) => {
    try {
        const response = await fetch('https://www.sdmis.fr/feed/');
        if (!response.ok) throw new Error('Failed to fetch SDMIS feed');
        const data = await response.text();
        res.set('Content-Type', 'text/xml');
        res.send(data);
    } catch (e: any) {
        res.status(500).json({ detail: e.message || String(e) });
    }
});

app.get('/api/ip', (req, res) => {
    const nets = networkInterfaces();
    let ipAddr = 'localhost';
    for (const name of Object.keys(nets)) {
        for (const net of nets[name] || []) {
            if (net.family === 'IPv4' && !net.internal) {
                ipAddr = net.address;
                break;
            }
        }
    }
    res.json({ ip: ipAddr, port: PORT });
});

// Fallback for SPA
app.use((req, res) => {
    res.sendFile(path.join(__dirname, '../index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT}`);
});
