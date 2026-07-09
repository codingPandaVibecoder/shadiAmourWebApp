const { SendMailClient } = require("zeptomail");

// Initialize ZeptoMail client
const client = new SendMailClient({
  url: "api.zeptomail.com/",
  token: process.env.ZEPTOMAIL_TOKEN,
});

// Generate 4-digit verification code
function generateVerificationCode() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// Helper function to send email via ZeptoMail
async function sendZeptoMail(to, subject, htmlBody, textBody) {
  try {
    const response = await client.sendMail({
      from: {
        address: process.env.ZEPTOMAIL_FROM_EMAIL || "noreply@damourmuslim.com",
        name: process.env.ZEPTOMAIL_FROM_NAME || "D'amour Muslim",
      },
      to: [
        {
          email_address: {
            address: to,
            name: to.split("@")[0], // Use part before @ as name
          },
        },
      ],
      subject: subject,
      htmlbody: htmlBody,
      textbody: textBody,
    });

    console.log(`✅ Email sent successfully to: ${to}`);
    return { success: true, response };
  } catch (error) {
    console.error(`❌ ZeptoMail error for ${to}:`, error);
    
    let errorMessage = "Failed to send email";
    if (error.details) {
      errorMessage = error.details;
    } else if (error.message) {
      errorMessage = error.message;
    }

    return { success: false, error: errorMessage };
  }
}

// Send verification email using ZeptoMail
async function sendVerificationEmail(email, code, username) {
  const subject = "Email Verification - D'amour Muslim";
  
  const htmlBody = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Email Verification - D'amour Muslim</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f9f9f9; }
        .container { max-width: 600px; margin: 0 auto; background: white; }
        .header { background: linear-gradient(135deg, #E91E63 0%, #673AB7 100%); color: white; padding: 30px 20px; text-align: center; }
        .header h1 { margin: 0; font-size: 28px; font-weight: bold; }
        .header p { margin: 10px 0 0 0; font-size: 16px; opacity: 0.9; }
        .content { padding: 40px 30px; }
        .welcome { font-size: 20px; font-weight: bold; color: #333; margin-bottom: 15px; }
        .message { font-size: 16px; color: #666; line-height: 1.6; margin-bottom: 30px; }
        .code-container { background: #f8f9fa; border: 2px dashed #E91E63; border-radius: 12px; padding: 30px; text-align: center; margin: 30px 0; }
        .code-label { font-size: 16px; color: #666; margin-bottom: 15px; }
        .code { font-size: 36px; font-weight: bold; color: #E91E63; letter-spacing: 8px; font-family: 'Courier New', monospace; margin: 10px 0; }
        .important { background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 8px; padding: 20px; margin: 30px 0; }
        .important h3 { color: #856404; margin: 0 0 15px 0; font-size: 18px; }
        .important ul { margin: 0; padding-left: 20px; color: #856404; }
        .important li { margin-bottom: 8px; line-height: 1.4; }
        .footer { background: #f8f9fa; padding: 30px; text-align: center; border-top: 1px solid #eee; }
        .footer p { margin: 5px 0; color: #666; font-size: 14px; }
        .footer a { color: #E91E63; text-decoration: none; }
        @media (max-width: 600px) {
          .content { padding: 30px 20px; }
          .code { font-size: 28px; letter-spacing: 4px; }
          .header { padding: 25px 20px; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>D'amour Muslim</h1>
          <p>Email Verification Required</p>
        </div>
        
        <div class="content">
          <div class="welcome">Welcome ${username}! 🌟</div>
          <div class="message">
            Thank you for joining D'amour Muslim, the trusted platform for Muslim matrimony. 
            To complete your registration and secure your account, please verify your email address using the verification code below:
          </div>
          
          <div class="code-container">
            <div class="code-label">Your 4-Digit Verification Code:</div>
            <div class="code">${code}</div>
          </div>
          
          <div class="important">
            <h3>⚠️ Important Security Information:</h3>
            <ul>
              <li><strong>This code expires in 10 minutes</strong> for your security</li>
              <li><strong>Never share this code</strong> with anyone - we will never ask for it</li>
              <li><strong>Use this code only on D'amour Muslim</strong> registration page</li>
              <li>If you didn't create an account with us, please ignore this email</li>
            </ul>
          </div>
        </div>
        
        <div class="footer">
          <p><strong>© 2024 D'amour Muslim</strong> - Connecting Hearts, Building Futures</p>
          <p>Need help? Contact us at <a href="mailto:support@damourmuslim.com">support@damourmuslim.com</a></p>
          <p>📱 WhatsApp: <a href="https://wa.me/+447899816181">+447454516156</a></p>
        </div>
      </div>
    </body>
    </html>
  `;

  const textBody = `
Welcome ${username}!

Thank you for joining D'amour Muslim. Please verify your email address using this 4-digit code:

${code}

Important:
- This code expires in 10 minutes
- Never share this code with anyone
- If you didn't create an account, please ignore this email

Complete your registration at: https://damourmuslim.com/register

Need help? Contact us at support@damourmuslim.com

© 2024 D'amour Muslim
  `;

  return await sendZeptoMail(email, subject, htmlBody, textBody);
}

// Send password reset email using ZeptoMail
async function sendPasswordResetEmail(email, resetToken, username) {
  const resetUrl = `${
    process.env.BASE_URL || "https://damourmuslim.com"
  }/reset-password?token=${resetToken}`;

  const subject = "Password Reset - D'amour Muslim";

  const htmlBody = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Password Reset - D'amour Muslim</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f9f9f9; }
        .container { max-width: 600px; margin: 0 auto; background: white; }
        .header { background: linear-gradient(135deg, #E91E63 0%, #673AB7 100%); color: white; padding: 30px 20px; text-align: center; }
        .header h1 { margin: 0; font-size: 28px; font-weight: bold; }
        .header p { margin: 10px 0 0 0; font-size: 16px; opacity: 0.9; }
        .content { padding: 40px 30px; }
        .welcome { font-size: 20px; font-weight: bold; color: #333; margin-bottom: 15px; }
        .message { font-size: 16px; color: #666; line-height: 1.6; margin-bottom: 30px; }
        .button { display: inline-block; background: #E91E63; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }
        .button:hover { background: #C2185B; }
        .important { background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 8px; padding: 20px; margin: 30px 0; }
        .important h3 { color: #856404; margin: 0 0 15px 0; font-size: 18px; }
        .important ul { margin: 0; padding-left: 20px; color: #856404; }
        .important li { margin-bottom: 8px; line-height: 1.4; }
        .footer { background: #f8f9fa; padding: 30px; text-align: center; border-top: 1px solid #eee; }
        .footer p { margin: 5px 0; color: #666; font-size: 14px; }
        .footer a { color: #E91E63; text-decoration: none; }
        @media (max-width: 600px) {
          .content { padding: 30px 20px; }
          .header { padding: 25px 20px; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>D'amour Muslim</h1>
          <p>Password Reset Request</p>
        </div>
        
        <div class="content">
          <div class="welcome">Hello ${username}! 🔐</div>
          <div class="message">
            We received a request to reset your password for your D'amour Muslim account. 
            Click the button below to create a new password:
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" class="button">Reset My Password</a>
          </div>
          
          <div class="important">
            <h3>⚠️ Important Security Information:</h3>
            <ul>
              <li><strong>This link expires in 1 hour</strong> for your security</li>
              <li><strong>If you didn't request this reset</strong>, please ignore this email</li>
              <li><strong>Your password remains unchanged</strong> until you complete the reset</li>
              <li><strong>Never share this link</strong> with anyone</li>
            </ul>
          </div>

          <div style="margin: 30px 0; padding: 20px; background: #f8f9fa; border-radius: 8px;">
            <p style="margin: 0; color: #666; font-size: 14px;">
              <strong>Can't click the button?</strong> Copy and paste this link into your browser:
            </p>
            <p style="margin: 10px 0 0 0; color: #E91E63; font-size: 14px; word-break: break-all;">
              ${resetUrl}
            </p>
          </div>
        </div>
        
        <div class="footer">
          <p><strong>© 2024 D'amour Muslim</strong> - Connecting Hearts, Building Futures</p>
          <p>Need help? Contact us at <a href="mailto:support@damourmuslim.com">support@damourmuslim.com</a></p>
          <p>📱 WhatsApp: <a href="https://wa.me/+447899816181">+447454516156</a></p>
        </div>
      </div>
    </body>
    </html>
  `;

  const textBody = `
Hello ${username}!

We received a request to reset your password for your D'amour Muslim account.

Reset your password by clicking this link:
${resetUrl}

Important:
- This link expires in 1 hour
- If you didn't request this reset, please ignore this email
- Your password remains unchanged until you complete the reset

Need help? Contact us at support@damourmuslim.com or WhatsApp: +447454516156

© 2024 D'amour Muslim
  `;

  return await sendZeptoMail(email, subject, htmlBody, textBody);
}

// Send profile approval congratulations email
async function sendProfileApprovalEmail(email, username, name) {
  const subject = "🎉 Congratulations! Your Profile Has Been Approved - D'amour Muslim";
  const profileUrl = `${process.env.BASE_URL || "https://damourmuslim.com"}/account/info`;

  const htmlBody = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Profile Approved - D'amour Muslim</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f9f9f9; }
        .container { max-width: 600px; margin: 0 auto; background: white; }
        .header { background: linear-gradient(135deg, #E91E63 0%, #673AB7 100%); color: white; padding: 30px 20px; text-align: center; }
        .header h1 { margin: 0; font-size: 28px; font-weight: bold; }
        .header p { margin: 10px 0 0 0; font-size: 16px; opacity: 0.9; }
        .content { padding: 40px 30px; }
        .welcome { font-size: 20px; font-weight: bold; color: #333; margin-bottom: 15px; }
        .message { font-size: 16px; color: #666; line-height: 1.6; margin-bottom: 30px; }
        .celebration { text-align: center; padding: 30px; background: linear-gradient(135deg, #fdf2f8 0%, #f3e8ff 100%); border-radius: 16px; margin: 20px 0; }
        .celebration-icon { font-size: 60px; margin-bottom: 15px; }
        .celebration h2 { color: #E91E63; margin: 0 0 10px 0; font-size: 24px; }
        .celebration p { color: #666; margin: 0; }
        .button { display: inline-block; background: #E91E63; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }
        .button:hover { background: #C2185B; }
        .next-steps { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 25px; margin: 30px 0; }
        .next-steps h3 { color: #166534; margin: 0 0 15px 0; font-size: 18px; }
        .next-steps ul { margin: 0; padding-left: 20px; color: #15803d; }
        .next-steps li { margin-bottom: 10px; line-height: 1.5; }
        .footer { background: #f8f9fa; padding: 30px; text-align: center; border-top: 1px solid #eee; }
        .footer p { margin: 5px 0; color: #666; font-size: 14px; }
        .footer a { color: #E91E63; text-decoration: none; }
        @media (max-width: 600px) {
          .content { padding: 30px 20px; }
          .header { padding: 25px 20px; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>D'amour Muslim</h1>
          <p>Your Journey Begins!</p>
        </div>
        
        <div class="content">
          <div class="celebration">
            <div class="celebration-icon">🎉</div>
            <h2>Congratulations, ${name || username}!</h2>
            <p>Your profile has been approved by our team</p>
          </div>

          <div class="message">
            We're thrilled to welcome you to the D'amour Muslim community! Our team has reviewed your profile 
            and it's now live on our platform. Other members can now view your profile and express interest.
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${profileUrl}" class="button">View My Profile</a>
          </div>
          
          <div class="next-steps">
            <h3>✨ What's Next?</h3>
            <ul>
              <li><strong>Complete your profile</strong> - Add more details to attract suitable matches</li>
              <li><strong>Browse and send requests to profiles</strong> - Start exploring and finding compatible partners</li>
              <li><strong>Stay active</strong> - Regular activity helps you appear in search results</li>
              <li><strong>Be patient</strong> - The right match is worth waiting for!</li>
            </ul>
          </div>

          <div class="message" style="text-align: center; font-style: italic; color: #888;">
            "And among His signs is that He created for you spouses from among yourselves, 
            that you may find tranquility in them." - Quran 30:21
          </div>
        </div>
        
        <div class="footer">
          <p><strong>© 2024 D'amour Muslim</strong> - Connecting Hearts, Building Futures</p>
          <p>Need help? Contact us at <a href="mailto:support@damourmuslim.com">support@damourmuslim.com</a></p>
          <p>📱 WhatsApp: <a href="https://wa.me/+447899816181">+447454516156</a></p>
        </div>
      </div>
    </body>
    </html>
  `;

  const textBody = `
Congratulations ${name || username}!

🎉 Your profile has been approved by our team!

We're thrilled to welcome you to the D'amour Muslim community. Your profile is now live and other members can view it and express interest.

What's Next?
- Complete your profile - Add more details to attract suitable matches
- Browse and send requests to profiles - Start exploring and finding compatible partners
- Stay active - Regular activity helps you appear in search results
- Be patient - The right match is worth waiting for!

View your profile: ${profileUrl}

"And among His signs is that He created for you spouses from among yourselves, that you may find tranquility in them." - Quran 30:21

Need help? Contact us at support@damourmuslim.com or WhatsApp: +447454516156

© 2024 D'amour Muslim
  `;

  return await sendZeptoMail(email, subject, htmlBody, textBody);
}

module.exports = {
  generateVerificationCode,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendProfileApprovalEmail,
  sendZeptoMail,
  sendMarriageGuide,
  sendReservationNotification,
};

async function sendMarriageGuide(email) {
  const pdfUrl = "https://res.cloudinary.com/dhuc2plh0/raw/upload/public/halal_marriage_guide_hg5dwe.pdf";
  const subject = "Your Free Halal Marriage Guide — D'amour Muslim 💌";

  const htmlBody = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Your Free Halal Marriage Guide</title>
    </head>
    <body style="margin:0;padding:0;background:#f9fafb;font-family:'Roboto',Arial,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 16px;">
        <tr><td align="center">
          <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);max-width:600px;">
            <!-- Header -->
            <tr>
              <td style="background:linear-gradient(135deg,#E91E63 0%,#673AB7 100%);padding:36px 40px;text-align:center;">
                <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:700;font-family:'Playfair Display',Georgia,serif;">D'amour Muslim</h1>
                <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">UK's Trusted Halal Marriage Platform</p>
              </td>
            </tr>
            <!-- Body -->
            <tr>
              <td style="padding:40px;">
                <h2 style="margin:0 0 16px;color:#1f2937;font-size:22px;font-family:'Playfair Display',Georgia,serif;">Your Free Halal Marriage Guide is here! 📖</h2>
                <p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.7;">Assalamu Alaikum,</p>
                <p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.7;">Thank you for downloading our <strong>Free Halal Marriage Guide (UK)</strong>. Inside, you will find practical, Islamic guidance on how to find a practising Muslim spouse the halal way — from the first steps of your search to preparing for a blessed nikah.</p>
                <!-- Download Button -->
                <table width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0;">
                  <tr><td align="center">
                    <a href="${pdfUrl}" target="_blank" style="display:inline-block;background:linear-gradient(135deg,#E91E63 0%,#673AB7 100%);color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;padding:14px 36px;border-radius:50px;box-shadow:0 4px 16px rgba(233,30,99,0.35);">📄 Download Your Guide</a>
                  </td></tr>
                </table>
                <p style="margin:0 0 16px;color:#4b5563;font-size:14px;line-height:1.7;">If the button above doesn't work, copy and paste this link into your browser:</p>
                <p style="margin:0 0 24px;"><a href="${pdfUrl}" style="color:#E91E63;font-size:13px;word-break:break-all;">${pdfUrl}</a></p>
                <hr style="border:none;border-top:1px solid #f3f4f6;margin:28px 0;">
                <p style="margin:0 0 8px;color:#6b7280;font-size:13px;line-height:1.6;">Ready to find your Muslim spouse? <a href="https://damourmuslim.com/register" style="color:#E91E63;text-decoration:none;font-weight:600;">Create your free profile</a> on D'amour Muslim and join thousands of serious Muslims looking for a halal marriage.</p>
              </td>
            </tr>
            <!-- Footer -->
            <tr>
              <td style="background:#f9fafb;padding:24px 40px;text-align:center;border-top:1px solid #f3f4f6;">
                <p style="margin:0 0 6px;color:#9ca3af;font-size:12px;">D'amour Muslim &bull; London, UK &bull; <a href="mailto:contact@damourmuslim.com" style="color:#9ca3af;">contact@damourmuslim.com</a></p>
                <p style="margin:0;color:#d1d5db;font-size:11px;">You received this email because you requested our free guide at damourmuslim.com</p>
              </td>
            </tr>
          </table>
        </td></tr>
      </table>
    </body>
    </html>
  `;

  const textBody = `Your Free Halal Marriage Guide — D'amour Muslim\n\nAssalamu Alaikum,\n\nThank you for requesting our Free Halal Marriage Guide (UK). Download it here:\n${pdfUrl}\n\nReady to find your Muslim spouse? Visit https://damourmuslim.com/register\n\nD'amour Muslim — London, UK`;

  return sendZeptoMail(email, subject, htmlBody, textBody);
}

// Send reservation notification email to admin
async function sendReservationNotification(reservation) {
  const adminEmail = "ayesha.tanveer879@gmail.com";
  const subject = `📅 New Reservation: ${reservation.name} — ${reservation.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} at ${reservation.time}`;

  const phoneDisplay = reservation.countryCode
    ? `${reservation.countryCode} ${reservation.phoneOrEmail}`
    : reservation.phoneOrEmail;

  const sourceLabel = (reservation.source || "website").replace(/_/g, " ");

  const htmlBody = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>New Reservation</title>
    </head>
    <body style="margin:0;padding:0;background:#f9fafb;font-family:'Roboto',Arial,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 16px;">
        <tr><td align="center">
          <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
            <!-- Header -->
            <tr>
              <td style="background:linear-gradient(135deg,#E91E63 0%,#673AB7 100%);padding:30px 40px;text-align:center;">
                <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:700;font-family:'Playfair Display',Georgia,serif;">New Reservation Booked</h1>
                <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">D'amour Muslim — Free Consultation</p>
              </td>
            </tr>
            <!-- Body -->
            <tr>
              <td style="padding:40px;">
                <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                  <tr>
                    <td style="padding:12px 16px;background:#f9fafb;border-radius:8px;font-size:14px;color:#6b7280;width:120px;">👤 Name</td>
                    <td style="padding:12px 16px;font-size:15px;color:#1f2937;font-weight:600;">${reservation.name}</td>
                  </tr>
                  <tr>
                    <td style="padding:12px 16px;font-size:14px;color:#6b7280;">📞 Phone</td>
                    <td style="padding:12px 16px;font-size:15px;color:#1f2937;font-weight:600;">${phoneDisplay}</td>
                  </tr>
                  <tr>
                    <td style="padding:12px 16px;background:#f9fafb;border-radius:8px;font-size:14px;color:#6b7280;">📅 Date</td>
                    <td style="padding:12px 16px;background:#f9fafb;border-radius:8px;font-size:15px;color:#1f2937;font-weight:600;">${reservation.date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</td>
                  </tr>
                  <tr>
                    <td style="padding:12px 16px;font-size:14px;color:#6b7280;">⏰ Time</td>
                    <td style="padding:12px 16px;font-size:15px;color:#1f2937;font-weight:600;">${reservation.time}</td>
                  </tr>
                  <tr>
                    <td style="padding:12px 16px;background:#f9fafb;border-radius:8px;font-size:14px;color:#6b7280;">📍 Source</td>
                    <td style="padding:12px 16px;background:#f9fafb;border-radius:8px;font-size:15px;color:#1f2937;">${sourceLabel}</td>
                  </tr>
                  ${reservation.pageUrl ? `
                  <tr>
                    <td style="padding:12px 16px;font-size:14px;color:#6b7280;">🌐 Page</td>
                    <td style="padding:12px 16px;font-size:13px;color:#6b7280;"><a href="${reservation.pageUrl}" style="color:#E91E63;">${reservation.pageUrl}</a></td>
                  </tr>` : ''}
                </table>
                <a href="https://damourmuslim.com/admin/reservations" style="display:inline-block;background:linear-gradient(135deg,#E91E63 0%,#673AB7 100%);color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:12px 28px;border-radius:50px;box-shadow:0 4px 12px rgba(233,30,99,0.3);">🔗 View in Admin Panel</a>
              </td>
            </tr>
            <!-- Footer -->
            <tr>
              <td style="background:#f9fafb;padding:24px 40px;text-align:center;border-top:1px solid #f3f4f6;">
                <p style="margin:0 0 6px;color:#9ca3af;font-size:12px;">D'amour Muslim &bull; London, UK</p>
                <p style="margin:0;color:#d1d5db;font-size:11px;">This is an automated reservation notification.</p>
              </td>
            </tr>
          </table>
        </td></tr>
      </table>
    </body>
    </html>
  `;

  const textBody = `NEW RESERVATION — D'amour Muslim\n\nName: ${reservation.name}\nPhone: ${phoneDisplay}\nDate: ${reservation.date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}\nTime: ${reservation.time}\nSource: ${sourceLabel}\n${reservation.pageUrl ? `Page: ${reservation.pageUrl}\n` : ''}\nView in admin: https://damourmuslim.com/admin/reservations`;

  return sendZeptoMail(adminEmail, subject, htmlBody, textBody);
}