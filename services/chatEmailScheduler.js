const Message = require("../models/Message");
const Conversation = require("../models/Conversation");
const User = require("../models/user");
const { sendZeptoMail } = require("./emailService");

// Store active timers so we can cancel if needed
const activeTimers = new Map();

/**
 * Schedule a reminder email if User B hasn't replied within 6 hours.
 * @param {String} conversationId
 * @param {String} senderUserId   – User A (who sent the first message)
 * @param {String} recipientUserId – User B (who should receive the email)
 */
function scheduleChatReminderEmail(conversationId, senderUserId, recipientUserId) {
  const SIX_HOURS = 6 * 60 * 60 * 1000;

  // Cancel any existing timer for this conversation
  if (activeTimers.has(conversationId)) {
    clearTimeout(activeTimers.get(conversationId));
  }

  const timer = setTimeout(async () => {
    try {
      // Check if User B has replied in the conversation
      const replyCount = await Message.countDocuments({
        conversationId,
        senderId: recipientUserId,
      });

      // If no reply from User B, send the email
      if (replyCount === 0) {
        const recipientUser = await User.findById(recipientUserId);
        const senderUser = await User.findById(senderUserId);

        if (recipientUser && recipientUser.email && senderUser) {
          const subject = "💬 You have a new message - D'amour Muslim";
          const loginUrl = process.env.BASE_URL || "https://damourmuslim.com";

          const htmlBody = `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>New Message - D'amour Muslim</title>
              <style>
                body { font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f9f9f9; }
                .container { max-width: 600px; margin: 0 auto; background: white; }
                .header { background: linear-gradient(135deg, #E91E63 0%, #673AB7 100%); color: white; padding: 30px 20px; text-align: center; }
                .header h1 { margin: 0; font-size: 28px; font-weight: bold; }
                .header p { margin: 10px 0 0 0; font-size: 16px; opacity: 0.9; }
                .content { padding: 40px 30px; }
                .welcome { font-size: 20px; font-weight: bold; color: #333; margin-bottom: 15px; }
                .message { font-size: 16px; color: #666; line-height: 1.6; margin-bottom: 30px; }
                .chat-alert { background: linear-gradient(135deg, #fdf2f8 0%, #f3e8ff 100%); border-radius: 16px; padding: 30px; text-align: center; margin: 20px 0; }
                .chat-icon { font-size: 48px; margin-bottom: 10px; }
                .button { display: inline-block; background: #E91E63; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }
                .footer { background: #f8f9fa; padding: 30px; text-align: center; border-top: 1px solid #eee; }
                .footer p { margin: 5px 0; color: #666; font-size: 14px; }
                .footer a { color: #E91E63; text-decoration: none; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>D'amour Muslim</h1>
                  <p>You have a new message!</p>
                </div>
                
                <div class="content">
                  <div class="chat-alert">
                    <div class="chat-icon">💬</div>
                    <h2 style="color: #E91E63; margin: 0 0 10px 0;">New Chat Message</h2>
                    <p style="color: #666; margin: 0;">Someone initiated a chat with you</p>
                  </div>

                  <div class="welcome">Hello ${recipientUser.username}!</div>
                  <div class="message">
                    <p><strong>${senderUser.username}</strong> sent you a message on D'amour Muslim. Don't keep them waiting — log back in to catch up and continue the conversation!</p>
                    <p>Building meaningful connections starts with a simple reply.</p>
                  </div>
                  
                  <div style="text-align: center; margin: 30px 0;">
                    <a href="${loginUrl}/chats" class="button" style="color: white;">View Your Messages</a>
                  </div>

                  <div class="message" style="text-align: center; font-style: italic; color: #888; font-size: 14px;">
                    "And among His signs is that He created for you spouses from among yourselves, that you may find tranquility in them." - Quran 30:21
                  </div>
                </div>
                
                <div class="footer">
                  <p><strong>© 2025 D'amour Muslim</strong> - Connecting Hearts, Building Futures</p>
                  <p>Need help? Contact us at <a href="mailto:support@damourmuslim.com">support@damourmuslim.com</a></p>
                  <p>📱 WhatsApp: <a href="https://wa.me/+447899816181">+447454516156</a></p>
                </div>
              </div>
            </body>
            </html>
          `;

          const textBody = `Hello ${recipientUser.username}!\n\n${senderUser.username} sent you a message on D'amour Muslim. Don't keep them waiting — log back in to catch up!\n\nView your messages: ${loginUrl}/chats\n\n© 2025 D'amour Muslim`;

          await sendZeptoMail(recipientUser.email, subject, htmlBody, textBody);
          console.log(`📧 Chat reminder email sent to ${recipientUser.email} for conversation ${conversationId}`);
        }
      } else {
        console.log(`💬 User B already replied in conversation ${conversationId}, skipping reminder email`);
      }
    } catch (err) {
      console.error("Chat reminder email error:", err);
    } finally {
      activeTimers.delete(conversationId);
    }
  }, SIX_HOURS);

  activeTimers.set(conversationId, timer);
  console.log(`⏰ Chat reminder scheduled for conversation ${conversationId} (6 hours)`);
}

module.exports = { scheduleChatReminderEmail };
