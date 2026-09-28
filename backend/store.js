const { getCollection, isDbConnected } = require('./db');
const { sha256, hashOwner, hashEvidence } = require('./utils/hash');

// Realistic initial seed data for immediate out-of-the-box functionality
const initialClaims = [
  {
    claimId: '1',
    ownerName: 'Ramesh Gowda',
    nationalId: 'IND-KA-560019-1092',
    ownerHash: hashOwner('IND-KA-560019-1092'),
    evidenceHash: '0x9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b',
    polygon: {
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
    },
    latE6: 12941500,
    lonE6: 77562000,
    referencePoint: [77.5620, 12.9415],
    parcelAreaAcres: 2.5,
    confirmedAreaAcres: 2.5,
    score: 5,
    status: 'Verified',
    attestations: [
      {
        attesterAddress: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
        attesterName: 'Suresh Patil (Neighbor)',
        role: 'Neighbor',
        weight: 1,
        timestamp: '2026-09-28T09:15:00.000Z'
      },
      {
        attesterAddress: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
        attesterName: 'Devi Prasad (Neighbor)',
        role: 'Neighbor',
        weight: 1,
        timestamp: '2026-09-28T10:00:00.000Z'
      },
      {
        attesterAddress: '0x9965507D1a55bcC2695C58ba16FB37d819B0A4df',
        attesterName: 'Gram Panchayat Leader V. Reddy',
        role: 'Village Leader',
        weight: 3,
        timestamp: '2026-09-28T11:45:00.000Z'
      }
    ],
    dispute: null,
    photos: [
      '/uploads/evidence_claim1_deed.jpg',
      '/uploads/evidence_claim1_survey.jpg'
    ],
    beneficiaryAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    notes: 'Historic ancestral property in Basavanagudi area registered under family title deed',
    createdAt: '2026-09-28T08:30:00.000Z',
    updatedAt: '2026-09-28T11:45:00.000Z'
  },
  {
    claimId: '2',
    ownerName: 'Lakshmi Bai',
    nationalId: 'IND-KA-560019-2041',
    ownerHash: hashOwner('IND-KA-560019-2041'),
    evidenceHash: '0x4f5e6d7c8b9a0f1e2d3c4b5a6f7e8d9c0b1a2f3e4d5c6b7a8f9e0d1c2b3a4f5e',
    polygon: {
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
    },
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
        timestamp: '2026-09-28T12:00:00.000Z'
      },
      {
        attesterAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        attesterName: 'Ramesh Gowda (Neighbor)',
        role: 'Neighbor',
        weight: 1,
        timestamp: '2026-09-28T12:30:00.000Z'
      }
    ],
    dispute: null,
    photos: [
      '/uploads/evidence_claim2_survey.jpg'
    ],
    beneficiaryAddress: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    notes: 'Agricultural and homestead parcel adjacent to Claim 1',
    createdAt: '2026-09-28T11:00:00.000Z',
    updatedAt: '2026-09-28T12:30:00.000Z'
  },
  {
    claimId: '3',
    ownerName: 'Anand Kumar',
    nationalId: 'IND-KA-560019-3389',
    ownerHash: hashOwner('IND-KA-560019-3389'),
    evidenceHash: '0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b',
    polygon: {
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
    },
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
        timestamp: '2026-09-28T13:00:00.000Z'
      }
    ],
    dispute: {
      isDisputed: true,
      reason: 'Boundary overlap of approximately 42% with registered Parcel 1 (Ramesh Gowda)',
      disputerAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      disputerName: 'Ramesh Gowda',
      overlappingClaimId: '1',
      timestamp: '2026-09-28T13:30:00.000Z'
    },
    photos: [
      '/uploads/evidence_claim3_tax_receipt.jpg'
    ],
    beneficiaryAddress: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
    notes: 'Candidate claim flagged by geospatial overlap engine. Pending human arbitration.',
    createdAt: '2026-09-28T12:45:00.000Z',
    updatedAt: '2026-09-28T13:30:00.000Z'
  }
];

const initialReliefs = [
  {
    reliefId: 'relief_flood_2026',
    name: 'Karnataka Flood Relief Scheme 2026',
    description: 'Post-disaster rehabilitation fund for flood-inundated agricultural and residential parcels in Bangalore South',
    disasterType: 'flood',
    zone: {
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
    },
    zoneHash: sha256('Karnataka Flood Relief Scheme 2026 Zone Polygon'),
    ratePerAcre: '1000000000000000000', // 1 MST in wei per acre
    maxPerClaim: '5000000000000000000', // 5 MST in wei max cap per claim
    budget: '100000000000000000000', // 100 MST total escrowed budget
    remainingBudget: '95000000000000000000', // 95 MST remaining after Claim 1 payout
    createdAt: '2026-09-28T07:00:00.000Z',
    updatedAt: '2026-09-28T14:30:00.000Z'
  },
  {
    reliefId: 'relief_fire_2026',
    name: 'Basavanagudi Market Emergency Fire Relief',
    description: 'Urgent grant disbursement for commercial and residential properties damaged by substation transformer fire',
    disasterType: 'flood',
    zone: {
      type: 'Polygon',
      coordinates: [
        [
          [77.5600, 12.9380],
          [77.5750, 12.9380],
          [77.5750, 12.9480],
          [77.5600, 12.9480],
          [77.5600, 12.9380]
        ]
      ]
    },
    zoneHash: sha256('Basavanagudi Market Emergency Fire Relief Zone Polygon'),
    ratePerAcre: '1500000000000000000', // 1.5 MST in wei
    maxPerClaim: '3000000000000000000', // 3 MST in wei
    budget: '50000000000000000000', // 50 MST
    remainingBudget: '50000000000000000000',
    createdAt: '2026-09-28T09:00:00.000Z',
    updatedAt: '2026-09-28T09:00:00.000Z'
  }
];

const initialPayouts = [
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
    confirmedAreaAcres: 2.5,
    damageNotes: 'Flooding inundated main dwelling and destroyed topsoil over 2 acres. Assessed by NGO field officer.',
    damageEvidenceHash: '0x8f1e2d3c4b5a6f7e8d9c0b1a2f3e4d5c6b7a8f9e0d1c2b3a4f5e6d7c8b9a0f1e',
    amount: '2500000000000000000',
    approvals: [
      'Officer_Kulkarni_KA102',
      'Officer_Deshmukh_KA204'
    ],
    txHash: '0x8f7d983c261e4b859e99f1165bc3bbd8c838e5399583be55307c1b5059da1374',
    releasedAt: '2026-09-28T14:30:00.000Z',
    createdAt: '2026-09-28T12:00:00.000Z',
    updatedAt: '2026-09-28T14:30:00.000Z'
  },
  {
    payoutId: 'payout_claim_2_relief_flood_2026',
    claimId: '2',
    reliefId: 'relief_flood_2026',
    beneficiaryAddress: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    status: 'Assessed',
    damageLevel: 2,
    answers: {
      depth: 'low',
      structure: 'partial',
      duration: 'short',
      type: 'pucca',
      contents: 'none'
    },
    confirmedAreaAcres: 1.8,
    damageNotes: 'Perimeter fence washed away; standing water in drainage ditches',
    damageEvidenceHash: '0x3e18a09fb2a4d33917a5b3bc9195d24ceb02534f593cc139bf4d24177b949982',
    amount: '900000000000000000',
    approvals: [],
    txHash: null,
    releasedAt: null,
    createdAt: '2026-09-28T13:00:00.000Z',
    updatedAt: '2026-09-28T13:00:00.000Z'
  }
];

// In-memory cache structures
const memoryStore = {
  claims: new Map(initialClaims.map(c => [String(c.claimId), { ...c }])),
  reliefs: new Map(initialReliefs.map(r => [String(r.reliefId), { ...r }])),
  payouts: new Map(initialPayouts.map(p => [String(p.claimId), { ...p }]))
};

function getMemStore(collectionName) {
  if (!memoryStore[collectionName]) {
    memoryStore[collectionName] = new Map();
  }
  return memoryStore[collectionName];
}

/**
 * Creates store methods for a collection.
 * Primary ID for claims is on-chain claimId.
 */
function createStore(collectionName, idField) {
  return {
    async getAll(filter = {}) {
      const col = getCollection(collectionName);
      if (isDbConnected() && col) {
        try {
          const docs = await col.find(filter, { projection: { _id: 0 } }).toArray();
          if (docs && docs.length > 0) return docs;
        } catch (e) {
          console.warn(`[Store] Error querying MongoDB ${collectionName}:`, e.message);
        }
      }
      const mem = getMemStore(collectionName);
      return Array.from(mem.values()).filter(doc => {
        for (const key of Object.keys(filter)) {
          if (doc[key] !== filter[key]) return false;
        }
        return true;
      });
    },

    async getById(id) {
      const col = getCollection(collectionName);
      const strId = String(id);
      if (isDbConnected() && col) {
        try {
          const doc = await col.findOne(
            { [idField]: strId },
            { projection: { _id: 0 } }
          );
          if (doc) return doc;
        } catch (e) {
          console.warn(`[Store] Error querying ${collectionName} by ID in MongoDB:`, e.message);
        }
      }
      return getMemStore(collectionName).get(strId) || null;
    },

    async save(doc) {
      const id = String(doc[idField]);
      const now = new Date().toISOString();
      const record = {
        ...doc,
        [idField]: id,
        createdAt: doc.createdAt || now,
        updatedAt: now
      };

      getMemStore(collectionName).set(id, record);

      const col = getCollection(collectionName);
      if (isDbConnected() && col) {
        try {
          await col.updateOne(
            { [idField]: id },
            { $set: record },
            { upsert: true }
          );
        } catch (e) {
          console.warn(`[Store] Error writing to MongoDB ${collectionName}:`, e.message);
        }
      }

      return record;
    },

    async update(id, updates) {
      const strId = String(id);
      const existing = getMemStore(collectionName).get(strId) || (await this.getById(strId));
      if (!existing) {
        return null;
      }

      const updated = {
        ...existing,
        ...updates,
        [idField]: strId,
        updatedAt: new Date().toISOString()
      };

      getMemStore(collectionName).set(strId, updated);

      const col = getCollection(collectionName);
      if (isDbConnected() && col) {
        try {
          await col.updateOne(
            { [idField]: strId },
            { $set: updated }
          );
        } catch (e) {
          console.warn(`[Store] Error updating ${collectionName} in MongoDB:`, e.message);
        }
      }

      return updated;
    }
  };
}

const claims = createStore('claims', 'claimId');
const reliefs = createStore('reliefs', 'reliefId');
const payouts = createStore('payouts', 'claimId');

/**
 * Universal polymorphic store helpers:
 * Support both (collectionName, id, updates) and (id, updates)
 */
async function getAll(colName = 'claims', filter = {}) {
  if (typeof colName === 'object' && colName !== null) {
    filter = colName;
    colName = 'claims';
  }
  if (colName === 'claims') return claims.getAll(filter);
  if (colName === 'reliefs') return reliefs.getAll(filter);
  if (colName === 'payouts') return payouts.getAll(filter);
  throw new Error(`Unknown collection: ${colName}`);
}

async function getById(arg1, arg2) {
  if (arg2 !== undefined) {
    const colName = arg1;
    const id = arg2;
    if (colName === 'claims') return claims.getById(id);
    if (colName === 'reliefs') return reliefs.getById(id);
    if (colName === 'payouts') return payouts.getById(id);
    throw new Error(`Unknown collection: ${colName}`);
  } else {
    // Single arg: getById(id) -> defaults to claims
    return claims.getById(arg1);
  }
}

async function save(arg1, arg2) {
  if (arg2 !== undefined) {
    const colName = arg1;
    const doc = arg2;
    if (colName === 'claims') return claims.save(doc);
    if (colName === 'reliefs') return reliefs.save(doc);
    if (colName === 'payouts') return payouts.save(doc);
    throw new Error(`Unknown collection: ${colName}`);
  } else {
    // Single arg: save(doc) -> defaults to claims
    return claims.save(arg1);
  }
}

async function update(arg1, arg2, arg3) {
  if (arg3 !== undefined) {
    const colName = arg1;
    const id = arg2;
    const updates = arg3;
    if (colName === 'claims') return claims.update(id, updates);
    if (colName === 'reliefs') return reliefs.update(id, updates);
    if (colName === 'payouts') return payouts.update(id, updates);
    throw new Error(`Unknown collection: ${colName}`);
  } else {
    // 2 args: update(id, updates) -> defaults to claims
    return claims.update(arg1, arg2);
  }
}

module.exports = {
  claims,
  reliefs,
  payouts,
  getAll,
  getById,
  save,
  update,
  getAllClaims: () => claims.getAll(),
  getClaimById: (id) => claims.getById(id),
  saveClaim: (claim) => claims.save(claim),
  updateClaim: (id, updates) => claims.update(id, updates),
  getAllReliefs: () => reliefs.getAll(),
  getReliefById: (id) => reliefs.getById(id),
  saveRelief: (relief) => reliefs.save(relief),
  updateRelief: (id, updates) => reliefs.update(id, updates),
  getAllPayouts: () => payouts.getAll(),
  getPayoutById: (id) => payouts.getById(id),
  savePayout: (payout) => payouts.save(payout),
  updatePayout: (id, updates) => payouts.update(id, updates)
};
