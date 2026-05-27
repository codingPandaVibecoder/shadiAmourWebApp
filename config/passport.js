const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const User = require("../models/user");
const { generateUniqueSlug } = require("../utils/profileHelpers");

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${process.env.BASE_URL}/auth/google/callback`,
      passReqToCallback: true,
      proxy: true
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

        // **NEW**: Create new user directly from Google OAuth for simplified flow
        // Generate unique username
        const generateUsername = () => {
          const adjectives = ['happy', 'bright', 'noble', 'kind', 'wise', 'calm', 'pure', 'true'];
          const nouns = ['soul', 'heart', 'star', 'light', 'moon', 'rose', 'pearl', 'gem'];
          const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
          const noun = nouns[Math.floor(Math.random() * nouns.length)];
          const num = Math.floor(Math.random() * 9999);
          return `${adj}${noun}${num}`;
        };

        let username = generateUsername();
        // Ensure username is unique
        while (await User.findOne({ username })) {
          username = generateUsername();
        }

        // Create new user with Google data
        const newUser = new User({
          username,
          googleId: profile.id,
          name: profile.displayName || null,
          email: profile.emails && profile.emails.length > 0 
            ? profile.emails[0].value.toLowerCase() 
            : null,
          isEmailVerified: true,
          googleProfilePic: profile.photos && profile.photos.length > 0 
            ? profile.photos[0].value 
            : null,
          password: await require('bcrypt').hash('google_oauth_' + profile.id, 12), // Placeholder password
          registrationSource: "google",
          isApproved: false,
          approvalStatus: "pending",
        });

        // Generate profile slug
        newUser.profileSlug = await generateUniqueSlug(newUser);
        await newUser.save();

        console.log("New Google user created:", newUser.username);
        return done(null, newUser);
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
