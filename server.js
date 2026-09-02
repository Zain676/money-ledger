/**
 * Local Development Server for Money Ledger
 * Serves static frontend and handles /api routes connected to MongoDB Atlas
 */

require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
const dns = require('dns');

// Configure reliable DNS servers for SRV resolution (8.8.8.8 & 1.1.1.1)
try {
    dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
} catch (e) {
    // DNS setting fallback
}

const { MongoClient, ServerApiVersion } = require('mongodb');

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB_NAME || 'money_ledger';
const COLLECTION_NAME = 'ledger_data';
const LEDGER_DOC_ID = 'primary_user_ledger';

let cachedClient = null;
let cachedDb = null;

async function getDatabase() {
    if (!MONGODB_URI) {
        throw new Error('MONGODB_URI is not set in .env');
    }
    if (cachedClient && cachedDb) {
        return { client: cachedClient, db: cachedDb };
    }
    const client = new MongoClient(MONGODB_URI, {
        serverApi: {
            version: ServerApiVersion.v1,
            strict: false,
            deprecationErrors: true,
        },
        maxPoolSize: 10,
        connectTimeoutMS: 8000,
        socketTimeoutMS: 30000,
    });
    await client.connect();
    const db = client.db(DB_NAME);
    cachedClient = client;
    cachedDb = db;
    return { client, db };
}

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const url = req.url.split('?')[0];

    // 1. API: Healthcheck
    if (url === '/api/health') {
        res.setHeader('Content-Type', 'application/json');
        try {
            if (!MONGODB_URI) {
                res.writeHead(200);
                res.end(JSON.stringify({ status: 'ok', database: 'not_configured' }));
                return;
            }
            const { db } = await getDatabase();
            await db.command({ ping: 1 });
            res.writeHead(200);
            res.end(JSON.stringify({
                status: 'ok',
                database: 'connected',
                cluster: 'MongoDB Atlas',
                databaseName: DB_NAME
            }));
        } catch (err) {
            console.error('Healthcheck DB Error:', err.message);
            res.writeHead(200);
            res.end(JSON.stringify({
                status: 'error',
                database: 'disconnected',
                error: err.message
            }));
        }
        return;
    }

    // 2. API: GET /api/ledger
    if (url === '/api/ledger' && req.method === 'GET') {
        res.setHeader('Content-Type', 'application/json');
        try {
            const { db } = await getDatabase();
            const collection = db.collection(COLLECTION_NAME);
            const doc = await collection.findOne({ _id: LEDGER_DOC_ID });

            if (!doc) {
                res.writeHead(200);
                res.end(JSON.stringify({
                    success: true,
                    exists: false,
                    data: null,
                    message: 'No cloud ledger found yet.'
                }));
                return;
            }

            res.writeHead(200);
            res.end(JSON.stringify({
                success: true,
                exists: true,
                data: {
                    accounts: doc.accounts || [],
                    people: doc.people || [],
                    categories: doc.categories || [],
                    transactions: doc.transactions || [],
                    settings: doc.settings || { currency: 'Rs. ', theme: 'light' }
                },
                lastSyncedAt: doc.updatedAt
            }));
        } catch (err) {
            console.error('GET Ledger DB Error:', err.message);
            res.writeHead(500);
            res.end(JSON.stringify({ success: false, error: err.message }));
        }
        return;
    }

    // 3. API: POST /api/ledger
    if (url === '/api/ledger' && req.method === 'POST') {
        res.setHeader('Content-Type', 'application/json');
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
            try {
                const payload = JSON.parse(body);
                const { db } = await getDatabase();
                const collection = db.collection(COLLECTION_NAME);

                const updateDoc = {
                    _id: LEDGER_DOC_ID,
                    accounts: Array.isArray(payload.accounts) ? payload.accounts : [],
                    people: Array.isArray(payload.people) ? payload.people : [],
                    categories: Array.isArray(payload.categories) ? payload.categories : [],
                    transactions: Array.isArray(payload.transactions) ? payload.transactions : [],
                    settings: payload.settings || { currency: 'Rs. ', theme: 'light' },
                    updatedAt: new Date().toISOString()
                };

                await collection.replaceOne(
                    { _id: LEDGER_DOC_ID },
                    updateDoc,
                    { upsert: true }
                );

                console.log(`[MongoDB Atlas] Synced: ${updateDoc.transactions.length} txs, ${updateDoc.accounts.length} accounts, ${updateDoc.people.length} people at ${updateDoc.updatedAt}`);

                res.writeHead(200);
                res.end(JSON.stringify({
                    success: true,
                    message: 'Saved to MongoDB Atlas',
                    updatedAt: updateDoc.updatedAt
                }));
            } catch (err) {
                console.error('POST Ledger DB Error:', err.message);
                res.writeHead(500);
                res.end(JSON.stringify({ success: false, error: err.message }));
            }
        });
        return;
    }

    // 4. Static File Server
    let filePath = path.join(__dirname, url === '/' ? 'index.html' : url);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                // Fallback to index.html for SPA routes
                fs.readFile(path.join(__dirname, 'index.html'), (fallbackErr, fallbackContent) => {
                    if (fallbackErr) {
                        res.writeHead(404);
                        res.end('File Not Found');
                    } else {
                        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                        res.end(fallbackContent);
                    }
                });
            } else {
                res.writeHead(500);
                res.end(`Server Error: ${err.code}`);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content);
        }
    });
});

server.listen(PORT, async () => {
    console.log(`\n==================================================`);
    console.log(`🚀 Money Ledger local server running!`);
    console.log(`👉 Open: http://localhost:${PORT}`);
    console.log(`==================================================\n`);

    try {
        const { db } = await getDatabase();
        console.log(`✅ MongoDB Atlas connected: Database "${DB_NAME}"`);
    } catch (e) {
        console.warn(`⚠️ MongoDB connection check:`, e.message);
    }
});
