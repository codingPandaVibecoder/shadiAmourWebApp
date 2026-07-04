/**
 * ONE-TIME BATCH SCORE GENERATION SCRIPT
 * 
 * Computes match scores for ALL approved, active users against their
 * entire opposite-gender candidate pool.
 * 
 * Usage:
 *   node scripts/generateAllScores.js
 * 
 * After successful completion, this file can be safely deleted.
 * 
 * Prerequisites:
 *   - MongoDB connection (reads MONGO_URI from .env)
 *   - Redis connection for BullMQ (reads REDIS_URL or REDIS_HOST/PORT from .env)
 *   - App server does NOT need to be running (this script connects directly)
 */

require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/user");
const MatchScore = require("../models/MatchScore");
const Request = require("../models/Request");
const { runHardFilters, computeScore } = require("../services/matchScoringService");
const { generateSourceVersion } = require("../services/matchScoringBatchService");
const { BATCH_SIZE } = require("../config/matching");

// ── Configuration ───────────────────────────────────────────────────────────
const DRY_RUN = process.argv.includes("--dry-run"); // Preview only, don't save
const CONCURRENCY = 3; // How many users to process in parallel

// ── Helpers ─────────────────────────────────────────────────────────────────

async function getCandidatePool(viewer) {
  // Exclude self + users already connected via requests
  const requests = await Request.find({
    $or: [{ from: viewer._id }, { to: viewer._id }],
    status: { $in: ["pending", "accepted"] },
  }).select("from to");

  const excludedIds = new Set([viewer._id.toString()]);
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

  // Geo filter: PK users only see Pakistan profiles
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
    "profileCompletenessTier",
    "updatedAt",
  ]).lean().cursor();
}

async function processUser(viewer) {
  let scored = 0;
  let skipped = 0;
  const bulkOps = [];

  const candidates = await getCandidatePool(viewer);

  for await (const candidate of candidates) {
    const filterResult = runHardFilters(viewer, candidate);

    if (!filterResult.passed) {
      // Remove any stale score for this pair
      bulkOps.push({
        deleteOne: { filter: { viewerId: viewer._id, vieweeId: candidate._id } },
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

    if (bulkOps.length >= BATCH_SIZE) {
      if (!DRY_RUN) await MatchScore.bulkWrite(bulkOps, { ordered: false });
      bulkOps.length = 0;
    }
  }

  // Final flush
  if (bulkOps.length > 0 && !DRY_RUN) {
    await MatchScore.bulkWrite(bulkOps, { ordered: false });
  }

  // Clear stale flag
  if (!DRY_RUN) {
    await User.findByIdAndUpdate(viewer._id, { matchScoresStaleSince: null });
  }

  return { userId: viewer._id, username: viewer.username, scored, skipped };
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║   BATCH MATCH SCORE GENERATOR           ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log("");

  if (DRY_RUN) {
    console.log("⚠️  DRY RUN MODE — no data will be written");
    console.log("");
  }

  // Connect to MongoDB
  const mongoUri = "mongodb://localhost:27017/test";
  console.log(`🔌 Connecting to MongoDB: ${mongoUri.replace(/\/\/.*@/, "//<credentials>@")}`);
  await mongoose.connect(mongoUri);
  console.log("✅ MongoDB connected");

  // Fetch all approved, active users
  const users = await User.find({
    isApproved: true,
    approvalStatus: "approved",
    isDeactivated: { $ne: true },
  }).select([
    "username", "name", "age", "height", "gender", "maritalStatus",
    "country", "city", "nationality", "ethnicity",
    "islamicSect", "preferredIslamicSect", "prays", "bornMuslim",
    "highestEducation",
    "preferredAgeRange", "preferredHeightRange",
    "willingToConsiderANonUkCitizen",
    "acceptSomeoneWithChildren", "acceptADivorcedPerson", "acceptAWidow",
    "children",
    "isApproved", "approvalStatus", "isDeactivated",
    "profileCompletenessTier",
    "updatedAt",
  ]).lean();

  console.log(`📊 Found ${users.length} approved, active users to process`);
  console.log("");

  if (users.length === 0) {
    console.log("⚠️  No users to process. Exiting.");
    await mongoose.disconnect();
    return;
  }

  let totalScored = 0;
  let totalSkipped = 0;
  const startTime = Date.now();

  // Process in batches with concurrency limit
  for (let i = 0; i < users.length; i += CONCURRENCY) {
    const batch = users.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(u => processUser(u)));

    for (const r of results) {
      totalScored += r.scored;
      totalSkipped += r.skipped;
      console.log(`  ✅ ${r.username}: ${r.scored} scored, ${r.skipped} filtered`);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const progress = Math.min(i + CONCURRENCY, users.length);
    console.log(`  📍 Progress: ${progress}/${users.length} users (${elapsed}s elapsed)`);
    console.log("");
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log("═══════════════════════════════════════════");
  console.log("  COMPLETE");
  console.log("═══════════════════════════════════════════");
  console.log(`  Users processed:  ${users.length}`);
  console.log(`  Pairs scored:     ${totalScored}`);
  console.log(`  Pairs filtered:   ${totalSkipped}`);
  console.log(`  Time:             ${totalTime}s`);
  if (DRY_RUN) console.log("  ⚠️  DRY RUN — no data saved");
  console.log("═══════════════════════════════════════════");

  await mongoose.disconnect();
  console.log("🔌 MongoDB disconnected");
}

main().catch(err => {
  console.error("❌ Fatal error:", err);
  process.exit(1);
});
