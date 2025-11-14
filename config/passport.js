const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const User = require("../models/user");
const { generateUniqueSlug } = require("../utils/profileHelpers");

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "/auth/google/callback",
      passReqToCallback: true,
    },
    async (req, accessToken, refreshToken, profile, done) => {
      try {
        console.log(
          "Google OAuth callback triggered for:",
          profile.displayName
        );

        // Check if user already exists with this Google ID
        let user = await User.findOne({ googleId: profile.id });

        if (user) {
          console.log(
            "Existing Google user found - signing in:",
            user.username
          );
          return done(null, user);
        }

        // Check if user exists with this email (for linking accounts)
        if (profile.emails && profile.emails.length > 0) {
          const email = profile.emails[0].value;
          user = await User.findOne({ email: email.toLowerCase() });

          if (user) {
            console.log(
              "Linking Google account to existing user:",
              user.username
            );
            // Link Google account to existing user
            user.googleId = profile.id;
            if (profile.photos && profile.photos.length > 0) {
              user.googleProfilePic = profile.photos[0].value;
            }
            await user.save();
            return done(null, user);
          }
        }

        // **IMPORTANT**: Only create new user if coming from registration flow
        // Check if there's a temp user from registration process
        if (req.session && req.session.tempUserId) {
          console.log("Creating new user from registration flow");
          const tempUser = await User.findById(req.session.tempUserId);
          if (tempUser) {
            // Update temp user with Google data
            tempUser.googleId = profile.id;
            tempUser.name = profile.displayName || tempUser.name;
            tempUser.email =
              profile.emails && profile.emails.length > 0
                ? profile.emails[0].value.toLowerCase()
                : tempUser.email;
            tempUser.isEmailVerified = true;
            tempUser.googleProfilePic =
              profile.photos && profile.photos.length > 0
                ? profile.photos[0].value
                : null;

            // Generate profile slug
            tempUser.profileSlug = await generateUniqueSlug(tempUser);
            await tempUser.save();

            // Clean up session
            delete req.session.tempUserId;

            return done(null, tempUser);
          }
        }

        // **NEW**: If no temp user, this might be a direct login attempt
        // For security, don't auto-create accounts from login page
        console.log(
          "No existing user found for Google login, redirecting to register"
        );
        return done(null, false, {
          message: "No account found. Please register first.",
        });
      } catch (error) {
        console.error("Google OAuth error:", error);
        return done(error, null);
      }
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user._id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

module.exports = passport;
