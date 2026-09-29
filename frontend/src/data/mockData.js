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

// Start EMPTY per Change 5 requirement - populated only by real user input
export const INITIAL_LAND_PARCELS = [];

// Start EMPTY per Change 5 requirement - populated only during the session
export const INITIAL_NOTIFICATIONS = [];
