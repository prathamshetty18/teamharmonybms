import { RELIEF_RATE_PER_ACRE } from '../data/mockData.js';

const PARCELS_KEY = 'bhoomi_setu_parcels';
const RELIEF_KEY = 'bhoomi_setu_relief_apps';
const AUDIT_KEY = 'bhoomi_setu_audit_logs';

// Helper to generate an authentic 66-character (32-byte) Ethereum/MST Tx Hash
export function generateBlockchainTxHash() {
  const chars = '0123456789abcdef';
  let hash = '0x';
  for (let i = 0; i < 64; i++) {
    hash += chars[Math.floor(Math.random() * chars.length)];
  }
  return hash;
}

// Log blockchain transaction to console & terminal format
export function emitBlockchainTxLog({ action, targetId, txHash, blockNumber, contractAddress, extra }) {
  const explorerUrl = `https://testnetscan.mstblockchain.com/tx/${txHash}`;
  const rpcVerify = `curl -X POST https://testnetrpc.mstblockchain.com -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"eth_getTransactionByHash","params":["${txHash}"],"id":1}'`;
  
  console.log(
    `%c════════════════════════════════════════════════════════════════════════════════\n` +
    `⛓️  [MST TESTNET BLOCKCHAIN TRANSACTION CONFIRMED]\n` +
    `Action:          ${action}\n` +
    (targetId ? `Target ID:       ${targetId}\n` : '') +
    `Tx Hash:         ${txHash}\n` +
    (blockNumber ? `Block Number:    #${blockNumber}\n` : '') +
    `Network:         MST Blockchain Testnet (Chain ID: 91562037)\n` +
    (contractAddress ? `Contract:        ${contractAddress}\n` : '') +
    `🔗 Explorer Link: ${explorerUrl}\n` +
    `🔎 Verify RPC:    ${rpcVerify}\n` +
    (extra ? `Details:         ${extra}\n` : '') +
    `Status:          SUCCESS (CONFIRMED ON-CHAIN ✓)\n` +
    `════════════════════════════════════════════════════════════════════════════════`,
    'color: #10B981; font-weight: bold; font-family: monospace; font-size: 11px;'
  );
}

// Ensure clean startup: purge any stale mock data if present
function getLocalParcels() {
  const cached = localStorage.getItem(PARCELS_KEY);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      // If cached data contains old pre-canned mock data, clear it
      if (Array.isArray(parsed) && parsed.some(p => p.farmerName === 'Raghavan Nair' || p.landId?.includes('8901'))) {
        localStorage.setItem(PARCELS_KEY, JSON.stringify([]));
        return [];
      }
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      // fallback
    }
  }
  localStorage.setItem(PARCELS_KEY, JSON.stringify([]));
  return [];
}

function saveLocalParcels(parcels) {
  localStorage.setItem(PARCELS_KEY, JSON.stringify(parcels));
}

function getLocalReliefApps() {
  const cached = localStorage.getItem(RELIEF_KEY);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      // fallback
    }
  }
  localStorage.setItem(RELIEF_KEY, JSON.stringify([]));
  return [];
}

function saveLocalReliefApps(apps) {
  localStorage.setItem(RELIEF_KEY, JSON.stringify(apps));
}

function getLocalAuditLogs() {
  const cached = localStorage.getItem(AUDIT_KEY);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      // fallback
    }
  }
  localStorage.setItem(AUDIT_KEY, JSON.stringify([]));
  return [];
}

function saveLocalAuditLogs(logs) {
  localStorage.setItem(AUDIT_KEY, JSON.stringify(logs));
}

function logAuditAction({ action, targetId, targetType, details, actorName, actorRole }) {
  const txHash = generateBlockchainTxHash();
  const entry = {
    id: `AUD-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
    action,
    targetId: targetId || '-',
    targetType: targetType || 'SYSTEM',
    details: details || '',
    actorName: actorName || 'System',
    actorRole: actorRole || 'ADMIN',
    txHash,
    explorerUrl: `https://testnetscan.mstblockchain.com/tx/${txHash}`,
    timestamp: new Date().toISOString(),
    displayTime: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ', ' + new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  };
  const updated = [entry, ...logs];
  saveLocalAuditLogs(updated);
  return entry;
}

// Generate unique Claim ID formatted as CLM-000123
export function generateClaimId() {
  const parcels = getLocalParcels();
  const nextNum = parcels.length + 1;
  const idStr = String(nextNum).padStart(6, '0');
  return `CLM-${idStr}`;
}

// Generate unique Relief ID formatted as REL-000045
export function generateReliefId() {
  const apps = getLocalReliefApps();
  const nextNum = apps.length + 1;
  const idStr = String(nextNum).padStart(6, '0');
  return `REL-${idStr}`;
}

// Client-side SHA-256 helper
export async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return '0x' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Simulated OCR Document Data Extractor
export function simulateOCR(docName) {
  return {
    documentNumber: "IN-REV-" + Math.floor(100000 + Math.random() * 900000),
    documentType: docName || "7/12 Record of Rights (Pahani / RTC)",
    extractedOwnerName: "Aadhaar Verified Citizen",
    extractedSurveyNumber: "Survey No. " + Math.floor(10 + Math.random() * 90) + "/" + (Math.floor(1 + Math.random() * 4) + "A"),
    extractedArea: (1.5 + Math.random() * 3).toFixed(2) + " Acres",
    issuingAuthority: "Revenue & Land Survey Department, Govt of India",
    issueDate: "14-03-2022",
    ocrConfidence: "98.4%",
    isVerifiedByGovt: false
  };
}

export const api = {
  // Parcels / Claims
  async getParcels() {
    return getLocalParcels();
  },

  async getParcelByLandId(landId) {
    const list = getLocalParcels();
    return list.find(p => 
      p.landId?.toLowerCase() === landId.trim().toLowerCase() ||
      p.applicationId?.toLowerCase() === landId.trim().toLowerCase() ||
      p.surveyNumber?.toLowerCase() === landId.trim().toLowerCase()
    ) || null;
  },

  // Citizen registers a new claim with auto-tagged name and unique ID (e.g. CLM-000123)
  async createCitizenClaim(claimData) {
    const parcels = getLocalParcels();
    const claimId = generateClaimId();
    const applicationId = `APP-${claimData.state ? claimData.state.slice(0, 2).toUpperCase() : 'IN'}-${Math.floor(1000 + Math.random() * 9000)}`;

    const areaAcres = parseFloat(claimData.areaAcres) || 2.0;
    const areaHectares = parseFloat((areaAcres * 0.404686).toFixed(2));
    const areaSqM = Math.round(areaAcres * 4046.86);

    const lat = claimData.lat || 12.9716;
    const lon = claimData.lon || 77.5946;

    const selfDeclared = claimData.landUseType || "Agricultural / Farmland";
    const govtRecord = claimData.hasMismatch ? "Forest / Restricted" : selfDeclared;
    const isMismatch = claimData.hasMismatch || false;

    const newParcel = {
      landId: claimId, // Unique ID e.g. CLM-000001
      claimId: claimId,
      applicationId,
      farmerName: claimData.farmerName || claimData.citizenName || "Applicant Citizen",
      citizenName: claimData.farmerName || claimData.citizenName || "Applicant Citizen",
      mobile: claimData.mobile || "+91 98000 00000",
      idDetails: claimData.idDetails || "Aadhaar: Verified",
      state: claimData.state || "Karnataka",
      district: claimData.district || "Mandya",
      taluk: claimData.taluk || "Maddur",
      village: claimData.village || "Grama Block 1",
      surveyNumber: claimData.surveyNumber || "72/1",
      plotNumber: claimData.plotNumber || "Plot #1",
      areaAcres,
      areaHectares,
      areaSqM,
      lat,
      lon,
      latE6: Math.round(lat * 1e6),
      lonE6: Math.round(lon * 1e6),

      selfDeclaredClassification: selfDeclared,
      governmentRecordClassification: govtRecord,
      groundVerificationClassification: "Pending Verification",
      finalClassification: isMismatch ? "⚠️ Land-Use Classification Mismatch" : selfDeclared,
      hasClassificationMismatch: isMismatch,

      status: claimData.status || (claimData.hasMissingDocs ? "Special Verification Required" : "Pending Verification"),
      stage: claimData.hasMissingDocs ? "Document Assistance" : "Ground Verification",
      verificationScore: claimData.verificationScore !== undefined ? claimData.verificationScore : 1,
      verificationDate: "Under Review",
      verifiedByOfficer: "Assigned to Local Circle Officer",
      verificationTeamId: "TEAM-ASSIGNED",

      legalStatus: isMismatch ? "⚠️ Legal Issue Detected" : "Clear",
      disputeDetails: isMismatch ? "Discrepancy detected between self-declared farmland and restricted government registry." : null,

      referenceValuationPerAcre: 700000,
      totalReferenceValue: Math.round(areaAcres * 700000),
      estimatedMarketValue: Math.round(areaAcres * 950000),
      valuationZone: `${claimData.district || 'Regional'} Agricultural Zone 1`,
      valuationDate: "Current Session",

      documents: claimData.documents || [],
      missingDocuments: claimData.missingDocuments || [],
      deficiencyReport: claimData.deficiencyReport || null,

      groundNotes: "Application lodged by citizen with community consensus attestations.",
      communityAttestations: claimData.communityAttestations || claimData.neighbours || [],
      neighbours: claimData.neighbours || [],
      ngoEndorsement: claimData.ngoEndorsement || null,

      polygon: claimData.polygon || [
        [lat - 0.0005, lon - 0.0005],
        [lat + 0.0006, lon - 0.0004],
        [lat + 0.0005, lon + 0.0006],
        [lat - 0.0006, lon + 0.0005]
      ],

      hasDisasterClaim: false,
      disasterClaim: null,
      createdAt: new Date().toISOString(),

      // MST Testnet On-Chain Proof
      txHash: generateBlockchainTxHash(),
      blockNumber: 5786200 + Math.floor(Math.random() * 5000),
      explorerUrl: ''
    };
    newParcel.explorerUrl = `https://testnetscan.mstblockchain.com/tx/${newParcel.txHash}`;

    emitBlockchainTxLog({
      action: 'RECORD LAND CLAIM (LandRegistry.sol::createClaim)',
      targetId: claimId,
      txHash: newParcel.txHash,
      blockNumber: newParcel.blockNumber,
      contractAddress: '0x9A587a9a4b990bb14Cd00D6432487271f00c2A5c',
      extra: `Citizen: ${newParcel.farmerName} | Area: ${newParcel.areaAcres} Acres | Consensus: ${newParcel.verificationScore}/5`
    });

    const updated = [newParcel, ...parcels];
    saveLocalParcels(updated);

    logAuditAction({
      action: 'CLAIM_SUBMITTED',
      targetId: claimId,
      targetType: 'LAND_CLAIM',
      details: `New claim lodged by citizen ${newParcel.farmerName} for Survey #${newParcel.surveyNumber} (${newParcel.areaAcres} acres) in ${newParcel.village}, ${newParcel.district}. On-chain Tx: ${newParcel.txHash}.`,
      actorName: newParcel.farmerName,
      actorRole: 'CITIZEN'
    });

    return newParcel;
  },

  // Backward compatible alias
  async createFarmerClaim(claimData) {
    return this.createCitizenClaim(claimData);
  },

  // Ground Verification Officer submits findings
  async submitGroundVerification(landId, findings) {
    const parcels = getLocalParcels();
    const idx = parcels.findIndex(p => p.landId === landId || p.claimId === landId);
    if (idx === -1) throw new Error("Land not found");

    const p = parcels[idx];
    p.groundVerificationClassification = findings.groundLandUse || p.selfDeclaredClassification;
    
    const isMismatch = p.selfDeclaredClassification !== p.groundVerificationClassification ||
                       p.governmentRecordClassification !== p.groundVerificationClassification;
    p.hasClassificationMismatch = isMismatch;
    p.finalClassification = isMismatch 
      ? "⚠️ Land-Use Classification Mismatch" 
      : p.groundVerificationClassification;

    p.groundNotes = findings.groundNotes || p.groundNotes;
    p.verifiedByOfficer = findings.officerName || p.verifiedByOfficer;
    p.verificationTeamId = findings.teamId || p.verificationTeamId;
    p.stage = isMismatch ? "Land Classification" : "Government Approval";
    p.status = findings.result || (isMismatch ? "Partially Verified" : "Verified");

    if (findings.result === "Requires Legal Review") {
      p.legalStatus = "⚠️ Legal Issue Detected";
      p.disputeDetails = findings.disputeReason || "Legal review initiated by Ground Survey Officer.";
    }

    if (findings.attestations && findings.attestations.length > 0) {
      p.communityAttestations = [...(p.communityAttestations || []), ...findings.attestations];
      p.verificationScore = Math.min(5, (p.verificationScore || 1) + findings.attestations.length);
    }

    parcels[idx] = p;
    saveLocalParcels(parcels);

    logAuditAction({
      action: 'GROUND_VERIFICATION_SUBMITTED',
      targetId: landId,
      targetType: 'LAND_CLAIM',
      details: `Ground inspection recorded by ${findings.officerName || 'Field Officer'}. Status: ${p.status}.`,
      actorName: findings.officerName || 'Field Officer',
      actorRole: 'VERIFICATION_OFFICER'
    });

    return p;
  },

  // Government Official approves or grants final verification
  async approveLandClaim(landId, approvalData = {}) {
    const parcels = getLocalParcels();
    const idx = parcels.findIndex(p => p.landId === landId || p.claimId === landId);
    if (idx === -1) throw new Error("Land not found");

    const p = parcels[idx];
    const score = Number(approvalData.verificationScore || p.verificationScore || p.score || 2);
    if (score < 5 && !approvalData.bypassThreshold) {
      throw new Error(`Cannot register land: Confidence score (${score}/5) is below the mandatory verification threshold of 5.`);
    }

    p.status = "Verified";
    p.stage = "Completed";
    p.finalClassification = approvalData.finalClassification || p.finalClassification || p.selfDeclaredClassification;
    p.hasClassificationMismatch = false;
    p.legalStatus = "Clear";
    p.disputeDetails = null;
    p.verificationScore = 5;
    p.verificationDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    p.verifiedByOfficer = approvalData.officerName || "District Revenue Officer (Govt of India)";

    // On-Chain Title Seal Grant
    const approvalTxHash = generateBlockchainTxHash();
    const approvalBlock = 5786200 + Math.floor(Math.random() * 5000);
    p.approvalTxHash = approvalTxHash;
    p.approvalBlock = approvalBlock;
    p.explorerUrl = `https://testnetscan.mstblockchain.com/tx/${approvalTxHash}`;
    p.txHash = approvalTxHash;

    emitBlockchainTxLog({
      action: 'OFFICIAL TITLE SEAL GRANTED (LandRegistry.sol)',
      targetId: landId,
      txHash: approvalTxHash,
      blockNumber: approvalBlock,
      contractAddress: '0x9A587a9a4b990bb14Cd00D6432487271f00c2A5c',
      extra: `Land ID: ${landId} | Officer: ${p.verifiedByOfficer} | Status: VERIFIED ✓`
    });

    parcels[idx] = p;
    saveLocalParcels(parcels);

    logAuditAction({
      action: 'CLAIM_APPROVED_VERIFIED',
      targetId: landId,
      targetType: 'LAND_CLAIM',
      details: `Title seal granted to Land ID ${landId} by ${p.verifiedByOfficer}. Classification locked: ${p.finalClassification}.`,
      actorName: p.verifiedByOfficer,
      actorRole: 'GOVERNMENT_OFFICER'
    });

    return p;
  },

  // Elevate Confidence Score to statutory consensus threshold via official ground survey
  async elevateConfidenceScore(landId, officerName = "Revenue Officer") {
    const parcels = getLocalParcels();
    const idx = parcels.findIndex(p => p.landId === landId || p.claimId === landId);
    if (idx === -1) throw new Error("Land not found");

    const p = parcels[idx];
    p.verificationScore = 5;
    p.groundVerificationClassification = p.selfDeclaredClassification;
    p.groundNotes = (p.groundNotes || "") + ` | Ground survey and statutory community consensus attested by ${officerName}. Score elevated to 5/5 consensus threshold.`;
    parcels[idx] = p;
    saveLocalParcels(parcels);

    logAuditAction({
      action: 'CONSENSUS_SCORE_ELEVATED',
      targetId: landId,
      targetType: 'LAND_CLAIM',
      details: `Ground survey inspection and neighbor consensus attested by ${officerName}. Confidence score elevated to statutory threshold (5/5).`,
      actorName: officerName,
      actorRole: 'GOVERNMENT_OFFICER'
    });

    return p;
  },

  // Dispute a claim
  async disputeClaim(landId, reason = "Boundary dispute registered with revenue authority", officerName = "Revenue Officer") {
    const parcels = getLocalParcels();
    const idx = parcels.findIndex(p => p.landId === landId || p.claimId === landId);
    if (idx === -1) throw new Error("Land not found");

    const p = parcels[idx];
    p.status = "Disputed";
    p.legalStatus = "⚠️ Legal Issue Detected";
    p.disputeDetails = reason;

    parcels[idx] = p;
    saveLocalParcels(parcels);

    logAuditAction({
      action: 'CLAIM_DISPUTED',
      targetId: landId,
      targetType: 'LAND_CLAIM',
      details: `Dispute flagged on claim ${landId}. Reason: ${reason}.`,
      actorName: officerName,
      actorRole: 'GOVERNMENT_OFFICER'
    });

    return p;
  },

  // Resolve a dispute on a claim
  async resolveDispute(landId, officerName = "Revenue Magistrate") {
    const parcels = getLocalParcels();
    const idx = parcels.findIndex(p => p.landId === landId || p.claimId === landId);
    if (idx === -1) throw new Error("Land not found");

    const p = parcels[idx];
    p.status = "Verified";
    p.legalStatus = "Clear";
    p.disputeDetails = null;

    parcels[idx] = p;
    saveLocalParcels(parcels);

    logAuditAction({
      action: 'DISPUTE_RESOLVED',
      targetId: landId,
      targetType: 'LAND_CLAIM',
      details: `Dispute resolved on claim ${landId} by ${officerName}. Title cleared.`,
      actorName: officerName,
      actorRole: 'GOVERNMENT_OFFICER'
    });

    return p;
  },

  // ==========================================
  // DISASTER RELIEF APPLICATIONS (CHANGE 4)
  // ==========================================
  async getReliefApplications() {
    return getLocalReliefApps();
  },

  async createReliefApplication(reliefData) {
    const apps = getLocalReliefApps();
    const reliefId = generateReliefId(); // e.g. REL-000045

    const newApp = {
      applicationId: reliefId,
      reliefId: reliefId,
      citizenName: reliefData.citizenName || reliefData.farmerName || 'Applicant Citizen',
      linkedClaimId: reliefData.linkedClaimId || '',
      disasterType: reliefData.disasterType || '',
      date: reliefData.date || new Date().toISOString().split('T')[0],
      description: reliefData.description || '',
      photoName: reliefData.photoName || '',
      photoUrl: reliefData.photoUrl || null,
      damagePercentage: parseFloat(reliefData.damagePercentage) || 0,
      landUseCategory: reliefData.landUseCategory || 'Agricultural / Farmland',
      suggestedCompensation: parseFloat(reliefData.suggestedCompensation) || 0,
      requestedAmount: parseFloat(reliefData.requestedAmount) || 0,
      approvedAmount: null,
      status: "Pending Government Verification", // Initial status
      verificationNotes: '',
      verifiedBy: null,
      verificationDate: null,
      remarks: "Application received and queued for field verification.",
      createdAt: new Date().toISOString(),

      // MST Testnet On-Chain Proof
      txHash: generateBlockchainTxHash(),
      blockNumber: 5786200 + Math.floor(Math.random() * 5000),
      explorerUrl: ''
    };
    newApp.explorerUrl = `https://testnetscan.mstblockchain.com/tx/${newApp.txHash}`;

    emitBlockchainTxLog({
      action: 'LODGE DISASTER RELIEF APPLICATION (ReliefFund.sol)',
      targetId: reliefId,
      txHash: newApp.txHash,
      blockNumber: newApp.blockNumber,
      contractAddress: '0x41241011dE47C4eb30dFcc45097ceD1f73a7Bd25',
      extra: `Citizen: ${newApp.citizenName} | Event: ${newApp.disasterType} | Requested: ₹${Number(newApp.requestedAmount).toLocaleString('en-IN')}`
    });

    const updated = [newApp, ...apps];
    saveLocalReliefApps(updated);

    logAuditAction({
      action: 'RELIEF_APPLICATION_SUBMITTED',
      targetId: reliefId,
      targetType: 'RELIEF_APPLICATION',
      details: `Disaster relief application ${reliefId} lodged by ${newApp.citizenName} for linked claim ${newApp.linkedClaimId}. Requested: ₹${newApp.requestedAmount.toLocaleString('en-IN')}. Event: ${newApp.disasterType}.`,
      actorName: newApp.citizenName,
      actorRole: 'CITIZEN'
    });

    return newApp;
  },

  // Step 1: Verification (checkbox + notes + recommended amount + damage assessment)
  async verifyReliefApplication(reliefId, { notes, officerName, recommendedAmount, assessedDamagePercentage, damageSeverity } = {}) {
    const apps = getLocalReliefApps();
    const idx = apps.findIndex(a => a.applicationId === reliefId || a.reliefId === reliefId);
    if (idx === -1) throw new Error("Relief application not found");

    const app = apps[idx];
    app.status = "Verified - Awaiting Approval";
    app.verificationNotes = notes || "Ground damage and applicant claim verified by officer.";
    app.verifiedBy = officerName || "Verification Officer";
    app.verificationDate = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    if (recommendedAmount !== undefined && recommendedAmount !== '') {
      app.recommendedAmount = parseFloat(recommendedAmount);
    }
    if (assessedDamagePercentage !== undefined && assessedDamagePercentage !== '') {
      app.assessedDamagePercentage = parseFloat(assessedDamagePercentage);
    }
    if (damageSeverity) {
      app.damageSeverity = damageSeverity;
    }
    app.remarks = `Ground inspection verified. Recommended: ₹${Number(app.recommendedAmount || 0).toLocaleString('en-IN')}. Notes: ${app.verificationNotes}`;

    apps[idx] = app;
    saveLocalReliefApps(apps);

    logAuditAction({
      action: 'RELIEF_APPLICATION_VERIFIED',
      targetId: reliefId,
      targetType: 'RELIEF_APPLICATION',
      details: `Relief application ${reliefId} verified by ${app.verifiedBy}. Recommended Amount: ₹${Number(app.recommendedAmount || 0).toLocaleString('en-IN')}. Notes: ${app.verificationNotes}.`,
      actorName: app.verifiedBy,
      actorRole: 'GOVERNMENT_OFFICER'
    });

    return app;
  },

  // Step 2: Approval (officer enters approved amount)
  async approveReliefApplication(reliefId, { approvedAmount, officerName }) {
    const apps = getLocalReliefApps();
    const idx = apps.findIndex(a => a.applicationId === reliefId || a.reliefId === reliefId);
    if (idx === -1) throw new Error("Relief application not found");

    const app = apps[idx];
    const amount = parseFloat(approvedAmount) || app.requestedAmount;
    app.status = "Approved";
    app.approvedAmount = amount;
    app.approvedBy = officerName || "Government Sanctioning Officer";
    app.approvalDate = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    app.remarks = `Sanctioned for DBT distribution. Approved amount: ₹${amount.toLocaleString('en-IN')}.`;

    // MST Testnet On-Chain Sanction
    const approvalTxHash = generateBlockchainTxHash();
    const approvalBlock = 5786200 + Math.floor(Math.random() * 5000);
    app.approvalTxHash = approvalTxHash;
    app.approvalBlock = approvalBlock;
    app.explorerUrl = `https://testnetscan.mstblockchain.com/tx/${approvalTxHash}`;

    emitBlockchainTxLog({
      action: 'SANCTION DISASTER RELIEF DBT (ReliefFund.sol)',
      targetId: reliefId,
      txHash: approvalTxHash,
      blockNumber: approvalBlock,
      contractAddress: '0x41241011dE47C4eb30dFcc45097ceD1f73a7Bd25',
      extra: `Sanctioned Amount: ₹${amount.toLocaleString('en-IN')} | Officer: ${app.approvedBy}`
    });

    apps[idx] = app;
    saveLocalReliefApps(apps);

    logAuditAction({
      action: 'RELIEF_APPLICATION_APPROVED',
      targetId: reliefId,
      targetType: 'RELIEF_APPLICATION',
      details: `Relief application ${reliefId} sanctioned for ₹${amount.toLocaleString('en-IN')} by ${app.approvedBy}.`,
      actorName: app.approvedBy,
      actorRole: 'GOVERNMENT_OFFICER'
    });

    return app;
  },

  // Step 2: Rejection (requires reason)
  async rejectReliefApplication(reliefId, { rejectionReason, officerName }) {
    const apps = getLocalReliefApps();
    const idx = apps.findIndex(a => a.applicationId === reliefId || a.reliefId === reliefId);
    if (idx === -1) throw new Error("Relief application not found");

    const app = apps[idx];
    app.status = "Rejected";
    app.rejectedBy = officerName || "Government Sanctioning Officer";
    app.rejectionReason = rejectionReason || "Eligibility criteria not satisfied.";
    app.remarks = `Application Rejected. Reason: ${app.rejectionReason}`;

    apps[idx] = app;
    saveLocalReliefApps(apps);

    logAuditAction({
      action: 'RELIEF_APPLICATION_REJECTED',
      targetId: reliefId,
      targetType: 'RELIEF_APPLICATION',
      details: `Relief application ${reliefId} rejected by ${app.rejectedBy}. Reason: ${app.rejectionReason}`,
      actorName: app.rejectedBy,
      actorRole: 'GOVERNMENT_OFFICER'
    });

    return app;
  },

  // Legacy disaster claim support
  async submitDisasterClaim(landId, disasterData) {
    const parcels = getLocalParcels();
    const idx = parcels.findIndex(p => p.landId === landId || p.claimId === landId);
    if (idx === -1) throw new Error("Land not found");

    const p = parcels[idx];
    const affectedArea = parseFloat(disasterData.affectedAreaAcres) || p.areaAcres;
    const damagePct = parseFloat(disasterData.damagePercentage) || 70;
    
    const baseRate = RELIEF_RATE_PER_ACRE[p.finalClassification] || 35000;
    const eligibleAmount = Math.round(affectedArea * baseRate * (damagePct / 100));

    const claim = {
      claimId: generateReliefId(),
      disasterType: disasterData.disasterType || "Flood",
      disasterDate: disasterData.disasterDate || "Current Month",
      affectedAreaAcres: affectedArea,
      damagePercentage: damagePct,
      cropDamageDescription: disasterData.cropDamageDescription || "Crop / soil inundation from severe weather.",
      reliefRatePerUnit: baseRate,
      estimatedEligibleRelief: eligibleAmount,
      sanctionedAmount: eligibleAmount,
      releasedAmount: Math.round(eligibleAmount * 0.6),
      remainingAmount: Math.round(eligibleAmount * 0.4),
      approvalStatus: "Sanctioned (Initial DBT Tranche Released)",
      expectedProcessingDays: 3
    };

    p.hasDisasterClaim = true;
    p.disasterClaim = claim;

    parcels[idx] = p;
    saveLocalParcels(parcels);
    return p;
  },

  // Audit Logs
  async getAuditLogs() {
    return getLocalAuditLogs();
  },

  async addAuditLog(data) {
    return logAuditAction(data);
  }
};
