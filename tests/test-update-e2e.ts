/**
 * End-to-end HTTP test for /api/update.
 * Spins up a minimal Express server (no Supabase) using the real DB logic.
 */

import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DB = path.join(__dirname, 'test-db-e2e-tmp.json');

// ── Minimal server replicating the real /api/update and /api/save logic ──

async function loadDb() {
    const data = await fs.readFile(TEST_DB, 'utf-8');
    return JSON.parse(data);
}
async function saveDb(data: any) {
    await fs.writeFile(TEST_DB, JSON.stringify(data, null, 2), 'utf-8');
}

function createTestServer() {
    const app = express();
    app.use(express.json());

    // No-auth update (test only)
    app.post('/api/update', async (req, res) => {
        try {
            const { category, originalIndex, updatedItem } = req.body;
            const dbData = await loadDb();
            if (!dbData[category])
                return res.status(400).json({ detail: 'Invalid category' });
            if (typeof originalIndex !== 'number' || isNaN(originalIndex) || originalIndex < 0 || originalIndex >= dbData[category].length)
                return res.status(404).json({ detail: 'Item not found' });
            dbData[category][originalIndex] = updatedItem;
            await saveDb(dbData);
            res.json({ status: 'success' });
        } catch (e: any) {
            res.status(500).json({ detail: e.message });
        }
    });

    app.post('/api/save', async (req, res) => {
        try {
            const { category, item } = req.body;
            const dbData = await loadDb();
            if (!dbData[category])
                return res.status(400).json({ detail: 'Invalid category' });
            dbData[category].push(item);
            await saveDb(dbData);
            res.json({ status: 'success' });
        } catch (e: any) {
            res.status(500).json({ detail: e.message });
        }
    });

    return app;
}

// ── HTTP helpers ──────────────────────────────────────────────────────────

async function post(server: http.Server, path: string, body: any): Promise<{ status: number; data: any }> {
    return new Promise((resolve, reject) => {
        const addr = server.address() as any;
        const payload = JSON.stringify(body);
        const options = {
            hostname: '127.0.0.1',
            port: addr.port,
            path,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
        };
        const req = http.request(options, res => {
            let raw = '';
            res.on('data', chunk => { raw += chunk; });
            res.on('end', () => resolve({ status: res.statusCode!, data: JSON.parse(raw) }));
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

// ── Test runner ───────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const errors: string[] = [];

function assert(condition: boolean, message: string) {
    if (condition) { console.log(`  ✓  ${message}`); passed++; }
    else { console.error(`  ✗  ${message}`); failed++; errors.push(message); }
}
function assertEq(actual: any, expected: any, message: string) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) {
        console.error(`  ✗  ${message}\n     expected: ${JSON.stringify(expected)}\n     actual  : ${JSON.stringify(actual)}`);
        failed++; errors.push(message);
    } else { console.log(`  ✓  ${message}`); passed++; }
}

const INITIAL = {
    chiefMessages: [
        { text: '<p>Hello <strong>World</strong></p>', images: ['/assets/img1.jpg', '/assets/img2.jpg'], author: 'marine', displayAuthor: true },
        { text: '<p>Second</p>', images: ['/assets/img3.jpg'], author: 'marine', displayAuthor: false }
    ],
    amicalistMessages: [], recruits: [], events: [], flashNews: [], sdmisNews: []
};

async function runTests() {
    await saveDb(JSON.parse(JSON.stringify(INITIAL)));

    const app = createTestServer();
    const server = http.createServer(app);
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as any).port;
    console.log(`\nTest server on port ${port}`);

    // ── Test 1: successful update via HTTP ──────────────────────────────
    console.log('\nTest 1: Update text via HTTP POST /api/update');
    {
        const r = await post(server, '/api/update', {
            category: 'chiefMessages',
            originalIndex: 0,
            updatedItem: { ...INITIAL.chiefMessages[0], text: '<p>Updated via HTTP</p>' }
        });
        assertEq(r.status, 200, 'HTTP 200');
        assertEq(r.data.status, 'success', 'body.status = success');
        const db = await loadDb();
        assertEq(db.chiefMessages[0].text, '<p>Updated via HTTP</p>', 'text persisted in DB');
        assertEq(db.chiefMessages[0].images, ['/assets/img1.jpg', '/assets/img2.jpg'], 'images untouched');
    }

    // ── Test 2: remove one image via HTTP ───────────────────────────────
    console.log('\nTest 2: Remove one image via HTTP');
    await saveDb(JSON.parse(JSON.stringify(INITIAL)));
    {
        const r = await post(server, '/api/update', {
            category: 'chiefMessages',
            originalIndex: 0,
            updatedItem: {
                text: INITIAL.chiefMessages[0].text,
                images: ['/assets/img1.jpg'],   // img2 removed
                author: 'marine',
                displayAuthor: true
            }
        });
        assertEq(r.status, 200, 'HTTP 200');
        const db = await loadDb();
        assertEq(db.chiefMessages[0].images, ['/assets/img1.jpg'], 'one image remains');
    }

    // ── Test 3: invalid category returns 400 ────────────────────────────
    console.log('\nTest 3: Invalid category → 400');
    {
        const r = await post(server, '/api/update', {
            category: 'nonexistent',
            originalIndex: 0,
            updatedItem: { text: 'x' }
        });
        assertEq(r.status, 400, 'HTTP 400 for invalid category');
    }

    // ── Test 4: out-of-bounds index returns 404 ──────────────────────────
    console.log('\nTest 4: Out-of-bounds index → 404');
    {
        const r = await post(server, '/api/update', {
            category: 'chiefMessages',
            originalIndex: 99,
            updatedItem: { text: 'x' }
        });
        assertEq(r.status, 404, 'HTTP 404 for bad index');
    }

    // ── Test 5: full client payload simulation ───────────────────────────
    // Simulate exactly what the browser save handler sends:
    // formData = { text, displayAuthor } from inputs + images from keptImages
    console.log('\nTest 5: Full simulated client payload (text + kept image)');
    await saveDb(JSON.parse(JSON.stringify(INITIAL)));
    {
        // Simulate: user edited text, kept only img1
        const simulatedFormData = {
            text: '<p>Edited text</p>',
            displayAuthor: true,
            images: ['/assets/img1.jpg'],  // keptImages applied
            author: 'marine'
        };
        const r = await post(server, '/api/update', {
            category: 'chiefMessages',
            originalIndex: 0,
            updatedItem: simulatedFormData
        });
        assertEq(r.status, 200, 'HTTP 200');
        const db = await loadDb();
        assertEq(db.chiefMessages[0].text, '<p>Edited text</p>', 'text saved');
        assertEq(db.chiefMessages[0].images, ['/assets/img1.jpg'], 'one image saved');
        assertEq(db.chiefMessages[1].text, '<p>Second</p>', 'other message unchanged');
    }

    // ── Test 6: missing originalIndex field ─────────────────────────────
    console.log('\nTest 6: Missing originalIndex → 404');
    {
        const r = await post(server, '/api/update', {
            category: 'chiefMessages',
            // originalIndex deliberately omitted → undefined → NaN comparison
            updatedItem: { text: 'x' }
        });
        assertEq(r.status, 404, 'HTTP 404 when originalIndex missing');
    }

    server.close();
    await fs.unlink(TEST_DB);

    console.log(`\n${'─'.repeat(45)}`);
    console.log(`Results: ${passed} passed, ${failed} failed`);
    if (failed > 0) { console.error('Failed:', errors); process.exit(1); }
}

runTests().catch(e => { console.error(e); process.exit(1); });
