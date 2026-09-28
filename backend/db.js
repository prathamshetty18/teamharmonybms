const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/harmonybms';
const DB_NAME = process.env.DB_NAME || 'harmonybms';

let client = null;
let db = null;
let isConnected = false;

const collections = {
  claims: null,
  reliefs: null,
  payouts: null
};

/**
 * Connects to MongoDB using the MongoClient.
 * If connection succeeds, initializes collections.
 * If MongoDB is not reachable, logs warning without crashing.
 */
async function connectDB() {
  if (isConnected && db) {
    return db;
  }

  try {
    client = new MongoClient(MONGO_URI, {
      serverSelectionTimeoutMS: 2000,
      connectTimeoutMS: 2000
    });

    await client.connect();
    db = client.db(DB_NAME);
    isConnected = true;

    collections.claims = db.collection('claims');
    collections.reliefs = db.collection('reliefs');
    collections.payouts = db.collection('payouts');

    // Create unique indices for primary identifiers
    await collections.claims.createIndex({ claimId: 1 }, { unique: true }).catch(() => {});
    await collections.reliefs.createIndex({ reliefId: 1 }, { unique: true }).catch(() => {});
    await collections.payouts.createIndex({ claimId: 1, reliefId: 1 }).catch(() => {});

    console.log(`[Database] Connected successfully to MongoDB at ${MONGO_URI.replace(/\/\/.*@/, '//***@')}`);
    return db;
  } catch (err) {
    console.warn(`[Database] Notice: MongoDB connection failed (${err.message}). Operating with local data store.`);
    isConnected = false;
    return null;
  }
}

/**
 * Returns database handle if connected, else null.
 */
function getDb() {
  return db;
}

/**
 * Checks if MongoDB is currently connected.
 */
function isDbConnected() {
  return isConnected && db !== null;
}

/**
 * Returns collection handle if connected, else null.
 */
function getCollection(name) {
  if (!isConnected || !db) return null;
  return db.collection(name);
}

/**
 * Closes the MongoDB connection.
 */
async function closeDB() {
  if (client) {
    await client.close();
    client = null;
    db = null;
    isConnected = false;
    console.log('[Database] MongoDB connection closed');
  }
}

// Export base DB functions first to prevent circular dependency issues
module.exports = {
  connectDB,
  getDb,
  isDbConnected,
  getCollection,
  closeDB,
  collections
};

// Re-export store interface via getters so both db.js and store.js satisfy data layer operations
Object.defineProperty(module.exports, 'claims', {
  get: () => require('./store').claims,
  enumerable: true
});
Object.defineProperty(module.exports, 'reliefs', {
  get: () => require('./store').reliefs,
  enumerable: true
});
Object.defineProperty(module.exports, 'payouts', {
  get: () => require('./store').payouts,
  enumerable: true
});
Object.defineProperty(module.exports, 'getAll', {
  get: () => require('./store').getAll,
  enumerable: true
});
Object.defineProperty(module.exports, 'getById', {
  get: () => require('./store').getById,
  enumerable: true
});
Object.defineProperty(module.exports, 'save', {
  get: () => require('./store').save,
  enumerable: true
});
Object.defineProperty(module.exports, 'update', {
  get: () => require('./store').update,
  enumerable: true
});
