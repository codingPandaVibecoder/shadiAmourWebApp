/**
 * Profile Compatibility Matching Configuration
 * All scoring weights, thresholds, and constants in one place.
 * 
 * To tune scoring: change weights here — no need to touch scoring logic.
 * For ML: these become the initial weights, later replaced by learned weights.
 */

// ── Category Weights (must sum to 100) ──────────────────────────────────────
const SCORING_WEIGHTS = {
  ISLAMIC: 30,
  AGE: 15,
  HEIGHT: 10,
  MARITAL_FAMILY: 10,
  LOCATION: 15,
  NATIONALITY_ETHNICITY: 10,
  EDUCATION: 10,
};

// ── Islamic Compatibility Sub-Scores (out of 30 total) ─────────────────────
const ISLAMIC = {
  SECT_CERTAINTY_FULL: 15,     // Both specified same specific sect
  SECT_CERTAINTY_PARTIAL: 8,   // One or both selected "Any Islamic sect"
  PRAYER_ALIGNED: 15,          // Both prays same (both true or both false)
  PRAYER_MISMATCHED: 5,        // One prays, one doesn't
};

// ── Marital/Family Alignment Sub-Scores (out of 10 total) ──────────────────
const MARITAL_FAMILY = {
  IDEAL: 10,                   // Both never-married
  ACCEPTED: 5,                 // One/both divorced/widowed (passed hard filter)
};

// ── Location & Openness Sub-Scores (out of 15 total) ───────────────────────
const LOCATION = {
  SAME_CITY: 15,
  SAME_COUNTRY: 10,
  DIFFERENT_COUNTRY: 5,
};

// ── Nationality/Ethnicity Affinity Sub-Scores (out of 10 total) ────────────
const ETHNICITY = {
  SAME: 10,
  AMBIGUOUS: 5,                // Either side "Other" or "N/A"
  DIFFERENT: 0,
};

// ── Education Tier Ranking (out of 10 total) ──────────────────────────────
const EDUCATION = {
  SAME_TIER: 10,
  ONE_APART: 6,
  TWO_APART: 2,
};

// Ordinal ranking for academic education levels (index = tier number)
const EDUCATION_TIERS = [
  "High School",
  "Diploma",
  "Bachelor's Degree",
  "Master's Degree",
  "Doctorate / PhD",
  "Professional Degree",
];

// Non-ranked tiers — treated as separate, not on the academic ladder
const NON_RANKED_EDUCATION = [
  "Islamic Studies",
  "Hafiz-e-Quran",
  "Other",
];

// ── Decay Rates ────────────────────────────────────────────────────────────
const AGE_DECAY_PER_YEAR = 1.5;   // Points lost per year outside preferred range
const HEIGHT_DECAY_PER_CM = 0.5;  // Points lost per cm outside preferred range

// ── Thresholds & Limits ────────────────────────────────────────────────────
const MIN_SCORE_THRESHOLD = 50;   // Minimum score for "Your Matches" page
const TOP_N_CANDIDATES = 50;      // Top-N candidates to precompute per user for periodic refresh
const BATCH_SIZE = 100;           // Cursor batch size for recompute operations

// ── Match Score Staleness ──────────────────────────────────────────────────
const SCORE_STALE_AFTER_MS = 24 * 60 * 60 * 1000; // 24 hours — scores older than this are stale

// ── Fields that trigger score recalculation when changed ───────────────────
const SCORED_FIELDS = [
  "name",           // Needed for display, triggers refresh
  "age",
  "height",
  "maritalStatus",
  "gender",
  "islamicSect",
  "preferredIslamicSect",
  "prays",
  "bornMuslim",
  "country",
  "city",
  "nationality",
  "ethnicity",
  "highestEducation",
  "lookingForASpouseThatIs",
  "preferredAgeRange",
  "preferredHeightRange",
  "willingToConsiderANonUkCitizen",
  "acceptSomeoneWithChildren",
  "acceptADivorcedPerson",
  "acceptAWidow",
  "children",
  "isApproved",
  "approvalStatus",
  "isDeactivated",
];

// ── Helper: Parse range string like "25-30" or "150-180" ───────────────────
function parseRange(rangeStr) {
  if (!rangeStr || typeof rangeStr !== "string") return null;
  const parts = rangeStr.split("-").map((s) => parseInt(s.trim(), 10));
  if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) return null;
  return { min: Math.min(parts[0], parts[1]), max: Math.max(parts[0], parts[1]) };
}

// ── Helper: Get education tier index ──────────────────────────────────────
function getEducationTier(education) {
  if (!education) return -1;
  // Check non-ranked first
  if (NON_RANKED_EDUCATION.includes(education)) return -2; // non-ranked marker
  const idx = EDUCATION_TIERS.indexOf(education);
  return idx; // -1 if not found at all
}

// ── Helper: Check if sect is a specific sect (not "Any Islamic sect") ─────
function isSpecificSect(sect) {
  if (!sect || typeof sect !== "string") return false;
  return sect.trim().toLowerCase() !== "any islamic sect";
}

module.exports = {
  SCORING_WEIGHTS,
  ISLAMIC,
  MARITAL_FAMILY,
  LOCATION,
  ETHNICITY,
  EDUCATION,
  EDUCATION_TIERS,
  NON_RANKED_EDUCATION,
  AGE_DECAY_PER_YEAR,
  HEIGHT_DECAY_PER_CM,
  MIN_SCORE_THRESHOLD,
  TOP_N_CANDIDATES,
  BATCH_SIZE,
  SCORE_STALE_AFTER_MS,
  SCORED_FIELDS,
  parseRange,
  getEducationTier,
  isSpecificSect,
};
