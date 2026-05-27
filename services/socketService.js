const { Server } = require("socket.io");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");

// Track online users: { odIdString: Set of socketIds }
const onlineUsers = new Map();

function initializeSocket(server, sessionMiddleware) {
  const io = new Server(server, {
    cors: {
      origin: process.env.BASE_URL || "https://damourmuslim.com",
      credentials: true,
    },
    // Coolify / reverse-proxy friendly settings
    transports: ["websocket", "polling"],
    allowUpgrades: true,
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // ── Authentication Middleware ──
  // Share Express session with Socket.io
  io.use((socket, next) => {
    sessionMiddleware(socket.request, {}, next);
  });

  // Verify user is logged in
  io.use((socket, next) => {
    const session = socket.request.session;
    if (session && session.userId) {
      socket.userId = session.userId;
      socket.username = session.user?.username || "User";
      return next();
    }
    return next(new Error("Authentication required"));
  });

  io.on("connection", (socket) => {
    const userId = socket.userId;
    console.log(`💬 Chat: User ${socket.username} connected (socket: ${socket.id})`);

    // Track online status
    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set());
    }
    onlineUsers.get(userId).add(socket.id);

    // ── Join a conversation room ──
    socket.on("joinConversation", async (conversationId, callback) => {
      try {
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
          return callback?.({ error: "Conversation not found" });
        }

        // Verify user is a participant
        const isParticipant = conversation.participants.some(
          (p) => p.toString() === userId
        );
        if (!isParticipant) {
          return callback?.({ error: "Access denied" });
        }

        socket.join(conversationId);
        console.log(`💬 User ${socket.username} joined room ${conversationId}`);
        callback?.({ success: true });
      } catch (err) {
        console.error("joinConversation error:", err);
        callback?.({ error: "Server error" });
      }
    });

    // ── Leave a conversation room ──
    socket.on("leaveConversation", (conversationId) => {
      socket.leave(conversationId);
    });

    // ── Send a message ──
    socket.on("sendMessage", async (data, callback) => {
      try {
        const { conversationId, text } = data;

        if (!text || !text.trim()) {
          return callback?.({ error: "Message cannot be empty" });
        }

        if (text.trim().length > 5000) {
          return callback?.({ error: "Message too long (max 5000 chars)" });
        }

        // Verify user is a participant
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
          return callback?.({ error: "Conversation not found" });
        }

        const isParticipant = conversation.participants.some(
          (p) => p.toString() === userId
        );
        if (!isParticipant) {
          return callback?.({ error: "Access denied" });
        }

        // Save message
        const message = await Message.create({
          conversationId,
          senderId: userId,
          text: text.trim(),
          status: "sent",
        });

        // Update conversation lastMessageAt
        conversation.lastMessageAt = message.createdAt;
        await conversation.save();

        // Populate sender info for the client
        const populatedMessage = await Message.findById(message._id)
          .populate("senderId", "username profilePic profileSlug");

        // Emit to the room (including sender for confirmation)
        io.to(conversationId).emit("newMessage", {
          _id: populatedMessage._id,
          conversationId,
          senderId: {
            _id: populatedMessage.senderId._id,
            username: populatedMessage.senderId.username,
            profilePic: populatedMessage.senderId.profilePic,
            profileSlug: populatedMessage.senderId.profileSlug,
          },
          text: populatedMessage.text,
          status: populatedMessage.status,
          createdAt: populatedMessage.createdAt,
        });

        // Check if the other participant is online – if so, auto-deliver
        const otherParticipantId = conversation.participants
          .find((p) => p.toString() !== userId)
          ?.toString();

        if (otherParticipantId && onlineUsers.has(otherParticipantId)) {
          // Other user is online, mark as delivered
          message.status = "delivered";
          await message.save();
          io.to(conversationId).emit("updateMessageStatus", {
            messageId: message._id,
            status: "delivered",
          });
        }

        callback?.({ success: true, messageId: message._id });

        // ── Schedule 6-hour email reminder for first message ──
        if (!conversation.firstMessageEmailSent) {
          // Check if this is the very first message in this conversation
          const messageCount = await Message.countDocuments({ conversationId });
          if (messageCount === 1) {
            conversation.firstMessageEmailSent = true;
            await conversation.save();

            // Schedule the email check (6 hours = 21600000 ms)
            const { scheduleChatReminderEmail } = require("./chatEmailScheduler");
            scheduleChatReminderEmail(conversationId, userId, otherParticipantId);
          }
        }
      } catch (err) {
        console.error("sendMessage error:", err);
        callback?.({ error: "Failed to send message" });
      }
    });

    // ── Message delivered ──
    socket.on("messageDelivered", async (data) => {
      try {
        const { messageId, conversationId } = data;
        const message = await Message.findById(messageId);
        if (!message) return;

        // Only the recipient can mark as delivered, and only if still 'sent'
        if (
          message.senderId.toString() !== userId &&
          message.status === "sent"
        ) {
          message.status = "delivered";
          await message.save();

          io.to(conversationId).emit("updateMessageStatus", {
            messageId,
            status: "delivered",
          });
        }
      } catch (err) {
        console.error("messageDelivered error:", err);
      }
    });

    // ── Message read ──
    socket.on("messageRead", async (data) => {
      try {
        const { conversationId } = data;

        // Mark ALL unread messages from the other person as 'read'
        const result = await Message.updateMany(
          {
            conversationId,
            senderId: { $ne: userId },
            status: { $in: ["sent", "delivered"] },
          },
          { $set: { status: "read" } }
        );

        if (result.modifiedCount > 0) {
          io.to(conversationId).emit("bulkMessageRead", {
            conversationId,
            readBy: userId,
          });
        }
      } catch (err) {
        console.error("messageRead error:", err);
      }
    });

    // ── Typing indicators ──
    socket.on("typing", (data) => {
      socket.to(data.conversationId).emit("userTyping", {
        userId,
        username: socket.username,
      });
    });

    socket.on("stopTyping", (data) => {
      socket.to(data.conversationId).emit("userStopTyping", {
        userId,
      });
    });

    // ── Disconnect ──
    socket.on("disconnect", () => {
      console.log(`💬 Chat: User ${socket.username} disconnected`);
      const userSockets = onlineUsers.get(userId);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          onlineUsers.delete(userId);
        }
      }
    });
  });

  return io;
}

module.exports = { initializeSocket, onlineUsers };
