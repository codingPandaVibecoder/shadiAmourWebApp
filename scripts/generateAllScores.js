/**
 * ONE-TIME BATCH SCORE GENERATION SCRIPT v2
 * 
 * Computes TopMatch lists for ALL approved, active users.
 * Each user gets top 15 matches ≥50 threshold persisted with isTopMatch:true.
 * 
 * Usage:
 *   node scripts/generateAllScores.js
 * 
 * After successful completion, this file can be safely deleted.
 */

require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/user");
const { recomputeTopMatchesList } = require("../services/matchScoringBatchService");

const CONCURRENCY = 3;

async function main() {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║   BATCH TOP-MATCHES GENERATOR v2        ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log("");

  // const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/damour-muslim";
  const mongoUri = "mongodb://localhost:27017/test";
  console.log(`🔌 Connecting to MongoDB...`);
  await mongoose.connect(mongoUri);
  console.log("✅ MongoDB connected");

  const users = await User.find({
    isApproved: true, approvalStatus: "approved", isDeactivated: { $ne: true },
  }).select("_id username").lean();

  console.log(`📊 Found ${users.length} approved, active users`);
  console.log("");

  let totalPersisted = 0, totalDeleted = 0;
  const startTime = Date.now();

  for (let i = 0; i < users.length; i += CONCURRENCY) {
    const batch = users.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(u => recomputeTopMatchesList(u._id)));
    for (const r of results) {
      totalPersisted += r.persisted;
      totalDeleted += r.deleted;
    }
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const progress = Math.min(i + CONCURRENCY, users.length);
    process.stdout.write(`  📍 ${progress}/${users.length} users (${elapsed}s)     \r`);
  }

  console.log("");
  console.log("═══════════════════════════════════════════");
  console.log("  COMPLETE");
  console.log(`  Users: ${users.length} | Persisted: ${totalPersisted} | Stale deleted: ${totalDeleted}`);
  console.log(`  Time: ${((Date.now()-startTime)/1000).toFixed(1)}s`);
  console.log("═══════════════════════════════════════════");

  await mongoose.disconnect();
}

main().catch(err => { console.error("❌ Fatal:", err); process.exit(1); });
