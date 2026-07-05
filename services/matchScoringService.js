/**
 * Profile Compatibility Scoring Engine
 * 
 * Deterministic, rule-based 0–100 compatibility scoring.
 * All weights pulled from config/matching.js — no magic numbers.
 * 
 * Exports:
 *   runHardFilters(viewer, viewee) → { passed, failures[] }
 *   computeScore(viewer, viewee)   → { finalScore, subScores, hardFilterPassed }
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
  PROXY_POINT_CAP_PERCENT,
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

  subScores.islamic = computeIslamicScore(viewer, viewee);
  subScores.age = computeAgeScore(viewer, viewee);
  subScores.height = computeHeightScore(viewer, viewee);
  subScores.maritalFamily = computeMaritalScore(viewer, viewee);
  subScores.location = computeLocationScore(viewer, viewee);
  subScores.nationalityEthnicity = computeEthnicityScore(viewer, viewee);
  subScores.education = computeEducationScore(viewer, viewee);

  // Strict zero-for-missing: direct sum, no normalization
  let totalEarned = 0;
  for (const cat of Object.values(subScores)) {
    totalEarned += (cat.earned || 0);
  }

  return {
    finalScore: Math.min(100, Math.max(0, totalEarned)),
    subScores,
    hardFilterPassed: true,
  };
}

// ── Category Scorers ────────────────────────────────────────────────────────

function computeIslamicScore(viewer, viewee) {
  let earned = 0;
  const sub = {};

  // ── Sect Fit: resolve effective signals ──
  function resolveSectSignal(user) {
    if (isSpecificSect(user.preferredIslamicSect)) {
      return { signal: user.preferredIslamicSect.toLowerCase().trim(), source: "preferred" };
    }
    if (user.preferredIslamicSect &&
        user.preferredIslamicSect.toLowerCase().trim() === "any islamic sect") {
      return { signal: null, source: "any" };
    }
    if (user.islamicSect && user.islamicSect.trim()) {
      return { signal: user.islamicSect.toLowerCase().trim(), source: "fallback" };
    }
    return { signal: null, source: "none" };
  }

  const vSig = resolveSectSignal(viewer);
  const cSig = resolveSectSignal(viewee);
  sub.viewerSectSource = vSig.source;
  sub.vieweeSectSource = cSig.source;

  if (vSig.source === "any" || cSig.source === "any") {
    earned += ISLAMIC.SECT_CERTAINTY_PARTIAL; // 8
    sub.sectEarned = ISLAMIC.SECT_CERTAINTY_PARTIAL;
  } else if (vSig.signal && cSig.signal && vSig.signal === cSig.signal) {
    earned += ISLAMIC.SECT_CERTAINTY_FULL; // 15
    sub.sectEarned = ISLAMIC.SECT_CERTAINTY_FULL;
  } else {
    sub.sectEarned = 0;
  }

  // ── Prayer Practice (15 pts) ──
  if (viewer.prays != null && viewee.prays != null) {
    if (viewer.prays === viewee.prays) {
      earned += ISLAMIC.PRAYER_ALIGNED; // 15
      sub.prayerEarned = ISLAMIC.PRAYER_ALIGNED;
    } else {
      earned += ISLAMIC.PRAYER_MISMATCHED; // 5
      sub.prayerEarned = ISLAMIC.PRAYER_MISMATCHED;
    }
  } else {
    sub.prayerEarned = 0;
  }

  return { earned, ...sub };
}

function computeAgeScore(viewer, viewee) {
  const maxPts = SCORING_WEIGHTS.AGE; // 15
  const capPts = Math.round(maxPts * PROXY_POINT_CAP_PERCENT / 100); // 7

  if (viewer.age == null || viewee.age == null) {
    return { earned: 0, viewerIsProxy: false, vieweeIsProxy: false };
  }

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
  const half = maxPts / 2;

  if (viewee.age >= viewerRange.min && viewee.age <= viewerRange.max) {
    fitScore += half;
  } else {
    const yearsOut = Math.min(Math.abs(viewee.age - viewerRange.min), Math.abs(viewee.age - viewerRange.max));
    fitScore += Math.max(0, half - AGE_DECAY_PER_YEAR * yearsOut);
  }
  if (viewer.age >= vieweeRange.min && viewer.age <= vieweeRange.max) {
    fitScore += half;
  } else {
    const yearsOut = Math.min(Math.abs(viewer.age - vieweeRange.min), Math.abs(viewer.age - vieweeRange.max));
    fitScore += Math.max(0, half - AGE_DECAY_PER_YEAR * yearsOut);
  }

  let earned = Math.round(Math.min(maxPts, fitScore));
  // CAP if proxy was used by either side
  if (viewerIsProxy || vieweeIsProxy) {
    earned = Math.min(earned, capPts);
  }

  return { earned, viewerIsProxy, vieweeIsProxy };
}

function computeHeightScore(viewer, viewee) {
  const maxPts = SCORING_WEIGHTS.HEIGHT; // 10
  const capPts = Math.round(maxPts * PROXY_POINT_CAP_PERCENT / 100); // 5

  if (viewer.height == null || viewee.height == null) {
    return { earned: 0, viewerIsProxy: false, vieweeIsProxy: false };
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
  const half = maxPts / 2;

  if (viewee.height >= viewerRange.min && viewee.height <= viewerRange.max) {
    fitScore += half;
  } else {
    const cmOut = Math.min(Math.abs(viewee.height - viewerRange.min), Math.abs(viewee.height - viewerRange.max));
    fitScore += Math.max(0, half - HEIGHT_DECAY_PER_CM * cmOut);
  }
  if (viewer.height >= vieweeRange.min && viewer.height <= vieweeRange.max) {
    fitScore += half;
  } else {
    const cmOut = Math.min(Math.abs(viewer.height - vieweeRange.min), Math.abs(viewer.height - vieweeRange.max));
    fitScore += Math.max(0, half - HEIGHT_DECAY_PER_CM * cmOut);
  }

  let earned = Math.round(Math.min(maxPts, fitScore));
  if (viewerIsProxy || vieweeIsProxy) {
    earned = Math.min(earned, capPts);
  }

  return { earned, viewerIsProxy, vieweeIsProxy };
}

function computeMaritalScore(viewer, viewee) {
  let earned = 0;

  if (viewer.maritalStatus === "nevermarried" && viewee.maritalStatus === "nevermarried") {
    earned = MARITAL_FAMILY.IDEAL; // 10
  } else if (viewer.maritalStatus && viewee.maritalStatus) {
    // One or both previously married — check that relevant acceptance fields were populated
    let acceptanceOk = true;
    if (viewer.maritalStatus === "divorced" && viewee.acceptADivorcedPerson == null) acceptanceOk = false;
    if (viewer.maritalStatus === "widowed" && viewee.acceptAWidow == null) acceptanceOk = false;
    if (viewee.maritalStatus === "divorced" && viewer.acceptADivorcedPerson == null) acceptanceOk = false;
    if (viewee.maritalStatus === "widowed" && viewer.acceptAWidow == null) acceptanceOk = false;
    if (hasChildren(viewer) && viewee.acceptSomeoneWithChildren == null) acceptanceOk = false;
    if (hasChildren(viewee) && viewer.acceptSomeoneWithChildren == null) acceptanceOk = false;
    earned = acceptanceOk ? MARITAL_FAMILY.ACCEPTED : 0; // 5 or 0
  }

  return { earned };
}

function computeLocationScore(viewer, viewee) {
  if (!viewer.city || !viewer.country || !viewee.city || !viewee.country) {
    return { earned: 0 };
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

  return { earned };
}

function computeEthnicityScore(viewer, viewee) {
  if (!viewer.ethnicity || !viewee.ethnicity) {
    return { earned: 0 };
  }

  const earned = viewer.ethnicity.toLowerCase() === viewee.ethnicity.toLowerCase()
    ? ETHNICITY.SAME   // 10
    : ETHNICITY.DIFFERENT; // 0

  return { earned };
}

function computeEducationScore(viewer, viewee) {
  if (!viewer.highestEducation || !viewee.highestEducation) {
    return { earned: 0 };
  }

  const viewerTier = getEducationTier(viewer.highestEducation);
  const vieweeTier = getEducationTier(viewee.highestEducation);

  if (viewerTier === -2 || vieweeTier === -2) {
    if (viewerTier === vieweeTier) return { earned: EDUCATION.SAME_TIER }; // 10
    return { earned: EDUCATION.TWO_APART }; // 2
  }
  if (viewerTier === -1 || vieweeTier === -1) return { earned: 0 };

  const diff = Math.abs(viewerTier - vieweeTier);
  let earned;
  if (diff === 0) earned = EDUCATION.SAME_TIER;
  else if (diff === 1) earned = EDUCATION.ONE_APART;
  else earned = EDUCATION.TWO_APART;

  return { earned };
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
