const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  conversationId: {
    type: mongoose.Types.ObjectId,
    ref: "Conversation",
    required: true,
    index: true,
  },
  senderId: {
    type: mongoose.Types.ObjectId,
    ref: "User",
    required: true,
  },
  text: {
    type: String,
    required: true,
    trim: true,
    maxlength: 5000,
  },
  status: {
    type: String,
    enum: ["sent", "delivered", "read"],
    default: "sent",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Compound index for fetching chat history efficiently
messageSchema.index({ conversationId: 1, createdAt: 1 });

module.exports = mongoose.model("Message", messageSchema);
