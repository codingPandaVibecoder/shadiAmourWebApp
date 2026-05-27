const User = require("../models/user");

/**
 * Middleware to check if user's profile is approved
 * Users with unapproved profiles cannot send requests to others
 */
module.exports = async function requireApprovedProfile(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({
      error: "not_logged_in",
      message: "Please log in to continue.",
    });
  }

  try {
    const user = await User.findById(req.session.userId);

    if (!user) {
      return res.status(404).json({
        error: "user_not_found",
        message: "User not found.",
      });
    }

    // Check if profile is approved
    if (!user.isApproved || user.approvalStatus !== "approved") {
      return res.status(403).json({
        error: "profile_not_approved",
        message: "Your profile is pending approval. You cannot send requests until your profile is approved by our team.",
      });
    }

    next();
  } catch (error) {
    console.error("Error in requireApprovedProfile middleware:", error);
    return res.status(500).json({
      error: "server_error",
      message: "Something went wrong. Please try again.",
    });
  }
};
