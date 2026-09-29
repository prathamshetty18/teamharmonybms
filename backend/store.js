const { getCollection, isDbConnected } = require('./db');
const { sha256, sha256Hex, hashOwner, hashEvidence } = require('./utils/hash');

/**
 * Converts area in acres into hectares and square meters on read
 */
function formatAreaUnits(acres) {
  const numAcres = Number(acres) || 0;
  return {
    acres: Number(numAcres.toFixed(4)),
    hectares: Number((numAcres * 0.404686).toFixed(4)),
    sqm: Number((numAcres * 4046.8564).toFixed(2))
  };
}

// Realistic initial seed data for immediate out-of-the-box functionality
const initialClaims = [
  {
    claimId: '1',
    landId: '1',
    ownerName: 'Ramesh Gowda',
    nationalId: 'IND-KA-560019-1092',
    ownerHash: hashOwner('IND-KA-560019-1092'),
    evidenceHash: '0x9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b',
    surveyNumber: 'Sy. No. 142/3A',
    plotNumber: 'Plot 4A',
    state: 'Karnataka',
    district: 'Bangalore South',
    taluk: 'Bangalore South',
    village: 'Basavanagudi',
    landUseFarmerDeclared: 'Agricultural',
    landUseGovtRecord: 'Agricultural',
    landUseGroundVerified: 'Agricultural',
    landUseFinalApproved: 'Agricultural',
    workflowStatus: 'Approved',
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
    landId: '2',
    ownerName: 'Lakshmi Bai',
    nationalId: 'IND-KA-560019-2041',
    ownerHash: hashOwner('IND-KA-560019-2041'),
    evidenceHash: '0x4f5e6d7c8b9a0f1e2d3c4b5a6f7e8d9c0b1a2f3e4d5c6b7a8f9e0d1c2b3a4f5e',
    surveyNumber: 'Sy. No. 142/4',
    plotNumber: 'Plot 4B',
    state: 'Karnataka',
    district: 'Bangalore South',
    taluk: 'Bangalore South',
    village: 'Basavanagudi',
    landUseFarmerDeclared: 'Agricultural',
    landUseGovtRecord: 'Agricultural',
    landUseGroundVerified: 'Agricultural',
    landUseFinalApproved: 'Pending',
    workflowStatus: 'Ground Verification',
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
    landId: '3',
    ownerName: 'Anand Kumar',
    nationalId: 'IND-KA-560019-3389',
    ownerHash: hashOwner('IND-KA-560019-3389'),
    evidenceHash: '0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b',
    surveyNumber: 'Sy. No. 142/3B',
    plotNumber: 'Plot 4C',
    state: 'Karnataka',
    district: 'Bangalore South',
    taluk: 'Bangalore South',
    village: 'Basavanagudi',
    landUseFarmerDeclared: 'Residential',
    landUseGovtRecord: 'Agricultural',
    landUseGroundVerified: 'Agricultural',
    landUseFinalApproved: 'Pending',
    workflowStatus: 'Special Verification',
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
    calculatedAmount: '2500000000000000000',
    estimatedAmount: '2500000000000000000',
    officiallySanctionedAmount: '2500000000000000000',
    sanctionedAmount: '2500000000000000000',
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
    calculatedAmount: '900000000000000000',
    estimatedAmount: '900000000000000000',
    officiallySanctionedAmount: null,
    sanctionedAmount: null,
    approvals: [],
    txHash: null,
    releasedAt: null,
    createdAt: '2026-09-28T13:00:00.000Z',
    updatedAt: '2026-09-28T13:00:00.000Z'
  }
];

const initialUsers = [
  {
    id: 'user_farmer_1',
    role: 'Farmer',
    name: 'Ramesh Gowda',
    contact: '+919876543210',
    password: '$2b$10$If31hPK8gLtRC4HnklaMoej9Tw/Echl5dxWSuuKqvA/T7T5iWxksa', // password123
    profile: {
      farmerId: 'FARM-KA-560019',
      nationalId: 'IND-KA-560019-1092',
      village: 'Basavanagudi',
      district: 'Bangalore South',
      walletAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
    },
    createdAt: '2026-09-28T08:00:00.000Z',
    updatedAt: '2026-09-28T08:00:00.000Z'
  },
  {
    id: 'user_gvo_1',
    role: 'Ground Verification Officer',
    name: 'Rajesh Kumar',
    contact: '+919876543211',
    password: '$2b$10$If31hPK8gLtRC4HnklaMoej9Tw/Echl5dxWSuuKqvA/T7T5iWxksa', // password123
    profile: {
      officerId: 'GVO-KA-401',
      department: 'Revenue & Land Survey',
      accreditationNo: 'ACC-2026-9912',
      jurisdiction: 'Bangalore South District'
    },
    createdAt: '2026-09-28T08:00:00.000Z',
    updatedAt: '2026-09-28T08:00:00.000Z'
  },
  {
    id: 'user_ngo_1',
    role: 'NGO/Community Verifier',
    name: 'Suresh Patil',
    contact: '+919876543212',
    password: '$2b$10$If31hPK8gLtRC4HnklaMoej9Tw/Echl5dxWSuuKqvA/T7T5iWxksa', // password123
    profile: {
      organization: 'Rural Land Rights Watch',
      registrationNo: 'NGO-KA-2019-88',
      role: 'Gram Panchayat Field Lead'
    },
    createdAt: '2026-09-28T08:00:00.000Z',
    updatedAt: '2026-09-28T08:00:00.000Z'
  },
  {
    id: 'user_gov_1',
    role: 'Government Officer',
    name: 'Officer Kulkarni',
    contact: '+919876543213',
    password: '$2b$10$If31hPK8gLtRC4HnklaMoej9Tw/Echl5dxWSuuKqvA/T7T5iWxksa', // password123
    profile: {
      officerId: 'GOV-KA-BLR-01',
      designation: 'Tahsildar / Disaster Relief Commissioner',
      office: 'Disaster Management Cell, District Collectorate'
    },
    createdAt: '2026-09-28T08:00:00.000Z',
    updatedAt: '2026-09-28T08:00:00.000Z'
  }
];

const initialDocuments = [
  {
    id: 'doc_1',
    claimId: '1',
    landId: '1',
    fileName: 'Ancestral_Title_Deed_1984.pdf',
    fileType: 'pdf',
    fileUrl: '/uploads/evidence_claim1_deed.pdf',
    documentType: 'title_deed',
    documentHash: sha256Hex('Ancestral_Title_Deed_1984_Ramesh_Gowda'),
    ocrText: 'GOVERNMENT OF KARNATAKA - DEPARTMENT OF STAMPS & REGISTRATION\nREGISTERED TITLE DEED NO: 4412/1984\nSurvey No: 142/3A | Extent: 2 Acres 20 Guntas (2.5 Acres)\nOwner: Ramesh Gowda S/O Late Channappa Gowda\nVillage: Basavanagudi | Taluk: Bangalore South | District: Bangalore Urban\nClassification: Wet Agricultural Land\nSub-Registrar Seal Verified',
    ocrData: {
      surveyNumber: '142/3A',
      ownerName: 'Ramesh Gowda',
      extentAcres: 2.5,
      district: 'Bangalore South',
      village: 'Basavanagudi',
      landUse: 'Agricultural'
    },
    verificationStatus: 'Verified',
    verifiedBy: 'Officer Kulkarni',
    verifiedAt: '2026-09-28T09:00:00.000Z',
    notes: 'Seal and signature matched with Basavanagudi Sub-Registrar archives',
    createdAt: '2026-09-28T08:30:00.000Z',
    updatedAt: '2026-09-28T09:00:00.000Z'
  },
  {
    id: 'doc_2',
    claimId: '1',
    landId: '1',
    fileName: 'Survey_Sketch_142_3A.jpg',
    fileType: 'jpg',
    fileUrl: '/uploads/evidence_claim1_survey.jpg',
    documentType: 'survey_sketch',
    documentHash: sha256Hex('Tippani_Survey_Sketch_142_3A_Basavanagudi'),
    ocrText: 'SURVEY OF INDIA / KARNATAKA REVENUE MAP\nTippani Sheet: Sy No 142/3A, Basavanagudi Area\nBoundary coordinates aligned with Revenue Benchmarks',
    ocrData: {
      surveyNumber: '142/3A',
      extentAcres: 2.5,
      village: 'Basavanagudi'
    },
    verificationStatus: 'Verified',
    verifiedBy: 'Rajesh Kumar (Field Assessor)',
    verifiedAt: '2026-09-28T10:15:00.000Z',
    notes: 'Physical boundaries match survey sketch',
    createdAt: '2026-09-28T08:45:00.000Z',
    updatedAt: '2026-09-28T10:15:00.000Z'
  },
  {
    id: 'doc_3',
    claimId: '2',
    landId: '2',
    fileName: 'Panchayat_Tax_Receipt_2025.png',
    fileType: 'png',
    fileUrl: '/uploads/evidence_claim2_tax.png',
    documentType: 'tax_receipt',
    documentHash: sha256Hex('Gram_Panchayat_Tax_Receipt_2025_Lakshmi_Bai'),
    ocrText: 'GRAM PANCHAYAT TAX DEMAND & RECEIPT 2025-2026\nProperty Assessment No: GP-BAS-2041\nOwner: Lakshmi Bai | Sy No: 142/4 | Extent: 1.8 Acres',
    ocrData: {
      surveyNumber: '142/4',
      ownerName: 'Lakshmi Bai',
      extentAcres: 1.8
    },
    verificationStatus: 'Pending',
    verifiedBy: null,
    verifiedAt: null,
    notes: 'Awaiting ground inspection by GVO',
    createdAt: '2026-09-28T11:00:00.000Z',
    updatedAt: '2026-09-28T11:00:00.000Z'
  }
];

const initialAuditLogs = [
  {
    id: 'audit_seed_101',
    who: 'Ramesh Gowda (Farmer)',
    what: 'CLAIM_SUBMITTED',
    when: '2026-09-28T08:30:00.000Z',
    landId: '1',
    claimId: '1',
    prevValue: 'DRAFT',
    newValue: 'SUBMITTED',
    remarks: 'Initial title deed and survey sketch submitted for parcel registration',
    metadata: { source: 'Portal Submission', initialStatus: 'SUBMITTED' }
  },
  {
    id: 'audit_seed_102',
    who: 'Officer Kulkarni (Government Officer)',
    what: 'DOCUMENT_VERIFIED',
    when: '2026-09-28T09:00:00.000Z',
    landId: '1',
    claimId: '1',
    prevValue: 'SUBMITTED',
    newValue: 'DOCUMENT_VERIFICATION',
    remarks: 'Ancestral Title deed 4412/1984 verified with Sub-Registrar archives',
    metadata: { documentId: 'doc_1', documentType: 'title_deed' }
  },
  {
    id: 'audit_seed_103',
    who: 'Rajesh Kumar (Ground Verification Officer)',
    what: 'GROUND_VERIFIED',
    when: '2026-09-28T10:15:00.000Z',
    landId: '1',
    claimId: '1',
    prevValue: 'DOCUMENT_VERIFICATION',
    newValue: 'GROUND_VERIFICATION',
    remarks: 'GPS survey complete. Physical boundaries verified on ground against Sy. No. 142/3A',
    metadata: { gpsLocation: [77.5620, 12.9415], boundaryVerified: true, landUse: 'Agricultural' }
  },
  {
    id: 'audit_seed_104',
    who: 'Suresh Patil (NGO/Community Verifier)',
    what: 'COMMUNITY_VERIFIED',
    when: '2026-09-28T11:45:00.000Z',
    landId: '1',
    claimId: '1',
    prevValue: 'GROUND_VERIFICATION',
    newValue: 'COMMUNITY/NGO_VERIFICATION',
    remarks: 'Neighbors Suresh Patil, Devi Prasad & Panchayat Leader V. Reddy attested ownership (Score: 5)',
    metadata: { attestationScore: 5, attesterCount: 3 }
  },
  {
    id: 'audit_seed_105',
    who: 'Officer Kulkarni (Government Officer)',
    what: 'GOVERNMENT_APPROVED',
    when: '2026-09-28T12:00:00.000Z',
    landId: '1',
    claimId: '1',
    prevValue: 'GOVERNMENT_REVIEW',
    newValue: 'APPROVED',
    remarks: 'Final land classification confirmed as Wet Agricultural. Registered on blockchain (Tx: 0x9a8b...).',
    metadata: { finalClassification: 'Agricultural', onChainStatus: 'Verified' }
  },
  {
    id: 'audit_seed_201',
    who: 'Lakshmi Bai (Farmer)',
    what: 'CLAIM_SUBMITTED',
    when: '2026-09-28T11:00:00.000Z',
    landId: '2',
    claimId: '2',
    prevValue: 'DRAFT',
    newValue: 'SUBMITTED',
    remarks: 'Application submitted with Panchayat tax receipt',
    metadata: { source: 'Portal Submission' }
  },
  {
    id: 'audit_seed_202',
    who: 'Rajesh Kumar (Ground Verification Officer)',
    what: 'GROUND_VERIFICATION_SCHEDULED',
    when: '2026-09-28T12:30:00.000Z',
    landId: '2',
    claimId: '2',
    prevValue: 'DOCUMENT_VERIFICATION',
    newValue: 'GROUND_VERIFICATION',
    remarks: 'Physical inspection scheduled by GVO. Neighbor attestations in progress (Score: 2)',
    metadata: { attestationScore: 2 }
  },
  {
    id: 'audit_seed_301',
    who: 'Anand Kumar (Farmer)',
    what: 'CLAIM_SUBMITTED',
    when: '2026-09-28T12:45:00.000Z',
    landId: '3',
    claimId: '3',
    prevValue: 'DRAFT',
    newValue: 'SUBMITTED',
    remarks: 'Application submitted for Sy. No. 142/3B',
    metadata: { source: 'Portal Submission' }
  },
  {
    id: 'audit_seed_302',
    who: 'Geospatial Overlap Engine',
    what: 'DISPUTE_FLAGGED',
    when: '2026-09-28T13:30:00.000Z',
    landId: '3',
    claimId: '3',
    prevValue: 'SUBMITTED',
    newValue: 'DISPUTED',
    remarks: 'Geospatial boundary conflict: overlaps registered Parcel #1 (Ramesh Gowda) by 42%',
    metadata: { overlappingClaimId: '1', overlapPercentage: 42 }
  }
];

const initialNotifications = [
  {
    id: 'notif_seed_101',
    userId: 'usr_farmer_01',
    role: 'Farmer',
    landId: '1',
    type: 'CLAIM_SUBMITTED',
    title: 'Land Parcel 1 Submitted',
    message: 'Your land parcel application for Sy. No. 142/3A has been successfully submitted.',
    prevStatus: 'DRAFT',
    newStatus: 'SUBMITTED',
    read: true,
    channel: 'IN_APP',
    createdAt: '2026-09-28T08:30:00.000Z',
    readAt: '2026-09-28T08:35:00.000Z'
  },
  {
    id: 'notif_seed_102',
    userId: 'usr_farmer_01',
    role: 'Farmer',
    landId: '1',
    type: 'DOCUMENT_VERIFIED',
    title: 'Documents Verified',
    message: 'Title deed 4412/1984 verified with Sub-Registrar archives for Parcel 1.',
    prevStatus: 'SUBMITTED',
    newStatus: 'DOCUMENT_VERIFICATION',
    read: true,
    channel: 'IN_APP',
    createdAt: '2026-09-28T09:00:00.000Z',
    readAt: '2026-09-28T09:05:00.000Z'
  },
  {
    id: 'notif_seed_103',
    userId: 'usr_farmer_01',
    role: 'Farmer',
    landId: '1',
    type: 'STATUS_CHANGE',
    title: 'Parcel #1 Approved by Government',
    message: 'Government Officer approved Parcel #1 (Sy. No. 142/3A) with final classification Agricultural. On-chain registration confirmed.',
    prevStatus: 'GOVERNMENT_REVIEW',
    newStatus: 'APPROVED',
    read: false,
    channel: 'IN_APP',
    createdAt: '2026-09-28T12:00:00.000Z'
  },
  {
    id: 'notif_seed_201',
    userId: 'usr_gvo_01',
    role: 'Ground Verification Officer',
    landId: '2',
    type: 'STATUS_CHANGE',
    title: 'Ground Inspection Pending for Parcel #2',
    message: 'Parcel #2 (Sy. No. 142/4, Lakshmi Bai) has moved to Ground Verification stage.',
    prevStatus: 'DOCUMENT_VERIFICATION',
    newStatus: 'GROUND_VERIFICATION',
    read: false,
    channel: 'IN_APP',
    createdAt: '2026-09-28T12:30:00.000Z'
  },
  {
    id: 'notif_seed_301',
    userId: 'usr_gov_01',
    role: 'Government Officer',
    landId: '3',
    type: 'DISPUTE_FLAGGED',
    title: 'Dispute Flagged on Parcel #3',
    message: 'Geospatial boundary conflict detected for Parcel #3 (42% overlap with Parcel #1). Dispute raised.',
    prevStatus: 'SUBMITTED',
    newStatus: 'DISPUTED',
    read: false,
    channel: 'IN_APP',
    createdAt: '2026-09-28T13:30:00.000Z'
  }
];

const initialDisasters = [
  {
    id: 'disaster_flood_blr_2026',
    disasterId: 'disaster_flood_blr_2026',
    name: '2026 Greater Bangalore Flash Floods',
    type: 'flood',
    date: '2026-08-15T00:00:00.000Z',
    state: 'Karnataka',
    district: 'Bangalore South',
    taluk: 'Bangalore South',
    affectedVillages: ['Basavanagudi', 'Jayanagar', 'Yelahanka'],
    affectedLocations: [
      { state: 'Karnataka', district: 'Bangalore South', taluk: 'Bangalore South', village: 'Basavanagudi' },
      { state: 'Karnataka', district: 'Bangalore South', taluk: 'Bangalore South', village: 'Jayanagar' }
    ],
    gisArea: {
      type: 'Polygon',
      coordinates: [
        [
          [77.5500, 12.9300],
          [77.6000, 12.9300],
          [77.6000, 12.9700],
          [77.5500, 12.9700],
          [77.5500, 12.9300]
        ]
      ]
    },
    gisAreaAcres: 3450.2,
    gisAreaSqKm: 13.96,
    severity: 'SEVERE',
    status: 'ACTIVE',
    applicableSchemes: ['SDRF', 'PMFBY'],
    declaredBy: 'Disaster Management Cell, Revenue Department, Govt of Karnataka',
    reliefIds: ['relief_flood_2026'],
    createdAt: '2026-08-15T06:00:00.000Z',
    updatedAt: '2026-08-15T06:00:00.000Z'
  },
  {
    id: 'disaster_eq_chamoli_2026',
    disasterId: 'disaster_eq_chamoli_2026',
    name: 'Chamoli Seismic Tremor Event 2026',
    type: 'earthquake',
    date: '2026-06-10T00:00:00.000Z',
    state: 'Uttarakhand',
    district: 'Chamoli',
    taluk: 'Joshimath',
    affectedVillages: ['Joshimath', 'Gopeshwar'],
    affectedLocations: [
      { state: 'Uttarakhand', district: 'Chamoli', taluk: 'Joshimath', village: 'Joshimath' }
    ],
    gisArea: {
      type: 'Polygon',
      coordinates: [
        [
          [79.5000, 30.5000],
          [79.6000, 30.5000],
          [79.6000, 30.6000],
          [79.5000, 30.6000],
          [79.5000, 30.5000]
        ]
      ]
    },
    gisAreaAcres: 5200.0,
    gisAreaSqKm: 21.04,
    severity: 'HIGH',
    status: 'CONTAINED',
    applicableSchemes: ['NDRF', 'SDRF'],
    declaredBy: 'Uttarakhand SDMA',
    reliefIds: [],
    createdAt: '2026-06-10T08:00:00.000Z',
    updatedAt: '2026-06-10T08:00:00.000Z'
  }
];

const initialDisasterAssessments = [
  {
    id: 'assess_seed_101',
    assessmentId: 'assess_seed_101',
    disasterId: 'disaster_flood_blr_2026',
    reliefId: 'relief_flood_2026',
    claimId: '1',
    landId: '1',
    officer: 'user_gvo_1',
    officerName: 'Rajesh Kumar',
    officerRole: 'Ground Verification Officer',
    timestamp: '2026-08-16T10:30:00.000Z',
    answers: {
      depth: 'high',
      structure: 'major',
      duration: 'long',
      type: 'pucca',
      contents: 'all'
    },
    damageLevel: 4,
    damagePercent: 100,
    confirmedAreaAcres: 2.5,
    calculatedAmount: '2500000000000000000',
    estimatedAmount: '2500000000000000000',
    officiallySanctionedAmount: '2500000000000000000',
    sanctionedAmount: '2500000000000000000',
    damageNotes: 'Flooding inundated main dwelling and destroyed topsoil over 2.5 acres. Assessed by GVO field officer.',
    photos: ['/uploads/evidence_claim1_flood.jpg'],
    gpsLocation: [77.5620, 12.9415],
    status: 'APPROVED',
    createdAt: '2026-08-16T10:30:00.000Z',
    updatedAt: '2026-08-16T14:00:00.000Z'
  },
  {
    id: 'assess_seed_102',
    assessmentId: 'assess_seed_102',
    disasterId: 'disaster_flood_blr_2026',
    reliefId: 'relief_flood_2026',
    claimId: '2',
    landId: '2',
    officer: 'user_gvo_1',
    officerName: 'Rajesh Kumar',
    officerRole: 'Ground Verification Officer',
    timestamp: '2026-08-17T09:15:00.000Z',
    answers: {
      depth: 'low',
      structure: 'partial',
      duration: 'short',
      type: 'pucca',
      contents: 'none'
    },
    damageLevel: 2,
    damagePercent: 50,
    confirmedAreaAcres: 1.8,
    calculatedAmount: '900000000000000000',
    estimatedAmount: '900000000000000000',
    officiallySanctionedAmount: null,
    sanctionedAmount: null,
    damageNotes: 'Perimeter fence washed away; standing water in drainage ditches',
    photos: ['/uploads/evidence_claim2_flood.jpg'],
    gpsLocation: [77.5640, 12.9430],
    status: 'SUBMITTED',
    createdAt: '2026-08-17T09:15:00.000Z',
    updatedAt: '2026-08-17T09:15:00.000Z'
  }
];

// In-memory cache structures
const memoryStore = {
  claims: new Map(initialClaims.map(c => [String(c.claimId), { ...c }])),
  reliefs: new Map(initialReliefs.map(r => [String(r.reliefId), { ...r }])),
  payouts: new Map(initialPayouts.map(p => [String(p.claimId), { ...p }])),
  users: new Map(initialUsers.map(u => [String(u.id), { ...u }])),
  documents: new Map(initialDocuments.map(d => [String(d.id), { ...d }])),
  auditLogs: new Map(initialAuditLogs.map(a => [String(a.id), { ...a }])),
  valuations: new Map(),
  disputes: new Map(),
  disasters: new Map(initialDisasters.map(d => [String(d.id), { ...d }])),
  disasterAssessments: new Map(initialDisasterAssessments.map(a => [String(a.id), { ...a }])),
  notifications: new Map(initialNotifications.map(n => [String(n.id), { ...n }]))
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

      if (collectionName === 'documents' && (updates.ocrEncrypted || updates.ocrText === null)) {
        delete updated.ocrText;
      }

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
    },

    async delete(id) {
      const strId = String(id);
      const mem = getMemStore(collectionName);
      const existed = mem.has(strId) || Boolean(await this.getById(strId));
      mem.delete(strId);

      const col = getCollection(collectionName);
      if (isDbConnected() && col) {
        try {
          await col.deleteOne({ [idField]: strId });
        } catch (e) {
          console.warn(`[Store] Error deleting from ${collectionName} in MongoDB:`, e.message);
        }
      }

      return existed;
    }
  };
}

const claims = createStore('claims', 'claimId');
const reliefs = createStore('reliefs', 'reliefId');
const payouts = createStore('payouts', 'claimId');
const users = createStore('users', 'id');
const documents = createStore('documents', 'id');
const auditLogs = createStore('auditLogs', 'id');
const valuations = createStore('valuations', 'valuationId');
const disputes = createStore('disputes', 'disputeId');
const disasters = createStore('disasters', 'id');
const disasterAssessments = createStore('disasterAssessments', 'id');
const notifications = createStore('notifications', 'id');
const ocrJobs = createStore('ocrJobs', 'id');

// Custom lookup extensions for notifications
notifications.getByLandId = async function(landId) {
  const strId = String(landId);
  const all = await this.getAll();
  return all
    .filter(n => String(n.landId) === strId || String(n.claimId) === strId)
    .sort((a, b) => new Date(b.createdAt || b.timestamp || 0) - new Date(a.createdAt || a.timestamp || 0));
};

notifications.getByUserId = async function(userId) {
  const strId = String(userId);
  const all = await this.getAll();
  return all
    .filter(n => String(n.userId) === strId)
    .sort((a, b) => new Date(b.createdAt || b.timestamp || 0) - new Date(a.createdAt || a.timestamp || 0));
};

notifications.getByRole = async function(role) {
  const strRole = String(role).trim().toLowerCase();
  const all = await this.getAll();
  return all
    .filter(n => !n.role || n.role.toUpperCase() === 'ALL' || String(n.role).trim().toLowerCase() === strRole)
    .sort((a, b) => new Date(b.createdAt || b.timestamp || 0) - new Date(a.createdAt || a.timestamp || 0));
};

notifications.markRead = async function(id) {
  const strId = String(id);
  const found = await this.getById(strId);
  if (!found) return null;
  return this.update(strId, { read: true, readAt: new Date().toISOString() });
};

notifications.markAllRead = async function(filter = {}) {
  const all = await this.getAll();
  let updatedCount = 0;
  for (const n of all) {
    if (n.read) continue;
    let match = true;
    if (filter.landId && String(n.landId) !== String(filter.landId)) match = false;
    if (filter.role && n.role && n.role !== 'ALL' && n.role.toLowerCase() !== filter.role.toLowerCase()) match = false;
    if (filter.userId && String(n.userId) !== String(filter.userId)) match = false;
    if (match) {
      await this.update(n.id, { read: true, readAt: new Date().toISOString() });
      updatedCount++;
    }
  }
  return updatedCount;
};

// Custom lookup extensions for disasters
const origDisasterGetById = disasters.getById.bind(disasters);
disasters.getById = async function(id) {
  const strId = String(id);
  const byId = await origDisasterGetById(strId);
  if (byId) return byId;
  const all = await this.getAll();
  return all.find(d => String(d.disasterId) === strId || String(d.id) === strId) || null;
};

// Custom lookup extensions for disasterAssessments
const origAssessGetById = disasterAssessments.getById.bind(disasterAssessments);
disasterAssessments.getById = async function(id) {
  const strId = String(id);
  const byId = await origAssessGetById(strId);
  if (byId) return byId;
  const all = await this.getAll();
  return all.find(a => String(a.assessmentId) === strId || String(a.id) === strId) || null;
};
disasterAssessments.getByClaimId = async function(claimId) {
  const strId = String(claimId);
  const all = await this.getAll();
  return all.filter(a => String(a.claimId) === strId || String(a.landId) === strId);
};
disasterAssessments.getByDisasterId = async function(disasterId) {
  const strId = String(disasterId);
  const all = await this.getAll();
  return all.filter(a => String(a.disasterId) === strId);
};

// Invariant: Audit Logs are strictly append-only
auditLogs.update = async function() {
  throw new Error('Audit Logs are append-only and cannot be modified');
};
auditLogs.delete = async function() {
  throw new Error('Audit Logs are append-only and cannot be deleted');
};

auditLogs.getByLandId = async function(landId) {
  const strId = String(landId);
  const col = getCollection('auditLogs');
  if (isDbConnected() && col) {
    try {
      const docs = await col.find(
        { $or: [{ landId: strId }, { claimId: strId }] },
        { projection: { _id: 0 } }
      ).sort({ when: 1 }).toArray();
      if (docs && docs.length > 0) return docs;
    } catch (e) {
      console.warn('[Store] Error querying auditLogs in MongoDB:', e.message);
    }
  }
  const all = Array.from(getMemStore('auditLogs').values());
  return all
    .filter(a => String(a.landId) === strId || String(a.claimId) === strId)
    .sort((a, b) => new Date(a.when) - new Date(b.when));
};

/**
 * Records a stub notification row in the notifications collection
 */
async function recordNotification({
  userId = null,
  role = 'ALL',
  landId = null,
  type = 'STATUS_CHANGE',
  title = null,
  message = null,
  prevStatus = null,
  newStatus = null,
  channel = 'IN_APP',
  metadata = {}
} = {}) {
  const now = new Date().toISOString();
  const id = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const record = {
    id,
    userId,
    role,
    landId: landId ? String(landId) : null,
    claimId: landId ? String(landId) : null,
    type: type || 'STATUS_CHANGE',
    title: title || (landId ? `Land Parcel #${landId} Update` : 'System Notification'),
    message: message || `Status changed${prevStatus ? ' from ' + prevStatus : ''}${newStatus ? ' to ' + newStatus : ''}.`,
    prevStatus: prevStatus || null,
    newStatus: newStatus || null,
    read: false,
    channel,
    metadata,
    createdAt: now
  };
  return notifications.save(record);
}

/**
 * Appends a new immutable audit record to the Audit Logs collection,
 * and automatically triggers a notification row on status changes (Phase F).
 */
async function recordAuditLog({ who, what, landId, prevValue, newValue, remarks, metadata = {} }) {
  const now = new Date().toISOString();
  const id = `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const record = {
    id,
    who: who || 'System / Authorized Verifier',
    what: what || 'STATUS_CHANGE',
    when: now,
    landId: String(landId),
    claimId: String(landId),
    prevValue: prevValue || 'None',
    newValue: newValue || 'Unknown',
    remarks: remarks || '',
    metadata
  };
  const saved = await auditLogs.save(record);

  // Phase F: status change triggers a notification row
  try {
    const actionLabel = (what || 'STATUS_CHANGE').replace(/_/g, ' ');
    await recordNotification({
      landId,
      role: 'ALL',
      type: what || 'STATUS_CHANGE',
      title: `Land #${landId}: ${actionLabel}`,
      message: `Land Parcel #${landId} transitioned from ${prevValue || 'N/A'} to ${newValue || 'N/A'}.${remarks ? ' ' + remarks : ''}`,
      prevStatus: prevValue,
      newStatus: newValue,
      metadata: { auditLogId: id, who, ...metadata }
    });
  } catch (err) {
    console.warn('[Notifications] Failed to auto-trigger notification row:', err.message);
  }

  return saved;
}

// -------------------------------------------------------------
// Phase C State Machine Status Definitions & On-Chain Mapping
// DRAFT -> SUBMITTED -> DOCUMENT_VERIFICATION -> GROUND_VERIFICATION ->
// COMMUNITY/NGO_VERIFICATION -> LAND_CLASSIFICATION -> GOVERNMENT_REVIEW -> APPROVED/DISPUTED/REJECTED
// -------------------------------------------------------------
const SPEC_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'DOCUMENT_VERIFICATION',
  'GROUND_VERIFICATION',
  'COMMUNITY/NGO_VERIFICATION',
  'COMMUNITY_NGO_VERIFICATION',
  'LAND_CLASSIFICATION',
  'GOVERNMENT_REVIEW',
  'APPROVED',
  'DISPUTED',
  'REJECTED'
];

function normalizeSpecStatus(status) {
  if (!status) return 'SUBMITTED';
  const s = String(status).trim().toUpperCase();
  if (s === 'PENDING') return 'SUBMITTED';
  if (s === 'VERIFIED') return 'APPROVED';
  if (s === 'COMMUNITY_NGO_VERIFICATION' || s === 'COMMUNITY/NGO_VERIFICATION') {
    return 'COMMUNITY/NGO_VERIFICATION';
  }
  return s;
}

function mapToOnChainStatus(specStatus) {
  if (!specStatus) return 'Pending';
  const s = normalizeSpecStatus(specStatus);
  if (s === 'GOVERNMENT_REVIEW' || s === 'APPROVED') {
    return 'Verified';
  }
  if (s === 'DISPUTED') {
    return 'Disputed';
  }
  if (s === 'REJECTED') {
    return 'Disputed';
  }
  return 'Pending';
}

documents.getByClaimId = async function(claimId) {
  const strId = String(claimId);
  const col = getCollection('documents');
  if (isDbConnected() && col) {
    try {
      const docs = await col.find(
        { $or: [{ claimId: strId }, { landId: strId }] },
        { projection: { _id: 0 } }
      ).toArray();
      if (docs && docs.length > 0) return docs;
    } catch (e) {
      console.warn('[Store] Error querying documents by claimId in MongoDB:', e.message);
    }
  }
  const all = Array.from(getMemStore('documents').values());
  return all.filter(d => String(d.claimId) === strId || String(d.landId) === strId);
};

users.findByContact = async function(contact) {
  if (!contact) return null;
  const col = getCollection('users');
  const normalized = String(contact).trim().toLowerCase();
  if (isDbConnected() && col) {
    try {
      const doc = await col.findOne(
        { $or: [{ contact: normalized }, { contact: String(contact).trim() }] },
        { projection: { _id: 0 } }
      );
      if (doc) return doc;
    } catch (e) {
      console.warn('[Store] Error querying users by contact in MongoDB:', e.message);
    }
  }
  const all = Array.from(getMemStore('users').values());
  return all.find(u => u.contact && u.contact.trim().toLowerCase() === normalized) || null;
};

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
  if (colName === 'users') return users.getAll(filter);
  if (colName === 'documents') return documents.getAll(filter);
  if (colName === 'auditLogs') return auditLogs.getAll(filter);
  if (colName === 'valuations') return valuations.getAll(filter);
  if (colName === 'disputes') return disputes.getAll(filter);
  if (colName === 'disasters') return disasters.getAll(filter);
  if (colName === 'disasterAssessments') return disasterAssessments.getAll(filter);
  throw new Error(`Unknown collection: ${colName}`);
}

async function getById(arg1, arg2) {
  if (arg2 !== undefined) {
    const colName = arg1;
    const id = arg2;
    if (colName === 'claims') return claims.getById(id);
    if (colName === 'reliefs') return reliefs.getById(id);
    if (colName === 'payouts') return payouts.getById(id);
    if (colName === 'users') return users.getById(id);
    if (colName === 'documents') return documents.getById(id);
    if (colName === 'auditLogs') return auditLogs.getById(id);
    if (colName === 'valuations') return valuations.getById(id);
    if (colName === 'disputes') return disputes.getById(id);
    if (colName === 'disasters') return disasters.getById(id);
    if (colName === 'disasterAssessments') return disasterAssessments.getById(id);
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
    if (colName === 'users') return users.save(doc);
    if (colName === 'documents') return documents.save(doc);
    if (colName === 'auditLogs') return auditLogs.save(doc);
    if (colName === 'valuations') return valuations.save(doc);
    if (colName === 'disputes') return disputes.save(doc);
    if (colName === 'disasters') return disasters.save(doc);
    if (colName === 'disasterAssessments') return disasterAssessments.save(doc);
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
    if (colName === 'users') return users.update(id, updates);
    if (colName === 'documents') return documents.update(id, updates);
    if (colName === 'auditLogs') return auditLogs.update(id, updates);
    if (colName === 'valuations') return valuations.update(id, updates);
    if (colName === 'disputes') return disputes.update(id, updates);
    if (colName === 'disasters') return disasters.update(id, updates);
    if (colName === 'disasterAssessments') return disasterAssessments.update(id, updates);
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
  users,
  documents,
  auditLogs,
  valuations,
  disputes,
  disasters,
  disasterAssessments,
  notifications,
  ocrJobs,
  recordNotification,
  getAllOcrJobs: () => ocrJobs.getAll(),
  getOcrJobById: (id) => ocrJobs.getById(id),
  saveOcrJob: (j) => ocrJobs.save(j),
  updateOcrJob: (id, updates) => ocrJobs.update(id, updates),
  getAllNotifications: () => notifications.getAll(),
  getNotificationById: (id) => notifications.getById(id),
  getNotificationsByLandId: (landId) => notifications.getByLandId(landId),
  getNotificationsByRole: (role) => notifications.getByRole(role),
  saveNotification: (n) => notifications.save(n),
  updateNotification: (id, updates) => notifications.update(id, updates),
  getAll,
  getById,
  save,
  update,
  formatAreaUnits,
  recordAuditLog,
  SPEC_STATUSES,
  normalizeSpecStatus,
  mapToOnChainStatus,
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
  updatePayout: (id, updates) => payouts.update(id, updates),
  getAllUsers: () => users.getAll(),
  getUserById: (id) => users.getById(id),
  getUserByContact: (contact) => users.findByContact(contact),
  saveUser: (user) => users.save(user),
  updateUser: (id, updates) => users.update(id, updates),
  getAllDocuments: () => documents.getAll(),
  getDocumentById: (id) => documents.getById(id),
  getDocumentsByClaimId: (claimId) => documents.getByClaimId(claimId),
  saveDocument: (doc) => documents.save(doc),
  updateDocument: (id, updates) => documents.update(id, updates),
  getAllAuditLogs: () => auditLogs.getAll(),
  getAuditLogsByLandId: (landId) => auditLogs.getByLandId(landId),
  getAuditLogById: (id) => auditLogs.getById(id),
  getAllValuations: () => valuations.getAll(),
  getValuationById: (id) => valuations.getById(id),
  saveValuation: (v) => valuations.save(v),
  updateValuation: (id, updates) => valuations.update(id, updates),
  getAllDisputes: () => disputes.getAll(),
  getDisputeById: (id) => disputes.getById(id),
  saveDispute: (d) => disputes.save(d),
  updateDispute: (id, updates) => disputes.update(id, updates),
  getAllDisasters: () => disasters.getAll(),
  getDisasterById: (id) => disasters.getById(id),
  saveDisaster: (d) => disasters.save(d),
  updateDisaster: (id, updates) => disasters.update(id, updates),
  getAllDisasterAssessments: () => disasterAssessments.getAll(),
  getDisasterAssessmentById: (id) => disasterAssessments.getById(id),
  getDisasterAssessmentsByClaimId: (claimId) => disasterAssessments.getByClaimId(claimId),
  getDisasterAssessmentsByDisasterId: (disasterId) => disasterAssessments.getByDisasterId(disasterId),
  saveDisasterAssessment: (a) => disasterAssessments.save(a),
  updateDisasterAssessment: (id, updates) => disasterAssessments.update(id, updates)
};
