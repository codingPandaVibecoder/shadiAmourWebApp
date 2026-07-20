/**
 * Match Scoring Batch Service v2
 * 
 * Bounded TopMatch store: only the top N per user (above threshold) are persisted.
 * Old entries that no longer qualify are actively DELETED, not just unflagged.
 * 
 * Exports:
 *   recomputeTopMatchesList(userId) — compute all candidates, persist top N ≥ threshold, delete stale
 *   markUserStale(userId)           — mark a user's scores as needing refresh
 */

const User = require("../models/user");
const MatchScore = require("../models/MatchScore");
const { runHardFilters, computeScore } = require("./matchScoringService");
const { TOP_MATCHES_LIST_SIZE, MIN_SCORE_THRESHOLD, SCORED_FIELDS } = require("../config/matching");

/**
 * Get the candidate pool for a viewer.
 */
async function getCandidatePool(viewer) {
  const Request = require("../models/Request");
  const requests = await Request.find({
    $or: [{ from: viewer._id }, { to: viewer._id }],
    status: { $in: ["pending", "accepted"] },
  }).select("from to");

  const excludedIds = new Set();
  excludedIds.add(viewer._id.toString());
  for (const req of requests) {
    excludedIds.add(req.from.toString());
    excludedIds.add(req.to.toString());
  }

  const oppositeGender = viewer.gender === "male" ? "female" : "male";

  const baseFilter = {
    _id: { $nin: Array.from(excludedIds) },
    gender: oppositeGender,
    isApproved: true,
    approvalStatus: "approved",
    isDeactivated: { $ne: true },
  };

  if ((viewer.country || "").toLowerCase() === "pakistan") {
    baseFilter.country = { $regex: /^pakistan$/i };
  }

  return User.find(baseFilter).select([
    "name", "age", "height", "gender", "maritalStatus",
    "country", "city", "nationality", "ethnicity",
    "islamicSect", "preferredIslamicSect", "prays", "bornMuslim",
    "highestEducation",
    "preferredAgeRange", "preferredHeightRange",
    "willingToConsiderANonUkCitizen",
    "acceptSomeoneWithChildren", "acceptADivorcedPerson", "acceptAWidow",
    "children",
    "isApproved", "approvalStatus", "isDeactivated",
    "profileCompletenessTier", "updatedAt",
  ]).lean().cursor();
}

/**
 * Mark a user's match scores as stale.
 */
async function markUserStale(userId) {
  try {
    await User.findByIdAndUpdate(userId, { matchScoresStaleSince: new Date() });
  } catch (error) {
    console.error(`Failed to mark user ${userId} stale:`, error.message);
  }
}

/**
 * Compute all candidate scores for a viewer, persist only the top N ≥ threshold
 * as isTopMatch entries, and actively DELETE any previously-persisted TopMatch
 * entries for this viewer that no longer qualify for the new top-N list.
 * 
 * This prevents the collection from creeping back toward full-matrix bloat:
 * entries that fall out of the top N are removed entirely, not just flagged.
 */
async function recomputeTopMatchesList(userId) {
  const viewer = await User.findById(userId).select([
    "name", "age", "height", "gender", "maritalStatus",
    "country", "city", "nationality", "ethnicity",
    "islamicSect", "preferredIslamicSect", "prays", "bornMuslim",
    "highestEducation",
    "preferredAgeRange", "preferredHeightRange",
    "willingToConsiderANonUkCitizen",
    "acceptSomeoneWithChildren", "acceptADivorcedPerson", "acceptAWidow",
    "children",
    "isApproved", "approvalStatus", "isDeactivated",
    "profileCompletenessTier", "updatedAt",
  ]);

  if (!viewer) {
    console.log(`User ${userId} not found`);
    return { scored: 0, filtered: 0, persisted: 0 };
  }

  // Phase 1: Score all candidates in memory
  const scoredPairs = [];
  const candidates = await getCandidatePool(viewer);

  for await (const candidate of candidates) {
    const filterResult = runHardFilters(viewer, candidate);
    if (!filterResult.passed) continue;

    const scoreResult = computeScore(viewer, candidate);
    scoredPairs.push({
      viewerId: viewer._id,
      vieweeId: candidate._id,
      finalScore: scoreResult.finalScore,
      subScores: scoreResult.subScores,
      viewerTier: viewer.profileCompletenessTier || null,
      vieweeTier: candidate.profileCompletenessTier || null,
    });
  }

  // Phase 2: Sort by score desc, keep top N ≥ threshold
  scoredPairs.sort((a, b) => b.finalScore - a.finalScore);
  const topPairs = [];
  for (const pair of scoredPairs) {
    if (pair.finalScore < MIN_SCORE_THRESHOLD) break;
    if (topPairs.length >= TOP_MATCHES_LIST_SIZE) break;
    topPairs.push(pair);
  }

  // Phase 3: Upsert new top entries with isTopMatch:true
  const newTopVieweeIds = new Set();
  for (const pair of topPairs) {
    await MatchScore.updateOne(
      { viewerId: pair.viewerId, vieweeId: pair.vieweeId },
      {
        $set: {
          finalScore: pair.finalScore,
          subScores: pair.subScores,
          hardFilterPassed: true,
          isTopMatch: true,
          viewerTier: pair.viewerTier,
          vieweeTier: pair.vieweeTier,
          computedAt: new Date(),
        },
      },
      { upsert: true }
    );
    newTopVieweeIds.add(pair.vieweeId.toString());
  }

  // Phase 4: DELETE any previously-persisted TopMatch entries for this viewer
  // that are no longer in the new top-N list. This prevents bloat — old rows
  // are removed entirely, not just flagged off.
  const deleted = await MatchScore.deleteMany({
    viewerId: viewer._id,
    isTopMatch: true,
    vieweeId: { $nin: Array.from(newTopVieweeIds) },
  });

  // Clear stale flag
  await User.findByIdAndUpdate(userId, { matchScoresStaleSince: null });

  console.log(`TopMatches for ${viewer.username}: ${scoredPairs.length} scored, ${topPairs.length} persisted, ${deleted.deletedCount} stale deleted`);
  return { scored: scoredPairs.length, filtered: scoredPairs.length - topPairs.length, persisted: topPairs.length, deleted: deleted.deletedCount };
}

module.exports = {
  recomputeTopMatchesList,
  markUserStale,
};
