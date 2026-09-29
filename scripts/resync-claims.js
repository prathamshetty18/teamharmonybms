const path = require('path');
const { MongoClient } = require(path.resolve(__dirname, '../backend/node_modules/mongodb'));
const chain = require('../chain.js');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../backend/.env') });

const uri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/harmonybms';

async function resyncClaims() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('harmonybms');
  const claimsColl = db.collection('claims');

  const claims = await claimsColl.find({}).toArray();
  console.log(`Found ${claims.length} claims in Mongo to resync with on-chain truth...`);

  for (const c of claims) {
    const claimId = c.claimId || c.landId || c.id;
    try {
      const chainData = await chain.getClaim(Number(claimId));
      if (chainData) {
        const newScore = Number(chainData.score != null ? chainData.score : 0);
        const newStatus = chainData.status || c.status;
        const verificationStatus = newStatus === 'Verified' ? 'APPROVED' : (newStatus === 'Disputed' ? 'DISPUTED' : 'PENDING');

        console.log(`[indexer] score write — claimId: ${claimId}, newScore: ${newScore}`);
        console.log(`[resync] claimId: ${claimId} | chain score: ${newScore} (was ${c.score}) | status: ${newStatus} (was ${c.status})`);
        await claimsColl.updateOne(
          { _id: c._id },
          {
            $set: {
              score: newScore,
              status: newStatus,
              onChainStatus: newStatus,
              verificationStatus: verificationStatus,
              ownerHash: chainData.ownerHash || c.ownerHash,
              evidenceHash: chainData.evidenceHash || c.evidenceHash,
              updatedAt: new Date().toISOString()
            }
          }
        );
      }
    } catch (err) {
      console.warn(`[resync] Failed to read chain for claim ${claimId}:`, err.message);
    }
  }

  await client.close();
  console.log('Resync completed successfully.');
}

resyncClaims().catch(console.error);
