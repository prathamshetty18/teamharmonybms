const path = require('path');
const fs = require('fs');

const backendNodeModules = path.join(__dirname, '..', 'backend', 'node_modules');
if (fs.existsSync(backendNodeModules)) {
  module.paths.unshift(backendNodeModules);
}

const { MongoClient } = require('mongodb');

const backendEnvPath = path.join(__dirname, '..', 'backend', '.env');
const rootEnvPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(backendEnvPath)) {
  require('dotenv').config({ path: backendEnvPath });
} else if (fs.existsSync(rootEnvPath)) {
  require('dotenv').config({ path: rootEnvPath });
}

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/harmonybms';
const DB_NAME = process.env.DB_NAME || 'harmonybms';

async function wipeDatabase() {
  console.log(`Connecting to MongoDB at: ${MONGO_URI}`);
  const client = new MongoClient(MONGO_URI);
  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const collections = await db.listCollections().toArray();
    console.log(`Found ${collections.length} collections:`, collections.map(c => c.name));

    for (const c of collections) {
      const col = db.collection(c.name);
      const countBefore = await col.countDocuments();
      await col.deleteMany({});
      const countAfter = await col.countDocuments();
      console.log(`- Dropped data in collection '${c.name}': ${countBefore} -> ${countAfter}`);
    }

    console.log('\nAll collections successfully emptied in MongoDB database:', DB_NAME);
  } catch (err) {
    console.error('Error wiping database:', err);
    process.exit(1);
  } finally {
    await client.close();
  }
}

wipeDatabase();
