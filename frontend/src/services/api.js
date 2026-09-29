import { INITIAL_LAND_PARCELS, RELIEF_RATE_PER_ACRE } from '../data/mockData';

const STORAGE_KEY = 'bhoomi_setu_parcels';

function getLocalParcels() {
  const cached = localStorage.getItem(STORAGE_KEY);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch {
      // fallback
    }
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_LAND_PARCELS));
  return INITIAL_LAND_PARCELS;
}

function saveLocalParcels(parcels) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(parcels));
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
    isVerifiedByGovt: false // Distinguishes between OCR-extracted vs officially verified
  };
}

export const api = {
  async getParcels() {
    return getLocalParcels();
  },

  async getParcelByLandId(landId) {
    const list = getLocalParcels();
    return list.find(p => 
      p.landId.toLowerCase() === landId.trim().toLowerCase() ||
      p.applicationId.toLowerCase() === landId.trim().toLowerCase() ||
      p.surveyNumber.toLowerCase() === landId.trim().toLowerCase()
    ) || null;
  },

  // Farmer registers a new claim
  async createFarmerClaim(claimData) {
    const parcels = getLocalParcels();
    const count = parcels.length + 1;
    const landId = `LAND-IN-2026-${String(8900 + count)}`;
    const applicationId = `APP-${claimData.state ? claimData.state.slice(0, 2).toUpperCase() : 'IN'}-${Math.floor(1000 + Math.random() * 9000)}`;

    const areaAcres = parseFloat(claimData.areaAcres) || 2.0;
    const areaHectares = parseFloat((areaAcres * 0.404686).toFixed(2));
    const areaSqM = Math.round(areaAcres * 4046.86);

    const lat = claimData.lat || 11.5300;
    const lon = claimData.lon || 76.1380;

    // Check classification alignment (mock check)
    const selfDeclared = claimData.landUseType || "Agricultural / Farmland";
    const govtRecord = claimData.hasMismatch ? "Forest / Restricted" : selfDeclared;
    const groundVerif = "Pending Verification";
    const isMismatch = claimData.hasMismatch || false;

    const newParcel = {
      landId,
      applicationId,
      farmerName: claimData.farmerName || "Applicant Citizen",
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
      groundVerificationClassification: groundVerif,
      finalClassification: isMismatch ? "⚠️ Land-Use Classification Mismatch" : "Self-Declared (Pending Verification)",
      hasClassificationMismatch: isMismatch,

      status: claimData.hasMissingDocs ? "Special Verification Required" : "Pending Verification",
      stage: claimData.hasMissingDocs ? "Document Assistance" : "Ground Verification",
      verificationScore: 1,
      verificationDate: "Under Review",
      verifiedByOfficer: "Assigned to Local Circle Officer",
      verificationTeamId: "TEAM-ASSIGNED",

      legalStatus: isMismatch ? "⚠️ Legal Issue Detected" : "Clear",
      disputeDetails: isMismatch ? "Discrepancy detected between self-declared farmland and restricted government registry." : null,

      referenceValuationPerAcre: 700000,
      totalReferenceValue: Math.round(areaAcres * 700000),
      estimatedMarketValue: Math.round(areaAcres * 950000),
      valuationZone: `${claimData.district || 'Regional'} Agricultural Zone 1`,
      valuationDate: "September 2026",

      documents: claimData.documents || [],
      missingDocuments: claimData.missingDocuments || [],
      deficiencyReport: claimData.deficiencyReport || null,

      groundNotes: "Application lodged by farmer. Ready for ground survey team inspection.",
      communityAttestations: [],

      polygon: claimData.polygon || [
        [lat - 0.0005, lon - 0.0005],
        [lat + 0.0006, lon - 0.0004],
        [lat + 0.0005, lon + 0.0006],
        [lat - 0.0006, lon + 0.0005]
      ],

      hasDisasterClaim: false,
      disasterClaim: null
    };

    const updated = [newParcel, ...parcels];
    saveLocalParcels(updated);
    return newParcel;
  },

  // Ground Verification Officer submits findings
  async submitGroundVerification(landId, findings) {
    const parcels = getLocalParcels();
    const idx = parcels.findIndex(p => p.landId === landId);
    if (idx === -1) throw new Error("Land not found");

    const p = parcels[idx];
    p.groundVerificationClassification = findings.groundLandUse || p.selfDeclaredClassification;
    
    // Check mismatch
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

    // Add community attestations
    if (findings.attestations && findings.attestations.length > 0) {
      p.communityAttestations = [...p.communityAttestations, ...findings.attestations];
      p.verificationScore = Math.min(5, p.verificationScore + findings.attestations.length);
    }

    parcels[idx] = p;
    saveLocalParcels(parcels);
    return p;
  },

  // Government Official approves or grants final verification
  async approveLandClaim(landId, approvalData) {
    const parcels = getLocalParcels();
    const idx = parcels.findIndex(p => p.landId === landId);
    if (idx === -1) throw new Error("Land not found");

    const p = parcels[idx];
    p.status = "Verified";
    p.stage = "Completed";
    p.finalClassification = approvalData.finalClassification || p.finalClassification;
    p.hasClassificationMismatch = false;
    p.legalStatus = "Clear";
    p.disputeDetails = null;
    p.verificationScore = 5;
    p.verificationDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    p.verifiedByOfficer = approvalData.officerName || "District Revenue Officer (Govt of India)";

    parcels[idx] = p;
    saveLocalParcels(parcels);
    return p;
  },

  // Submit Disaster Relief Claim
  async submitDisasterClaim(landId, disasterData) {
    const parcels = getLocalParcels();
    const idx = parcels.findIndex(p => p.landId === landId);
    if (idx === -1) throw new Error("Land not found");

    const p = parcels[idx];
    const affectedArea = parseFloat(disasterData.affectedAreaAcres) || p.areaAcres;
    const damagePct = parseFloat(disasterData.damagePercentage) || 70;
    
    // Dynamic compensation calculation based on verified land use
    const baseRate = RELIEF_RATE_PER_ACRE[p.finalClassification] || 35000;
    const eligibleAmount = Math.round(affectedArea * baseRate * (damagePct / 100));

    const claim = {
      claimId: `RELIEF-${p.district ? p.district.slice(0, 3).toUpperCase() : 'GOV'}-2026-${Math.floor(100 + Math.random() * 900)}`,
      disasterType: disasterData.disasterType || "Flood",
      disasterDate: disasterData.disasterDate || "Current Month",
      affectedAreaAcres: affectedArea,
      damagePercentage: damagePct,
      cropDamageDescription: disasterData.cropDamageDescription || "Crop / soil inundation from severe weather.",
      reliefRatePerUnit: baseRate,
      estimatedEligibleRelief: eligibleAmount,
      sanctionedAmount: eligibleAmount,
      releasedAmount: Math.round(eligibleAmount * 0.6), // 60% first DBT tranche
      remainingAmount: Math.round(eligibleAmount * 0.4),
      approvalStatus: "Sanctioned (Initial DBT Tranche Released)",
      expectedProcessingDays: 3
    };

    p.hasDisasterClaim = true;
    p.disasterClaim = claim;

    parcels[idx] = p;
    saveLocalParcels(parcels);
    return p;
  }
};
