const User = require("../models/user");

// Middleware to ensure user has completed onboarding before accessing the app
module.exports = async function requireOnboardingComplete(req, res, next) {
  // Skip if not logged in
  if (!req.session.userId) {
    return next();
  }

  // Fetch user if not already available
  let user = req.userData;
  if (!user) {
    user = await User.findById(req.session.userId);
  }

  if (!user) {
    return next();
  }

  // Check if user has completed onboarding (has all required fields from 5 steps)
  // Step 1: profileFor, gender, username (username is required at registration)
  // Step 2: name, age, height, maritalStatus
  // Step 3: city, country
  // Step 4: highestEducation, work
  // Step 5: aboutMe, contact
  const hasCompletedOnboarding = 
    user.name && 
    user.age && 
    user.height && 
    user.maritalStatus && 
    user.city && 
    user.country && 
    user.highestEducation && 
    user.work && 
    user.aboutMe && 
    user.contact;

  if (!hasCompletedOnboarding) {
    // Redirect to onboarding page
    return res.redirect('/onboarding');
  }

  next();
};
