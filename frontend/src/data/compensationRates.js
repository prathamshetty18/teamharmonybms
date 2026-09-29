/**
 * Government Compensation Benchmark Rates (Configurable per Land Use Category)
 * Base rates represent compensation amount (₹) per 1% of verified damage.
 * 
 * Formula:
 * suggested_amount = base_rate_for(land_use_category) * damage_percentage
 */

export const COMPENSATION_BASE_RATES_PER_PERCENT = {
  "Agricultural / Farmland": 500, // ₹50,000 for 100% damage
  "Agricultural": 500,
  "Residential": 1000,           // ₹100,000 for 100% damage
  "Commercial": 1500,            // ₹150,000 for 100% damage
  "Industrial": 1800,            // ₹180,000 for 100% damage
  "Mixed-use": 1200,             // ₹120,000 for 100% damage
  "Forest / Restricted": 300,    // ₹30,000 for 100% damage
  "Institutional / Public": 800, // ₹80,000 for 100% damage
  "Other": 600                  // ₹60,000 for 100% damage
};

/**
 * Get base rate per 1% damage for a given land use category
 */
export function getBaseRateForCategory(category) {
  if (!category) return COMPENSATION_BASE_RATES_PER_PERCENT["Agricultural / Farmland"];
  
  const trimmed = category.trim().toLowerCase();
  for (const [key, rate] of Object.entries(COMPENSATION_BASE_RATES_PER_PERCENT)) {
    if (key.toLowerCase() === trimmed || trimmed.includes(key.toLowerCase()) || key.toLowerCase().includes(trimmed)) {
      return rate;
    }
  }
  return 500;
}

/**
 * Compute suggested compensation based on land use category and damage percentage
 */
export function computeSuggestedCompensation(category, damagePercentage) {
  const baseRate = getBaseRateForCategory(category);
  const pct = Math.max(0, Math.min(100, parseFloat(damagePercentage) || 0));
  return Math.round(baseRate * pct);
}
