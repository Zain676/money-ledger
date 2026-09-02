/**
 * Netlify Serverless Function — MongoDB Atlas API
 * Handles cloud persistence and multi-device sync for Money Ledger
 */

const { MongoClient, ServerApiVersion } = require('mongodb');
const dns = require('dns');

// Configure reliable DNS servers for SRV resolution (8.8.8.8 & 1.1.1.1)
try {
    dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
} catch (e) {
    // DNS setting fallback
}

// Try loading local .env if available
try {
    require('dotenv').config();
} catch (e) {
    // dotenv is optional in production Netlify environment
}

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB_NAME || 'money_ledger';
const COLLECTION_NAME = 'ledger_data';
const LEDGER_DOC_ID = 'primary_user_ledger';

// Global cache for MongoDB connection across serverless invocations
let cachedClient = null;
let cachedDb = null;

async function connectToDatabase() {
    if (!MONGODB_URI) {
        throw new Error('MONGODB_URI environment variable is not configured.');
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
        connectTimeoutMS: 5000,
        socketTimeoutMS: 30000,
    });

    await client.connect();
    const db = client.db(DB_NAME);

    cachedClient = client;
    cachedDb = db;

    return { client, db };
}

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json',
};

exports.handler = async (event, context) => {
    // Enable connection re-use in AWS Lambda / Netlify
    context.callbackWaitsForEmptyEventLoop = false;

    // Handle Preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 204,
            headers: corsHeaders,
            body: '',
        };
    }

    const path = event.path || '';
    const isHealth = path.endsWith('/health');
    const isLedger = path.endsWith('/ledger') || path.endsWith('/api') || path.endsWith('/api/');

    try {
        // 1. Healthcheck Route
        if (isHealth) {
            if (!MONGODB_URI) {
                return {
                    statusCode: 200,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        status: 'ok',
                        database: 'not_configured',
                        message: 'MONGODB_URI not set. Running in local storage mode.',
                    }),
                };
            }

            const { db } = await connectToDatabase();
            await db.command({ ping: 1 });

            return {
                statusCode: 200,
                headers: corsHeaders,
                body: JSON.stringify({
                    status: 'ok',
                    database: 'connected',
                    cluster: 'MongoDB Atlas',
                    databaseName: DB_NAME,
                }),
            };
        }

        // Check if database is configured
        if (!MONGODB_URI) {
            return {
                statusCode: 200,
                headers: corsHeaders,
                body: JSON.stringify({
                    success: false,
                    isLocalMode: true,
                    message: 'MONGODB_URI environment variable is not configured. Using browser localStorage.',
                }),
            };
        }

        const { db } = await connectToDatabase();
        const collection = db.collection(COLLECTION_NAME);

        // 2. GET /api/ledger — Retrieve Cloud State
        if (event.httpMethod === 'GET') {
            const doc = await collection.findOne({ _id: LEDGER_DOC_ID });

            if (!doc) {
                return {
                    statusCode: 200,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        success: true,
                        exists: false,
                        data: null,
                        message: 'No cloud ledger found yet. Ready to initialize.',
                    }),
                };
            }

            return {
                statusCode: 200,
                headers: corsHeaders,
                body: JSON.stringify({
                    success: true,
                    exists: true,
                    data: {
                        accounts: doc.accounts || [],
                        people: doc.people || [],
                        categories: doc.categories || [],
                        transactions: doc.transactions || [],
                        settings: doc.settings || { currency: 'Rs. ', theme: 'light' },
                    },
                    lastSyncedAt: doc.updatedAt,
                }),
            };
        }

        // 3. POST /api/ledger — Save / Update Cloud State
        if (event.httpMethod === 'POST') {
            let payload;
            try {
                payload = JSON.parse(event.body);
            } catch (e) {
                return {
                    statusCode: 400,
                    headers: corsHeaders,
                    body: JSON.stringify({ success: false, error: 'Invalid JSON payload' }),
                };
            }

            const { accounts, people, categories, transactions, settings } = payload;

            const updateDoc = {
                _id: LEDGER_DOC_ID,
                accounts: Array.isArray(accounts) ? accounts : [],
                people: Array.isArray(people) ? people : [],
                categories: Array.isArray(categories) ? categories : [],
                transactions: Array.isArray(transactions) ? transactions : [],
                settings: settings || { currency: 'Rs. ', theme: 'light' },
                updatedAt: new Date().toISOString(),
            };

            await collection.replaceOne(
                { _id: LEDGER_DOC_ID },
                updateDoc,
                { upsert: true }
            );

            return {
                statusCode: 200,
                headers: corsHeaders,
                body: JSON.stringify({
                    success: true,
                    message: 'Successfully synced to MongoDB Atlas',
                    updatedAt: updateDoc.updatedAt,
                }),
            };
        }

        // Fallback for unsupported methods
        return {
            statusCode: 405,
            headers: corsHeaders,
            body: JSON.stringify({ success: false, error: 'Method Not Allowed' }),
        };

    } catch (error) {
        console.error('API Handler Error:', error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({
                success: false,
                error: error.message || 'Internal Server Error',
            }),
        };
    }
};
