/**
 * Harmony BMS - Seed Script
 * 
 * Seeds 4 demonstration parcels:
 * - Claim #1: Ramesh Gowda (Verified, 2.0 acres, inside flood relief zone)
 * - Claim #2: Lakshmi Bai (Pending, 1.8 acres, inside flood relief zone)
 * - Claim #3: Anand Kumar (Disputed, overlaps Claim #1 by 42% to demo automated boundary dispute)
 * - Claim #4: Smt. Sunitha Rao (Verified, 2.2 acres, inside flood relief zone)
 * 
 * Seeds 1 Disaster Relief Scheme:
 * - relief_flood_2026: Karnataka SDRF Flood Relief Scheme 2026 (covers Claim #1, #2, #4)
 * 
 * Seeds corresponding payout records for demoing Assessed and Paid states.
 * 
 * Works with MongoDB Atlas / local MongoDB if running, and syncs with store.js cache.
 */

const path = require('path');
const fs = require('fs');

const backendNodeModules = path.join(__dirname, '..', 'backend', 'node_modules');
if (fs.existsSync(backendNodeModules)) {
  module.paths.unshift(backendNodeModules);
}

// Load environment variables from backend/.env or root .env
const backendEnvPath = path.join(__dirname, '..', 'backend', '.env');
const rootEnvPath = path.join(__dirname, '..', '.env');

if (fs.existsSync(backendEnvPath)) {
  require('dotenv').config({ path: backendEnvPath });
} else if (fs.existsSync(rootEnvPath)) {
  require('dotenv').config({ path: rootEnvPath });
}

const { MongoClient } = require('mongodb');
const { sha256, hashOwner, hashEvidence } = require('../backend/utils/hash');
const store = require('../backend/store');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/harmonybms';
const DB_NAME = process.env.DB_NAME || 'harmonybms';

// -------------------------------------------------------------
// GeoJSON Boundary Coordinates (Bangalore South / Basavanagudi)
// -------------------------------------------------------------

// Parcel 1: Ramesh Gowda [77.5610, 12.9405] to [77.5630, 12.9425] (~2.0 acres)
const polygonClaim1 = {
  type: 'Polygon',
  coordinates: [
    [
      [77.5610, 12.9405],
      [77.5630, 12.9405],
      [77.5630, 12.9425],
      [77.5610, 12.9425],
      [77.5610, 12.9405]
    ]
  ]
};

// Parcel 2: Lakshmi Bai [77.5635, 12.9405] to [77.5655, 12.9425] (~1.8 acres, adjacent)
const polygonClaim2 = {
  type: 'Polygon',
  coordinates: [
    [
      [77.5635, 12.9405],
      [77.5655, 12.9405],
      [77.5655, 12.9425],
      [77.5635, 12.9425],
      [77.5635, 12.9405]
    ]
  ]
};

// Parcel 3: Anand Kumar [77.5620, 12.9410] to [77.5640, 12.9430] (~2.0 acres, OVERLAPS Claim #1 by 42%)
const polygonClaim3 = {
  type: 'Polygon',
  coordinates: [
    [
      [77.5620, 12.9410],
      [77.5640, 12.9410],
      [77.5640, 12.9430],
      [77.5620, 12.9430],
      [77.5620, 12.9410]
    ]
  ]
};

// Parcel 4: Smt. Sunitha Rao [77.5660, 12.9430] to [77.5680, 12.9450] (~2.2 acres, inside zone)
const polygonClaim4 = {
  type: 'Polygon',
  coordinates: [
    [
      [77.5660, 12.9430],
      [77.5680, 12.9430],
      [77.5680, 12.9450],
      [77.5660, 12.9450],
      [77.5660, 12.9430]
    ]
  ]
};

// Flood Relief Zone: Enclosing polygon covering Basavanagudi South basin
const floodReliefZone = {
  type: 'Polygon',
  coordinates: [
    [
      [77.5500, 12.9300],
      [77.5800, 12.9300],
      [77.5800, 12.9600],
      [77.5500, 12.9600],
      [77.5500, 12.9300]
    ]
  ]
};

// -------------------------------------------------------------
// Seed Data Definitions
// -------------------------------------------------------------

const seedClaims = [
  // 1. Verified Claim inside Relief Zone
  {
    claimId: '1',
    ownerName: 'Ramesh Gowda',
    nationalId: 'IND-KA-560019-1088',
    ownerHash: hashOwner('IND-KA-560019-1088'),
    evidenceHash: hashEvidence({
      photos: ['/uploads/evidence_claim1_deed.jpg', '/uploads/evidence_claim1_survey.jpg'],
      polygon: polygonClaim1,
      ownerName: 'Ramesh Gowda'
    }),
    polygon: polygonClaim1,
    latE6: 12941500,
    lonE6: 77562000,
    referencePoint: [77.5620, 12.9415],
    parcelAreaAcres: 2.0,
    confirmedAreaAcres: 2.0,
    score: 5,
    status: 'Verified',
    attestations: [
      {
        attesterAddress: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
        attesterName: 'Suresh Patil (Neighbor)',
        role: 'Neighbor',
        weight: 1,
        notes: 'Confirmed boundary marks and ancestral stone markers',
        timestamp: '2026-09-28T09:15:00.000Z'
      },
      {
        attesterAddress: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
        attesterName: 'Devi Prasad (Neighbor)',
        role: 'Neighbor',
        weight: 1,
        notes: 'Owner has farmed this plot for over 25 years',
        timestamp: '2026-09-28T10:00:00.000Z'
      },
      {
        attesterAddress: '0x9965507D1a55bcC2695C58ba16FB37d819B0A4df',
        attesterName: 'Gram Panchayat Leader V. Reddy',
        role: 'Village Leader',
        weight: 3,
        notes: 'Panchayat revenue register verification cross-matched with patta',
        timestamp: '2026-09-28T11:45:00.000Z'
      }
    ],
    dispute: null,
    disputeReason: null,
    disputeNotes: null,
    conflicts: null,
    photos: [
      '/uploads/evidence_claim1_deed.jpg',
      '/uploads/evidence_claim1_survey.jpg'
    ],
    beneficiaryAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    notes: 'Historic ancestral property in Basavanagudi area registered under family title deed',
    createdAt: '2026-09-28T08:30:00.000Z',
    updatedAt: '2026-09-28T11:45:00.000Z'
  },

  // 2. Pending Claim inside Relief Zone (needs 3 more points to verify)
  {
    claimId: '2',
    ownerName: 'Lakshmi Bai',
    nationalId: 'IND-KA-560019-2041',
    ownerHash: hashOwner('IND-KA-560019-2041'),
    evidenceHash: hashEvidence({
      photos: ['/uploads/evidence_claim2_survey.jpg'],
      polygon: polygonClaim2,
      ownerName: 'Lakshmi Bai'
    }),
    polygon: polygonClaim2,
    latE6: 12941500,
    lonE6: 77564500,
    referencePoint: [77.5645, 12.9415],
    parcelAreaAcres: 1.8,
    confirmedAreaAcres: 1.8,
    score: 2,
    status: 'Pending',
    attestations: [
      {
        attesterAddress: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
        attesterName: 'Suresh Patil (Neighbor)',
        role: 'Neighbor',
        weight: 1,
        notes: 'Neighbor confirms residential dwelling location',
        timestamp: '2026-09-28T12:00:00.000Z'
      },
      {
        attesterAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        attesterName: 'Ramesh Gowda (Neighbor)',
        role: 'Neighbor',
        weight: 1,
        notes: 'East side border shares fence with my land',
        timestamp: '2026-09-28T12:30:00.000Z'
      }
    ],
    dispute: null,
    disputeReason: null,
    disputeNotes: null,
    conflicts: null,
    photos: [
      '/uploads/evidence_claim2_survey.jpg'
    ],
    beneficiaryAddress: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    notes: 'Agricultural and homestead parcel adjacent to Claim 1. Awaiting Village Leader attestation.',
    createdAt: '2026-09-28T11:00:00.000Z',
    updatedAt: '2026-09-28T12:30:00.000Z'
  },

  // 3. Disputed Claim (Overlapping Claim #1 by 42% — Demos Automated Dispute Resolution)
  {
    claimId: '3',
    ownerName: 'Anand Kumar',
    nationalId: 'IND-KA-560019-3389',
    ownerHash: hashOwner('IND-KA-560019-3389'),
    evidenceHash: hashEvidence({
      photos: ['/uploads/evidence_claim3_tax_receipt.jpg'],
      polygon: polygonClaim3,
      ownerName: 'Anand Kumar'
    }),
    polygon: polygonClaim3,
    latE6: 12942000,
    lonE6: 77563000,
    referencePoint: [77.5630, 12.9420],
    parcelAreaAcres: 2.0,
    confirmedAreaAcres: null,
    score: 1,
    status: 'Disputed',
    attestations: [
      {
        attesterAddress: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
        attesterName: 'Suresh Patil (Neighbor)',
        role: 'Neighbor',
        weight: 1,
        notes: 'Tentative attestation; boundary unclear',
        timestamp: '2026-09-28T13:00:00.000Z'
      }
    ],
    dispute: {
      isDisputed: true,
      reason: 'Geospatial boundary conflict: overlaps registered Parcel #1 (Ramesh Gowda) by 42%',
      notes: 'Automated dispute flagged during POST /claims submission. Overlaps detected with existing claim(s): #1. Immediate freeze placed on payouts pending human boundary arbitration.',
      disputerAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      disputerName: 'Automated Geospatial Overlap Engine',
      overlappingClaimId: '1',
      conflicts: [
        {
          claimId: '1',
          ownerName: 'Ramesh Gowda',
          candidateOverlapPercent: 42.1,
          existingOverlapPercent: 42.1,
          overlapAreaAcres: 0.84,
          reason: 'Boundary overlap of 42.1% (0.84 acres) with Parcel #1 (Ramesh Gowda)'
        }
      ],
      timestamp: '2026-09-28T13:30:00.000Z'
    },
    disputeReason: 'Geospatial boundary conflict: overlaps registered Parcel #1 (Ramesh Gowda) by 42%',
    disputeNotes: 'Automated dispute flagged during POST /claims submission. Overlaps detected with existing claim(s): #1. Immediate freeze placed on payouts pending human boundary arbitration.',
    conflicts: [
      {
        claimId: '1',
        ownerName: 'Ramesh Gowda',
        candidateOverlapPercent: 42.1,
        existingOverlapPercent: 42.1,
        overlapAreaAcres: 0.84
      }
    ],
    photos: [
      '/uploads/evidence_claim3_tax_receipt.jpg'
    ],
    beneficiaryAddress: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
    notes: 'Candidate claim automatically flagged by Turf.js geospatial overlap engine. Payouts frozen.',
    createdAt: '2026-09-28T12:45:00.000Z',
    updatedAt: '2026-09-28T13:30:00.000Z'
  },

  // 4. Second Verified Claim inside Relief Zone (ready for assessment)
  {
    claimId: '4',
    ownerName: 'Smt. Sunitha Rao',
    nationalId: 'IND-KA-560019-4412',
    ownerHash: hashOwner('IND-KA-560019-4412'),
    evidenceHash: hashEvidence({
      photos: ['/uploads/evidence_claim4_panchayat_letter.jpg'],
      polygon: polygonClaim4,
      ownerName: 'Smt. Sunitha Rao'
    }),
    polygon: polygonClaim4,
    latE6: 12944000,
    lonE6: 77567000,
    referencePoint: [77.5670, 12.9440],
    parcelAreaAcres: 2.2,
    confirmedAreaAcres: 2.2,
    score: 6,
    status: 'Verified',
    attestations: [
      {
        attesterAddress: '0x9965507D1a55bcC2695C58ba16FB37d819B0A4df',
        attesterName: 'Gram Panchayat Leader V. Reddy',
        role: 'Village Leader',
        weight: 3,
        notes: 'Panchayat revenue register verification complete',
        timestamp: '2026-09-28T13:15:00.000Z'
      },
      {
        attesterAddress: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
        attesterName: 'Red Cross Karnataka Relief Team',
        role: 'Accredited NGO',
        weight: 3,
        notes: 'Field GPS boundary survey confirmed by emergency aid worker',
        timestamp: '2026-09-28T13:45:00.000Z'
      }
    ],
    dispute: null,
    disputeReason: null,
    disputeNotes: null,
    conflicts: null,
    photos: [
      '/uploads/evidence_claim4_panchayat_letter.jpg'
    ],
    beneficiaryAddress: '0x2546BcD3c84621e976D8185a91A922aE77ECEc30',
    notes: 'Verified parcel within Basavanagudi flood sector. Ready for post-disaster damage assessment.',
    createdAt: '2026-09-28T12:00:00.000Z',
    updatedAt: '2026-09-28T13:45:00.000Z'
  }
];

const seedReliefs = [
  // 1. Primary Flood Relief Scheme covering Verified Claim #1 and Claim #4
  {
    reliefId: 'relief_flood_2026',
    name: 'Karnataka State SDRF Flood Relief Scheme 2026',
    description: 'Emergency disaster compensation for flood-inundated agricultural and homestead plots in Bangalore South (Cauvery Basin)',
    disasterType: 'flood',
    zone: floodReliefZone,
    zoneHash: sha256(floodReliefZone),
    ratePerAcre: '1000000000000000000', // 1.0 MST per acre in wei
    maxPerClaim: '5000000000000000000', // 5.0 MST max cap per claim in wei
    budget: '100000000000000000000',    // 100.0 MST total budget in wei
    remainingBudget: '98000000000000000000', // 98.0 MST remaining after Claim 1 payout
    createdAt: '2026-09-28T07:00:00.000Z',
    updatedAt: '2026-09-28T14:30:00.000Z'
  }
];

const seedPayouts = [
  // Payout 1: Claim #1 (Paid out: Level 4 damage, 2.0 acres, 1.0 MST/acre * 100% = 2.0 MST)
  {
    payoutId: 'payout_claim_1_relief_flood_2026',
    claimId: '1',
    reliefId: 'relief_flood_2026',
    beneficiaryAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    status: 'Paid',
    damageLevel: 4,
    answers: {
      depth: 'high',
      structure: 'major',
      duration: 'long',
      type: 'pucca',
      contents: 'all'
    },
    confirmedAreaAcres: 2.0,
    damageNotes: 'Flooding inundated entire plot and collapsed mud boundary bunds. Level 4 catastrophic damage verified.',
    damageEvidenceHash: '0x8f1e2d3c4b5a6f7e8d9c0b1a2f3e4d5c6b7a8f9e0d1c2b3a4f5e6d7c8b9a0f1e',
    amount: '2000000000000000000', // 2.0 MST in wei
    approvals: [
      'Officer_Kulkarni_KA102',
      'Officer_Deshmukh_KA204'
    ],
    txHash: '0x4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e',
    releasedAt: '2026-09-28T15:00:00.000Z',
    assessorAddress: '0x2546BcD3c84621e976D8185a91A922aE77ECEc30'
  },

  // Payout 4: Claim #4 (Assessed: Level 2 damage, 2.2 acres, 1.0 MST * 50% = 1.1 MST)
  {
    payoutId: 'payout_claim_4_relief_flood_2026',
    claimId: '4',
    reliefId: 'relief_flood_2026',
    beneficiaryAddress: '0x2546BcD3c84621e976D8185a91A922aE77ECEc30',
    status: 'Assessed',
    damageLevel: 2,
    answers: {
      depth: 'low',
      structure: 'partial',
      duration: 'short',
      type: 'pucca',
      contents: 'none'
    },
    confirmedAreaAcres: 2.2,
    damageNotes: 'Partial perimeter inundation. Silt deposited over lower terrace. Level 2 moderate damage confirmed.',
    damageEvidenceHash: '0x7e8d9c0b1a2f3e4d5c6b7a8f9e0d1c2b3a4f5e6d7c8b9a0f1e2d3c4b5a6f7e8d',
    amount: '1100000000000000000', // 1.1 MST in wei
    approvals: [
      'Officer_Kulkarni_KA102'
    ],
    txHash: null,
    releasedAt: null,
    assessorAddress: '0x2546BcD3c84621e976D8185a91A922aE77ECEc30'
  }
];

async function seedDatabase() {
  console.log('===========================================================');
  console.log('🌱 Harmony BMS - Seeding Demonstration Data');
  console.log('===========================================================');

  // 1. Sync in-memory store
  console.log('[1/4] Synchronizing in-memory cache...');
  for (const c of seedClaims) {
    await store.save('claims', c);
  }
  for (const r of seedReliefs) {
    await store.save('reliefs', r);
  }
  for (const p of seedPayouts) {
    await store.save('payouts', p);
  }
  console.log('      ✓ In-memory store successfully populated');

  // 2. Connect to MongoDB (Atlas or local)
  const client = new MongoClient(MONGO_URI, {
    serverSelectionTimeoutMS: 4000,
    connectTimeoutMS: 4000
  });

  try {
    console.log(`[2/4] Connecting to MongoDB: ${MONGO_URI.replace(/\/\/.*@/, '//***@')}`);
    await client.connect();
    const db = client.db(DB_NAME);
    console.log(`      ✓ Connected to database: "${DB_NAME}"`);

    const claimsCol = db.collection('claims');
    const reliefsCol = db.collection('reliefs');
    const payoutsCol = db.collection('payouts');

    // 3. Clear existing data
    console.log(`[3/4] Resetting collections in "${DB_NAME}"...`);
    await claimsCol.deleteMany({});
    await reliefsCol.deleteMany({});
    await payoutsCol.deleteMany({});

    // 4. Insert documents
    console.log(`[4/4] Inserting demo records...`);
    await claimsCol.insertMany(seedClaims);
    await claimsCol.createIndex({ claimId: 1 }, { unique: true });
    console.log(`      ✓ Inserted ${seedClaims.length} parcel claims (including overlapping dispute demo)`);

    await reliefsCol.insertMany(seedReliefs);
    await reliefsCol.createIndex({ reliefId: 1 }, { unique: true });
    console.log(`      ✓ Inserted ${seedReliefs.length} flood relief zone (covering Verified Claim #1 & #4)`);

    await payoutsCol.insertMany(seedPayouts);
    await payoutsCol.createIndex({ claimId: 1, reliefId: 1 });
    console.log(`      ✓ Inserted ${seedPayouts.length} payout records (Assessed & Paid demo states)`);

    console.log('\n-----------------------------------------------------------');
    console.log('🎉 Database seeding completed successfully in Atlas & Memory!');
    console.log('-----------------------------------------------------------');
    console.log('Seeded Parcels:');
    console.log('  #1 - Ramesh Gowda     | Status: Verified (5 pts) | Zone: INSIDE  | Payout: Paid (2.0 MST)');
    console.log('  #2 - Lakshmi Bai      | Status: Pending (2 pts)  | Zone: INSIDE  | Payout: None');
    console.log('  #3 - Anand Kumar      | Status: Disputed         | Overlaps: #1 (42% conflict demo)');
    console.log('  #4 - Smt. Sunitha Rao | Status: Verified (6 pts) | Zone: INSIDE  | Payout: Assessed (1.1 MST)');
    console.log('\nSeeded Relief Schemes:');
    console.log('  relief_flood_2026     | Karnataka SDRF Flood Relief | Budget: 100 MST | Rate: 1 MST/acre');
    console.log('===========================================================\n');
  } catch (err) {
    console.warn(`[Seed Notice] MongoDB server not reachable (${err.message}).`);
    console.log('✓ All 4 claims, relief scheme, and payouts are active in-memory and will serve Express REST API seamlessly.\n');
  } finally {
    try {
      await client.close();
    } catch {}
  }
}

if (require.main === module) {
  seedDatabase().then(() => process.exit(0)).catch(err => {
    console.error('Seed error:', err);
    process.exit(1);
  });
}

module.exports = {
  seedDatabase,
  seedClaims,
  seedReliefs,
  seedPayouts,
  polygonClaim1,
  polygonClaim2,
  polygonClaim3,
  polygonClaim4,
  floodReliefZone
};
