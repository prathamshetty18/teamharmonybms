const { MongoClient } = require('d:/BMS_MST_hackathon/backend/node_modules/mongodb');

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/harmonybms';
const client = new MongoClient(uri);

async function main() {
  await client.connect();
  const db = client.db();
  const r1 = await db.collection('users').updateMany({ role: "citizen" }, { $set: { role: "Farmer" } });
  const r2 = await db.collection('users').updateMany({ role: "government" }, { $set: { role: "Government Officer" } });
  console.log("citizen → Farmer:", r1.modifiedCount);
  console.log("government → Government Officer:", r2.modifiedCount);
  console.log("Remaining non-canonical roles:");
  const distinct = await db.collection('users').distinct("role");
  distinct.forEach(r => console.log("  ", r));
  await client.close();
}

main().catch(console.error);
