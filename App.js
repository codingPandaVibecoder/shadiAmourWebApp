function calculateProfileCompletion(user) {
  const totalFields = 64; // Total possible fields

  let completedFields = 0;

  // Check each field in the user object
  Object.keys(user.toObject()).forEach((key) => {
    const value = user[key];
    if (
      value !== null &&
      value !== undefined &&
      value !== "" &&
      value !== "N/A"
    ) {
      if (Array.isArray(value) && value.length > 0) {
        completedFields++;
      } else if (typeof value === "object" && !Array.isArray(value)) {
        // For nested objects like profilePic, coverPhoto
        if (value.url || Object.keys(value).length > 0) {
          completedFields++;
        }
      } else if (typeof value !== "object") {
        completedFields++;
      }
    }
  });

  const percentage = Math.round((completedFields / totalFields) * 100);
  return {
    completed: completedFields,
    total: totalFields,
    percentage: percentage,
  };
}
const slugify = require("slugify");
function generateProfileSlug(user) {
  // Use name if available, otherwise username
  const baseName = user.username;

  let parts = [baseName];

  // **FIXED**: Prioritize most specific to least specific location
  let locationPart = null;

  if (
    user.birthPlace &&
    user.birthPlace.trim() &&
    user.birthPlace.toLowerCase() !== "n/a"
  ) {
    locationPart = user.birthPlace;
  } else if (
    user.city &&
    user.city.trim() &&
    user.city.toLowerCase() !== "n/a"
  ) {
    locationPart = user.city;
  } else if (
    user.country &&
    user.country.trim() &&
    user.country.toLowerCase() !== "n/a"
  ) {
    locationPart = user.country;
  } else if (
    user.nationality &&
    user.nationality.trim() &&
    user.nationality.toLowerCase() !== "n/a"
  ) {
    locationPart = user.nationality;
  }

  if (locationPart) {
    parts.push(`from-${locationPart}`);
  }

  // Add age if available
  if (user.age) {
    parts.push(`${user.age}`);
  }

  // Join parts and slugify
  const slug = slugify(parts.join(" "), {
    lower: true,
    strict: true, // Remove special characters
    locale: "en",
  });

  return slug;
}

// **NEW**: Function to ensure unique slug
async function generateUniqueSlug(user) {
  let baseSlug = generateProfileSlug(user);
  let slug = baseSlug;
  let counter = 1;

  // Check if slug already exists
  while (await User.findOne({ profileSlug: slug, _id: { $ne: user._id } })) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  return slug;
}
const User = require("./models/user");
const Newsletter = require("./models/Newsletter");
const { countryOptions, countryPlaceholders } = require("./config/countries");
const path = require("path");
const Request = require("./models/Request");
const Notification = require("./models/Notification");
const NotificationService = require("./services/notificationService");
const isLoggedIn = require("./middlewares/isLoggedIn");
const findUser = require("./middlewares/findUser");
const {
  requireAdminOrModerator,
  requireAdminOnly,
  requireViewAccess,
} = require("./middlewares/accessControl");
const mongoose = require("mongoose");
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const MongoStore = require("connect-mongo");
const { v4: uuidv4 } = require("uuid");
require("dotenv").config();
const port = process.env.PORT;
const compression = require("compression");
const app = express();
app.set("trust proxy", 1);
app.use(express.static(path.join(__dirname, "public")));
app.use(compression());
app.use((req, res, next) => {
  // Security headers
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");

  // SEO-friendly cache headers for static assets
  if (
    req.url.match(/\.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/)
  ) {
    res.setHeader("Cache-Control", "public, max-age=31536000"); // 1 year
  }

  next();
});
const rateLimit = require("express-rate-limit");
const { ipKeyGenerator } = require("express-rate-limit");
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minutes
  max: 200, // Limit each IP to 200 requests per windowMs
  message: "Too many requests from this IP",
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipKeyGenerator,
});
const emailVerificationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Limit each IP to 3 email verification requests per hour
  message: {
    success: false,
    error: "Too many email verification attempts. Please try again in 1 hour.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipKeyGenerator,
});

const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Limit each IP to 3 password reset requests per hour
  message: {
    success: false,
    error: "Too many password reset attempts. Please try again in 1 hour.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipKeyGenerator,
});

app.use(limiter);
app.use(
  session({
    secret: process.env.SECRETKEYSESSION,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGODB_URI,
      collectionName: "sessions",
    }),
    cookie: { secure: false, httpOnly: true }, // set secure: true if using HTTPS
  })
);

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUDINARY_KEY,
  api_secret: process.env.CLOUDINARY_SECRET,
});
const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    // Get username from either userData or form data
    let username = req.userData?.username || req.body?.userId || "unknown";

    // If userId is passed instead of username, look up the username
    if (req.body?.userId && !req.userData?.username) {
      try {
        const user = await User.findById(req.body.userId);
        username = user?.username || "unknown";
      } catch (e) {
        console.log("Error finding user for username:", e);
      }
    }

    // **NEW**: Different naming based on file field name
    let suffix = "";
    if (file.fieldname === "coverPhoto") {
      suffix = "C"; // Cover photo: M23C
    } else if (file.fieldname === "profilePic") {
      suffix = "P"; // Profile picture: M23P
    } else {
      suffix = "imgs1"; // Fallback for other uploads
    }

    return {
      folder: "user_profiles",
      public_id: `${username}${suffix}`, // M23C or M23P
      allowed_formats: ["jpg", "jpeg", "png", "webp"],
      transformation: [
        { quality: "auto" }, // compress smartly
        { fetch_format: "auto" }, // store in efficient format
      ],
    };
  },
});
const upload = multer({ storage });
const {
  generateVerificationCode,
  sendVerificationEmail,
  sendPasswordResetEmail,
} = require("./services/emailService");
const requireProfileComplete = require("./middlewares/requireProfileComplete");

// Add this middleware after your session setup but before your routes
app.set("view engine", "ejs");

mongoose
  .connect(process.env.MONGODB_URI, {})
  .then(() => {
    console.log(" Mongoose Server Started!");
  })
  .catch((err) => {
    console.log(" Err mongoose!", err);
  });
app.use((req, res, next) => {
  // Make user data available to all templates
  res.locals.user = req.session.user || null;
  res.locals.isAdmin = req.session.isAdmin || false; // **EXISTING**
  res.locals.isModerator = req.session.isModerator || false; // **NEW**
  next();
});
// Place after app.use(session(...)) and before your routes
app.use((req, res, next) => {
  res.locals.isProd = process.env.NODE_ENV === "production";
  res.locals.isAdmin = req.session.user?.isAdmin || false;
  res.locals.GA_ID = process.env.GA_MEASUREMENT_ID; // Use your existing ID from Google
  next();
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.get(["/", "/home"], (req, res) => {
  res.render("home", {
    user: req.session.user || null,
  });
});

app.get("/register", (req, res) => {
  if (req.session.userId) {
    // User is already logged in, redirect to home or dashboard
    return res.redirect("/home");
  }
  res.render("register", { countryOptions, countryPlaceholders });
});

app.get("/onboarding", isLoggedIn, findUser, (req, res) => {
  const user = req.userData;

  // Check if user has completed onboarding
  // if (user.profileSlug && user.name && user.age && user.country) {
  //   return res.redirect(`/account/info`);
  // }

  res.render("onboarding", { user });
});
// **NEW**: Save onboarding step
app.post("/api/onboarding/save", isLoggedIn, findUser, async (req, res) => {
  try {
    const user = req.userData;
    const { step, data } = req.body;

    console.log(`Onboarding step ${step} data:`, data);

    // Update user fields based on step
    Object.keys(data).forEach((key) => {
      if (data[key] !== undefined && data[key] !== "" && data[key] !== "N/A") {
        user[key] = data[key];
      }
    });

    // Generate profile slug when we have enough data (step 1)
    if (step === 1 && user.name) {
      user.profileSlug = await generateUniqueSlug(user);
    }

    await user.save();

    // Update session
    req.session.user = user;

    res.json({
      success: true,
      message: `Step ${step} completed successfully!`,
      isLastStep: step === 4,
    });
  } catch (error) {
    console.error("Onboarding save error:", error);
    res.json({
      success: false,
      error: `Failed to save step: ${error.message}`,
    });
  }
});

// **NEW**: Complete onboarding
// Update the complete onboarding route:

app.post("/api/onboarding/complete", isLoggedIn, findUser, async (req, res) => {
  try {
    const user = req.userData;

    // Ensure user has profile slug
    if (!user.profileSlug) {
      user.profileSlug = await generateUniqueSlug(user);
      await user.save();
    }

    res.json({
      success: true,
      redirectUrl: `/account/info?from=onboarding`,
    });
  } catch (error) {
    console.error("Complete onboarding error:", error);
    res.json({
      success: false,
      error: "Failed to complete onboarding",
    });
  }
});
app.get("/api/profile-completion", isLoggedIn, findUser, async (req, res) => {
  try {
    const user = req.userData;
    const completion = calculateProfileCompletion(user);

    res.json({
      success: true,
      completion,
    });
  } catch (error) {
    console.error("Profile completion error:", error);
    res.json({
      success: false,
      error: "Failed to calculate profile completion",
    });
  }
});
app.get("/login", (req, res) => {
  if (req.session.userId) {
    // User is already logged in, redirect to home or dashboard
    return res.redirect("/home");
  }
  res.render("login");
});

// Place this after session and before your protected routes
app.post("/account/update", isLoggedIn, findUser, async (req, res) => {
  console.log("Account update request body:", req.body);

  try {
    const user = req.userData;
    const formData = req.body;
    // **NEW**: Validate minimum character requirements
    const minCharFields = {
      aboutMe: 5,
      islamIsImportantToMeInfo: 5,
      describeNature: 5,
      lookingForASpouseThatIs: 5,
    };

    for (const [field, minLength] of Object.entries(minCharFields)) {
      const value = formData[field];
      if (value && value.trim().length < minLength) {
        return res.json({
          error: `${field
            .replace(/([A-Z])/g, " $1")
            .toLowerCase()} must be at least ${minLength} characters long`,
        });
      }
    }

    // Basic Info Tab
    if (formData.name) user.name = formData.name;
    if (formData.age !== undefined)
      user.age = parseInt(formData.age) || user.age;
    if (formData.gender) user.gender = formData.gender;
    if (formData.maritalStatus && formData.maritalStatus !== "N/A") {
      user.maritalStatus = formData.maritalStatus; // Handle as string enum
    }
    if (formData.work) user.work = formData.work;
    if (formData.aboutMe) user.aboutMe = formData.aboutMe;

    // Handle hobbies as comma-separated array
    if (formData.hobbies && Array.isArray(formData.hobbies)) {
      user.hobbies = formData.hobbies;
    }

    // Contact & Location Tab
    if (formData.contact) user.contact = formData.contact;
    if (formData.waliMyContactDetails)
      user.waliMyContactDetails = formData.waliMyContactDetails;
    if (formData.adress) user.adress = formData.adress;
    if (formData.city) user.city = formData.city;
    if (formData.state) user.state = formData.state;
    if (formData.country) user.country = formData.country;
    if (formData.nationality) user.nationality = formData.nationality;
    if (formData.birthPlace) user.birthPlace = formData.birthPlace;
    if (formData.willingToRelocate !== undefined)
      user.willingToRelocate =
        formData.willingToRelocate === true ||
        formData.willingToRelocate === "true";

    // Handle languages as array
    if (formData.languagesSpoken && Array.isArray(formData.languagesSpoken)) {
      user.languagesSpoken = formData.languagesSpoken;
    }

    // Physical Appearance Tab
    if (formData.height !== undefined)
      user.height = parseInt(formData.height) || user.height;
    if (formData.build) user.build = formData.build;
    if (formData.eyeColor) user.eyeColor = formData.eyeColor;
    if (formData.hairColor) user.hairColor = formData.hairColor;
    if (formData.complexion) user.complexion = formData.complexion;
    if (formData.ethnicity) user.ethnicity = formData.ethnicity;
    if (formData.disability) user.disability = formData.disability;
    if (formData.smoker !== undefined)
      user.smoker = formData.smoker === true || formData.smoker === "true";

    // Religion & Faith Tab
    if (formData.religion) user.religion = formData.religion;
    if (formData.caste) user.caste = formData.caste;
    if (formData.islamicSect) user.islamicSect = formData.islamicSect;
    if (formData.bornMuslim !== undefined)
      user.bornMuslim =
        formData.bornMuslim === true || formData.bornMuslim === "true";
    if (formData.prays !== undefined)
      user.prays = formData.prays === true || formData.prays === "true";
    if (formData.celebratesMilaad !== undefined)
      user.celebratesMilaad =
        formData.celebratesMilaad === true ||
        formData.celebratesMilaad === "true";
    if (formData.celebrateKhatams !== undefined)
      user.celebrateKhatams =
        formData.celebrateKhatams === true ||
        formData.celebrateKhatams === "true";
    if (formData.islamIsImportantToMeInfo)
      user.islamIsImportantToMeInfo = formData.islamIsImportantToMeInfo;

    // Family & Background Tab
    if (formData.fatherName) user.fatherName = formData.fatherName;
    if (formData.motherName) user.motherName = formData.motherName;
    if (formData.fatherProfession)
      user.fatherProfession = formData.fatherProfession;
    if (formData.siblings !== undefined)
      user.siblings = parseInt(formData.siblings) || user.siblings;
    if (formData.livingArrangementsAfterMarriage)
      user.livingArrangementsAfterMarriage =
        formData.livingArrangementsAfterMarriage;
    if (formData.futurePlans) user.futurePlans = formData.futurePlans;
    if (formData.whoCompletedProfile)
      user.whoCompletedProfile = formData.whoCompletedProfile;
    if (formData.describeNature) user.describeNature = formData.describeNature;
    if (formData.anySpecialInformationPeopleShouldKnow)
      user.anySpecialInformationPeopleShouldKnow =
        formData.anySpecialInformationPeopleShouldKnow;
    if (
      formData.qualitiesYouNeedInYourPartner &&
      Array.isArray(formData.qualitiesYouNeedInYourPartner)
    ) {
      user.qualitiesYouNeedInYourPartner =
        formData.qualitiesYouNeedInYourPartner;
    }
    // Handle qualities as array
    if (
      formData.QualitiesThatYouCanBringToYourMarriage &&
      Array.isArray(formData.QualitiesThatYouCanBringToYourMarriage)
    ) {
      user.QualitiesThatYouCanBringToYourMarriage =
        formData.QualitiesThatYouCanBringToYourMarriage;
    }

    // Handle dynamic education array
    if (formData.education && Array.isArray(formData.education)) {
      user.education = formData.education.filter(
        (edu) => edu && (edu.title || edu.institute || edu.year)
      );
    }

    // Handle dynamic children array
    if (formData.children && Array.isArray(formData.children)) {
      user.children = formData.children.filter(
        (child) => child && (child.name || child.age || child.livingLocation)
      );
    }

    // Partner Preferences Tab
    if (formData.preferredAgeRange)
      user.preferredAgeRange = formData.preferredAgeRange;
    if (formData.preferredHeightRange)
      user.preferredHeightRange = formData.preferredHeightRange;
    if (formData.preferredCaste) user.preferredCaste = formData.preferredCaste;
    if (formData.preferredEthnicity)
      user.preferredEthnicity = formData.preferredEthnicity;
    if (formData.allowParnterToWork !== undefined)
      user.allowParnterToWork =
        formData.allowParnterToWork === true ||
        formData.allowParnterToWork === "true";
    if (formData.allowPartnerToStudy !== undefined)
      user.allowPartnerToStudy =
        formData.allowPartnerToStudy === true ||
        formData.allowPartnerToStudy === "true";

    // Acceptance preferences
    if (formData.acceptSomeoneWithChildren !== undefined)
      user.acceptSomeoneWithChildren =
        formData.acceptSomeoneWithChildren === true ||
        formData.acceptSomeoneWithChildren === "true";
    if (formData.acceptADivorcedPerson !== undefined)
      user.acceptADivorcedPerson =
        formData.acceptADivorcedPerson === true ||
        formData.acceptADivorcedPerson === "true";
    if (formData.acceptAWidow !== undefined)
      user.acceptAWidow =
        formData.acceptAWidow === true || formData.acceptAWidow === "true";
    if (formData.agreesWithPolygamy !== undefined)
      user.agreesWithPolygamy =
        formData.agreesWithPolygamy === true ||
        formData.agreesWithPolygamy === "true";
    if (formData.AcceptSomeoneWithBeard !== undefined)
      user.AcceptSomeoneWithBeard =
        formData.AcceptSomeoneWithBeard === true ||
        formData.AcceptSomeoneWithBeard === "true";
    if (formData.AcceptSomeoneWithHijab !== undefined)
      user.AcceptSomeoneWithHijab =
        formData.AcceptSomeoneWithHijab === true ||
        formData.AcceptSomeoneWithHijab === "true";
    if (formData.ConsiderARevert !== undefined)
      user.ConsiderARevert =
        formData.ConsiderARevert === true ||
        formData.ConsiderARevert === "true";
    if (formData.acceptSomeoneInOtherCountry !== undefined)
      user.acceptSomeoneInOtherCountry =
        formData.acceptSomeoneInOtherCountry === true ||
        formData.acceptSomeoneInOtherCountry === "true";
    if (formData.willingToSharePhotosUponRequest !== undefined)
      user.willingToSharePhotosUponRequest =
        formData.willingToSharePhotosUponRequest === true ||
        formData.willingToSharePhotosUponRequest === "true";
    if (formData.willingToMeetUpOutside !== undefined)
      user.willingToMeetUpOutside =
        formData.willingToMeetUpOutside === true ||
        formData.willingToMeetUpOutside === "true";
    if (formData.willingToConsiderANonUkCitizen !== undefined)
      user.willingToConsiderANonUkCitizen =
        formData.willingToConsiderANonUkCitizen === true ||
        formData.willingToConsiderANonUkCitizen === "true";
    // Save the updated user
    const fieldsAffectingSlug = [
      "name",
      "birthPlace",
      "city",
      "country",
      "nationality",
      "age",
    ];
    const shouldUpdateSlug = fieldsAffectingSlug.some(
      (field) => formData[field] !== undefined
    );

    if (shouldUpdateSlug) {
      user.profileSlug = await generateUniqueSlug(user);
      console.log("Updated profile slug:", user.profileSlug);
    }

    await user.save();

    // Update session user data
    req.session.user = user;

    console.log("User profile updated successfully:", user.username);
    res.json({ success: true, message: "Profile updated successfully!" });
  } catch (error) {
    console.error("Account update error:", error);
    res.json({ error: `Failed to update profile: ${error.message}` });
  }
});

// new register post
app.post("/register", async (req, res) => {
  console.log("Register request body:", req.body);

  const { username, email, password, gender } = req.body;
  console.log("Session verification status:", {
    emailVerified: req.session.emailVerified,
    verifiedEmail: req.session.verifiedEmail,
    providedEmail: email?.toLowerCase(),
    match: req.session.verifiedEmail === email?.toLowerCase(),
  });

  if (!username || !password || !gender) {
    console.log("required fields missing");
    return res.render("register", {
      error: "Username, password, and gender are required.",
    });
  }

  // **NEW**: Check if email is verified
  // if (
  //   !req.session.emailVerified ||
  //   req.session.verifiedEmail !== email.toLowerCase()
  // ) {
  //   console.log("Email verification failed:", {
  //     emailVerified: req.session.emailVerified,
  //     verifiedEmail: req.session.verifiedEmail,
  //     providedEmail: email.toLowerCase(),
  //   });
  //   return res.render("register", {
  //     error: "Please verify your email before registering.",
  //   });
  // }

  // **UPDATED**: Only check email verification if email was provided
  if (email && email.trim()) {
    if (
      !req.session.emailVerified ||
      req.session.verifiedEmail !== email.toLowerCase()
    ) {
      console.log("Email provided but not verified");
      return res.render("register", {
        error:
          "Please verify your email address or leave it empty to register without email.",
      });
    }
  }

  // Check passcode
  // **NEW**: Check if passcode was verified in the verification step
  if (!req.session.passcodeVerified) {
    return res.render("register", {
      error: "Please verify your mobile number and passcode first.",
    });
  }

  // **NEW**: Store the verified mobile number in user data
  const verifiedMobile = req.session.verifiedMobile;

  // Check password length
  if (!password || password.length < 5) {
    return res.render("register", {
      error: "Password must be at least 5 characters long.",
    });
  }

  // Check if gender is valid
  if (gender !== "male" && gender !== "female") {
    return res.render("register", {
      error: "Please select a valid gender.",
    });
  }

  // Check unique username and email
  // const existingUser = await User.findOne({
  //   $or: [{ username }, { email: email.toLowerCase() }],
  // });
  // if (existingUser) {
  //   return res.render("register", {
  //     error: "Username or email already exists. Please try different ones.",
  //   });
  // }
  // Build query for existing user check
  let existingUserQuery = { username };
  if (email && email.trim()) {
    existingUserQuery = {
      $or: [{ username }, { email: email.toLowerCase() }],
    };
  }

  const existingUser = await User.findOne(existingUserQuery);
  if (existingUser) {
    const errorMsg =
      email && email.trim()
        ? "Username or email already exists. Please try different ones."
        : "Username already exists. Please try a different one.";
    return res.render("register", { error: errorMsg });
  }

  try {
    console.log("Creating user...");
    const hashedPassword = await bcrypt.hash(password, 12);
    // const newUser = new User({
    //   username,
    //   email: email.toLowerCase(), // **NEW**
    //   password: hashedPassword,
    //   gender,
    //   isEmailVerified: true, // **NEW**: Set as verified since they passed verification
    //   registrationSource: "register",
    // });
    const userData = {
      username,
      password: hashedPassword,
      gender,
      registrationSource: "register",
      contact: verifiedMobile,
    };

    // **OPTIONAL**: Only add email if provided
    if (email && email.trim()) {
      userData.email = email.toLowerCase();
      // Only set as verified if they actually verified it
      userData.isEmailVerified =
        req.session.emailVerified &&
        req.session.verifiedEmail === email.toLowerCase();
    }

    const newUser = new User(userData);

    newUser.profileSlug = await generateUniqueSlug(newUser);
    await newUser.save();
    console.log("User created successfully:", newUser.username);
    req.session.userId = newUser._id;
    req.session.user = newUser;
    // Clean up verification session data
    delete req.session.emailVerified;
    delete req.session.verifiedEmail;
    delete req.session.passcodeVerified; // **NEW**
    delete req.session.verifiedMobile; // **NEW**

    return res.redirect("/onboarding");
  } catch (error) {
    console.error("Registration error:", error);
    return res.render("register", {
      error: "Registration failed. Please try again.",
    });
  }
});
// **NEW**: Passcode verification route
app.post("/api/verify-passcode", async (req, res) => {
  try {
    const { countryCode, mobileNumber, passcode } = req.body;

    if (!countryCode || !mobileNumber || !passcode) {
      return res.json({
        success: false,
        error: "All fields are required",
      });
    }

    // Clean the mobile number (remove any spaces, hyphens, etc.)
    const cleanMobile = mobileNumber.replace(/\D/g, "");

    if (cleanMobile.length < 7) {
      return res.json({
        success: false,
        error: "Please enter a valid mobile number",
      });
    }

    // Get the last 3 digits of the mobile number
    const lastThreeDigits = cleanMobile.slice(-3);

    // Base passcode is always "1111" (even length)
    const basePasscode = process.env.PASSCODE;

    // Generate expected passcode using the logic:
    // First digit at start, second digit in middle, third digit at end
    const firstDigit = lastThreeDigits[0];
    const secondDigit = lastThreeDigits[1];
    const thirdDigit = lastThreeDigits[2];

    // Insert: first digit at start, second in middle (position 2), third at end
    const expectedPasscode =
      firstDigit +
      basePasscode.substring(0, 2) +
      secondDigit +
      basePasscode.substring(2) +
      thirdDigit;

    console.log("Passcode verification:", {
      mobile: countryCode + cleanMobile,
      lastThreeDigits,
      expectedPasscode,
      providedPasscode: passcode,
    });

    if (passcode === expectedPasscode) {
      // Store verification in session
      req.session.passcodeVerified = true;
      req.session.verifiedMobile = countryCode + cleanMobile;

      res.json({
        success: true,
        message: "Mobile number and passcode verified successfully",
      });
    } else {
      res.json({
        success: false,
        error: "Your number and passcode do not match. please, try again",
      });
    }
  } catch (error) {
    console.error("Passcode verification error:", error);
    res.json({
      success: false,
      error: "Verification failed. Please try again.",
    });
  }
});
app.post("/login", async (req, res) => {
  const { username, password, remember } = req.body;
  console.log("received");

  // Check if it's admin login first
  if (
    username === process.env.ADMIN_USERNAME &&
    password === process.env.ADMIN_PASSWORD
  ) {
    req.session.isAdmin = true;
    req.session.isModerator = false; // **NEW**
    req.session.adminUsername = username;
    // Create a user object for admin with isAdmin flag
    req.session.user = {
      username: username,
      isAdmin: true,
      isModerator: false,
    };

    if (remember === "true" || remember === true) {
      req.session.cookie.maxAge = 1000 * 60 * 60 * 24 * 30; // 30 days
    } else {
      req.session.cookie.expires = false; // Session cookie
    }

    return res.json({ success: true, redirect: "/admin/dashboard" });
  }
  // **NEW**: Check if it's moderator login
  if (
    username === process.env.MODERATOR_USERNAME &&
    password === process.env.MODERATOR_PASSWORD
  ) {
    req.session.isAdmin = false; // **NEW**
    req.session.isModerator = true; // **NEW**
    req.session.adminUsername = username;
    req.session.user = {
      username: username,
      isAdmin: false,
      isModerator: true, // **NEW**
    };

    if (remember === "true" || remember === true) {
      req.session.cookie.maxAge = 1000 * 60 * 60 * 24 * 30; // 30 days
    } else {
      req.session.cookie.expires = false; // Session cookie
    }

    return res.json({ success: true, redirect: "/admin/dashboard" });
  }
  // If not admin,or moderator try user login
  const foundUser = await User.findOne({
    $or: [{ username: username }, { email: username.toLowerCase() }],
  });
  if (!foundUser) {
    return res.json({ error: "username or password is incorrect" });
  }

  const isMatch = await bcrypt.compare(password, foundUser.password);
  if (isMatch) {
    req.session.userId = foundUser._id;
    // Ensure user object has isAdmin flag
    const userObj = foundUser.toObject();
    userObj.isAdmin = false; // Regular users are not admin
    userObj.isModerator = false; // Regular users are not moderator
    req.session.user = userObj;

    if (remember === "true" || remember === true) {
      req.session.cookie.maxAge = 1000 * 60 * 60 * 24 * 30; // 30 days
    } else {
      req.session.cookie.expires = false; // Session cookie (browser closes = logout)
    }

    const redirectUrl = req.session.returnTo || "/home";
    delete req.session.returnTo;

    return res.json({ success: true, redirect: redirectUrl });
  } else {
    return res.json({ error: "username or password is incorrect" });
  }
});

// Middleware to check and create notifications after login
app.use(async (req, res, next) => {
  // Only run for logged-in regular users (not admin)
  if (req.session.userId && !req.session.isAdmin) {
    try {
      // Check for email notification
      await NotificationService.checkAndCreateEmailNotification(
        req.session.userId
      );
    } catch (error) {
      console.error("Error in notification middleware:", error);
    }
  }
  next();
});

app.get("/logout", (req, res) => {
  const wasAdmin = req.session.isAdmin;
  const wasModerator = req.session.isModerator; // **NEW**

  req.session.destroy((err) => {
    if (err) {
      return res.send("error logging out");
    }
    res.clearCookie("connect.sid");

    // Redirect to appropriate page based on user type
    if (wasAdmin || wasModerator) {
      // **UPDATED**
      res.redirect("/login");
    } else {
      res.redirect("/home");
    }
  });
});

app.get(["/account", "/account/info"], isLoggedIn, findUser, (req, res) => {
  const accountInfo = req.userData;
  res.render("account/info", { accountInfo });
});

app.get("/account/pendingRequests", isLoggedIn, async (req, res) => {
  const beinglikeduser = await User.findById(req.session.userId).populate({
    path: "likeRequests",
    match: { status: "pending" },
    populate: [{ path: "from", model: "User" }],
  });
  const pendinglikeRequests = beinglikeduser.likeRequests;
  res.render("account/pendingLikeRequests", { pendinglikeRequests });
});
app.get("/account/acceptedRequests", isLoggedIn, async (req, res) => {
  const beinglikeduser = await User.findById(req.session.userId).populate({
    path: "likeRequests",
    match: { status: "accepted" },
    populate: [
      { path: "from", model: "User" },
      // { path: "to", model: "User" },
    ],
  });
  const acceptedlikeRequests = beinglikeduser.likeRequests;
  res.render("account/acceptedLikeRequests", { acceptedlikeRequests });
});

app.post("/requests/:id/accept", isLoggedIn, async (req, res) => {
  try {
    const requestId = req.params.id;

    const request = await Request.findById(requestId);
    if (!request) {
      return res.status(404).json({ error: "Request not found" });
    }

    // Check if current user is the recipient
    if (request.to.toString() !== req.session.userId) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // Update request status
    request.status = "accepted";
    await request.save();

    // Get both users
    const requestFromUser = await User.findById(request.from);
    const requestToUser = await User.findById(request.to);

    // Grant MUTUAL access (both users can see each other's full profiles)
    if (!requestFromUser.canAccessFullProfileOf.includes(requestToUser._id)) {
      requestFromUser.canAccessFullProfileOf.push(requestToUser._id);
    }

    if (!requestToUser.canAccessFullProfileOf.includes(requestFromUser._id)) {
      requestToUser.canAccessFullProfileOf.push(requestFromUser._id);
    }

    await requestFromUser.save();
    await requestToUser.save();

    await NotificationService.createNotification({
      userId: request.from._id,
      type: "request_accepted",
      title: "Request Accepted!",
      message: `Congratulations! Your request was accepted by ${
        request.to.name || request.to.username
      }.`,
      priority: "high",
      actionUrl: `/profiles/${request.to.profileSlug || request.to._id}`,
      actionText: "View Profile",
    });
    console.log(
      `User ${request.to.username} accepted request from ${request.from.username}`
    );

    return res.redirect("/account/pendingRequests");
  } catch (error) {
    console.error("Error accepting request:", error);
    return res.status(500).json({ error: "Failed to accept request" });
  }
});
// Replace the existing /requests/:id/reject route
app.post("/requests/:id/reject", isLoggedIn, async (req, res) => {
  try {
    const requestId = req.params.id;

    const request = await Request.findById(requestId);
    if (!request) {
      return res.status(404).json({ error: "Request not found" });
    }

    // Check if current user is the recipient
    if (request.to.toString() !== req.session.userId) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // Update request status
    request.status = "rejected";
    await request.save();

    // Remove sender's access to receiver's profile
    // (Receiver had granted access for sender to be seen during decision)
    const requestToUser = await User.findById(request.to);
    const requestFromUser = await User.findById(request.from);

    // Remove sender from receiver's access list
    requestToUser.canAccessFullProfileOf.pull(request.from);

    await requestToUser.save();
    await requestFromUser.save();
    await NotificationService.createNotification({
      userId: request.from._id,
      type: "request_rejected",
      title: "Request Declined",
      message: `Your request was declined by ${
        request.to.name || request.to.username
      }.`,
      priority: "medium",
      actionUrl: "/profiles",
      actionText: "Browse Profiles",
    });
    console.log(
      `User ${request.to.username} rejected request from ${request.from.username}`
    );
    return res.redirect("/account/pendingRequests");
  } catch (error) {
    console.error("Error rejecting request:", error);
    return res.status(500).json({ error: "Failed to reject request" });
  }
});

// Add this new API route for cancelling requests
app.post("/api/requests/:requestId/cancel", isLoggedIn, async (req, res) => {
  try {
    const { requestId } = req.params;
    const requestToCancel = await Request.findById(requestId);

    if (!requestToCancel) {
      return res
        .status(404)
        .json({ success: false, error: "Request not found" });
    }

    // Check if current user is the sender
    if (requestToCancel.from.toString() !== req.session.userId) {
      return res.status(403).json({ success: false, error: "Unauthorized" });
    }

    const fromUserId = requestToCancel.from.toString();
    const toUserId = requestToCancel.to.toString();

    const fromUser = await User.findById(fromUserId);
    const toUser = await User.findById(toUserId);

    // Remove each other from access lists
    if (fromUser) {
      fromUser.canAccessFullProfileOf.pull(toUserId);
      await fromUser.save();
    }

    if (toUser) {
      toUser.canAccessFullProfileOf.pull(fromUserId);
      toUser.likeRequests.pull(requestId);
      await toUser.save();
    }

    // Delete the request
    await Request.findByIdAndDelete(requestId);

    res.json({
      success: true,
      message: "Request cancelled successfully",
    });
  } catch (error) {
    console.error("Error cancelling request:", error);
    res.status(500).json({
      success: false,
      error: "Failed to cancel request",
    });
  }
});
app.get("/profiles", async (req, res) => {
  // Pagination params
  const page = parseInt(req.query.page) > 0 ? parseInt(req.query.page) : 1;
  const limit = 10;
  const skip = (page - 1) * limit;

  // Extract filter parameters
  const { gender, minAge, maxAge, minHeight, maxHeight, city, nationality } =
    req.query;

  // Build filter object
  const filter = {};

  if (gender) filter.gender = gender;
  if (city) filter.city = { $regex: new RegExp(city, "i") };
  if (nationality) filter.nationality = nationality;

  // Age range filter
  if (minAge || maxAge) {
    filter.age = {};
    if (minAge) filter.age.$gte = parseInt(minAge);
    if (maxAge) filter.age.$lte = parseInt(maxAge);
  }

  // Height range filter - FIXED VERSION
  if (minHeight || maxHeight) {
    filter.height = {};
    if (minHeight) {
      const minHeightNum = parseFloat(minHeight);
      if (!isNaN(minHeightNum)) {
        filter.height.$gte = minHeightNum;
      }
    }
    if (maxHeight) {
      const maxHeightNum = parseFloat(maxHeight);
      if (!isNaN(maxHeightNum)) {
        filter.height.$lte = maxHeightNum;
      }
    }
  }

  try {
    // **NEW**: Get featured profiles (max 4, exclude current user)
    const featuredFilter = { isFeatured: true };

    const featuredProfiles = await User.find(featuredFilter)
      .limit(4)
      .sort({ featuredDate: -1 }); // Show most recently featured first

    // **UPDATED**: Exclude featured profiles from regular profiles to avoid duplicates
    // const excludeIds = [
    //   ...(req.session.userId ? [req.session.userId] : []),
    //   ...featuredProfiles.map((profile) => profile._id),
    // ];
    // filter._id = { $nin: excludeIds };
    const excludeIds = featuredProfiles.map((profile) => profile._id);
    if (excludeIds.length > 0) {
      filter._id = { $nin: excludeIds };
    }
    const totalProfiles = await User.countDocuments(filter);

    // **NEW**: Handle sorting
    const { sortBy } = req.query;
    let sortOptions = {};

    if (sortBy === "random") {
      // For random sorting, we'll use MongoDB's $sample aggregation
      const profiles = await User.aggregate([
        { $match: filter },
        { $sample: { size: Math.min(limit, totalProfiles) } },
      ]);
    } else {
      // Default: newly created (most recent first)
      sortOptions = { createdAt: -1, _id: -1 };
    }

    // **UPDATED**: Apply sorting based on sortBy parameter
    const profiles =
      sortBy === "random"
        ? await User.aggregate([
            { $match: filter },
            { $skip: skip },
            { $sample: { size: Math.min(limit, totalProfiles - skip) } },
          ])
        : await User.find(filter).sort(sortOptions).skip(skip).limit(limit);

    const activeFilters = {
      gender,
      minAge,
      maxAge,
      minHeight,
      maxHeight,
      city,
      nationality,
    };

    const totalPages = Math.ceil(totalProfiles / limit);

    return res.render("profiles", {
      featuredProfiles, // **NEW**
      profiles,
      filters: Object.keys(req.query).length > 0 ? activeFilters : null,
      sortBy: sortBy || "newly-created", // **NEW**
      page,
      totalPages,
      totalProfiles,
    });
  } catch (error) {
    console.error("Error fetching profiles:", error);
    return res.status(500).render("error", {
      title: "Error",
      message: "Failed to fetch profiles",
      error: process.env.NODE_ENV === "development" ? error : {},
    });
  }
});
app.get("/profiles/:slug", async (req, res) => {
  try {
    const { slug } = req.params;
    let foundProfile;

    // Check if it's an old MongoDB ID format (for backward compatibility)
    if (mongoose.Types.ObjectId.isValid(slug) && slug.length === 24) {
      foundProfile = await User.findById(slug);
    } else {
      // It's a slug - find by slug field
      foundProfile = await User.findOne({ profileSlug: slug });
    }

    if (!foundProfile) {
      return res.status(404).render("404", {
        title: "Profile Not Found - shadiamour",
        url: req.originalUrl,
      });
    }

    let canAccessFullProfile = false;
    let hasalreadysentrequest = false;

    // If admin, always grant full access
    if (req.session.isAdmin || req.session.isModerator) {
      canAccessFullProfile = true;
    } else if (req.session.userId) {
      const loggedUser = await User.findById(req.session.userId);

      // Check if current user can access this profile's private information
      if (
        loggedUser.canAccessFullProfileOf.some((userId) =>
          userId.equals(foundProfile._id)
        )
      ) {
        canAccessFullProfile = true;
      }

      // Check if user has already sent a pending request
      const existingRequest = await Request.findOne({
        from: req.session.userId,
        to: foundProfile._id,
        status: "pending",
      });

      if (existingRequest) {
        hasalreadysentrequest = true;
      }
    }

    res.render("profile", {
      profile: foundProfile,
      canAccessFullProfile,
      hasalreadysentrequest,
      user: req.session.user,
      isAdmin: req.session.isAdmin,
      filters: null,
    });
  } catch (err) {
    console.error("Profile route error:", err);
    res.status(500).render("error", {
      title: "Server Error",
      message: "Failed to load profile",
      error: process.env.NODE_ENV === "development" ? err : {},
    });
  }
});
app.post(
  "/interested/:id",
  isLoggedIn,
  requireProfileComplete,
  async (req, res) => {
    try {
      const beinglikeduserId = req.params.id; // receiver
      const likeUserId = req.session.userId; // sender

      // Check if target user exists
      const beingLikedUser = await User.findById(beinglikeduserId);
      if (!beingLikedUser) {
        return res.status(404).json({ error: "User not found" });
      }

      // Check if request already exists
      const existingRequest = await Request.findOne({
        from: likeUserId,
        to: beinglikeduserId,
        status: "pending",
      });

      if (existingRequest) {
        return res.json({ error: "Request already sent" });
      }

      // ONLY grant access to sender's profile to receiver
      // (Receiver can see sender's info to make decision)
      if (!beingLikedUser.canAccessFullProfileOf.includes(likeUserId)) {
        beingLikedUser.canAccessFullProfileOf.push(likeUserId);
      }

      // Create new request
      const newRequest = new Request({
        from: likeUserId,
        to: beinglikeduserId,
        status: "pending", // explicitly set as pending
      });

      await newRequest.save();

      // Add request to receiver's list
      if (!beingLikedUser.likeRequests.includes(newRequest._id)) {
        beingLikedUser.likeRequests.push(newRequest);
      }

      await beingLikedUser.save();

      return res.json({
        message: "Successfully sent your like request",
      });
    } catch (error) {
      console.error("Error sending request:", error);
      return res.status(500).json({
        error: "Failed to send request. Please try again.",
      });
    }
  }
);

// ...existing code...
app.get("/admin", (req, res) => {
  if (req.session.isAdmin) {
    return res.redirect("/admin/dashboard");
  }
  // Redirect to main login page instead of rendering separate admin login
  res.redirect("/login");
});
app.get("/admin/addUser", requireAdminOnly, (req, res) => {
  if (!req.session.isAdmin) return res.redirect("/admin");
  res.render("admin/addUser");
});
// app.get("/admin/dashboard", requireAdminOrModerator, async (req, res) => {
//   if (!req.session.isAdmin && !req.session.isModerator) {
//     return res.redirect("/login");
//   }

//   try {
//     // Get all users with registration source
//     const users = await User.find({}).sort({ createdAt: -1, _id: -1 });

//     // Calculate basic stats
//     const totalUsers = users.length;
//     const byAdmin = users.filter(
//       (user) => user.registrationSource === "admin"
//     ).length;
//     const bySelf = users.filter(
//       (user) => user.registrationSource === "register"
//     ).length;

//     const stats = {
//       totalUsers,
//       registrationSources: {
//         byAdmin,
//         bySelf,
//       },
//     };

//     res.render("admin/dashboard", { users, stats });
//   } catch (error) {
//     console.error("Dashboard error:", error);
//     res.render("admin/dashboard", {
//       users: [],
//       stats: {
//         totalUsers: 0,
//         registrationSources: {
//           byAdmin: 0,
//           bySelf: 0,
//         },
//       },
//     });
//   }
// });
app.get("/admin/dashboard", requireAdminOrModerator, async (req, res) => {
  if (!req.session.isAdmin && !req.session.isModerator) {
    return res.redirect("/login");
  }

  try {
    // **UPDATED**: Handle filter parameter
    const { filter } = req.query;

    // Build query based on filter
    let query = {};
    if (filter === "admin") {
      query.registrationSource = "admin";
    } else if (filter === "register") {
      query.registrationSource = "register";
    } else if (filter === "featured") {
      query.isFeatured = true;
    }
    // For 'all' or no filter, query remains empty (gets all users)

    // Get users with applied filter
    const users = await User.find(query).sort({ createdAt: -1, _id: -1 });

    // Calculate basic stats (always from all users, not filtered)
    const totalUsers = await User.countDocuments({});
    const byAdmin = await User.countDocuments({ registrationSource: "admin" });
    const bySelf = await User.countDocuments({
      registrationSource: "register",
    });
    const featuredCount = await User.countDocuments({ isFeatured: true }); // **NEW**

    const stats = {
      totalUsers,
      registrationSources: {
        byAdmin,
        bySelf,
      },
      featuredCount, // **NEW**
    };

    res.render("admin/dashboard", {
      users,
      stats,
      currentFilter: filter || "all", // **NEW**
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    res.render("admin/dashboard", {
      users: [],
      stats: {
        totalUsers: 0,
        registrationSources: {
          byAdmin: 0,
          bySelf: 0,
        },
        featuredCount: 0, // **NEW**
      },
      currentFilter: "all", // **NEW**
    });
  }
});
app.post("/admin/user/:id/edit", async (req, res) => {
  if (!req.session.isAdmin) return res.status(403).json({ error: "Forbidden" });
  const { id } = req.params;
  const allowedFields = [
    "name",
    "age",
    "gender",
    "country",
    "state",
    "city",
    "contact",
    "religion",
    "caste",
    "adress",
  ];
  const update = {};
  allowedFields.forEach((field) => {
    if (req.body[field] !== undefined) update[field] = req.body[field];
  });
  try {
    await User.findByIdAndUpdate(id, update);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Update failed" });
  }
});
app.post("/admin/user/:id/delete", requireAdminOnly, async (req, res) => {
  if (!req.session.isAdmin) return res.status(403).json({ error: "Forbidden" });
  const { id } = req.params;
  try {
    await User.findByIdAndDelete(id);
    // Optionally: delete related requests, images, etc.
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Delete failed" });
  }
});

app.post("/admin/user/add", requireAdminOnly, async (req, res) => {
  if (!req.session.isAdmin) return res.status(403).json({ error: "Forbidden" });

  console.log("Received user data:", req.body); // Debug log

  const {
    username,
    password,
    willingToConsiderANonUkCitizen,
    name,
    work,
    age,
    gender,
    country,
    state,
    city,
    contact,
    religion,
    caste,
    adress,
    eyeColor,
    hairColor,
    complexion,
    build,
    wearHijab,
    beard,
    height,
    languagesSpoken,
    education,
    nationality,
    ethnicity,
    maritalStatus,
    disability,
    disabilityInfo,
    smoker,
    bornMuslim,
    islamicSect,
    prays,
    celebratesMilaad,
    celebrateKhatams,
    islamIsImportantToMeInfo,
    acceptSomeoneWithChildren,
    acceptADivorcedPerson,
    agreesWithPolygamy,
    acceptAWidow,
    AcceptSomeoneWithBeard,
    AcceptSomeoneWithHijab,
    ConsiderARevert,
    livingArrangementsAfterMarriage,
    futurePlans,
    describeNature,
    QualitiesThatYouCanBringToYourMarriage,
    fatherName,
    motherName,
    fatherProfession,
    aboutMe,
    hobbies,
    willingToRelocate,
    preferredAgeRange,
    preferredHeightRange,
    preferredCaste,
    preferredEthnicity,
    allowParnterToWork,
    allowPartnerToStudy,
    acceptSomeoneInOtherCountry,
    qualitiesYouNeedInYourPartner,
    lookingForASpouseThatIs,
    willingToSharePhotosUponRequest,
    willingToMeetUpOutside,
    whoCompletedProfile,
    waliMyContactDetails,
    siblings,
    birthPlace,
    children,
    anySpecialInformationPeopleShouldKnow,
  } = req.body;

  // Validate required fields
  if (!password) {
    return res.json({ error: "Password is required" });
  }

  if (!username) {
    return res.json({
      error: "Username is required (should be auto-generated)",
    });
  }
  const minCharFields = {
    aboutMe: 5,
    islamIsImportantToMeInfo: 5,
    describeNature: 5,
    lookingForASpouseThatIs: 5,
  };

  for (const [field, minLength] of Object.entries(minCharFields)) {
    const value = req.body[field];
    if (value && value.trim().length < minLength) {
      return res.json({
        error: `${field
          .replace(/([A-Z])/g, " $1")
          .toLowerCase()} must be at least ${minLength} characters long`,
      });
    }
  }
  try {
    // Check if username already exists
    const existing = await User.findOne({ username });
    if (existing) {
      return res.json({ error: "Username already exists" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Process arrays (they should already be arrays from frontend)
    const languagesSpokenArr = Array.isArray(languagesSpoken)
      ? languagesSpoken
      : [];
    const qualitiesArr = Array.isArray(QualitiesThatYouCanBringToYourMarriage)
      ? QualitiesThatYouCanBringToYourMarriage
      : [];
    const hobbiesArr = Array.isArray(hobbies) ? hobbies : [];
    const qualitiesNeededArr = Array.isArray(qualitiesYouNeedInYourPartner)
      ? qualitiesYouNeedInYourPartner
      : [];

    // Process education and children arrays
    const educationArr = Array.isArray(education) ? education : [];
    const childrenArr = Array.isArray(children) ? children : [];

    // Create new user object with required fields
    const userData = {
      username,
      password: hashedPassword,
      gender,
      registrationSource: "admin",
    };

    // Add optional STRING fields only if they exist and are not "N/A"
    if (name && name !== "N/A") userData.name = name;
    if (work && work !== "N/A") userData.work = work;
    if (country && country !== "N/A") userData.country = country;
    if (state && state !== "N/A") userData.state = state;
    if (city && city !== "N/A") userData.city = city;
    if (contact && contact !== "N/A") userData.contact = contact;
    if (religion && religion !== "N/A") userData.religion = religion;
    if (caste && caste !== "N/A") userData.caste = caste;
    if (adress && adress !== "N/A") userData.adress = adress;
    if (eyeColor && eyeColor !== "N/A") userData.eyeColor = eyeColor;
    if (hairColor && hairColor !== "N/A") userData.hairColor = hairColor;
    if (complexion && complexion !== "N/A") userData.complexion = complexion;
    if (build && build !== "N/A") userData.build = build;
    if (wearHijab && wearHijab !== "N/A") userData.wearHijab = wearHijab;
    if (beard && beard !== "N/A") userData.beard = beard;
    if (nationality && nationality !== "N/A")
      userData.nationality = nationality;
    if (ethnicity && ethnicity !== "N/A") userData.ethnicity = ethnicity;
    if (islamicSect && islamicSect !== "N/A")
      userData.islamicSect = islamicSect;
    if (islamIsImportantToMeInfo && islamIsImportantToMeInfo !== "N/A")
      userData.islamIsImportantToMeInfo = islamIsImportantToMeInfo;
    if (
      livingArrangementsAfterMarriage &&
      livingArrangementsAfterMarriage !== "N/A"
    )
      userData.livingArrangementsAfterMarriage =
        livingArrangementsAfterMarriage;
    if (futurePlans && futurePlans !== "N/A")
      userData.futurePlans = futurePlans;
    if (describeNature && describeNature !== "N/A")
      userData.describeNature = describeNature;
    if (fatherName && fatherName !== "N/A") userData.fatherName = fatherName;
    if (motherName && motherName !== "N/A") userData.motherName = motherName;
    if (fatherProfession && fatherProfession !== "N/A")
      userData.fatherProfession = fatherProfession;
    if (aboutMe && aboutMe !== "N/A") userData.aboutMe = aboutMe;
    if (preferredAgeRange && preferredAgeRange !== "N/A")
      userData.preferredAgeRange = preferredAgeRange;
    if (preferredHeightRange && preferredHeightRange !== "N/A")
      userData.preferredHeightRange = preferredHeightRange;
    if (preferredCaste && preferredCaste !== "N/A")
      userData.preferredCaste = preferredCaste;
    if (preferredEthnicity && preferredEthnicity !== "N/A")
      userData.preferredEthnicity = preferredEthnicity;
    if (lookingForASpouseThatIs && lookingForASpouseThatIs !== "N/A")
      userData.lookingForASpouseThatIs = lookingForASpouseThatIs;
    if (whoCompletedProfile && whoCompletedProfile !== "N/A")
      userData.whoCompletedProfile = whoCompletedProfile;
    if (waliMyContactDetails && waliMyContactDetails !== "N/A")
      userData.waliMyContactDetails = waliMyContactDetails;
    if (birthPlace && birthPlace !== "N/A") userData.birthPlace = birthPlace;
    if (
      anySpecialInformationPeopleShouldKnow &&
      anySpecialInformationPeopleShouldKnow !== "N/A"
    )
      userData.anySpecialInformationPeopleShouldKnow =
        anySpecialInformationPeopleShouldKnow;

    // Handle MARITAL STATUS (enum field)
    if (maritalStatus && maritalStatus !== "N/A") {
      userData.maritalStatus = maritalStatus;
    }

    // Handle DISABILITY (special logic)
    if (disability && disability !== "N/A") {
      if (disability === "yes" && disabilityInfo && disabilityInfo.trim()) {
        userData.disability = disabilityInfo.trim();
      } else if (disability === "no") {
        userData.disability = "no";
      } else if (disability !== "yes") {
        userData.disability = disability;
      }
    }

    // Handle NUMERIC fields (convert and validate)
    if (age && age !== "N/A" && age !== "") {
      const ageNum = parseInt(age);
      if (!isNaN(ageNum)) userData.age = ageNum;
    }
    if (height && height !== "N/A" && height !== "") {
      const heightNum = parseInt(height);
      if (!isNaN(heightNum)) userData.height = heightNum;
    }
    if (siblings !== undefined && siblings !== "N/A" && siblings !== "") {
      const siblingsNum = parseInt(siblings);
      if (!isNaN(siblingsNum)) userData.siblings = siblingsNum;
    }

    // Handle BOOLEAN fields - only save if not "N/A" and convert to proper boolean
    if (smoker !== undefined && smoker !== "N/A") {
      userData.smoker = smoker === "true";
    }
    if (bornMuslim !== undefined && bornMuslim !== "N/A") {
      userData.bornMuslim = bornMuslim === "true";
    }
    if (prays !== undefined && prays !== "N/A") {
      userData.prays = prays === "true";
    }
    if (celebratesMilaad !== undefined && celebratesMilaad !== "N/A") {
      userData.celebratesMilaad = celebratesMilaad === "true";
    }
    if (celebrateKhatams !== undefined && celebrateKhatams !== "N/A") {
      userData.celebrateKhatams = celebrateKhatams === "true";
    }
    if (willingToRelocate !== undefined && willingToRelocate !== "N/A") {
      userData.willingToRelocate = willingToRelocate;
    }
    if (allowParnterToWork !== undefined && allowParnterToWork !== "N/A") {
      userData.allowParnterToWork = allowParnterToWork === "true";
    }
    if (allowPartnerToStudy !== undefined && allowPartnerToStudy !== "N/A") {
      userData.allowPartnerToStudy = allowPartnerToStudy === "true";
    }
    if (
      acceptSomeoneWithChildren !== undefined &&
      acceptSomeoneWithChildren !== "N/A"
    ) {
      userData.acceptSomeoneWithChildren = acceptSomeoneWithChildren === "true";
    }
    if (
      acceptADivorcedPerson !== undefined &&
      acceptADivorcedPerson !== "N/A"
    ) {
      userData.acceptADivorcedPerson = acceptADivorcedPerson === "true";
    }
    if (agreesWithPolygamy !== undefined && agreesWithPolygamy !== "N/A") {
      userData.agreesWithPolygamy = agreesWithPolygamy === "true";
    }
    if (acceptAWidow !== undefined && acceptAWidow !== "N/A") {
      userData.acceptAWidow = acceptAWidow === "true";
    }
    if (
      AcceptSomeoneWithBeard !== undefined &&
      AcceptSomeoneWithBeard !== "N/A"
    ) {
      userData.AcceptSomeoneWithBeard = AcceptSomeoneWithBeard === "true";
    }
    if (
      AcceptSomeoneWithHijab !== undefined &&
      AcceptSomeoneWithHijab !== "N/A"
    ) {
      userData.AcceptSomeoneWithHijab = AcceptSomeoneWithHijab === "true";
    }
    if (ConsiderARevert !== undefined && ConsiderARevert !== "N/A") {
      userData.ConsiderARevert = ConsiderARevert === "true";
    }
    if (
      acceptSomeoneInOtherCountry !== undefined &&
      acceptSomeoneInOtherCountry !== "N/A"
    ) {
      userData.acceptSomeoneInOtherCountry = acceptSomeoneInOtherCountry;
    }
    if (
      willingToSharePhotosUponRequest !== undefined &&
      willingToSharePhotosUponRequest !== "N/A"
    ) {
      userData.willingToSharePhotosUponRequest =
        willingToSharePhotosUponRequest;
    }
    if (
      willingToMeetUpOutside !== undefined &&
      willingToMeetUpOutside !== "N/A"
    ) {
      userData.willingToMeetUpOutside = willingToMeetUpOutside;
    }
    if (
      willingToConsiderANonUkCitizen !== undefined &&
      willingToConsiderANonUkCitizen !== "N/A"
    ) {
      userData.willingToConsiderANonUkCitizen = willingToConsiderANonUkCitizen;
    }

    // Handle ARRAYS - only add if they have content
    if (languagesSpokenArr.length > 0) {
      userData.languagesSpoken = languagesSpokenArr;
    }
    if (qualitiesArr.length > 0) {
      userData.QualitiesThatYouCanBringToYourMarriage = qualitiesArr;
    }
    if (hobbiesArr.length > 0) {
      userData.hobbies = hobbiesArr;
    }
    if (qualitiesNeededArr.length > 0) {
      userData.qualitiesYouNeedInYourPartner = qualitiesNeededArr;
    }
    if (educationArr.length > 0) {
      userData.education = educationArr;
    }
    if (childrenArr.length > 0) {
      userData.children = childrenArr;
    }

    console.log("Creating user with data:", userData); // Debug log

    // Create and save user
    const user = new User(userData);
    user.profileSlug = await generateUniqueSlug(user);
    console.log("Generated slug:", user.profileSlug);
    await user.save();

    console.log("User created successfully:", user.username); // Debug log
    res.json({ success: true, message: "User created successfully" });
  } catch (err) {
    console.error("Add user error:", err);
    res.json({ error: `Failed to add user: ${err.message}` });
  }
});
app.get("/admin/user/:id", requireAdminOrModerator, async (req, res) => {
  if (!req.session.isAdmin) return res.redirect("/admin");
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).send("User not found");

  // Requests where this user is involved
  const Request = require("./models/Request");
  const userRequests = await Request.find({
    $or: [{ from: user._id }, { to: user._id }],
  }).populate("from to");
  const pendingRequests = userRequests.filter((r) => r.status === "pending");
  const acceptedRequests = userRequests.filter((r) => r.status === "accepted");

  res.render("admin/userProfile", {
    user,
    userRequests,
    pendingRequests,
    acceptedRequests,
  });
});
app.get("/generate-username", async (req, res) => {
  const { gender } = req.query;
  if (!gender || (gender !== "male" && gender !== "female")) {
    return res.json({ username: "" });
  }
  // Find the highest number for the gender prefix
  const prefix = gender === "male" ? "M" : "F";
  const regex = new RegExp(`^${prefix}(\\d+)$`);
  const users = await User.find({ username: { $regex: regex } }).select(
    "username"
  );
  let maxNum = 0;
  users.forEach((u) => {
    const match = u.username.match(regex);
    if (match && Number(match[1]) > maxNum) {
      maxNum = Number(match[1]);
    }
  });
  const username = `${prefix}${maxNum + 1}`;
  res.json({ username });
});

// Add these routes after your existing admin routes (around line 385, after the generate-username route)

// Edit User Page Route
app.get("/admin/edit-user/:id", requireAdminOnly, async (req, res) => {
  if (!req.session.isAdmin) {
    return res.redirect("/admin");
  }

  try {
    const userId = req.params.id;
    const userToEdit = await User.findById(userId);

    if (!userToEdit) {
      return res.status(404).send("User not found");
    }

    res.render("admin/editUser", { userToEdit });
  } catch (error) {
    console.error("Admin edit user error:", error);
    res.redirect("/admin/dashboard");
  }
});

// Update User Route
// Replace the entire /admin/user/update route with this corrected version:
const profileUpload = multer({ storage }).fields([
  { name: "profilePic", maxCount: 1 },
  { name: "coverPhoto", maxCount: 1 },
]);
app.post("/admin/user/update", profileUpload, async (req, res) => {
  try {
    let updateData, userId;

    if (req.files || req.body.userData) {
      // FormData request with files
      userId = req.body.userId;
      updateData = req.body.userData ? JSON.parse(req.body.userData) : {};
      console.log(
        "FormData request - userId:",
        userId,
        "files:",
        Object.keys(req.files || {})
      );
    } else {
      // JSON request without files
      const { userId: id, ...data } = req.body;
      userId = id;
      updateData = data;
      console.log("JSON request - userId:", userId);
    }

    if (!userId) {
      return res.json({ error: "User ID is required" });
    }

    // Authorization check
    const isAdmin = req.session.isAdmin;
    const isUserUpdatingSelf =
      req.session.userId && req.session.userId === userId;

    if (!isAdmin && !isUserUpdatingSelf) {
      console.log("Access denied:", {
        isAdmin,
        isUserUpdatingSelf,
        sessionUserId: req.session.userId,
        targetUserId: userId,
      });
      return res.status(403).json({
        error: "Forbidden: You can only update your own profile",
      });
    }

    // Set userData for Cloudinary storage naming
    if (isUserUpdatingSelf || isAdmin) {
      const currentUser = await User.findById(userId);
      req.userData = currentUser;
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.json({ error: "User not found" });
    }

    console.log("Update data received:", updateData);

    // **NEW**: Handle file uploads first
    if (req.files) {
      console.log("Files received:", Object.keys(req.files));

      // Handle profile picture
      if (req.files.profilePic && req.files.profilePic[0]) {
        const profilePicFile = req.files.profilePic[0];
        user.profilePic = {
          url: profilePicFile.path,
          filename: profilePicFile.filename,
        };
        console.log("Profile picture uploaded:", user.profilePic);
      }

      // Handle cover photo
      if (req.files.coverPhoto && req.files.coverPhoto[0]) {
        const coverPhotoFile = req.files.coverPhoto[0];
        user.coverPhoto = {
          url: coverPhotoFile.path,
          filename: coverPhotoFile.filename,
        };
        console.log("Cover photo uploaded:", user.coverPhoto);
      }
    }

    // Define field categories for cleaner processing
    const booleanFields = [
      "smoker",
      "bornMuslim",
      "prays",
      "celebratesMilaad",
      "celebrateKhatams",
      // "willingToRelocate",
      "allowParnterToWork",
      "allowPartnerToStudy",
      "acceptSomeoneWithChildren",
      "acceptADivorcedPerson",
      "agreesWithPolygamy",
      "acceptAWidow",
      "AcceptSomeoneWithBeard",
      "AcceptSomeoneWithHijab",
      "ConsiderARevert",
      // "acceptSomeoneInOtherCountry",
      // "willingToSharePhotosUponRequest",
      // "willingToMeetUpOutside",
      // "willingToConsiderANonUkCitizen",
    ];

    const numericFields = ["age", "height", "siblings", "contact"];

    const arrayFields = [
      "hobbies",
      "languagesSpoken",
      "QualitiesThatYouCanBringToYourMarriage",
      "qualitiesYouNeedInYourPartner",
    ];

    const objectArrayFields = ["education", "children"];

    const enumFields = {
      maritalStatus: [
        "married",
        "unmarried",
        "divorced",
        "widowed",
        "separated",
      ],
      build: ["slim", "average", "athletic", "heavy"],
      eyeColor: ["black", "brown", "grey", "other"],
      hairColor: ["black", "brown", "blonde"],
      complexion: ["fair", "wheatish", "dark"],
      ethnicity: ["bangladeshi", "pakistani", "indian", "british", "other"],
      gender: ["male", "female", "rather not say"],
    };

    // **IMPORTANT FIX**: Clear any existing "N/A" values in boolean fields |first
    booleanFields.forEach((field) => {
      if (user[field] === "N/A" || user[field] === null) {
        user[field] = undefined;
        console.log(`Cleared existing N/A value for ${field}`);
      }
    });

    // Process each field individually
    Object.keys(updateData).forEach((key) => {
      const value = updateData[key];

      // Handle N/A values - need special logic for different field types
      if (
        value === undefined ||
        value === "" ||
        value === "N/A" ||
        value === null
      ) {
        console.log(`Processing N/A or empty value for field ${key}:`, value);

        // **FIX**: Clear boolean fields when N/A
        if (booleanFields.includes(key) && value === "N/A") {
          user[key] = undefined;
          console.log(
            `Explicitly cleared boolean field ${key} due to N/A value`
          );
        }

        // **NEW**: Clear enum fields when N/A
        else if (enumFields[key] && value === "N/A") {
          user[key] = undefined;
          console.log(`Explicitly cleared enum field ${key} due to N/A value`);
        }

        // Skip truly empty values (but N/A was handled above)
        if (value === undefined || value === "" || value === null) {
          return;
        }

        // If we reach here, it was "N/A" and was handled above
        return;
      }

      console.log(`Processing field ${key} with value:`, value);

      // Handle BOOLEAN fields
      if (booleanFields.includes(key)) {
        user[key] = value === "true" || value === true;
        console.log(`Set boolean ${key} to:`, user[key]);
      }
      // Handle NUMERIC fields
      else if (numericFields.includes(key)) {
        const num = parseInt(value);
        if (!isNaN(num)) {
          user[key] = num;
          console.log(`Set number ${key} to:`, user[key]);
        }
      }
      // Handle ARRAY fields (comma-separated strings)
      else if (arrayFields.includes(key)) {
        if (Array.isArray(value)) {
          user[key] = value.filter((item) => item && item.trim());
        } else if (typeof value === "string" && value.trim()) {
          user[key] = value
            .split(",")
            .map((item) => item.trim())
            .filter((item) => item);
        }
        console.log(`Set array ${key} to:`, user[key]);
      }
      // Handle OBJECT ARRAY fields (education, children)
      else if (objectArrayFields.includes(key)) {
        if (Array.isArray(value)) {
          user[key] = value.filter(
            (item) =>
              item && Object.values(item).some((val) => val && val.trim())
          );
          console.log(`Set object array ${key} to:`, user[key]);
        }
      }
      // Handle ENUM fields with validation
      else if (enumFields[key]) {
        if (enumFields[key].includes(value)) {
          user[key] = value;
          console.log(`Set enum ${key} to:`, user[key]);
        } else {
          console.log(`Invalid enum value for ${key}:`, value);
        }
      }
      // Handle DISABILITY special case
      else if (key === "disability") {
        if (value === "no") {
          user[key] = "no";
        } else if (value && value.trim()) {
          user[key] = value.trim();
        }
        console.log(`Set disability to:`, user[key]);
      }
      // Handle all other STRING fields
      else {
        if (typeof value === "string" && value.trim()) {
          user[key] = value.trim();
          console.log(`Set string ${key} to:`, user[key]);
        } else if (typeof value === "number") {
          user[key] = value;
          console.log(`Set number ${key} to:`, user[key]);
        }
      }
    });

    // **FINAL CLEANUP**: Remove any remaining "N/A" or invalid values in boolean fields
    booleanFields.forEach((field) => {
      if (
        user[field] === "N/A" ||
        user[field] === null ||
        user[field] === "null"
      ) {
        user[field] = undefined;
        console.log(`Final cleanup: cleared ${field} with invalid value`);
      }
    });

    // Add debug log before saving
    const slugFields = [
      "name",
      "birthPlace",
      "city",
      "country",
      "nationality",
      "age",
    ];
    const shouldUpdateSlug = slugFields.some(
      (field) => updateData[field] !== undefined
    );

    if (shouldUpdateSlug) {
      user.profileSlug = await generateUniqueSlug(user);
      console.log("Admin updated profile slug:", user.profileSlug);
    }
    await user.save();

    console.log(`User ${user.username} updated successfully by admin`);
    res.json({ success: true, message: "User updated successfully" });
  } catch (error) {
    console.error("Admin update user error:", error);
    res.json({ error: `Failed to update user: ${error.message}` });
  }
});

// Reset User Password Route
app.post("/admin/user/reset-password", requireAdminOnly, async (req, res) => {
  if (!req.session.isAdmin) {
    return res
      .status(403)
      .json({ success: false, error: "Forbidden: Admin access required" });
  }

  try {
    const { userId, newPassword } = req.body;
    console.log("Reset password request for userId:", userId);

    // Validate input
    if (!userId || !newPassword) {
      return res.json({
        success: false,
        error: "User ID and new password are required",
      });
    }

    if (newPassword.length < 5) {
      return res.json({
        success: false,
        error: "Password must be at least 5 characters long",
      });
    }

    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.json({ success: false, error: "User not found" });
    }
    console.log("user password was", user.password);

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update user password
    user.password = hashedPassword;
    await user.save();
    console.log("user new password is", user.password);
    console.log(`Admin reset password for user: ${user.username}`);

    res.json({
      success: true,
      message: `Password updated successfully for ${user.username}`,
    });
  } catch (error) {
    console.error("Admin reset password error:", error);
    res.json({
      success: false,
      error: `Failed to reset password: ${error.message}`,
    });
  }
});

// Add this new route for account info updates

// Add these routes in App.js after your existing routes

// Get sent requests
app.get("/api/requests/sent", isLoggedIn, async (req, res) => {
  try {
    const requests = await Request.find({ from: req.session.userId })
      .populate("to", "username city profilePicture age country state")
      .sort({ createdAt: -1 });
    res.json({ success: true, requests });
  } catch (error) {
    console.error("Error fetching sent requests:", error);
    res.status(500).json({ success: false, error: "Failed to fetch requests" });
  }
});

// Get received requests
app.get("/api/requests/received", isLoggedIn, async (req, res) => {
  try {
    const requests = await Request.find({ to: req.session.userId })
      .populate("from", "username profilePicture city age")
      .sort({ createdAt: -1 });
    console.log("received requests are: ", requests);
    res.json({ success: true, requests });
  } catch (error) {
    console.error("Error fetching received requests:", error);
    res.status(500).json({ success: false, error: "Failed to fetch requests" });
  }
});

// Respond to request
// Replace your existing /api/requests/:requestId/respond route
app.post("/api/requests/:requestId/respond", isLoggedIn, async (req, res) => {
  try {
    const { requestId } = req.params;
    const { action } = req.body;

    if (!["accepted", "rejected"].includes(action)) {
      return res.status(400).json({ success: false, error: "Invalid action" });
    }

    const request = await Request.findById(requestId);
    if (!request) {
      return res
        .status(404)
        .json({ success: false, error: "Request not found" });
    }

    // Check if user is the recipient
    if (request.to.toString() !== req.session.userId) {
      return res.status(403).json({ success: false, error: "Unauthorized" });
    }

    request.status = action;
    await request.save();

    if (action === "accepted") {
      // Grant mutual access
      const requestFromUser = await User.findById(request.from);
      const requestToUser = await User.findById(request.to);

      if (!requestFromUser.canAccessFullProfileOf.includes(requestToUser._id)) {
        requestFromUser.canAccessFullProfileOf.push(requestToUser._id);
      }

      if (!requestToUser.canAccessFullProfileOf.includes(requestFromUser._id)) {
        requestToUser.canAccessFullProfileOf.push(requestFromUser._id);
      }

      await requestFromUser.save();
      await requestToUser.save();
    } else if (action === "rejected") {
      // Remove access
      const requestToUser = await User.findById(request.to);
      requestToUser.canAccessFullProfileOf.pull(request.from);
      await requestToUser.save();
    }

    res.json({ success: true, message: `Request ${action} successfully` });
  } catch (error) {
    console.error("Error responding to request:", error);
    res.status(500).json({ success: false, error: "Failed to update request" });
  }
});
// Admin Requests Management Route
app.get("/admin/requests", requireAdminOrModerator, async (req, res) => {
  try {
    const { status } = req.query;

    // Build filter object
    const filter = {};
    if (status && ["pending", "accepted", "rejected"].includes(status)) {
      filter.status = status;
    }

    // Get all requests with populated user data
    const requests = await Request.find(filter)
      .populate(
        "from",
        "username name gender age city country createdAt profileSlug"
      )
      .populate(
        "to",
        "username name gender age city country createdAt profileSlug"
      )
      .sort({ createdAt: -1 });

    // Calculate stats
    const totalRequests = await Request.countDocuments({});
    const pendingRequests = await Request.countDocuments({ status: "pending" });
    const acceptedRequests = await Request.countDocuments({
      status: "accepted",
    });
    const rejectedRequests = await Request.countDocuments({
      status: "rejected",
    });

    const stats = {
      total: totalRequests,
      pending: pendingRequests,
      accepted: acceptedRequests,
      rejected: rejectedRequests,
    };

    res.render("admin/requests", {
      requests,
      stats,
      currentFilter: status || "all",
    });
  } catch (error) {
    console.error("Admin requests error:", error);
    res.render("admin/requests", {
      requests: [],
      stats: { total: 0, pending: 0, accepted: 0, rejected: 0 },
      currentFilter: "all",
    });
  }
});
app.post("/api/newsletter/subscribe", async (req, res) => {
  try {
    const { name, email, interestedIn, preferredAgeRange } = req.body;

    // Validate required fields
    if (!name || !email || !interestedIn) {
      return res.status(400).json({
        success: false,
        error: "Name, email, and preference are required",
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: "Please provide a valid email address",
      });
    }

    // Check if email already exists
    const existingSubscriber = await Newsletter.findOne({
      email: email.toLowerCase(),
    });
    if (existingSubscriber) {
      if (existingSubscriber.isActive) {
        return res.status(400).json({
          success: false,
          error: "This email is already subscribed to our newsletter",
        });
      } else {
        // Reactivate existing subscriber
        existingSubscriber.isActive = true;
        existingSubscriber.name = name;
        existingSubscriber.interestedIn = interestedIn;
        existingSubscriber.preferredAgeRange = preferredAgeRange || null;
        existingSubscriber.subscribedAt = new Date();
        existingSubscriber.unsubscribedAt = null;

        await existingSubscriber.save();

        return res.json({
          success: true,
          message: "Welcome back! Your subscription has been reactivated.",
        });
      }
    }

    // Create new newsletter subscription
    const newSubscriber = new Newsletter({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      interestedIn,
      preferredAgeRange: preferredAgeRange || null,
      source: "website",
    });

    await newSubscriber.save();

    console.log("New newsletter subscriber:", newSubscriber.email);

    res.json({
      success: true,
      message: "Successfully subscribed to newsletter!",
    });
  } catch (error) {
    console.error("Newsletter subscription error:", error);

    if (error.code === 11000) {
      // Duplicate email error
      return res.status(400).json({
        success: false,
        error: "This email is already subscribed",
      });
    }

    res.status(500).json({
      success: false,
      error: "Failed to subscribe. Please try again later.",
    });
  }
});

// Admin route to view newsletter subscribers
// Admin route to view newsletter subscribers
app.get("/admin/newsletter", requireAdminOnly, async (req, res) => {
  if (!req.session.isAdmin) {
    return res.redirect("/admin");
  }

  try {
    const { filter } = req.query;

    // Build query based on filter
    let query = { isActive: true };
    if (filter === "male") {
      query.interestedIn = "male";
    } else if (filter === "female") {
      query.interestedIn = "female";
    } else if (filter === "both") {
      query.interestedIn = "both";
    }

    const subscribers = await Newsletter.find(query).sort({
      subscribedAt: -1,
    });

    // Calculate all stats (not just filtered)
    const allSubscribers = await Newsletter.find({ isActive: true });
    const stats = {
      total: allSubscribers.length,
      male: allSubscribers.filter((s) => s.interestedIn === "male").length,
      female: allSubscribers.filter((s) => s.interestedIn === "female").length,
      both: allSubscribers.filter((s) => s.interestedIn === "both").length,
    };

    res.render("admin/newsletter", {
      subscribers,
      stats,
      currentFilter: filter || "all",
    });
  } catch (error) {
    console.error("Newsletter admin error:", error);
    res.render("admin/newsletter", {
      subscribers: [],
      stats: { total: 0, male: 0, female: 0, both: 0 },
      currentFilter: "all",
    });
  }
});
// **NEW**: Unsubscribe a user (admin action)
app.post(
  "/admin/newsletter/:id/unsubscribe",
  requireAdminOnly,
  async (req, res) => {
    try {
      const { id } = req.params;

      const subscriber = await Newsletter.findById(id);
      if (!subscriber) {
        return res.json({ success: false, error: "Subscriber not found" });
      }

      subscriber.isActive = false;
      subscriber.unsubscribedAt = new Date();
      await subscriber.save();

      console.log(`Admin unsubscribed user: ${subscriber.email}`);

      res.json({
        success: true,
        message: "User unsubscribed successfully",
      });
    } catch (error) {
      console.error("Admin unsubscribe error:", error);
      res.json({
        success: false,
        error: "Failed to unsubscribe user",
      });
    }
  }
);

// **NEW**: Export newsletter subscribers as CSV
app.get("/admin/newsletter/export", requireAdminOnly, async (req, res) => {
  try {
    const subscribers = await Newsletter.find({ isActive: true }).sort({
      subscribedAt: -1,
    });

    // Generate CSV content
    let csv =
      "Name,Email,Interested In,Preferred Age Range,Subscribed Date,Source\n";

    subscribers.forEach((subscriber) => {
      const subscribedDate = new Date(
        subscriber.subscribedAt
      ).toLocaleDateString();
      const ageRange = subscriber.preferredAgeRange || "Not specified";

      csv += `"${subscriber.name}","${subscriber.email}","${subscriber.interestedIn}","${ageRange}","${subscribedDate}","${subscriber.source}"\n`;
    });

    // Set headers for file download
    const filename = `newsletter_subscribers_${
      new Date().toISOString().split("T")[0]
    }.csv`;
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    console.log(`Admin exported ${subscribers.length} newsletter subscribers`);

    res.send(csv);
  } catch (error) {
    console.error("Newsletter export error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to export subscribers",
    });
  }
});

// **NEW**: Get newsletter stats API
app.get("/api/admin/newsletter/stats", requireAdminOnly, async (req, res) => {
  try {
    const totalActive = await Newsletter.countDocuments({ isActive: true });
    const totalInactive = await Newsletter.countDocuments({ isActive: false });
    const maleInterested = await Newsletter.countDocuments({
      isActive: true,
      interestedIn: "male",
    });
    const femaleInterested = await Newsletter.countDocuments({
      isActive: true,
      interestedIn: "female",
    });
    const bothInterested = await Newsletter.countDocuments({
      isActive: true,
      interestedIn: "both",
    });

    // Age range stats
    const ageRangeStats = {};
    const ageRanges = ["18-25", "26-30", "31-35", "36-40", "41+"];

    for (const range of ageRanges) {
      ageRangeStats[range] = await Newsletter.countDocuments({
        isActive: true,
        preferredAgeRange: range,
      });
    }

    res.json({
      success: true,
      stats: {
        total: totalActive,
        inactive: totalInactive,
        male: maleInterested,
        female: femaleInterested,
        both: bothInterested,
        ageRanges: ageRangeStats,
      },
    });
  } catch (error) {
    console.error("Newsletter stats error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch stats",
    });
  }
});
// Admin Request Actions (Enhanced with Delete)
app.post(
  "/admin/requests/:requestId/respond",
  requireAdminOrModerator,
  async (req, res) => {
    try {
      const { requestId } = req.params;
      const { action } = req.body;

      if (!["accepted", "rejected", "revoke", "delete"].includes(action)) {
        return res
          .status(400)
          .json({ success: false, error: "Invalid action" });
      }

      const request = await Request.findById(requestId).populate(
        "from to",
        "username name profileSlug"
      );
      if (!request) {
        return res
          .status(404)
          .json({ success: false, error: "Request not found" });
      }

      // **NEW**: Handle delete action
      if (action === "delete") {
        // Remove mutual access between users if it exists
        const requestFromUser = await User.findById(request.from._id);
        const requestToUser = await User.findById(request.to._id);

        if (requestFromUser) {
          requestFromUser.canAccessFullProfileOf.pull(request.to._id);
          await requestFromUser.save();
        }

        if (requestToUser) {
          requestToUser.canAccessFullProfileOf.pull(request.from._id);
          requestToUser.likeRequests.pull(requestId);
          await requestToUser.save();
        }

        // Send notification to requester
        await NotificationService.createNotification({
          userId: request.from._id,
          type: "request_rejected", // Reuse rejected type or create new one
          title: "Request Deleted",
          message: `Your request to ${
            request.to.name || request.to.username
          } was deleted by admin.`,
          priority: "medium",
          actionUrl: "/profiles",
          actionText: "Browse Profiles",
        });

        // Delete the request permanently
        await Request.findByIdAndDelete(requestId);

        console.log(
          `Admin deleted request from ${request.from.username} to ${request.to.username}`
        );
        return res.json({
          success: true,
          message: "Request deleted successfully",
        });
      }

      // Handle revoke action
      if (action === "revoke") {
        if (request.status !== "accepted") {
          return res.status(400).json({
            success: false,
            error: "Can only revoke accepted requests",
          });
        }

        // Remove mutual access
        const requestFromUser = await User.findById(request.from._id);
        const requestToUser = await User.findById(request.to._id);

        if (requestFromUser) {
          requestFromUser.canAccessFullProfileOf.pull(request.to._id);
          await requestFromUser.save();
        }

        if (requestToUser) {
          requestToUser.canAccessFullProfileOf.pull(request.from._id);
          await requestToUser.save();
        }

        // Update request status back to pending
        request.status = "pending";
        await request.save();

        // Send notification to both users
        await NotificationService.createNotification({
          userId: request.from._id,
          type: "request_revoked",
          title: "Request Access Revoked",
          message: `Your accepted request with ${
            request.to.name || request.to.username
          } has been revoked by admin.`,
          priority: "high",
          actionUrl: "/profiles",
          actionText: "Browse Profiles",
        });

        await NotificationService.createNotification({
          userId: request.to._id,
          type: "request_revoked",
          title: "Request Access Revoked",
          message: `Your connection with ${
            request.from.name || request.from.username
          } has been revoked by admin.`,
          priority: "high",
          actionUrl: "/profiles",
          actionText: "Browse Profiles",
        });

        console.log(
          `Admin revoked request from ${request.from.username} to ${request.to.username}`
        );
        return res.json({
          success: true,
          message: "Request access revoked successfully",
        });
      }

      // Handle accept/reject actions
      request.status = action;
      await request.save();

      if (action === "accepted") {
        // Grant mutual access
        const requestFromUser = await User.findById(request.from._id);
        const requestToUser = await User.findById(request.to._id);

        if (
          !requestFromUser.canAccessFullProfileOf.includes(requestToUser._id)
        ) {
          requestFromUser.canAccessFullProfileOf.push(requestToUser._id);
        }

        if (
          !requestToUser.canAccessFullProfileOf.includes(requestFromUser._id)
        ) {
          requestToUser.canAccessFullProfileOf.push(requestFromUser._id);
        }

        await requestFromUser.save();
        await requestToUser.save();

        // Send notification to requester
        await NotificationService.createNotification({
          userId: request.from._id,
          type: "request_accepted",
          title: "Request Accepted!",
          message: `Congratulations! Your request was accepted by ${
            request.to.name || request.to.username
          }.`,
          priority: "high",
          actionUrl: `/profiles/${request.to.profileSlug || request.to._id}`,
          actionText: "View Profile",
        });
      } else if (action === "rejected") {
        // Remove any existing access
        const requestToUser = await User.findById(request.to._id);
        const requestFromUser = await User.findById(request.from._id);

        if (requestToUser) {
          requestToUser.canAccessFullProfileOf.pull(request.from._id);
          await requestToUser.save();
        }

        if (requestFromUser) {
          requestFromUser.canAccessFullProfileOf.pull(request.to._id);
          await requestFromUser.save();
        }

        // Send notification to requester
        await NotificationService.createNotification({
          userId: request.from._id,
          type: "request_rejected",
          title: "Request Declined",
          message: `Your request was declined by ${
            request.to.name || request.to.username
          }.`,
          priority: "medium",
          actionUrl: "/profiles",
          actionText: "Browse Profiles",
        });
      }

      console.log(
        `Admin ${action} request from ${request.from.username} to ${request.to.username}`
      );
      res.json({ success: true, message: `Request ${action} successfully` });
    } catch (error) {
      console.error("Admin request respond error:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to update request" });
    }
  }
);
// **NEW**: Feature/Unfeature Profile Route
app.post(
  "/admin/user/:id/feature",
  requireAdminOrModerator,
  async (req, res) => {
    if (!req.session.isAdmin && !req.session.isModerator) {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }

    try {
      const { id } = req.params;
      const { action } = req.body;

      if (!action || !["feature", "unfeature"].includes(action)) {
        return res.json({ success: false, error: "Invalid action" });
      }

      const user = await User.findById(id);
      if (!user) {
        return res.json({ success: false, error: "User not found" });
      }

      if (action === "feature") {
        user.isFeatured = true;
        user.featuredDate = new Date();
        console.log(`Admin featured profile: ${user.username}`);
      } else {
        user.isFeatured = false;
        user.featuredDate = null;
        console.log(`Admin unfeatured profile: ${user.username}`);
      }

      await user.save();

      res.json({
        success: true,
        message: `Profile ${action}d successfully`,
        isFeatured: user.isFeatured,
      });
    } catch (error) {
      console.error("Feature profile error:", error);
      res.json({
        success: false,
        error: `Failed to ${req.body.action} profile`,
      });
    }
  }
);
// Unsubscribe route (for email links)
app.get("/newsletter/unsubscribe/:email", async (req, res) => {
  try {
    const { email } = req.params;

    const subscriber = await Newsletter.findOne({ email: email.toLowerCase() });
    if (subscriber) {
      subscriber.isActive = false;
      subscriber.unsubscribedAt = new Date();
      await subscriber.save();
    }

    res.render("newsletter/unsubscribe", { email });
  } catch (error) {
    console.error("Newsletter unsubscribe error:", error);
    res.status(500).send("Error unsubscribing");
  }
});
// Send email verification code
app.post(
  "/api/send-verification-code",
  emailVerificationLimiter,
  async (req, res) => {
    try {
      const { email, username } = req.body;

      if (!email || !username) {
        return res.json({
          success: false,
          error: "Email and username are required",
        });
      }

      // Check if email already exists and is verified
      const existingUser = await User.findOne({ email: email.toLowerCase() });
      if (existingUser && existingUser.isEmailVerified) {
        return res.json({
          success: false,
          error: "This email is already registered and verified",
        });
      }

      // Generate verification code
      const code = generateVerificationCode();

      // Send email
      const emailResult = await sendVerificationEmail(email, code, username);

      if (!emailResult.success) {
        return res.json({
          success: false,
          error: "Failed to send verification email",
        });
      }

      // Store code in session temporarily (you could also store in database)
      req.session.pendingVerification = {
        email: email.toLowerCase(),
        code: code,
        username: username,
        expiry: Date.now() + 10 * 60 * 1000, // 10 minutes
      };

      res.json({
        success: true,
        message: "Verification code sent to your email",
      });
    } catch (error) {
      console.error("Send verification code error:", error);
      res.json({ success: false, error: "Failed to send verification code" });
    }
  }
);

// Verify email code
app.post("/api/verify-email-code", async (req, res) => {
  try {
    const { code } = req.body;

    if (!req.session.pendingVerification) {
      return res.json({
        success: false,
        error: "No pending verification found",
      });
    }

    const pending = req.session.pendingVerification;

    // Check if code expired
    if (Date.now() > pending.expiry) {
      delete req.session.pendingVerification;
      return res.json({
        success: false,
        error: "Verification code expired. Please request a new one.",
      });
    }

    // Check if code matches
    if (code !== pending.code) {
      return res.json({ success: false, error: "Invalid verification code" });
    }

    // Code is valid - mark as verified
    req.session.emailVerified = true;
    req.session.verifiedEmail = pending.email;

    // Clean up
    delete req.session.pendingVerification;

    res.json({ success: true, message: "Email verified successfully!" });
  } catch (error) {
    console.error("Verify email code error:", error);
    res.json({ success: false, error: "Failed to verify code" });
  }
});
// **NEW**: Save email verification to user profile
app.post(
  "/api/save-email-verification",
  isLoggedIn,
  findUser,
  async (req, res) => {
    try {
      const { email } = req.body;
      const user = req.userData;

      if (
        !email ||
        !req.session.emailVerified ||
        req.session.verifiedEmail !== email.toLowerCase()
      ) {
        return res.json({
          success: false,
          error: "Email verification session invalid",
        });
      }

      // Update user's email and verification status
      user.email = email.toLowerCase().trim();
      user.isEmailVerified = true;

      await user.save();

      // Update session user data
      req.session.user = user;

      // Clean up verification session data
      delete req.session.emailVerified;
      delete req.session.verifiedEmail;

      console.log(
        `Email verification saved for user: ${user.username}, email: ${user.email}`
      );

      res.json({
        success: true,
        message: "Email verification saved successfully!",
      });
    } catch (error) {
      console.error("Save email verification error:", error);
      res.json({
        success: false,
        error: "Failed to save email verification",
      });
    }
  }
);
// Notification API Routes
app.get("/api/notifications", isLoggedIn, async (req, res) => {
  try {
    const notifications = await NotificationService.getUserNotifications(
      req.session.userId,
      20,
      false
    );
    const unreadCount = await NotificationService.getUnreadCount(
      req.session.userId
    );

    res.json({
      success: true,
      notifications,
      unreadCount,
    });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to fetch notifications" });
  }
});

// Mark notification as read
app.post("/api/notifications/:id/read", isLoggedIn, async (req, res) => {
  try {
    const notification = await NotificationService.markAsRead(
      req.params.id,
      req.session.userId
    );

    if (!notification) {
      return res
        .status(404)
        .json({ success: false, error: "Notification not found" });
    }

    res.json({ success: true, notification });
  } catch (error) {
    console.error("Error marking notification as read:", error);
    res.status(500).json({ success: false, error: "Failed to mark as read" });
  }
});

// Mark all notifications as read
app.post("/api/notifications/mark-all-read", isLoggedIn, async (req, res) => {
  try {
    const count = await NotificationService.markAllAsRead(req.session.userId);
    res.json({ success: true, markedCount: count });
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to mark all as read" });
  }
});

// Check and create email notification for current user
app.post("/api/notifications/check-email", isLoggedIn, async (req, res) => {
  try {
    const created = await NotificationService.checkAndCreateEmailNotification(
      req.session.userId
    );
    res.json({ success: true, notificationCreated: created });
  } catch (error) {
    console.error("Error checking email notification:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to check email notification" });
  }
});

// Forgot Password Routes
app.get("/forgot-password", (req, res) => {
  if (req.session.userId) {
    // User is already logged in
    return res.redirect("/home");
  }
  res.render("forgot-password");
});

app.post("/forgot-password", passwordResetLimiter, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !email.trim()) {
      return res.json({ success: false, error: "Email address is required" });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.json({
        success: false,
        error: "Please provide a valid email address",
      });
    }

    // Find user with this email
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.json({
        success: false,
        error:
          "No account found with this email address. Please check your email or contact support.",
      });
    }

    // Generate secure reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

    // Save token to user
    user.passwordResetToken = resetToken;
    user.passwordResetExpiry = resetExpiry;
    await user.save();

    // Send reset email
    const emailResult = await sendPasswordResetEmail(
      user.email,
      resetToken,
      user.name || user.username
    );

    if (!emailResult.success) {
      // Clean up token on email failure
      user.passwordResetToken = null;
      user.passwordResetExpiry = null;
      await user.save();

      return res.json({
        success: false,
        error: "Failed to send reset email. Please try again later.",
      });
    }

    console.log(
      `Password reset requested for user: ${user.username}, email: ${user.email}`
    );

    res.json({
      success: true,
      message: "Password reset instructions sent to your email address",
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.json({
      success: false,
      error: "An error occurred. Please try again later.",
    });
  }
});

// Reset Password Routes
app.get("/reset-password", async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.render("forgot-password", {
        error:
          "Invalid or missing reset token. Please request a new password reset.",
      });
    }

    // Find user with valid token
    const user = await User.findOne({
      passwordResetToken: token,
      passwordResetExpiry: { $gt: new Date() },
    });

    if (!user) {
      return res.render("forgot-password", {
        error:
          "Invalid or expired reset token. Please request a new password reset.",
      });
    }

    // Token is valid, show reset form
    res.render("reset-password", { token });
  } catch (error) {
    console.error("Reset password GET error:", error);
    res.render("forgot-password", {
      error: "An error occurred. Please try again.",
    });
  }
});
app.post("/reset-password", async (req, res) => {
  try {
    const { token, password, confirmPassword } = req.body;

    // Validation
    if (!token || !password || !confirmPassword) {
      return res.json({
        success: false,
        error: "All fields are required",
      });
    }

    if (password.length < 5) {
      return res.json({
        success: false,
        error: "Password must be at least 5 characters long",
      });
    }

    if (password !== confirmPassword) {
      return res.json({
        success: false,
        error: "Passwords do not match",
      });
    }

    // Find user with valid token
    const user = await User.findOne({
      passwordResetToken: token,
      passwordResetExpiry: { $gt: new Date() },
    });

    if (!user) {
      return res.json({
        success: false,
        error:
          "Invalid or expired reset token. Please request a new password reset.",
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Update user password and clear reset token
    user.password = hashedPassword;
    user.passwordResetToken = null;
    user.passwordResetExpiry = null;
    await user.save();

    console.log(`Password successfully reset for user: ${user.username}`);

    res.json({
      success: true,
      message: "Password reset successfully",
    });
  } catch (error) {
    console.error("Reset password POST error:", error);
    res.json({
      success: false,
      error: "An error occurred. Please try again later.",
    });
  }
});
app.get("/terms", (req, res) => {
  res.render("terms", {
    title: "Terms and Conditions - D'amour Muslim",
  });
});
// SEO: Generate dynamic sitemap
app.get("/sitemap.xml", async (req, res) => {
  try {
    const users = await User.find({}).select("_id updatedAt");

    let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://www.shadiamour.com/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://www.shadiamour.com/profiles</loc>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://www.shadiamour.com/profiles?gender=male</loc>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://www.shadiamour.com/profiles?gender=female</loc>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://www.shadiamour.com/register</loc>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`;

    // Add individual profile pages
    users.forEach((user) => {
      const lastmod = user.updatedAt
        ? user.updatedAt.toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0];
      sitemap += `
  <url>
    <loc>https://www.shadiamour.com/profiles/${user._id}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>`;
    });

    sitemap += `
</urlset>`;

    res.set("Content-Type", "application/xml");
    res.send(sitemap);
  } catch (error) {
    console.error("Sitemap generation error:", error);
    res.status(500).send("Error generating sitemap");
  }
});
// SEO: Robots.txt
app.get("/robots.txt", (req, res) => {
  const robots = `User-agent: *
Allow: /
Allow: /profiles
Allow: /profiles?gender=male
Allow: /profiles?gender=female
Allow: /register
Allow: /login
Disallow: /admin/
Disallow: /account/
Disallow: /api/
Disallow: /logout

Sitemap: https://www.shadiamour.com/sitemap.xml`;

  res.set("Content-Type", "text/plain");
  res.send(robots);
});
app.use((req, res) => {
  res.status(404).render("404", {
    title: "Page Not Found - shadiamour",
    url: req.originalUrl,
  });
});
app.listen(port, (req, res) => {
  console.log("on port 3000!");
});
