// models/DeletedAccount.js
const mongoose = require("mongoose");

const deletedAccountSchema = new mongoose.Schema({
  // Original user data (complete snapshot)
  originalUserId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
  },
  userData: {
    type: mongoose.Schema.Types.Mixed, // Stores complete user object
    required: true,
  },
  
  // Deletion metadata
  deletedAt: {
    type: Date,
    default: Date.now,
  },
  deletedBy: {
    type: String, // Admin username
    required: true,
  },
  deletionReason: {
    type: String,
    default: null,
  },
  
  // User info for quick reference (denormalized)
  username: String,
  email: String,
  name: String,
  gender: String,
  registeredAt: Date,
  
  // Whether the user can reactivate
  canReactivate: {
    type: Boolean,
    default: true,
  },
  
  // If reactivated
  reactivatedAt: {
    type: Date,
    default: null,
  },
  reactivatedBy: {
    type: String,
    default: null,
  },
});

// Index for faster queries
deletedAccountSchema.index({ originalUserId: 1 });
deletedAccountSchema.index({ email: 1 });
deletedAccountSchema.index({ username: 1 });
deletedAccountSchema.index({ deletedAt: -1 });

module.exports = mongoose.model("DeletedAccount", deletedAccountSchema);