const { MongoClient } = require('mongodb');
const path = require('path');
const chain = require('../chain.js');
require('dotenv').config({ path: path.resolve(__dirname, '../backend/.env') });

(async () => {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017';
  const c = new MongoClient(uri);
  await c.connect();
  const db = c.db('harmonybms');
  
  let chainData = null;
  try {
    chainData = await chain.getClaim(3);
  } catch (e) {
    console.warn('Chain read error for claim 3:', e.message);
  }

  const claim3Doc = {
    claimId: '3',
    landId: '3',
    ownerName: 'vandya',
    citizenName: 'vandya',
    nationalId: 'IND-KA-560019',
    surveyNumber: '142/3b',
    plotNumber: 'Plot #3',
    village: 'kestur',
    taluk: 'Mandya',
    district: 'Mandya',
    state: 'Karnataka',
    landUseFarmerDeclared: 'Agricultural / Farmland',
    landUseGovtRecord: 'Agricultural / Farmland',
    landUseGroundVerified: 'Agricultural / Farmland',
    landUseFinalApproved: 'Agricultural / Farmland',
    parcelAreaAcres: 3.0,
    areaAcres: 3.0,
    area: { acres: 3.0, hectares: 1.2141, sqm: 12140.57 },
    score: chainData ? Number(chainData.score) : 6,
    status: chainData ? chainData.status : 'Verified',
    onChainStatus: chainData ? chainData.status : 'Verified',
    verificationStatus: 'APPROVED',
    workflowStatus: 'Approved',
    ownerHash: chainData?.ownerHash || '0xbed926e2111599c9795b14eaa4148000f6a01e3edd97f03e48064dc33156de7d',
    evidenceHash: chainData?.evidenceHash || '0xafbcd09d72d635836c971b889c82af5ad7054e56310bc104b38e8201fbfcd162',
    latE6: 12971540,
    lonE6: 77594500,
    referencePoint: [77.5945, 12.97154],
    polygon: {
      type: 'Polygon',
      coordinates: [[
        [77.5941, 12.9711],
        [77.5952, 12.9712],
        [77.5951, 12.9722],
        [77.594, 12.9721],
        [77.5941, 12.9711]
      ]]
    },
    attestations: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  await db.collection('claims').updateOne(
    { claimId: '3' },
    { $set: claim3Doc },
    { upsert: true }
  );

  console.log('Claim 3 upserted successfully into Mongo!');
  const all = await db.collection('claims').find({}, { claimId: 1, ownerName: 1, score: 1, status: 1, _id: 0 }).toArray();
  console.log('All claims in Mongo:', all);
  await c.close();
})();
