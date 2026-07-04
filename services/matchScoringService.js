/**
 * Profile Compatibility Scoring Engine
 * 
 * Deterministic, rule-based 0–100 compatibility scoring.
 * All weights pulled from config/matching.js — no magic numbers.
 * 
 * Exports:
 *   runHardFilters(viewer, viewee) → { passed, failures[] }
 *   computeScore(viewer, viewee)   → { finalScore, pointsEarned, pointsAvailable, subScores, ... }
 *   hasChildren(user)              → boolean
 */

const {
  SCORING_WEIGHTS,
  ISLAMIC,
  MARITAL_FAMILY,
  LOCATION,
  ETHNICITY,
  EDUCATION,
  AGE_DECAY_PER_YEAR,
  HEIGHT_DECAY_PER_CM,
  AGE_DELTA,
  HEIGHT_DELTA,
  parseRange,
  getEducationTier,
  isSpecificSect,
} = require("../config/matching");

// ── Hard Filter Gate ────────────────────────────────────────────────────────

/**
 * Run all bidirectional hard filters.
 * Missing preference fields → permissive (passes that check).
 * Returns { passed: boolean, failures: string[] }
 */
function runHardFilters(viewer, viewee) {
  const failures = [];

  // 1. Gender: must be opposite
  if (!viewer.gender || !viewee.gender || viewer.gender === viewee.gender) {
    failures.push("Same gender");
    return { passed: false, failures };
  }

  // 2. Status: both approved and not deactivated
  if (!viewer.isApproved || viewer.approvalStatus !== "approved" || viewer.isDeactivated) {
    failures.push("Viewer not active/approved");
  }
  if (!viewee.isApproved || viewee.approvalStatus !== "approved" || viewee.isDeactivated) {
    failures.push("Viewee not active/approved");
  }

  // 3. Divorce acceptance (bidirectional)
  if (viewer.maritalStatus === "divorced") {
    if (viewee.acceptADivorcedPerson === false) {
      failures.push("Viewee does not accept divorced persons");
    }
    // Missing → pass
  }
  if (viewee.maritalStatus === "divorced") {
    if (viewer.acceptADivorcedPerson === false) {
      failures.push("Viewer does not accept divorced persons");
    }
  }

  // 4. Widow acceptance (bidirectional)
  if (viewer.maritalStatus === "widowed") {
    if (viewee.acceptAWidow === false) {
      failures.push("Viewee does not accept widows");
    }
  }
  if (viewee.maritalStatus === "widowed") {
    if (viewer.acceptAWidow === false) {
      failures.push("Viewer does not accept widows");
    }
  }

  // 5. Children acceptance (bidirectional)
  if (hasChildren(viewer)) {
    if (viewee.acceptSomeoneWithChildren === false) {
      failures.push("Viewee does not accept someone with children");
    }
  }
  if (hasChildren(viewee)) {
    if (viewer.acceptSomeoneWithChildren === false) {
      failures.push("Viewer does not accept someone with children");
    }
  }

  // 6. Cross-border openness (bidirectional)
//   if (
//     viewer.willingToConsiderANonUkCitizen &&
//     viewer.willingToConsiderANonUkCitizen.toLowerCase() === "no" &&
//     viewer.country &&
//     viewee.country &&
//     viewer.country.toLowerCase() !== viewee.country.toLowerCase()
//   ) {
//     failures.push("Viewer not willing to consider non-UK citizen (different country)");
//   }
//   if (
//     viewee.willingToConsiderANonUkCitizen &&
//     viewee.willingToConsiderANonUkCitizen.toLowerCase() === "no" &&
//     viewer.country &&
//     viewee.country &&
//     viewer.country.toLowerCase() !== viewee.country.toLowerCase()
//   ) {
//     failures.push("Viewee not willing to consider non-UK citizen (different country)");
//   }
// 6. Cross-border openness (bidirectional)
  
  // Helper to safely check if the value means "no" or false
  const isStrictlyNo = (val) => {
    if (val === undefined || val === null) return false;
    if (typeof val === "boolean") return val === false; // Handle boolean false
    return String(val).toLowerCase() === "no"; // Handle string "no"
  };

  if (
    isStrictlyNo(viewer.willingToConsiderANonUkCitizen) &&
    viewer.country &&
    viewee.country &&
    String(viewer.country).toLowerCase() !== String(viewee.country).toLowerCase()
  ) {
    failures.push("Viewer not willing to consider non-UK citizen (different country)");
  }
  
  if (
    isStrictlyNo(viewee.willingToConsiderANonUkCitizen) &&
    viewer.country &&
    viewee.country &&
    String(viewer.country).toLowerCase() !== String(viewee.country).toLowerCase()
  ) {
    failures.push("Viewee not willing to consider non-UK citizen (different country)");
  }

  // 7. Islamic Sect filter (bidirectional)
  // Viewer's preferred sect vs viewee's actual sect
  if (isSpecificSect(viewer.preferredIslamicSect)) {
    if (
      viewee.islamicSect &&
      viewer.preferredIslamicSect.toLowerCase() !== viewee.islamicSect.toLowerCase()
    ) {
      failures.push("Viewer's preferred sect does not match viewee's sect");
    }
    // Missing viewee.islamicSect → pass
  }
  // Viewee's preferred sect vs viewer's actual sect
  if (isSpecificSect(viewee.preferredIslamicSect)) {
    if (
      viewer.islamicSect &&
      viewee.preferredIslamicSect.toLowerCase() !== viewer.islamicSect.toLowerCase()
    ) {
      failures.push("Viewee's preferred sect does not match viewer's sect");
    }
  }

  return { passed: failures.length === 0, failures };
}

// ── Weighted Scoring Engine ─────────────────────────────────────────────────

/**
 * Compute compatibility score for a viewer→viewee pair.
 * Only call after runHardFilters returns { passed: true }.
 */
function computeScore(viewer, viewee) {
  const subScores = {};
  let totalEarned = 0;
  let totalAvailable = 0;

  // 4.1 Islamic Compatibility (30 pts)
  const islamic = computeIslamicScore(viewer, viewee);
  subScores.islamic = islamic;

  // 4.2 Age Compatibility (15 pts)
  const age = computeAgeScore(viewer, viewee);
  subScores.age = age;

  // 4.3 Height Compatibility (10 pts)
  const height = computeHeightScore(viewer, viewee);
  subScores.height = height;

  // 4.4 Marital/Family Alignment (10 pts)
  const marital = computeMaritalScore(viewer, viewee);
  subScores.maritalFamily = marital;

  // 4.5 Location & Openness (15 pts)
  const location = computeLocationScore(viewer, viewee);
  subScores.location = location;

  // 4.6 Nationality/Ethnicity Affinity (10 pts)
  const ethnicity = computeEthnicityScore(viewer, viewee);
  subScores.nationalityEthnicity = ethnicity;

  // 4.7 Education & Work (10 pts, education only)
  const education = computeEducationScore(viewer, viewee);
  subScores.education = education;

  // Sum up earned and available
  for (const cat of Object.values(subScores)) {
    totalEarned += cat.earned;
    totalAvailable += cat.available;
  }

  // Missing-data normalization
  const finalScore = totalAvailable > 0
    ? Math.round((totalEarned / totalAvailable) * 100)
    : 0;

  return {
    finalScore: Math.min(100, Math.max(0, finalScore)),
    pointsEarned: totalEarned,
    pointsAvailable: totalAvailable,
    subScores,
    hardFilterPassed: true,
  };
}

// ── Category Scorers ────────────────────────────────────────────────────────

function computeIslamicScore(viewer, viewee) {
  let earned = 0;
  let available = 0;

  // Sect Fit (15 pts available)
  const viewerHasSect = viewer.preferredIslamicSect != null;
  const vieweeHasSect = viewee.preferredIslamicSect != null;

  if (viewerHasSect && vieweeHasSect) {
    available += ISLAMIC.SECT_CERTAINTY_FULL; // 15
    const viewerSpecific = isSpecificSect(viewer.preferredIslamicSect);
    const vieweeSpecific = isSpecificSect(viewee.preferredIslamicSect);

    if (viewerSpecific && vieweeSpecific) {
      // Both specified a specific sect — award full since hard filter already ensured match
      earned += ISLAMIC.SECT_CERTAINTY_FULL;
    } else {
      // At least one selected "Any Islamic sect"
      earned += ISLAMIC.SECT_CERTAINTY_PARTIAL; // 8
    }
  }
  // If either field missing → exclude entirely (0 available, 0 earned)

  // Prayer Practice (15 pts available)
  const viewerHasPrays = viewer.prays != null;
  const vieweeHasPrays = viewee.prays != null;

  if (viewerHasPrays && vieweeHasPrays) {
    available += ISLAMIC.PRAYER_ALIGNED; // 15
    if (viewer.prays === viewee.prays) {
      earned += ISLAMIC.PRAYER_ALIGNED; // Both same → full 15
    } else {
      earned += ISLAMIC.PRAYER_MISMATCHED; // Different → 5
    }
  }
  // Missing on either side → exclude

  return { earned, available };
}

function computeAgeScore(viewer, viewee) {
  let earned = 0;
  const available = SCORING_WEIGHTS.AGE; // 15

  if (viewer.age == null || viewee.age == null) {
    return { earned: 0, available: 0, viewerIsProxy: false, vieweeIsProxy: false };
  }

  // Resolve ranges: use real preference if set, otherwise proxy from own age
  let viewerRange, vieweeRange;
  let viewerIsProxy = false, vieweeIsProxy = false;

  if (viewer.preferredAgeRange && parseRange(viewer.preferredAgeRange)) {
    viewerRange = parseRange(viewer.preferredAgeRange);
  } else {
    viewerRange = { min: viewer.age - AGE_DELTA, max: viewer.age + AGE_DELTA };
    viewerIsProxy = true;
  }

  if (viewee.preferredAgeRange && parseRange(viewee.preferredAgeRange)) {
    vieweeRange = parseRange(viewee.preferredAgeRange);
  } else {
    vieweeRange = { min: viewee.age - AGE_DELTA, max: viewee.age + AGE_DELTA };
    vieweeIsProxy = true;
  }

  let fitScore = 0;

  // Is viewee's age in viewer's preferred/proxy range?
  if (viewee.age >= viewerRange.min && viewee.age <= viewerRange.max) {
    fitScore += SCORING_WEIGHTS.AGE / 2; // 7.5
  } else {
    const yearsOut = Math.min(
      Math.abs(viewee.age - viewerRange.min),
      Math.abs(viewee.age - viewerRange.max)
    );
    fitScore += Math.max(0, SCORING_WEIGHTS.AGE / 2 - AGE_DECAY_PER_YEAR * yearsOut);
  }

  // Is viewer's age in viewee's preferred/proxy range?
  if (viewer.age >= vieweeRange.min && viewer.age <= vieweeRange.max) {
    fitScore += SCORING_WEIGHTS.AGE / 2; // 7.5
  } else {
    const yearsOut = Math.min(
      Math.abs(viewer.age - vieweeRange.min),
      Math.abs(viewer.age - vieweeRange.max)
    );
    fitScore += Math.max(0, SCORING_WEIGHTS.AGE / 2 - AGE_DECAY_PER_YEAR * yearsOut);
  }

  earned = Math.round(Math.min(SCORING_WEIGHTS.AGE, fitScore));
  return { earned, available, viewerIsProxy, vieweeIsProxy };
}

function computeHeightScore(viewer, viewee) {
  let earned = 0;
  const available = SCORING_WEIGHTS.HEIGHT; // 10

  if (viewer.height == null || viewee.height == null) {
    return { earned: 0, available: 0, viewerIsProxy: false, vieweeIsProxy: false };
  }

  let viewerRange, vieweeRange;
  let viewerIsProxy = false, vieweeIsProxy = false;

  if (viewer.preferredHeightRange && parseRange(viewer.preferredHeightRange)) {
    viewerRange = parseRange(viewer.preferredHeightRange);
  } else {
    viewerRange = { min: viewer.height - HEIGHT_DELTA, max: viewer.height + HEIGHT_DELTA };
    viewerIsProxy = true;
  }

  if (viewee.preferredHeightRange && parseRange(viewee.preferredHeightRange)) {
    vieweeRange = parseRange(viewee.preferredHeightRange);
  } else {
    vieweeRange = { min: viewee.height - HEIGHT_DELTA, max: viewee.height + HEIGHT_DELTA };
    vieweeIsProxy = true;
  }

  let fitScore = 0;

  if (viewee.height >= viewerRange.min && viewee.height <= viewerRange.max) {
    fitScore += SCORING_WEIGHTS.HEIGHT / 2;
  } else {
    const cmOut = Math.min(
      Math.abs(viewee.height - viewerRange.min),
      Math.abs(viewee.height - viewerRange.max)
    );
    fitScore += Math.max(0, SCORING_WEIGHTS.HEIGHT / 2 - HEIGHT_DECAY_PER_CM * cmOut);
  }

  if (viewer.height >= vieweeRange.min && viewer.height <= vieweeRange.max) {
    fitScore += SCORING_WEIGHTS.HEIGHT / 2;
  } else {
    const cmOut = Math.min(
      Math.abs(viewer.height - vieweeRange.min),
      Math.abs(viewer.height - vieweeRange.max)
    );
    fitScore += Math.max(0, SCORING_WEIGHTS.HEIGHT / 2 - HEIGHT_DECAY_PER_CM * cmOut);
  }

  earned = Math.round(Math.min(SCORING_WEIGHTS.HEIGHT, fitScore));
  return { earned, available, viewerIsProxy, vieweeIsProxy };
}

function computeMaritalScore(viewer, viewee) {
  const available = SCORING_WEIGHTS.MARITAL_FAMILY; // 10, always available
  let earned;

  if (viewer.maritalStatus === "nevermarried" && viewee.maritalStatus === "nevermarried") {
    earned = MARITAL_FAMILY.IDEAL; // 10
  } else {
    // One or both married before — they passed the hard filter, so acceptance exists
    earned = MARITAL_FAMILY.ACCEPTED; // 5
  }

  return { earned, available };
}

function computeLocationScore(viewer, viewee) {
  const available = SCORING_WEIGHTS.LOCATION; // 15

  if (!viewer.city || !viewer.country || !viewee.city || !viewee.country) {
    return { earned: 0, available: 0 };
  }

  let earned;

  if (viewer.city.toLowerCase() === viewee.city.toLowerCase() &&
      viewer.country.toLowerCase() === viewee.country.toLowerCase()) {
    earned = LOCATION.SAME_CITY; // 15
  } else if (viewer.country.toLowerCase() === viewee.country.toLowerCase()) {
    earned = LOCATION.SAME_COUNTRY; // 10
  } else {
    earned = LOCATION.DIFFERENT_COUNTRY; // 5
  }

  return { earned, available };
}

function computeEthnicityScore(viewer, viewee) {
  const available = SCORING_WEIGHTS.NATIONALITY_ETHNICITY; // 10

  if (!viewer.ethnicity || !viewee.ethnicity) {
    return { earned: 0, available: 0 };
  }

  let earned;

  const vEth = viewer.ethnicity.toLowerCase();
  const cEth = viewee.ethnicity.toLowerCase();

  if (vEth === cEth) {
    earned = ETHNICITY.SAME; // 10
  } else if (vEth === "other" || vEth === "n/a" || cEth === "other" || cEth === "n/a") {
    earned = ETHNICITY.AMBIGUOUS; // 5
  } else {
    earned = ETHNICITY.DIFFERENT; // 0
  }

  return { earned, available };
}

function computeEducationScore(viewer, viewee) {
  const available = SCORING_WEIGHTS.EDUCATION; // 10

  if (!viewer.highestEducation || !viewee.highestEducation) {
    return { earned: 0, available: 0 };
  }

  const viewerTier = getEducationTier(viewer.highestEducation);
  const vieweeTier = getEducationTier(viewee.highestEducation);

  // If either is non-ranked (-2), treat as equivalent to "other" → same tier
  if (viewerTier === -2 || vieweeTier === -2) {
    if (viewerTier === vieweeTier) {
      return { earned: EDUCATION.SAME_TIER, available }; // 10
    }
    // Non-ranked vs ranked → treat as two+ tiers apart
    return { earned: EDUCATION.TWO_APART, available }; // 2
  }

  // If either not found (-1), exclude
  if (viewerTier === -1 || vieweeTier === -1) {
    return { earned: 0, available: 0 };
  }

  const diff = Math.abs(viewerTier - vieweeTier);

  let earned;
  if (diff === 0) {
    earned = EDUCATION.SAME_TIER; // 10
  } else if (diff === 1) {
    earned = EDUCATION.ONE_APART; // 6
  } else {
    earned = EDUCATION.TWO_APART; // 2
  }

  return { earned, available };
}

// ── Utility ─────────────────────────────────────────────────────────────────

function hasChildren(user) {
  return Array.isArray(user.children) && user.children.length > 0;
}

module.exports = {
  runHardFilters,
  computeScore,
  hasChildren,
};
