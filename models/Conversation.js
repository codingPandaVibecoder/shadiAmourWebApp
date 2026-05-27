const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema({
  participants: [
    {
      type: mongoose.Types.ObjectId,
      ref: "User",
      required: true,
    },
  ],
  lastMessageAt: {
    type: Date,
    default: Date.now,
  },
  // Track if first-message email reminder has been scheduled
  firstMessageEmailSent: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Ensure exactly 2 participants
conversationSchema.pre("validate", function (next) {
  if (this.participants.length !== 2) {
    return next(new Error("A conversation must have exactly 2 participants."));
  }
  next();
});

// Index for fast lookup of a user's conversations
conversationSchema.index({ participants: 1 });
conversationSchema.index({ lastMessageAt: -1 });

// Static helper: find or create a conversation between two users
conversationSchema.statics.findOrCreate = async function (userIdA, userIdB) {
  let conversation = await this.findOne({
    participants: { $all: [userIdA, userIdB], $size: 2 },
  });

  if (!conversation) {
    conversation = await this.create({
      participants: [userIdA, userIdB],
    });
  }

  return conversation;
};

module.exports = mongoose.model("Conversation", conversationSchema);
