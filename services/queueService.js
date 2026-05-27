const { Queue, Worker } = require("bullmq");
const { createRedisConnection } = require("../config/redis");
const NotificationService = require("./notificationService");
const { SendMailClient } = require("zeptomail");
console.log("🔑 Initializing ZeptoMail client...");
console.log("Token exists:", !!process.env.ZEPTOMAIL_TOKEN);
console.log("Token starts with 'Zoho-':", process.env.ZEPTOMAIL_TOKEN?.startsWith("Zoho-"));

// Initialize ZeptoMail client
const zeptoClient = new SendMailClient({
  url: "api.zeptomail.com/",
  token: process.env.ZEPTOMAIL_TOKEN,
});
console.log("✅ ZeptoMail client initialized");

// Create separate connections for queue and worker
const queueConnection = createRedisConnection();
const workerConnection = createRedisConnection();

// Create the notification queue
const notificationQueue = new Queue("notifications", {
  connection: queueConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});

// Email templates for different request types
const emailTemplates = {
  // When someone sends a request
  requestSent: (senderUsername, receiverUsername) => ({
    subject: `Profile Request Sent - D'amour Muslim`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Request Sent - D'amour Muslim</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f9f9f9; }
          .container { max-width: 600px; margin: 0 auto; background: white; }
          .header { background: linear-gradient(135deg, #E91E63 0%, #673AB7 100%); color: white; padding: 30px 20px; text-align: center; }
          .header h1 { margin: 0; font-size: 28px; font-weight: bold; }
          .content { padding: 40px 30px; }
          .message { font-size: 16px; color: #666; line-height: 1.6; margin-bottom: 30px; }
          .highlight { background: #f8f9fa; border-left: 4px solid #E91E63; padding: 20px; margin: 20px 0; }
          .button { display: inline-block; background: #E91E63; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; }
          .footer { background: #f8f9fa; padding: 30px; text-align: center; border-top: 1px solid #eee; }
          .footer p { margin: 5px 0; color: #666; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>D'amour Muslim</h1>
            <p>Profile Request Sent</p>
          </div>
          <div class="content">
            <h2>Hello ${senderUsername}! 💌</h2>
            <div class="message">
              <p>Your profile sharing request has been successfully sent to <strong>${receiverUsername}</strong>. They can now view your complete profile.</p>
              <p>They will be notified about your interest and can choose to accept or decline your request.</p>
              <p>If they accept, they will start sharing their private info back with you. Else, they will not have access to your private information.</p>
            </div>
            <div class="highlight">
              <h3>What happens next?</h3>
<ul>
  <li>${receiverUsername} can now view your full profile and contact details</li>
  <li>If they accept your request, you'll be able to view their complete profile</li>
  <li>You'll receive an email notification when they respond</li>
</ul>
            </div>
            <div style="text-align: center; margin: 30px 0;">
              <a style="color:white" href="https://damourmuslim.com/account" class="button">View Your Requests</a>
            </div>
          </div>
          <div class="footer">
            <p><strong>© 2024 D'amour Muslim</strong> - Connecting Hearts, Building Futures</p>
            <p>Need help? Contact us at <a href="mailto:support@damourmuslim.com">support@damourmuslim.com</a></p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `Hello ${senderUsername}!\n\nYour profile sharing request has been sent to ${receiverUsername}. They can now view your complete profile.\n\nIf they accept, you'll be able to view their full profile too.\n\nView your requests at: https://damourmuslim.com/account\n\n© 2024 D'amour Muslim`,
  }),

  // When someone receives a request
  requestReceived: (receiverUsername, senderUsername, senderProfileUrl) => ({
    subject: `New Profile Request from ${senderUsername} - D'amour Muslim`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>New Request - D'amour Muslim</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f9f9f9; }
          .container { max-width: 600px; margin: 0 auto; background: white; }
          .header { background: linear-gradient(135deg, #E91E63 0%, #673AB7 100%); color: white; padding: 30px 20px; text-align: center; }
          .header h1 { margin: 0; font-size: 28px; font-weight: bold; }
          .content { padding: 40px 30px; }
          .message { font-size: 16px; color: #666; line-height: 1.6; margin-bottom: 30px; }
          .highlight { background: #fff3cd; border-left: 4px solid #ffc107; padding: 20px; margin: 20px 0; }
          .button { display: inline-block; background: #E91E63; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 5px; }
          .button-secondary { background: #6c757d; }
          .footer { background: #f8f9fa; padding: 30px; text-align: center; border-top: 1px solid #eee; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>D'amour Muslim</h1>
            <p>New Profile Request! 🌟</p>
          </div>
          <div class="content">
            <h2>Hello ${receiverUsername}! 💕</h2>
            <div class="message">
              <p>Great news! <strong>${senderUsername}</strong> is interested in connecting with you and has sent you a profile sharing request. You can now view their complete profile!</p>
            </div>
            <div class="highlight">
              <h3>⚠️ What does this mean?</h3>
<p>You can now view <strong>${senderUsername}'s complete profile</strong> including their contact details. If you accept this request, they will also be able to view your full profile.</p>
            </div>
            <div style="text-align: center; margin: 30px 0;">
              <a style="color:white" href="${senderProfileUrl}" class="button">View Their Profile</a>
              <a style="color:white" href="https://damourmuslim.com/account" class="button button-secondary">Manage Requests</a>
            </div>
          </div>
          <div class="footer">
            <p><strong>© 2024 D'amour Muslim</strong> - Connecting Hearts, Building Futures</p>
            <p>Need help? Contact us at <a href="mailto:support@damourmuslim.com">support@damourmuslim.com</a></p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `Hello ${receiverUsername}!\n\n${senderUsername} is interested in connecting with you! You can now view their complete profile.\n\nIf you accept their request, they'll be able to view your full profile too.\n\nView their profile: ${senderProfileUrl}\nManage requests: https://damourmuslim.com/account\n\n© 2024 D'amour Muslim`,
  }),

  // When request is accepted
  requestAccepted: (username, acceptedByUsername, acceptedByProfileUrl) => ({
    subject: `Good News! ${acceptedByUsername} Accepted Your Request - D'amour Muslim`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Request Accepted - D'amour Muslim</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f9f9f9; }
          .container { max-width: 600px; margin: 0 auto; background: white; }
          .header { background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; padding: 30px 20px; text-align: center; }
          .header h1 { margin: 0; font-size: 28px; font-weight: bold; }
          .content { padding: 40px 30px; }
          .message { font-size: 16px; color: #666; line-height: 1.6; margin-bottom: 30px; }
          .success-box { background: #d4edda; border: 1px solid #c3e6cb; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center; }
          .success-box h3 { color: #155724; margin: 0 0 10px 0; }
          .button { display: inline-block; background: #28a745; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; }
          .footer { background: #f8f9fa; padding: 30px; text-align: center; border-top: 1px solid #eee; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>D'amour Muslim</h1>
            <p>Request Accepted! 🎉</p>
          </div>
          <div class="content">
            <h2>Congratulations ${username}! 💕</h2>
            <div class="success-box">
              <h3>✅ ${acceptedByUsername} accepted your profile request!</h3>
<p>You can now view each others full profiles!</p>
            </div>
            <div class="message">
              <p>This is a great step forward! You can now access ${acceptedByUsername}'s full profile information including their contact details.</p>
              <p>We wish you the best on your journey to finding your life partner!</p>
            </div>
            <div style="text-align: center; margin: 30px 0;">
              <a style="color:white" href="${acceptedByProfileUrl}" class="button">View ${acceptedByUsername}'s Full Profile</a>
            </div>
          </div>
          <div class="footer">
            <p><strong>© 2024 D'amour Muslim</strong> - Connecting Hearts, Building Futures</p>
            <p>Need help? Contact us at <a href="mailto:support@damourmuslim.com">support@damourmuslim.com</a></p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `Congratulations ${username}!\n\n${acceptedByUsername} accepted your profile request! You can now view their complete profile and contact details.\n\nView their profile: ${acceptedByProfileUrl}\n\n© 2024 D'amour Muslim`,
  }),

  // Notification to acceptor
  youAcceptedRequest: (username, acceptedUsername, acceptedProfileUrl) => ({
    subject: `You've Connected with ${acceptedUsername} - D'amour Muslim`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Connection Made - D'amour Muslim</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f9f9f9; }
          .container { max-width: 600px; margin: 0 auto; background: white; }
          .header { background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; padding: 30px 20px; text-align: center; }
          .header h1 { margin: 0; font-size: 28px; font-weight: bold; }
          .content { padding: 40px 30px; }
          .message { font-size: 16px; color: #666; line-height: 1.6; margin-bottom: 30px; }
          .button { display: inline-block; background: #28a745; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; }
          .footer { background: #f8f9fa; padding: 30px; text-align: center; border-top: 1px solid #eee; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>D'amour Muslim</h1>
            <p>New Connection! 🤝</p>
          </div>
          <div class="content">
            <h2>Hello ${username}! 💕</h2>
            <div class="message">
              <p>You've accepted the profile request from <strong>${acceptedUsername}</strong>.</p>
<p>They can now view your complete profile and contact information. You already have access to their full profile.</p>
<p>May Allah bless this connection!</p>
            </div>
            <div style="text-align: center; margin: 30px 0;">
              <a style="color:white" href="${acceptedProfileUrl}" class="button">View ${acceptedUsername}'s Profile</a>
            </div>
          </div>
          <div class="footer">
            <p><strong>© 2024 D'amour Muslim</strong> - Connecting Hearts, Building Futures</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `Hello ${username}!\n\nYou've accepted the profile request from ${acceptedUsername}. They can now view your complete profile. You already have access to their full profile.\n\nView their profile: ${acceptedProfileUrl}\n\n© 2024 D'amour Muslim`,
  }),

  // When request is rejected
  requestRejected: (username, rejectedByUsername) => ({
    subject: `Profile Request Update - D'amour Muslim`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Request Update - D'amour Muslim</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f9f9f9; }
          .container { max-width: 600px; margin: 0 auto; background: white; }
          .header { background: linear-gradient(135deg, #E91E63 0%, #673AB7 100%); color: white; padding: 30px 20px; text-align: center; }
          .header h1 { margin: 0; font-size: 28px; font-weight: bold; }
          .content { padding: 40px 30px; }
          .message { font-size: 16px; color: #666; line-height: 1.6; margin-bottom: 30px; }
          .info-box { background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0; }
          .button { display: inline-block; background: #E91E63; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; }
          .footer { background: #f8f9fa; padding: 30px; text-align: center; border-top: 1px solid #eee; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>D'amour Muslim</h1>
            <p>Request Update</p>
          </div>
          <div class="content">
            <h2>Hello ${username},</h2>
            <div class="message">
              <p>We wanted to let you know that <strong>${rejectedByUsername}</strong> has declined your profile sharing request.</p>
              <p>Don't be discouraged! There are many other compatible profiles on our platform.</p>
            </div>
            <div class="info-box">
              <h3>💡 Keep Looking!</h3>
              <p>Finding the right match takes time. We encourage you to explore more profiles and send requests to others who interest you.</p>
            </div>
            <div style="text-align: center; margin: 30px 0;">
              <a style="color:white" href="https://damourmuslim.com/profiles" class="button">Browse More Profiles</a>
            </div>
          </div>
          <div class="footer">
            <p><strong>© 2024 D'amour Muslim</strong> - Connecting Hearts, Building Futures</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `Hello ${username},\n\n${rejectedByUsername} has declined your profile sharing request.\n\nDon't be discouraged! There are many other compatible profiles.\n\nBrowse more profiles: https://damourmuslim.com/profiles\n\n© 2024 D'amour Muslim`,
  }),
};


// Send email function using ZeptoMail with comprehensive debugging
async function sendEmail(to, template) {
  if (!to) {
    console.log("⚠️ No email address provided, skipping email");
    return { success: false, error: "No email address" };
  }

  // **DEBUG**: Check environment variables
  console.log("📧 Preparing to send email...");
  console.log("To:", to);
  console.log("Subject:", template.subject);
  console.log("From Email:", process.env.ZEPTOMAIL_FROM_EMAIL || "noreply@damourmuslim.com");
  console.log("From Name:", process.env.ZEPTOMAIL_FROM_NAME || "D'amour Muslim");
  console.log("ZeptoMail Token exists:", !!process.env.ZEPTOMAIL_TOKEN);
  console.log("ZeptoMail Token length:", process.env.ZEPTOMAIL_TOKEN?.length || 0);

  const emailPayload = {
    from: {
      address: process.env.ZEPTOMAIL_FROM_EMAIL || "noreply@damourmuslim.com",
      name: process.env.ZEPTOMAIL_FROM_NAME || "D'amour Muslim",
    },
    to: [
      {
        email_address: {
          address: to,
          name: to.split("@")[0],
        },
      },
    ],
    subject: template.subject,
    htmlbody: template.html,
    textbody: template.text,
  };

  console.log("📨 Email payload prepared:", JSON.stringify({
    from: emailPayload.from,
    to: emailPayload.to,
    subject: emailPayload.subject,
    hasHtml: !!emailPayload.htmlbody,
    hasText: !!emailPayload.textbody,
  }, null, 2));

  try {
    console.log("🚀 Sending email via ZeptoMail...");
    const response = await zeptoClient.sendMail(emailPayload);
    
    console.log("✅ ZeptoMail API Response:", JSON.stringify(response, null, 2));
    console.log(`✅ Email sent successfully to: ${to}`);
    
    return { success: true, response };
  } catch (error) {
    // Enhanced error logging for ZeptoMail
    console.error(`❌ Failed to send email to ${to}`);
    console.error("Error type:", typeof error);
    console.error("Error constructor:", error?.constructor?.name);
    console.error("Full error object:", error);
    console.error("Error string:", String(error));
    
    // Try to extract error details in multiple ways
    let errorMessage = "Failed to send email - unknown error";
    
    if (error.error) {
      console.error("error.error:", error.error);
      errorMessage = JSON.stringify(error.error);
    } else if (error.details) {
      console.error("error.details:", error.details);
      errorMessage = error.details;
    } else if (error.message) {
      console.error("error.message:", error.message);
      errorMessage = error.message;
    } else if (error.response) {
      console.error("error.response:", error.response);
      errorMessage = JSON.stringify(error.response);
    } else if (typeof error === 'string') {
      errorMessage = error;
    } else {
      errorMessage = JSON.stringify(error);
    }

    console.error("📋 Extracted error message:", errorMessage);
    return { success: false, error: errorMessage };
  }
}

// Create the worker to process jobs
const notificationWorker = new Worker(
  "notifications",
  async (job) => {
    const { type, data } = job.data;
    console.log(`📬 Processing job: ${type} (Job ID: ${job.id})`);

    try {
      switch (type) {
        case "REQUEST_SENT": {
          const { sender, receiver } = data;

          // Create notification for sender
          await NotificationService.createNotification({
            userId: sender.id,
            type: "request_sent",
            title: "Request Sent",
            message: `Your profile sharing request has been sent to ${receiver.username}.`,
            priority: "medium",
            actionUrl: "/account",
            actionText: "View Requests",
          });

          // Create notification for receiver
          await NotificationService.createNotification({
            userId: receiver.id,
            type: "request_received",
            title: "New Profile Request",
            message: `${sender.username} wants to connect with you!`,
            priority: "high",
            actionUrl: `/profiles/${sender.profileSlug || sender.id}`,
            actionText: "View Profile",
          });

          // Send emails (only if users have emails)
          if (sender.email) {
            await sendEmail(
              sender.email,
              emailTemplates.requestSent(sender.username, receiver.username)
            );
          }

          if (receiver.email) {
            const senderProfileUrl = `https://damourmuslim.com/profiles/${sender.profileSlug || sender.id}`;
            await sendEmail(
              receiver.email,
              emailTemplates.requestReceived(receiver.username, sender.username, senderProfileUrl)
            );
          }
          break;
        }

        case "REQUEST_ACCEPTED": {
          const { acceptor, requester } = data;

          // Notification for the original requester (their request was accepted)
          await NotificationService.createNotification({
            userId: requester.id,
            type: "request_accepted",
            title: "Request Accepted! 🎉",
            message: `${acceptor.username} accepted your profile request. You can now view their full profile!`,
            priority: "high",
            actionUrl: `/profiles/${acceptor.profileSlug || acceptor.id}`,
            actionText: "View Profile",
          });

          // Notification for the acceptor (confirmation)
          await NotificationService.createNotification({
            userId: acceptor.id,
            type: "connection_made",
            title: "New Connection",
            message: `You are now connected with ${requester.username}.`,
            priority: "medium",
            actionUrl: `/profiles/${requester.profileSlug || requester.id}`,
            actionText: "View Profile",
          });

          // Send emails
          if (requester.email) {
            const acceptorProfileUrl = `https://damourmuslim.com/profiles/${acceptor.profileSlug || acceptor.id}`;
            await sendEmail(
              requester.email,
              emailTemplates.requestAccepted(requester.username, acceptor.username, acceptorProfileUrl)
            );
          }

          if (acceptor.email) {
            const requesterProfileUrl = `https://damourmuslim.com/profiles/${requester.profileSlug || requester.id}`;
            await sendEmail(
              acceptor.email,
              emailTemplates.youAcceptedRequest(acceptor.username, requester.username, requesterProfileUrl)
            );
          }
          break;
        }

        case "REQUEST_REJECTED": {
          const { rejector, requester } = data;

          // Notification for the original requester
          await NotificationService.createNotification({
            userId: requester.id,
            type: "request_rejected",
            title: "Request Update",
            message: `Your profile request to ${rejector.username} was not accepted. Keep exploring other profiles!`,
            priority: "low",
            actionUrl: "/profiles",
            actionText: "Browse Profiles",
          });

          // Send email to requester
          if (requester.email) {
            await sendEmail(
              requester.email,
              emailTemplates.requestRejected(requester.username, rejector.username)
            );
          }
          break;
        }

        default:
          console.warn(`⚠️ Unknown job type: ${type}`);
      }

      console.log(`✅ Job ${job.id} completed successfully`);
      return { success: true };
    } catch (error) {
      console.error(`❌ Job ${job.id} failed:`, error);
      throw error;
    }
  },
  {
    connection: workerConnection,
    concurrency: 5,
  }
);

// Worker event handlers
notificationWorker.on("completed", (job) => {
  console.log(`✅ Job ${job.id} has completed`);
});

notificationWorker.on("failed", (job, err) => {
  console.error(`❌ Job ${job?.id} has failed:`, err.message);
});

notificationWorker.on("error", (err) => {
  console.error("❌ Worker error:", err);
});

// Queue helper functions
const QueueService = {
  // Add a job to send request notifications
  async queueRequestSent(sender, receiver) {
    try {
      const job = await notificationQueue.add(
        "request-sent",
        {
          type: "REQUEST_SENT",
          data: {
            sender: {
              id: sender._id.toString(),
              username: sender.username,
              email: sender.email,
              profileSlug: sender.profileSlug,
            },
            receiver: {
              id: receiver._id.toString(),
              username: receiver.username,
              email: receiver.email,
              profileSlug: receiver.profileSlug,
            },
          },
        },
        { priority: 2 }
      );
      console.log(`📤 Queued REQUEST_SENT job: ${job.id}`);
      return job;
    } catch (error) {
      console.error("❌ Failed to queue REQUEST_SENT:", error);
      return null;
    }
  },

  // Add a job for request accepted
  async queueRequestAccepted(acceptor, requester) {
    try {
      const job = await notificationQueue.add(
        "request-accepted",
        {
          type: "REQUEST_ACCEPTED",
          data: {
            acceptor: {
              id: acceptor._id.toString(),
              username: acceptor.username,
              email: acceptor.email,
              profileSlug: acceptor.profileSlug,
            },
            requester: {
              id: requester._id.toString(),
              username: requester.username,
              email: requester.email,
              profileSlug: requester.profileSlug,
            },
          },
        },
        { priority: 1 }
      );
      console.log(`📤 Queued REQUEST_ACCEPTED job: ${job.id}`);
      return job;
    } catch (error) {
      console.error("❌ Failed to queue REQUEST_ACCEPTED:", error);
      return null;
    }
  },

  // Add a job for request rejected
  async queueRequestRejected(rejector, requester) {
    try {
      const job = await notificationQueue.add(
        "request-rejected",
        {
          type: "REQUEST_REJECTED",
          data: {
            rejector: {
              id: rejector._id.toString(),
              username: rejector.username,
              profileSlug: rejector.profileSlug,
            },
            requester: {
              id: requester._id.toString(),
              username: requester.username,
              email: requester.email,
              profileSlug: requester.profileSlug,
            },
          },
        },
        { priority: 3 }
      );
      console.log(`📤 Queued REQUEST_REJECTED job: ${job.id}`);
      return job;
    } catch (error) {
      console.error("❌ Failed to queue REQUEST_REJECTED:", error);
      return null;
    }
  },

  // Get queue stats
  async getQueueStats() {
    const [waiting, active, completed, failed] = await Promise.all([
      notificationQueue.getWaitingCount(),
      notificationQueue.getActiveCount(),
      notificationQueue.getCompletedCount(),
      notificationQueue.getFailedCount(),
    ]);
    return { waiting, active, completed, failed };
  },

  // Close connections gracefully
  async close() {
    await notificationWorker.close();
    await notificationQueue.close();
    await queueConnection.quit();
    await workerConnection.quit();
    console.log("🔌 Queue service closed");
  },
};

module.exports = QueueService;