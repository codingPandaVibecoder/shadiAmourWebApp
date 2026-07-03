const mongoose = require("mongoose");

/**
 * Precomputed compatibility score between two users.
 * Stored directionally (viewer → viewee), though scores are symmetric.
 * Only pairs that pass the Hard Filter gate are stored.
 */
const matchScoreSchema = new mongoose.Schema({
  // The user who would see this score on a candidate's card
  viewerId: {
    type: mongoose.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  // The candidate being scored
  vieweeId: {
    type: mongoose.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },

  // ── Final Score ──────────────────────────────────────────────────────────
  finalScore: {
    type: Number,
    min: 0,
    max: 100,
    required: true,
  },
  pointsEarned: {
    type: Number,
    required: true,
  },
  pointsAvailable: {
    type: Number,
    required: true,
  },

  // ── Hard Filter Gate ─────────────────────────────────────────────────────
  hardFilterPassed: {
    type: Boolean,
    default: true,
  },

  // ── Per-Category Sub-Scores (feature vector for ML readiness) ────────────
  subScores: {
    islamic: {
      earned: { type: Number, default: 0 },
      available: { type: Number, default: 0 },
    },
    age: {
      earned: { type: Number, default: 0 },
      available: { type: Number, default: 0 },
    },
    height: {
      earned: { type: Number, default: 0 },
      available: { type: Number, default: 0 },
    },
    maritalFamily: {
      earned: { type: Number, default: 0 },
      available: { type: Number, default: 0 },
    },
    location: {
      earned: { type: Number, default: 0 },
      available: { type: Number, default: 0 },
    },
    nationalityEthnicity: {
      earned: { type: Number, default: 0 },
      available: { type: Number, default: 0 },
    },
    education: {
      earned: { type: Number, default: 0 },
      available: { type: Number, default: 0 },
    },
  },

  // ── Snapshot Metadata ────────────────────────────────────────────────────
  // Profile tiers at time of computation
  viewerTier: {
    type: String,
    enum: ["A", "B", null],
    default: null,
  },
  vieweeTier: {
    type: String,
    enum: ["A", "B", null],
    default: null,
  },

  // Source version hash — changes when either user's scored fields change
  sourceVersion: {
    type: String,
    default: null,
  },

  // When this score was computed
  computedAt: {
    type: Date,
    default: Date.now,
  },
});

// ── Indexes ────────────────────────────────────────────────────────────────
// Unique: one score per viewer→viewee pair
matchScoreSchema.index({ viewerId: 1, vieweeId: 1 }, { unique: true });

// For "Your Matches" page: get viewer's top scores
matchScoreSchema.index({ viewerId: 1, finalScore: -1 });

// For stale detection
matchScoreSchema.index({ computedAt: 1 });

// For bidirectional lookups (used when either user's profile changes)
matchScoreSchema.index({ vieweeId: 1, viewerId: 1 });

module.exports = mongoose.model("MatchScore", matchScoreSchema);
