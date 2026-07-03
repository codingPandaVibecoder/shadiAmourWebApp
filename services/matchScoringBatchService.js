/**
 * Match Scoring Batch Service
 * 
 * Handles bulk score computation, invalidation, and cache management.
 * Uses cursor-based iteration to handle 1-3K profiles efficiently.
 * 
 * Exports:
 *   recomputeScoresForUser(userId)    — recompute all pair scores for one user
 *   recomputeTopMatches(userId, topN) — recompute only top-N candidates
 *   markUserStale(userId)             — mark a user's scores as needing refresh
 *   generateSourceVersion(viewer, viewee) — hash of scored fields
 */

const User = require("../models/user");
const MatchScore = require("../models/MatchScore");
const { runHardFilters, computeScore } = require("./matchScoringService");
const { TOP_N_CANDIDATES, BATCH_SIZE, SCORED_FIELDS } = require("../config/matching");
const crypto = require("crypto");

/**
 * Generate a deterministic hash from the scored fields + timestamps of both users.
 * Used to detect when a cached score needs recalculation.
 */
function generateSourceVersion(viewer, viewee) {
  const viewerFields = SCORED_FIELDS.map((f) => String(viewer[f] ?? "")).join("|");
  const vieweeFields = SCORED_FIELDS.map((f) => String(viewee[f] ?? "")).join("|");
  const viewerUpdated = viewer.updatedAt ? viewer.updatedAt.getTime() : 0;
  const vieweeUpdated = viewee.updatedAt ? viewee.updatedAt.getTime() : 0;

  const raw = `${viewer._id}:${viewerFields}:${viewerUpdated}|${viewee._id}:${vieweeFields}:${vieweeUpdated}`;
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

/**
 * Mark a user's match scores as stale.
 * Sets matchScoresStaleSince on the user document.
 */
async function markUserStale(userId) {
  try {
    await User.findByIdAndUpdate(userId, {
      matchScoresStaleSince: new Date(),
    });
    console.log(`🏷️  Marked user ${userId} as stale for match scoring`);
  } catch (error) {
    console.error(`❌ Failed to mark user ${userId} stale:`, error.message);
  }
}

/**
 * Get the candidate pool for a viewer:
 * - Active, approved, non-deactivated
 * - Opposite gender
 * - Excludes self
 * - Excludes users viewer already sent/received requests to/from
 * - Respects geo filter: PK users only see PK profiles
 */
async function getCandidatePool(viewer) {
  // Get IDs of users involved in requests (sent or received)
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

  // Apply geo filter: PK users see only Pakistan profiles
  // All others see everyone (no restriction)
  const viewerCountry = (viewer.country || "").toLowerCase();
  if (viewerCountry === "pakistan") {
    baseFilter.country = { $regex: /^pakistan$/i };
  }

  return User.find(baseFilter).select([
    "name", "age", "height", "gender", "maritalStatus",
    "country", "city", "nationality", "ethnicity",
    "islamicSect", "preferredIslamicSect", "prays", "bornMuslim",
    "highestEducation", "work",
    "preferredAgeRange", "preferredHeightRange",
    "willingToConsiderANonUkCitizen",
    "acceptSomeoneWithChildren", "acceptADivorcedPerson", "acceptAWidow",
    "children",
    "isApproved", "approvalStatus", "isDeactivated",
    "profileCompletenessTier",
    "updatedAt",
  ]).lean().cursor();
}

/**
 * Recompute all pair scores for a given user against their entire candidate pool.
 * Uses batched upsert via bulkWrite for performance.
 */
async function recomputeScoresForUser(userId) {
  const viewer = await User.findById(userId).select([
    "name", "age", "height", "gender", "maritalStatus",
    "country", "city", "nationality", "ethnicity",
    "islamicSect", "preferredIslamicSect", "prays", "bornMuslim",
    "highestEducation", "work",
    "preferredAgeRange", "preferredHeightRange",
    "willingToConsiderANonUkCitizen",
    "acceptSomeoneWithChildren", "acceptADivorcedPerson", "acceptAWidow",
    "children",
    "isApproved", "approvalStatus", "isDeactivated",
    "profileCompletenessTier",
    "updatedAt",
  ]);

  if (!viewer) {
    console.log(`⚠️  User ${userId} not found, skipping score recompute`);
    return { scored: 0, skipped: 0 };
  }

  const candidates = await getCandidatePool(viewer);
  const bulkOps = [];
  let scored = 0;
  let skipped = 0;

  for await (const candidate of candidates) {
    // Hard filter gate
    const filterResult = runHardFilters(viewer, candidate);

    if (!filterResult.passed) {
      // Remove any existing score for this pair (they no longer pass filters)
      bulkOps.push({
        deleteOne: {
          filter: { viewerId: viewer._id, vieweeId: candidate._id },
        },
      });
      skipped++;
    } else {
      const scoreResult = computeScore(viewer, candidate);
      const sourceVersion = generateSourceVersion(viewer, candidate);

      bulkOps.push({
        updateOne: {
          filter: { viewerId: viewer._id, vieweeId: candidate._id },
          update: {
            $set: {
              finalScore: scoreResult.finalScore,
              pointsEarned: scoreResult.pointsEarned,
              pointsAvailable: scoreResult.pointsAvailable,
              subScores: scoreResult.subScores,
              hardFilterPassed: true,
              viewerTier: viewer.profileCompletenessTier || null,
              vieweeTier: candidate.profileCompletenessTier || null,
              sourceVersion,
              computedAt: new Date(),
            },
          },
          upsert: true,
        },
      });
      scored++;
    }

    // Flush in batches to avoid memory issues
    if (bulkOps.length >= BATCH_SIZE) {
      await MatchScore.bulkWrite(bulkOps, { ordered: false });
      bulkOps.length = 0;
    }
  }

  // Final flush
  if (bulkOps.length > 0) {
    await MatchScore.bulkWrite(bulkOps, { ordered: false });
  }

  // Clear stale flag
  await User.findByIdAndUpdate(userId, { matchScoresStaleSince: null });

  console.log(`✅ Recompute scores for user ${userId}: ${scored} scored, ${skipped} filtered out`);
  return { scored, skipped };
}

/**
 * Recompute only top-N candidates for a user.
 * More efficient for periodic refresh — finds top candidates without scoring all.
 * Falls back to full recompute since scoring is cheap at this scale.
 */
async function recomputeTopMatches(userId, topN = TOP_N_CANDIDATES) {
  // At 1-3K profiles, full recompute is cheap enough.
  // When profile count grows, can optimize by scoring in priority order.
  return recomputeScoresForUser(userId);
}

module.exports = {
  recomputeScoresForUser,
  recomputeTopMatches,
  markUserStale,
  generateSourceVersion,
};
