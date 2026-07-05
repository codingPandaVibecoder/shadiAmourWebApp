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

  // Whether this is a persisted TopMatch entry (bounded per-user store)
  isTopMatch: {
    type: Boolean,
    default: false,
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
      sectEarned: { type: Number, default: 0 },
      prayerEarned: { type: Number, default: 0 },
      viewerSectSource: { type: String },
      vieweeSectSource: { type: String },
    },
    age: {
      earned: { type: Number, default: 0 },
      viewerIsProxy: { type: Boolean, default: false },
      vieweeIsProxy: { type: Boolean, default: false },
    },
    height: {
      earned: { type: Number, default: 0 },
      viewerIsProxy: { type: Boolean, default: false },
      vieweeIsProxy: { type: Boolean, default: false },
    },
    maritalFamily: {
      earned: { type: Number, default: 0 },
    },
    location: {
      earned: { type: Number, default: 0 },
    },
    nationalityEthnicity: {
      earned: { type: Number, default: 0 },
    },
    education: {
      earned: { type: Number, default: 0 },
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

// For "Your Matches" page and TopMatch queries
matchScoreSchema.index({ viewerId: 1, isTopMatch: 1, finalScore: -1 });

// For admin top matches union query
matchScoreSchema.index({ isTopMatch: 1, finalScore: -1 });

// For stale detection
matchScoreSchema.index({ computedAt: 1 });

// For bidirectional lookups (used when either user's profile changes)
matchScoreSchema.index({ vieweeId: 1, viewerId: 1 });

module.exports = mongoose.model("MatchScore", matchScoreSchema);
