// Indian States and Union Territories with sample Districts and Taluks
export const INDIAN_LOCATIONS = {
  "Karnataka": {
    districts: {
      "Mandya": ["Mandya", "Maddur", "Malavalli", "Pandavapura", "Srirangapatna", "Nagaseetha"],
      "Mysuru": ["Mysuru", "Nanjangud", "Hunsur", "Piriyapatna", "T. Narasipura"],
      "Wayanad-Border": ["Gundlupet", "HD Kote"],
      "Bengaluru Rural": ["Devanahalli", "Doddaballapura", "Hosakote", "Nelamangala"]
    }
  },
  "Kerala": {
    districts: {
      "Wayanad": ["Vythiri", "Sulthan Bathery", "Mananthavady", "Meppadi"],
      "Idukki": ["Devikulam", "Peerumade", "Udumbanchola", "Thodupuzha"],
      "Ernakulam": ["Aluva", "Kochi", "Kunnathunad", "Muvattupuzha"]
    }
  },
  "Maharashtra": {
    districts: {
      "Raigad": ["Alibag", "Mahad", "Panvel", "Roha", "Pen"],
      "Pune": ["Haveli", "Baramati", "Shirur", "Ambegaon", "Maval"],
      "Nagpur": ["Nagpur Urban", "Kamptee", "Hingna", "Katol"]
    }
  },
  "Odisha": {
    districts: {
      "Puri": ["Puri", "Pipili", "Satyabadi", "Gop", "Brahmagiri"],
      "Ganjam": ["Berhampur", "Chhatrapur", "Bhanjanagar", "Hinjilicut"],
      "Balasore": ["Balasore", "Basta", "Jaleswar", "Soro"]
    }
  },
  "Tamil Nadu": {
    districts: {
      "Thanjavur": ["Thanjavur", "Kumbakonam", "Papanasam", "Pattukkottai"],
      "Coimbatore": ["Coimbatore North", "Coimbatore South", "Pollachi", "Mettupalayam"],
      "Cuddalore": ["Cuddalore", "Chidambaram", "Panruti", "Vridhachalam"]
    }
  },
  "Gujarat": {
    districts: {
      "Surat": ["Surat City", "Chorasi", "Olpad", "Bardoli"],
      "Kutch": ["Bhuj", "Anjar", "Gandhidham", "Mandvi"]
    }
  },
  "Bihar": {
    districts: {
      "Patna": ["Patna Sadar", "Barh", "Danapur", "Masaurhi"],
      "Darbhanga": ["Darbhanga Sadar", "Benipur", "Biraul"]
    }
  },
  "Assam": {
    districts: {
      "Kamrup": ["Guwahati", "Hajo", "Palasbari", "Rangia"],
      "Dhemaji": ["Dhemaji", "Jonai", "Silapathar"]
    }
  }
};

export const LAND_USE_TYPES = [
  "Agricultural / Farmland",
  "Residential",
  "Commercial",
  "Industrial",
  "Forest / Restricted",
  "Institutional / Public",
  "Other"
];

export const DISASTER_TYPES = [
  "Flood",
  "Drought",
  "Cyclone",
  "Landslide",
  "Storm",
  "Fire",
  "Other government-recognized disasters"
];

// Government Compensation Benchmarks (per acre for 100% damage)
export const RELIEF_RATE_PER_ACRE = {
  "Agricultural / Farmland": 35000,
  "Residential": 75000,
  "Commercial": 95000,
  "Industrial": 110000,
  "Forest / Restricted": 20000,
  "Institutional / Public": 50000,
  "Other": 30000
};

export const INITIAL_LAND_PARCELS = [
  {
    landId: "LAND-IN-2026-8901",
    applicationId: "APP-KL-9812",
    farmerName: "Raghavan Nair",
    mobile: "+91 98471 23456",
    idDetails: "Aadhaar: XXXX-XXXX-4912",
    state: "Kerala",
    district: "Wayanad",
    taluk: "Vythiri",
    village: "Chooralmala",
    surveyNumber: "142/3B",
    plotNumber: "Plot #14",
    areaAcres: 2.8,
    areaHectares: 1.13,
    areaSqM: 11331,
    lat: 11.5342,
    lon: 76.1420,
    latE6: 11534200,
    lonE6: 76142000,
    
    // Multi-tier land use classification
    selfDeclaredClassification: "Agricultural / Farmland",
    governmentRecordClassification: "Agricultural / Farmland",
    groundVerificationClassification: "Agricultural / Farmland",
    finalClassification: "Agricultural / Farmland",
    hasClassificationMismatch: false,
    
    // Status tracking
    status: "Verified",
    stage: "Final Approval", // Stages: "Claim Submitted" -> "Document Verification" -> "Ground Verification" -> "Community/NGO Verification" -> "Land Classification" -> "Government Approval" -> "Completed"
    verificationScore: 5, // Target: 5
    verificationDate: "28 Sep 2026",
    verifiedByOfficer: "Devendra Patil (Sub-Divisional Magistrate)",
    verificationTeamId: "TEAM-WYD-04",
    
    // Legal & Valuation
    legalStatus: "Clear", // "Clear", "Disputed", "Requires Legal Review"
    disputeDetails: null,
    referenceValuationPerAcre: 850000,
    totalReferenceValue: 2380000,
    estimatedMarketValue: 3100000,
    valuationZone: "Wayanad High-Yield Spices Belt (Zone A2)",
    valuationDate: "August 2026",
    
    // Documents
    documents: [
      { type: "7/12 Extract / RTC Deed", status: "Verified", docNumber: "KL-WYD-2021-9982", ocrExtracted: true },
      { type: "Pattadar Passbook", status: "Verified", docNumber: "KL-PASS-7842", ocrExtracted: true },
      { type: "Cadastral Survey Map", status: "Verified", docNumber: "MAP-REV-142", ocrExtracted: true }
    ],
    missingDocuments: [],
    deficiencyReport: null,
    
    // Verification Evidence
    groundNotes: "Boundary pegs physically verified against pre-disaster Survey Stone benchmarks. Slope stable.",
    communityAttestations: [
      { name: "S. K. Raman (Neighboring Farm 142/3A)", role: "Neighbor", status: "Verified", weight: 1, date: "28 Sep 2026" },
      { name: "Panchayat Council President", role: "Village Leader", status: "Verified", weight: 3, date: "28 Sep 2026" },
      { name: "Kerala Disaster Relief Mission", role: "Accredited NGO", status: "Verified", weight: 3, date: "28 Sep 2026" }
    ],

    // Polygon boundary (Wayanad homestead)
    polygon: [
      [11.5337, 76.1415],
      [11.5348, 76.1418],
      [11.5346, 76.1428],
      [11.5335, 76.1424]
    ],

    // Disaster Relief Claim Link
    hasDisasterClaim: true,
    disasterClaim: {
      claimId: "RELIEF-WYD-2026-004",
      disasterType: "Landslide",
      disasterDate: "July 2026",
      affectedAreaAcres: 2.1,
      damagePercentage: 75,
      cropDamageDescription: "Standing coffee and cardamom plantation destroyed by hill debris flow.",
      reliefRatePerUnit: 35000,
      estimatedEligibleRelief: 55125,
      sanctionedAmount: 55125,
      releasedAmount: 35000,
      remainingAmount: 20125,
      approvalStatus: "Partially Released",
      expectedProcessingDays: 3
    }
  },
  {
    landId: "LAND-IN-2026-4421",
    applicationId: "APP-KA-5510",
    farmerName: "Basavaraj Gowda",
    mobile: "+91 94482 11982",
    idDetails: "Aadhaar: XXXX-XXXX-7104",
    state: "Karnataka",
    district: "Mandya",
    taluk: "Maddur",
    village: "Shivapura",
    surveyNumber: "88/1",
    plotNumber: "Field Block 3",
    areaAcres: 4.2,
    areaHectares: 1.70,
    areaSqM: 16997,
    lat: 12.5841,
    lon: 77.0428,
    latE6: 12584100,
    lonE6: 77042800,
    
    selfDeclaredClassification: "Agricultural / Farmland",
    governmentRecordClassification: "Agricultural / Farmland",
    groundVerificationClassification: "Commercial",
    finalClassification: "⚠️ Land-Use Classification Mismatch",
    hasClassificationMismatch: true,
    
    status: "Partially Verified",
    stage: "Land Classification",
    verificationScore: 3,
    verificationDate: "27 Sep 2026",
    verifiedByOfficer: "T. Ananth Murthy (Tahsildar)",
    verificationTeamId: "TEAM-MDY-01",
    
    legalStatus: "Requires Legal Review",
    disputeDetails: "Ground inspection found a brick warehouse operating on agricultural record. Conversion certificate (NA) not produced.",
    referenceValuationPerAcre: 1200000,
    totalReferenceValue: 5040000,
    estimatedMarketValue: 7200000,
    valuationZone: "Maddur Highway Irrigation Belt (Zone B)",
    valuationDate: "July 2026",
    
    documents: [
      { type: "RTC (Pahani) Extract", status: "Verified", docNumber: "KA-MDY-2022-411", ocrExtracted: true }
    ],
    missingDocuments: ["Non-Agricultural Conversion Certificate", "Commercial Building Layout Plan"],
    deficiencyReport: {
      missing: ["Commercial Conversion Order", "Fire Safety Clearance"],
      alternativeEvidence: "Electricity Board bill under commercial tariff provided.",
      requiredNextAction: "Submit DC Non-Agricultural conversion permit or restore to active cultivation."
    },
    
    groundNotes: "Active warehouse structure on 0.8 acre portion. Remaining 3.4 acres under sugarcane cultivation.",
    communityAttestations: [
      { name: "C. Shivakumar (Adjoining Plot)", role: "Neighbor", status: "Verified", weight: 1, date: "26 Sep 2026" }
    ],

    polygon: [
      [12.5835, 77.0420],
      [12.5849, 77.0422],
      [12.5847, 77.0435],
      [12.5833, 77.0431]
    ],

    hasDisasterClaim: false,
    disasterClaim: null
  },
  {
    landId: "LAND-IN-2026-1189",
    applicationId: "APP-MH-3301",
    farmerName: "Anandi Bai Patil",
    mobile: "+91 97654 88201",
    idDetails: "Aadhaar: XXXX-XXXX-3829",
    state: "Maharashtra",
    district: "Raigad",
    taluk: "Mahad",
    village: "Birwadi",
    surveyNumber: "214/B",
    plotNumber: "Homestead #9",
    areaAcres: 1.5,
    areaHectares: 0.61,
    areaSqM: 6070,
    lat: 18.0832,
    lon: 73.4219,
    latE6: 18083200,
    lonE6: 73421900,
    
    selfDeclaredClassification: "Residential",
    governmentRecordClassification: "Residential",
    groundVerificationClassification: "Residential",
    finalClassification: "Residential",
    hasClassificationMismatch: false,
    
    status: "Verified",
    stage: "Completed",
    verificationScore: 7,
    verificationDate: "25 Sep 2026",
    verifiedByOfficer: "R. K. Deshmukh (Circle Officer)",
    verificationTeamId: "TEAM-RGD-02",
    
    legalStatus: "Clear",
    disputeDetails: null,
    referenceValuationPerAcre: 1500000,
    totalReferenceValue: 2250000,
    estimatedMarketValue: 2900000,
    valuationZone: "Mahad Savitri River Precinct (Zone R1)",
    valuationDate: "June 2026",
    
    documents: [
      { type: "Gram Panchayat Property Card (Namuna 8)", status: "Verified", docNumber: "MH-GP-2019-14", ocrExtracted: true },
      { type: "Inheritance Deed (Virasat)", status: "Verified", docNumber: "MH-VIR-883", ocrExtracted: true }
    ],
    missingDocuments: [],
    deficiencyReport: null,
    
    groundNotes: "Residential building completely damaged in 2026 flash flooding. Foundation markings intact.",
    communityAttestations: [
      { name: "K. D. More (Neighboring House)", role: "Neighbor", status: "Verified", weight: 1, date: "24 Sep 2026" },
      { name: "Gram Sevak / Sarpanch", role: "Village Leader", status: "Verified", weight: 3, date: "24 Sep 2026" },
      { name: "Konkan Disaster Aid Trust", role: "Accredited NGO", status: "Verified", weight: 3, date: "25 Sep 2026" }
    ],

    polygon: [
      [18.0827, 73.4212],
      [18.0837, 73.4215],
      [18.0835, 73.4225],
      [18.0825, 73.4222]
    ],

    hasDisasterClaim: true,
    disasterClaim: {
      claimId: "RELIEF-MH-2026-081",
      disasterType: "Flood",
      disasterDate: "August 2026",
      affectedAreaAcres: 1.5,
      damagePercentage: 90,
      cropDamageDescription: "Complete inundation of residential compound and outhouse. Silt accumulation > 1.2m.",
      reliefRatePerUnit: 75000,
      estimatedEligibleRelief: 101250,
      sanctionedAmount: 101250,
      releasedAmount: 101250,
      remainingAmount: 0,
      approvalStatus: "Fully Disbursed",
      expectedProcessingDays: 0
    }
  },
  {
    landId: "LAND-IN-2026-7732",
    applicationId: "APP-OD-1092",
    farmerName: "Balaram Mohanty",
    mobile: "+91 93370 44510",
    idDetails: "Aadhaar: XXXX-XXXX-1983",
    state: "Odisha",
    district: "Puri",
    taluk: "Brahmagiri",
    village: "Chilika Coast Sector 4",
    surveyNumber: "305/7",
    plotNumber: "Coastal Parcel 12",
    areaAcres: 3.6,
    areaHectares: 1.46,
    areaSqM: 14569,
    lat: 19.7891,
    lon: 85.6421,
    latE6: 19789100,
    lonE6: 85642100,
    
    selfDeclaredClassification: "Agricultural / Farmland",
    governmentRecordClassification: "Forest / Restricted",
    groundVerificationClassification: "Coastal Wetland Buffer",
    finalClassification: "⚠️ Land-Use Classification Mismatch",
    hasClassificationMismatch: true,
    
    status: "Disputed",
    stage: "Land Classification",
    verificationScore: 2,
    verificationDate: "26 Sep 2026",
    verifiedByOfficer: "Pradip Senapati (Forest Range Officer)",
    verificationTeamId: "TEAM-PURI-01",
    
    legalStatus: "⚠️ Legal Issue Detected",
    disputeDetails: "Parcel falls inside Coastal Regulation Zone (CRZ-1) and overlaps Mangrove Eco-Buffer strip. Formal title contest filed by Department of Environment & Forests.",
    referenceValuationPerAcre: 500000,
    totalReferenceValue: 1800000,
    estimatedMarketValue: 2400000,
    valuationZone: "Puri Coastal Conservation Belt",
    valuationDate: "May 2026",
    
    documents: [
      { type: "Ancestral Possession Receipt (Handwritten)", status: "Pending Verification", docNumber: "OD-OLD-1974", ocrExtracted: false }
    ],
    missingDocuments: ["Record of Rights (RoR)", "Revenue Settlement Certificate", "CRZ Exemption Clearance"],
    deficiencyReport: {
      missing: ["Official Patta (RoR)", "CRZ Clearance"],
      alternativeEvidence: "Affidavit of continuous fishing & coastal paddy cultivation for 38 years.",
      requiredNextAction: "Case forwarded to District Land & CRZ Adjudication Tribunal."
    },
    
    groundNotes: "Tidal mangrove vegetation overlapping 60% of plot perimeter. Human agricultural bunds breached by cyclone.",
    communityAttestations: [
      { name: "Pabitra Jena (Fisherfolk Union)", role: "Neighbor", status: "Verified", weight: 1, date: "25 Sep 2026" }
    ],

    polygon: [
      [19.7884, 85.6415],
      [19.7898, 85.6418],
      [19.7895, 85.6430],
      [19.7882, 85.6426]
    ],

    hasDisasterClaim: true,
    disasterClaim: {
      claimId: "RELIEF-OD-2026-192",
      disasterType: "Cyclone",
      disasterDate: "September 2026",
      affectedAreaAcres: 3.6,
      damagePercentage: 80,
      cropDamageDescription: "Saline water ingress destroyed standing saline-resistant paddy crop and nursery beds.",
      reliefRatePerUnit: 35000,
      estimatedEligibleRelief: 100800,
      sanctionedAmount: 0,
      releasedAmount: 0,
      remainingAmount: 100800,
      approvalStatus: "Held Pending CRZ Dispute Review",
      expectedProcessingDays: 14
    }
  }
];

export const INITIAL_NOTIFICATIONS = [
  {
    id: 1,
    type: "warning",
    title: "⚠️ Land-Use Classification Mismatch",
    body: "Application APP-KA-5510 (Maddur): Self-declared as Farmland, but ground verification identified Commercial warehouse. Flagged for review.",
    time: "10m ago"
  },
  {
    id: 2,
    type: "success",
    title: "✓ Land Status Officially Verified",
    body: "Land ID LAND-IN-2026-8901 (Wayanad, Kerala): Completed all 6 stages of verification. Digital Certificate and QR code generated.",
    time: "32m ago"
  },
  {
    id: 3,
    type: "info",
    title: "Disaster Relief Sanctioned",
    body: "Relief application for Landslide damage in Wayanad approved: ₹35,000 initial DBT installment released to farmer's linked account.",
    time: "1h ago"
  }
];
