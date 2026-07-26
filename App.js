require("dotenv").config(); // MUST be first!
const { muslimMaleNames, muslimFemaleNames } = require("./config/seoData");
const Blog = require("./models/Blog");
const IslamicFAQ = require("./models/IslamicFAQ");
const FaqCategory = require("./models/FaqCategory");
const CategoryPage = require("./models/CategoryPage");
const Reservation = require("./models/Reservation");
function getRandomSeoName(gender) {
  if (gender === "male") {
    const randomIndex = Math.floor(Math.random() * muslimMaleNames.length);
    return muslimMaleNames[randomIndex];
  } else if (gender === "female") {
    const randomIndex = Math.floor(Math.random() * muslimFemaleNames.length);
    return muslimFemaleNames[randomIndex];
  }
  return null;
}
// **NEW**: Image optimization helper
function getOptimizedImageUrl(
  originalUrl,
  width = 300,
  height = 400,
  crop = "fill"
) {
  if (!originalUrl || !originalUrl.includes("cloudinary.com")) {
    return originalUrl;
  }

  // Insert transformations into Cloudinary URL
  return originalUrl.replace(
    "/upload/",
    `/upload/c_${crop},w_${width},h_${height},q_auto,f_auto/`
  );
}

// Make it available globally
global.getOptimizedImageUrl = getOptimizedImageUrl;
const slugify = require("slugify");
// **NEW**: Function to ensure unique slug
const {
  calculateProfileCompletion,
  generateProfileSlug,
  generateUniqueSlug,
  computeProfileTier,
} = require("./utils/profileHelpers");

function addProfileSlugHistory(profile, oldSlug, newSlug) {
  if (!oldSlug || oldSlug === newSlug) {
    return;
  }

  if (!profile.profileSlugHistory) {
    profile.profileSlugHistory = [];
  }

  if (!profile.profileSlugHistory.includes(oldSlug)) {
    profile.profileSlugHistory.push(oldSlug);
  }
}
const User = require("./models/user");
const MatchScore = require("./models/MatchScore");
const Newsletter = require("./models/Newsletter");
const { countryOptions, countryPlaceholders } = require("./config/countries");
const { detectCountry, buildGeoFilter, getFilterUIConfig } = require("./config/geoFilter");
const path = require("path");
const Request = require("./models/Request");
const Notification = require("./models/Notification");
const NotificationService = require("./services/notificationService");
const QueueService = require("./services/queueService");
const indexNow = require("./services/indexNowService");
const isLoggedIn = require("./middlewares/isLoggedIn");
const findUser = require("./middlewares/findUser");
const requireApprovedProfile = require("./middlewares/requireApprovedProfile");
const {
  requireAdminOrModerator,
  requireAdminOnly,
  requireViewAccess,
} = require("./middlewares/accessControl");
const { requireSeoAdmin, requireSeoAdminApi } = require("./middlewares/seoAdminAuth");
const GlobalSeoSettings = require("./models/GlobalSeoSettings");
const Podcast = require("./models/Podcast");
const AdMedia = require("./models/AdMedia");
const TeamMember = require("./models/TeamMember");
const http = require("http");
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
const passport = require("./config/passport");
const port = process.env.PORT;
const compression = require("compression");
const app = express();
app.set("trust proxy", 1);

// Redirect http → https and www → non-www
app.use((req, res, next) => {
  const host = req.headers.host || "";
  const proto = req.headers["x-forwarded-proto"] || req.protocol;

  // Redirect www to non-www
  if (host.startsWith("www.")) {
    const nonWwwHost = host.slice(4);
    return res.redirect(301, `https://${nonWwwHost}${req.originalUrl}`);
  }

  // Redirect http to https (skip in local development)
  if (proto === "http" && process.env.NODE_ENV === "production") {
    return res.redirect(301, `https://${host}${req.originalUrl}`);
  }

  next();
});

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
const sessionMiddleware = session({
  secret: process.env.SECRETKEYSESSION,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    collectionName: "sessions",
  }),
  cookie: { secure: false, httpOnly: true }, // set secure: true if using HTTPS
});
app.use(sessionMiddleware);
app.use(passport.initialize());
app.use(passport.session());
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUDINARY_KEY,
  api_secret: process.env.CLOUDINARY_SECRET,
});
const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    let username = req.userData?.username || req.body?.userId || "unknown";

    if (req.body?.userId && !req.userData?.username) {
      try {
        const user = await User.findById(req.body.userId);
        username = user?.username || "unknown";
      } catch (e) {
        console.log("Error finding user for username:", e);
      }
    }

    let suffix = "";
    if (file.fieldname === "coverPhoto") {
      suffix = "C";
    } else if (file.fieldname === "profilePic") {
      suffix = "P";
    } else {
      suffix = "imgs1";
    }

    return {
      folder: "user_profiles",
      public_id: `${username}${suffix}`,
      allowed_formats: ["jpg", "jpeg", "png", "webp"],
      // **ENHANCED**: Better compression and optimization
      transformation: [
        { quality: "auto:good" }, // Smart compression
        { fetch_format: "auto" }, // Serve optimal format (WebP when supported)
        {
          if: "w_gt_1200",
          width: 1200,
          crop: "limit",
        }, // Limit max width
        {
          if: "h_gt_1200",
          height: 1200,
          crop: "limit",
        }, // Limit max height
      ],
    };
  },
});
const upload = multer({ storage });

// **FIX**: Dedicated Cloudinary storage for blog images — keeps them out of user_profiles/
const blogImageStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    const uniqueId = `blog_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return {
      folder: "blog_images",
      public_id: uniqueId,
      allowed_formats: ["jpg", "jpeg", "png", "webp"],
      transformation: [
        { quality: "auto:good" },
        { fetch_format: "auto" },
        { if: "w_gt_1200", width: 1200, crop: "limit" },
      ],
    };
  },
});
const blogImageUpload = multer({ storage: blogImageStorage });

const faqImageStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    const uniqueId = `faq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return {
      folder: "faq_images",
      public_id: uniqueId,
      allowed_formats: ["jpg", "jpeg", "png", "webp"],
      transformation: [
        { quality: "auto:good" },
        { fetch_format: "auto" },
        { if: "w_gt_1200", width: 1200, crop: "limit" },
      ],
    };
  },
});
const faqImageUpload = multer({ storage: faqImageStorage });

// KYC verification image storage
const kycStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    const username = req.userData?.username || req.session?.userId || 'unknown';
    const fieldMap = { idFront: 'idfront', idBack: 'idback', selfie: 'selfie' };
    const suffix = fieldMap[file.fieldname] || file.fieldname;
    return {
      folder: 'kyc_verifications',
      public_id: `${username}_${suffix}`,
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
      transformation: [
        { quality: 'auto:good' },
        { fetch_format: 'auto' },
        { if: 'w_gt_2000', width: 2000, crop: 'limit' },
      ],
    };
  },
});
const kycUpload = multer({ storage: kycStorage });

// Cloudinary storage for ad media (images + videos)
const adMediaStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    const uniqueId = `ad_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const isVideo = file.mimetype.startsWith("video/");
    return {
      folder: "ad_media",
      public_id: uniqueId,
      resource_type: "auto",
      allowed_formats: isVideo ? ["mp4", "mov", "webm", "avi"] : ["jpg", "jpeg", "png", "webp"],
      ...(isVideo ? {} : { transformation: [{ quality: "auto:good" }, { fetch_format: "auto" }] }),
    };
  },
});
const adMediaUpload = multer({
  storage: adMediaStorage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB for videos
});

// Cloudinary storage for team member photos
const teamPhotoStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    const uniqueId = `team_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return {
      folder: "team_photos",
      public_id: uniqueId,
      allowed_formats: ["jpg", "jpeg", "png", "webp"],
      transformation: [
        { quality: "auto:good" },
        { fetch_format: "auto" },
        { width: 400, height: 400, crop: "fill", gravity: "face" },
      ],
    };
  },
});
const teamPhotoUpload = multer({ storage: teamPhotoStorage });

const {
  generateVerificationCode,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendProfileApprovalEmail,
  sendMarriageGuide,
  sendReservationNotification,
} = require("./services/emailService");
const requireProfileComplete = require("./middlewares/requireProfileComplete");
const requireOnboardingComplete = require("./middlewares/requireOnboardingComplete");

// Add this middleware after your session setup but before your routes
app.set("view engine", "ejs");

mongoose
  .connect(process.env.MONGODB_URI, {})
  .then(async () => {
    console.log(" Mongoose Server Started!");
    // Seed default FAQ categories (idempotent)
    const defaultCategories = [
      "Destiny", "Birth", "Divorce", "Engagement", "Family",
      "Getting Married", "Intimacy", "Prayer & Purification",
      "Rights & Responsibilities", "Spouse Search",
    ];
    const slugify = require("slugify");
    for (const name of defaultCategories) {
      const slug = slugify(name, { lower: true, strict: true });
      await FaqCategory.findOneAndUpdate(
        { name },
        { name, slug },
        { upsert: true, setDefaultsOnInsert: true }
      );
    }
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

// **NEW**: Global SEO Settings Middleware - Make available to all views
app.use(async (req, res, next) => {
  try {
    res.locals.globalSeoSettings = await GlobalSeoSettings.getSettings();
  } catch (error) {
    console.error("Error loading global SEO settings:", error);
    res.locals.globalSeoSettings = null;
  }
  try {
    res.locals.categoryPages = await CategoryPage.find({ isPublished: true })
      .select("title categorySlug pageSlug")
      .sort({ title: 1 })
      .limit(20)
      .lean();
  } catch (e) {
    res.locals.categoryPages = [];
  }
  next();
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.get(["/", "/home"], requireOnboardingComplete, async (req, res) => {
  try {

    // Fetch 4 most recently added profiles by admin/staff
    const staffAddedProfiles = await User.find({
      approvalStatus: "approved",
      registrationSource: "admin",
      isDeactivated: { $ne: true },
    })
      .sort({ registeredAt: -1, createdAt: -1 })
      .limit(4)
      .select("name age city profilePic profileSlug username gender work")
      .lean();

    res.render("home", {
      user: req.session.user || null,
    
      staffAddedProfiles: staffAddedProfiles || [],
    });
  } catch (error) {
    console.error("Error fetching homepage data:", error);
    res.render("home", {
      user: req.session.user || null,
      randomProfiles: [],
      staffAddedProfiles: [],
    });
  }
});

app.get("/register", (req, res) => {
  if (req.session.userId) {
    // User is already logged in, redirect to home or dashboard
    return res.redirect("/home");
  }
  res.render("register-new", {
    error: req.query.error || null,
  });
});

// SEO LANDING PAGES (REWRITTEN CONTENT VARIANT)
// ============================================
const seoPages = [
  {
    path: "/muslim-marriage",
    pageTitle: "Muslim Marriage UK — The Islamic Approach to Finding a Spouse | shadiAmour",
    h1: "Muslim Marriage UK — The Islamic Approach to Finding a Spouse",
    heroSubtitle: "From sincere intention to istikhara to the wali's involvement — understand the Islamic roadmap for finding a spouse, and see how shadiAmour supports every stage of it.",
    metaDescription: "Understand the Islamic approach to Muslim marriage in the UK — Quranic principles, Nikah guidance, and how shadiAmour helps British Muslims find a halal spouse.",
    keywords: "Muslim marriage UK, Islamic marriage guide, Nikah UK, Muslim marriage website UK, halal marriage process, Muslim marriage site UK",
    canonicalPath: "/muslim-marriage",
    ctaHeading: "Take the First Step Toward Nikah",
    ctaSubtext: "Join the UK Muslims who have found their spouse through shadiAmour — a platform built on halal principles from day one.",
    relatedLinks: [
      { url: "/halal-marriage", label: "What Makes a Marriage Process Halal" },
      { url: "/muslim-matrimonial", label: "Building Your Matrimonial Biodata" },
      { url: "/muslim-matchmaking", label: "How Our Matchmaking Works" },
      { url: "/find-muslim-spouse", label: "A Step-by-Step Guide to Finding a Spouse" },
      { url: "/verified-muslim-profiles", label: "Why Verified Profiles Matter" }
    ],
    pageFaqSchema: [
      { q: "What does Islam actually say about marriage?", a: "Nikah is strongly encouraged in Islam and is described as fulfilling half of a believer's religion. It is a sacred bond meant to establish a household rooted in sakeenah (tranquillity), mawaddah (affection), and rahmah (mercy)." },
      { q: "Will using a marriage website compromise my deen?", a: "Not on shadiAmour. The platform exists exclusively for Muslims with genuine marriage intentions, with no dating culture and no encouragement of unsupervised private chatting." },
      { q: "Do I need my wali to be involved if I use shadiAmour?", a: "We actively encourage wali participation, consistent with Islamic guidance. The platform is structured to make family involvement easy, not to sidestep it." },
      { q: "How is this different from a regular dating app?", a: "shadiAmour exists solely for marriage. Every profile is checked by our moderation team, there is no swipe-based browsing culture, and the whole experience is oriented around Nikah." },
      { q: "Does it cost anything to search for a spouse here?", a: "No. Creating a profile, browsing verified members, and expressing interest are all free." }
    ],
    pageFaqs: [
      { q: "What does Islam actually say about marriage?", a: "Nikah is strongly encouraged in Islam and is described as fulfilling half of a believer's religion. It is a sacred bond meant to establish a household rooted in sakeenah (tranquillity), mawaddah (affection), and rahmah (mercy)." },
      { q: "Will using a marriage website compromise my deen?", a: "Not on shadiAmour. The platform exists exclusively for Muslims with genuine marriage intentions, with no dating culture and no encouragement of unsupervised private chatting." },
      { q: "Do I need my wali to be involved if I use shadiAmour?", a: "We actively encourage wali participation, consistent with Islamic guidance. The platform is structured to make family involvement easy, not to sidestep it." },
      { q: "How is this different from a regular dating app?", a: "shadiAmour exists solely for marriage. Every profile is checked by our moderation team, there is no swipe-based browsing culture, and the whole experience is oriented around Nikah." },
      { q: "Does it cost anything to search for a spouse here?", a: "No. Creating a profile, browsing verified members, and expressing interest are all free." }
    ],
    bodyContent: `
      <div class="prose max-w-none">
        <p class="text-lg text-gray-700 mb-6 leading-relaxed">In Islam, marriage (Nikah) is far more than a civil contract — it is half of one's deen and one of the most spiritually significant acts a Muslim can undertake. The Prophet Muhammad ■ said: "When a man marries, he has fulfilled half of his religion, so let him fear Allah regarding the remaining half." (Al-Bayhaqi). shadiAmour exists to make that search safer and more dignified for British Muslims.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">The Quranic Foundation</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">Allah describes the marital bond as one built on sakeenah (tranquillity), mawaddah (deep affection), and rahmah (mercy) — "And of His signs is that He created for you from yourselves mates that you may find tranquillity in them..." (Quran 30:21). These qualities are not automatic; they are responsibilities both spouses cultivate daily.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">The Islamic Process of Seeking a Spouse</h2>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Sincere Intention (Niyyah) — approaching the search to please Allah and fulfil the Sunnah.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Istikhara — seeking Allah's guidance before committing to a proposal.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Wali Involvement — a guardian who protects and supports, not obstructs.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Halal Meeting — respectful, modest, purposeful conversation, never unchaperoned dating.</span></li>
        </ul>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">How shadiAmour Supports This Process</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">shadiAmour is a marriage-only environment with verified profiles, wali-friendly account management, and UK GDPR-compliant data protection — giving British Muslims a trustworthy, halal-first alternative to mainstream dating apps.</p>

        <div class="bg-primary/5 rounded-2xl p-6 border border-primary/10 mt-8">
          <p class="text-gray-700 font-medium">Muslim Marriage London • Muslim Matchmaking Leicester • Muslim Rishta Birmingham • Halal Marriage Manchester • Muslim Matrimony Bradford • Islamic Marriage Luton • Muslim Shaadi Bolton • Muslim Matrimonial Sites Oldham • Online Nikah UK • Pakistani Muslim Marriage UK • Bengali Muslim Matrimony UK</p>
        </div>
      </div>
    `
  },
  {
    path: "/halal-marriage",
    pageTitle: "Halal Marriage UK — Marrying the Right Way, Without Compromise | shadiAmour",
    h1: "Halal Marriage UK — Marrying the Right Way, Without Compromise",
    heroSubtitle: "Halal marriage isn't just about who you marry — it's about how you get there. See what makes the process halal, and how shadiAmour keeps it that way.",
    metaDescription: "Learn what makes a marriage process halal in Islam — boundaries, family involvement, and supervised meetings — and find a halal marriage partner on shadiAmour.",
    keywords: "halal marriage UK, halal marriage site, halal marriage process, halal way to find a partner, halal Muslim marriage website, halal marriage steps",
    canonicalPath: "/halal-marriage",
    ctaHeading: "Start Your Halal Search Today",
    ctaSubtext: "Join a marriage-only platform built around Islamic boundaries from the very first click.",
    relatedLinks: [
      { url: "/muslim-marriage", label: "The Islamic Approach to Marriage" },
      { url: "/muslim-rishta", label: "Modern Rishta the Respectable Way" },
      { url: "/trusted-muslim-matchmaking", label: "Why Trust Comes First" },
      { url: "/verified-muslim-profiles", label: "Why Verified Profiles Matter" },
      { url: "/best-muslim-marriage-website", label: "What Sets shadiAmour Apart" }
    ],
    pageFaqSchema: [
      { q: "What exactly does \"halal marriage\" mean?", a: "It describes the entire process of coming together — how two people meet, communicate, and who is involved — not just that both parties are Muslim." },
      { q: "Is private messaging before family involvement allowed?", a: "Islamic boundaries discourage khulwa (unsupervised private seclusion). shadiAmour encourages purposeful, compatibility-focused conversation with family awareness rather than open-ended chatting." },
      { q: "Does shadiAmour require wali involvement?", a: "Family and wali involvement is built into the platform's design rather than treated as an afterthought, and is actively encouraged for every member." },
      { q: "How does shadiAmour keep the environment halal?", a: "Every profile is created with the explicit intention of Nikah, and our moderation team reviews profiles to keep the environment serious, respectful, and free of dating-app culture." },
      { q: "Is joining shadiAmour free?", a: "Yes — creating a profile and browsing verified members is free." }
    ],
    pageFaqs: [
      { q: "What exactly does \"halal marriage\" mean?", a: "It describes the entire process of coming together — how two people meet, communicate, and who is involved — not just that both parties are Muslim." },
      { q: "Is private messaging before family involvement allowed?", a: "Islamic boundaries discourage khulwa (unsupervised private seclusion). shadiAmour encourages purposeful, compatibility-focused conversation with family awareness rather than open-ended chatting." },
      { q: "Does shadiAmour require wali involvement?", a: "Family and wali involvement is built into the platform's design rather than treated as an afterthought, and is actively encouraged for every member." },
      { q: "How does shadiAmour keep the environment halal?", a: "Every profile is created with the explicit intention of Nikah, and our moderation team reviews profiles to keep the environment serious, respectful, and free of dating-app culture." },
      { q: "Is joining shadiAmour free?", a: "Yes — creating a profile and browsing verified members is free." }
    ],
    bodyContent: `
      <div class="prose max-w-none">
        <p class="text-lg text-gray-700 mb-6 leading-relaxed">"Halal marriage" is not simply marriage between two Muslims — it describes the entire process by which two people come together: how they meet, how they communicate, and who is involved along the way. A halal approach protects both parties from the emotional and spiritual harm caused by undisciplined, dating-style interactions.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">What Makes the Process Halal</h2>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">The intention is marriage from the very first conversation, never casual companionship.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">There is no khulwa (unsupervised private seclusion) between unrelated men and women.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">A wali or family member is aware of, and ideally involved in, the process.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Conversations stay purposeful — discussing compatibility, values, and future goals rather than open-ended chatting.</span></li>
        </ul>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Why This Matters More Than Ever in the UK</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">Mainstream dating apps normalise extended, unchaperoned, often non-committal interactions that conflict directly with Islamic boundaries. Many British Muslims feel caught between this culture and a desire to do things the right way — which is exactly the gap a halal marriage site is designed to close.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">How shadiAmour Keeps the Process Halal</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">Every profile on shadiAmour is created with the explicit intention of Nikah. Family and wali involvement is built into the platform rather than treated as an afterthought, and our moderation team reviews profiles to keep the environment serious, respectful, and free of dating-app culture.</p>

        <div class="bg-primary/5 rounded-2xl p-6 border border-primary/10 mt-8">
          <p class="text-gray-700 font-medium">Muslim Marriage London • Muslim Matchmaking Leicester • Muslim Rishta Birmingham • Halal Marriage Manchester • Muslim Matrimony Bradford • Islamic Marriage Luton • Muslim Shaadi Bolton • Muslim Matrimonial Sites Oldham • Online Nikah UK • Pakistani Muslim Marriage UK • Bengali Muslim Matrimony UK</p>
        </div>
      </div>
    `
  },
  {
    path: "/muslim-matrimonial",
    pageTitle: "Muslim Matrimonial UK — Building Your Biodata for a Respectable Rishta | shadiAmour",
    h1: "Muslim Matrimonial UK — Building Your Biodata for a Respectable Rishta",
    heroSubtitle: "A strong matrimonial biodata is the foundation of a respectable rishta. Here's what belongs in yours, and how shadiAmour brings the tradition online.",
    metaDescription: "Everything you need to know about the Muslim matrimonial process in the UK — biodata, family introductions, and matrimonial etiquette — powered by shadiAmour.",
    keywords: "Muslim matrimonial UK, Muslim matrimonial site, Muslim matrimony website, matrimonial biodata Muslim, Muslim matrimonial profile UK",
    canonicalPath: "/muslim-matrimonial",
    ctaHeading: "Build Your Matrimonial Profile Today",
    ctaSubtext: "Registration is free and every profile is reviewed by our moderation team before it goes live.",
    relatedLinks: [
      { url: "/muslim-rishta", label: "The Rishta Tradition, Modernised" },
      { url: "/verified-muslim-profiles", label: "How Verification Works" },
      { url: "/muslim-matchmaking", label: "How Our Matchmaking Works" },
      { url: "/find-muslim-spouse", label: "A Step-by-Step Guide to Finding a Spouse" },
      { url: "/muslim-marriage", label: "The Islamic Approach to Marriage" }
    ],
    pageFaqSchema: [
      { q: "What is a matrimonial biodata?", a: "A clear, honest summary of who you are — your family background, religious practice, education, and what you're looking for in a spouse — traditionally used by families to review a match." },
      { q: "What should I include in my profile?", a: "Religious practice, family background, education and career, and clear expectations of what you're looking for and what you won't compromise on." },
      { q: "Can my parents be involved in reviewing my profile?", a: "Yes. A matrimonial biodata is built for parents and guardians to review alongside their son or daughter, keeping the process transparent and rooted in family involvement." },
      { q: "Are shadiAmour matrimonial profiles checked?", a: "Yes — every profile is reviewed by our moderation team for accuracy and seriousness before it goes live." },
      { q: "Is it free to create a matrimonial profile?", a: "Yes, creating and browsing profiles on shadiAmour is free." }
    ],
    pageFaqs: [
      { q: "What is a matrimonial biodata?", a: "A clear, honest summary of who you are — your family background, religious practice, education, and what you're looking for in a spouse — traditionally used by families to review a match." },
      { q: "What should I include in my profile?", a: "Religious practice, family background, education and career, and clear expectations of what you're looking for and what you won't compromise on." },
      { q: "Can my parents be involved in reviewing my profile?", a: "Yes. A matrimonial biodata is built for parents and guardians to review alongside their son or daughter, keeping the process transparent and rooted in family involvement." },
      { q: "Are shadiAmour matrimonial profiles checked?", a: "Yes — every profile is reviewed by our moderation team for accuracy and seriousness before it goes live." },
      { q: "Is it free to create a matrimonial profile?", a: "Yes, creating and browsing profiles on shadiAmour is free." }
    ],
    bodyContent: `
      <div class="prose max-w-none">
        <p class="text-lg text-gray-700 mb-6 leading-relaxed">The matrimonial tradition — rooted in South Asian and broader Muslim culture — centres on a structured biodata: a clear, honest summary of who you are, your family background, your religious practice, and what you are looking for in a spouse. A matrimonial site simply brings this tradition online, while keeping its dignity intact.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">What Belongs in a Strong Matrimonial Profile</h2>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Religious practice — sect, level of observance, and importance of deen in daily life.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Family background — parents' origin, profession, and household values.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Education and career — honestly presented, without exaggeration.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Clear expectations — what you are looking for, and what you are not willing to compromise on.</span></li>
        </ul>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Why Families Still Value the Matrimonial Process</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">Unlike casual dating profiles, a matrimonial biodata is built for parents and guardians to review alongside their son or daughter. It keeps the process transparent and rooted in family involvement — a structure many British Muslim families actively prefer over informal introductions.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">shadiAmour's Matrimonial Profile Standards</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">shadiAmour profiles are structured around the same information a traditional matrimonial biodata would include, reviewed by our moderation team for accuracy and seriousness before they go live — giving families confidence in every profile they view.</p>

        <div class="bg-primary/5 rounded-2xl p-6 border border-primary/10 mt-8">
          <p class="text-gray-700 font-medium">Muslim Marriage London • Muslim Matchmaking Leicester • Muslim Rishta Birmingham • Halal Marriage Manchester • Muslim Matrimony Bradford • Islamic Marriage Luton • Muslim Shaadi Bolton • Muslim Matrimonial Sites Oldham • Online Nikah UK • Pakistani Muslim Marriage UK • Bengali Muslim Matrimony UK</p>
        </div>
      </div>
    `
  },
  {
    path: "/muslim-matchmaking",
    pageTitle: "Muslim Matchmaking UK — Where Tradition Meets Trusted Technology | shadiAmour",
    h1: "Muslim Matchmaking UK — Where Tradition Meets Trusted Technology",
    heroSubtitle: "The trusted auntie network, extended online. See what real compatibility looks like, and how shadiAmour blends smart filters with family judgement.",
    metaDescription: "Discover how Muslim matchmaking works in the UK — combining family wisdom, Islamic compatibility, and smart filters — through shadiAmour's matchmaking platform.",
    keywords: "Muslim matchmaking UK, Muslim matchmaking service, online Muslim matchmaking, Islamic matchmaking site, Muslim matchmaker UK",
    canonicalPath: "/muslim-matchmaking",
    ctaHeading: "Let Your Search Reach Further",
    ctaSubtext: "Join shadiAmour and filter by the things that genuinely matter — practice, values, and family expectations.",
    relatedLinks: [
      { url: "/muslim-matrimonial", label: "Building Your Matrimonial Biodata" },
      { url: "/muslim-rishta", label: "The Rishta Tradition, Modernised" },
      { url: "/trusted-muslim-matchmaking", label: "Why Trust Comes First" },
      { url: "/find-muslim-spouse", label: "A Step-by-Step Guide to Finding a Spouse" },
      { url: "/muslim-marriage", label: "The Islamic Approach to Marriage" }
    ],
    pageFaqSchema: [
      { q: "How is online matchmaking different from the traditional \"auntie network\"?", a: "It doesn't replace that wisdom — it extends it, reaching beyond the limits of one's immediate community while keeping the same compatibility-first approach." },
      { q: "What does real compatibility depend on?", a: "Shared level of religious practice, aligned views on family roles and long-term goals, compatible expectations around extended family, and similar attitudes toward finances and education." },
      { q: "Can filters alone find me the right match?", a: "No. Filters for age, location, and sect are useful, but they cannot measure sabr, akhlaq, or how someone handles disagreement — good matchmaking blends filtering with family judgement." },
      { q: "What can I filter by on shadiAmour?", a: "Location, sect, ethnicity, and religious practice, while keeping wali and family involvement built into every profile." },
      { q: "Is shadiAmour's matchmaking free to use?", a: "Yes — searching and filtering profiles is free." }
    ],
    pageFaqs: [
      { q: "How is online matchmaking different from the traditional \"auntie network\"?", a: "It doesn't replace that wisdom — it extends it, reaching beyond the limits of one's immediate community while keeping the same compatibility-first approach." },
      { q: "What does real compatibility depend on?", a: "Shared level of religious practice, aligned views on family roles and long-term goals, compatible expectations around extended family, and similar attitudes toward finances and education." },
      { q: "Can filters alone find me the right match?", a: "No. Filters for age, location, and sect are useful, but they cannot measure sabr, akhlaq, or how someone handles disagreement — good matchmaking blends filtering with family judgement." },
      { q: "What can I filter by on shadiAmour?", a: "Location, sect, ethnicity, and religious practice, while keeping wali and family involvement built into every profile." },
      { q: "Is shadiAmour's matchmaking free to use?", a: "Yes — searching and filtering profiles is free." }
    ],
    bodyContent: `
      <div class="prose max-w-none">
        <p class="text-lg text-gray-700 mb-6 leading-relaxed">For generations, Muslim matchmaking relied on the trusted "auntie network" — relatives and community elders who knew families well enough to suggest a suitable match. Online matchmaking doesn't replace this wisdom; it extends it, reaching beyond the limits of one's immediate community while keeping the same compatibility-first approach.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">What Real Compatibility Looks Like</h2>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Shared level of religious practice — not just shared label of "Muslim."</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Aligned views on family roles, parenting, and long-term life goals.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Compatible expectations around extended family involvement.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Similar attitudes toward finances, education, and where you intend to settle.</span></li>
        </ul>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">The Limits of Algorithms Alone</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">Filters for age, location, and sect are useful, but they cannot measure sabr, akhlaq, or how someone handles disagreement. Good matchmaking blends practical filtering with space for family judgement and personal discernment.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">How shadiAmour Approaches Matchmaking</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">shadiAmour lets you filter by location, sect, ethnicity, and religious practice, while keeping wali and family involvement built into every profile — so technology supports the matchmaking process rather than replacing the human judgement behind it.</p>

        <div class="bg-primary/5 rounded-2xl p-6 border border-primary/10 mt-8">
          <p class="text-gray-700 font-medium">Muslim Marriage London • Muslim Matchmaking Leicester • Muslim Rishta Birmingham • Halal Marriage Manchester • Muslim Matrimony Bradford • Islamic Marriage Luton • Muslim Shaadi Bolton • Muslim Matrimonial Sites Oldham • Online Nikah UK • Pakistani Muslim Marriage UK • Bengali Muslim Matrimony UK</p>
        </div>
      </div>
    `
  },
  {
    path: "/muslim-rishta",
    pageTitle: "Muslim Rishta UK — Modern Rishta the Respectable Way | shadiAmour",
    h1: "Muslim Rishta UK — Modern Rishta the Respectable Way",
    heroSubtitle: "The rishta tradition has always relied on family trust and respectful pacing. See why it's getting harder to find locally, and how shadiAmour extends it online.",
    metaDescription: "Find a respectable Muslim rishta in the UK the halal way — understand rishta etiquette, family involvement, and how shadiAmour modernises the rishta process.",
    keywords: "Muslim rishta UK, rishta website UK, Pakistani rishta UK, Bengali rishta UK, online rishta service, Muslim rishta site",
    canonicalPath: "/muslim-rishta",
    ctaHeading: "Extend Your Rishta Search",
    ctaSubtext: "Join shadiAmour to reach verified families beyond your immediate network, without losing the etiquette that makes rishta work.",
    relatedLinks: [
      { url: "/muslim-matrimonial", label: "Building Your Matrimonial Biodata" },
      { url: "/halal-marriage", label: "What Makes a Marriage Process Halal" },
      { url: "/muslim-matchmaking", label: "How Our Matchmaking Works" },
      { url: "/verified-muslim-profiles", label: "Why Verified Profiles Matter" },
      { url: "/find-muslim-spouse", label: "A Step-by-Step Guide to Finding a Spouse" }
    ],
    pageFaqSchema: [
      { q: "What is rishta?", a: "The South Asian Muslim tradition of proposing marriage through family introduction, where families know each other, expectations are discussed openly, and the process moves at a respectful pace." },
      { q: "Why is the traditional rishta process getting harder?", a: "Smaller, more dispersed Muslim communities, fewer extended family networks living locally, and diaspora families wanting matches that respect both British upbringing and cultural roots." },
      { q: "What rishta etiquette should still apply online?", a: "Approach with sincerity, be transparent with your own family early, and avoid prolonged one-to-one contact before family involvement begins." },
      { q: "Does shadiAmour support rishta for specific communities?", a: "Yes — Pakistani, Bengali, Arab, and Indian Muslim families can all use shadiAmour to extend their rishta search beyond their immediate network." },
      { q: "Is starting a rishta search on shadiAmour free?", a: "Yes, creating a profile and searching is free." }
    ],
    pageFaqs: [
      { q: "What is rishta?", a: "The South Asian Muslim tradition of proposing marriage through family introduction, where families know each other, expectations are discussed openly, and the process moves at a respectful pace." },
      { q: "Why is the traditional rishta process getting harder?", a: "Smaller, more dispersed Muslim communities, fewer extended family networks living locally, and diaspora families wanting matches that respect both British upbringing and cultural roots." },
      { q: "What rishta etiquette should still apply online?", a: "Approach with sincerity, be transparent with your own family early, and avoid prolonged one-to-one contact before family involvement begins." },
      { q: "Does shadiAmour support rishta for specific communities?", a: "Yes — Pakistani, Bengali, Arab, and Indian Muslim families can all use shadiAmour to extend their rishta search beyond their immediate network." },
      { q: "Is starting a rishta search on shadiAmour free?", a: "Yes, creating a profile and searching is free." }
    ],
    bodyContent: `
      <div class="prose max-w-none">
        <p class="text-lg text-gray-700 mb-6 leading-relaxed">Rishta — the South Asian Muslim tradition of proposing marriage through family introduction — remains one of the most trusted ways Muslims in the UK find a spouse. It carries built-in safeguards: families know each other, expectations are discussed openly, and the process moves at a respectful pace.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Why the Traditional Rishta Process Is Getting Harder</h2>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Smaller, more dispersed Muslim communities across UK towns and suburbs.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Fewer extended family networks living locally to make introductions.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Diaspora families wanting matches that respect both British upbringing and cultural roots.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Pressure to find a rishta quickly, without lowering standards on deen or compatibility.</span></li>
        </ul>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Rishta Etiquette Worth Preserving</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">Even online, good rishta etiquette holds: approach with sincerity, be transparent with your own family early, and avoid prolonged one-to-one contact before family involvement begins.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">shadiAmour's Modern Take on Rishta</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">shadiAmour gives Pakistani, Bengali, Arab, and Indian Muslim families a verified, structured place to extend their rishta search beyond their immediate network — without abandoning the family involvement and etiquette that make the rishta process trusted in the first place.</p>

        <div class="bg-primary/5 rounded-2xl p-6 border border-primary/10 mt-8">
          <p class="text-gray-700 font-medium">Muslim Marriage London • Muslim Matchmaking Leicester • Muslim Rishta Birmingham • Halal Marriage Manchester • Muslim Matrimony Bradford • Islamic Marriage Luton • Muslim Shaadi Bolton • Muslim Matrimonial Sites Oldham • Online Nikah UK • Pakistani Muslim Marriage UK • Bengali Muslim Matrimony UK</p>
        </div>
      </div>
    `
  },
  {
    path: "/find-muslim-spouse",
    pageTitle: "How to Find a Muslim Spouse in the UK — A Step-by-Step Guide | shadiAmour",
    h1: "How to Find a Muslim Spouse in the UK — A Step-by-Step Guide",
    heroSubtitle: "A practical, six-step path to finding a Muslim spouse — from setting your niyyah to a halal meeting — with shadiAmour supporting every step.",
    metaDescription: "A practical step-by-step guide to finding a Muslim spouse in the UK — from intention to Nikah — with shadiAmour supporting every step.",
    keywords: "find Muslim spouse UK, how to find a Muslim spouse, find a Muslim partner UK, find Muslim husband UK, find Muslim wife UK",
    canonicalPath: "/find-muslim-spouse",
    ctaHeading: "Start Step One Today",
    ctaSubtext: "Create your free shadiAmour profile and put this guide into practice.",
    relatedLinks: [
      { url: "/muslim-marriage", label: "The Islamic Approach to Marriage" },
      { url: "/halal-marriage", label: "What Makes a Marriage Process Halal" },
      { url: "/muslim-matchmaking", label: "How Our Matchmaking Works" },
      { url: "/verified-muslim-profiles", label: "Why Verified Profiles Matter" },
      { url: "/muslim-matrimonial", label: "Building Your Matrimonial Biodata" }
    ],
    pageFaqSchema: [
      { q: "What's the first step to finding a Muslim spouse?", a: "Setting your niyyah — being clear with yourself that this search is for marriage, not validation or distraction." },
      { q: "How does istikhara fit into the process?", a: "It should become a habit — praying for guidance before, not just after, a proposal comes your way." },
      { q: "When should I involve my wali or family?", a: "Early. Don't wait until things are \"serious\" to bring them in." },
      { q: "What should I prioritise when evaluating a match?", a: "Deen, character, and compatibility first; everything else is secondary." },
      { q: "How does shadiAmour support this journey?", a: "With verified profiles, wali-friendly account options, and a marriage-only environment, giving each step in this guide a practical home." }
    ],
    pageFaqs: [
      { q: "What's the first step to finding a Muslim spouse?", a: "Setting your niyyah — being clear with yourself that this search is for marriage, not validation or distraction." },
      { q: "How does istikhara fit into the process?", a: "It should become a habit — praying for guidance before, not just after, a proposal comes your way." },
      { q: "When should I involve my wali or family?", a: "Early. Don't wait until things are \"serious\" to bring them in." },
      { q: "What should I prioritise when evaluating a match?", a: "Deen, character, and compatibility first; everything else is secondary." },
      { q: "How does shadiAmour support this journey?", a: "With verified profiles, wali-friendly account options, and a marriage-only environment, giving each step in this guide a practical home." }
    ],
    bodyContent: `
      <div class="prose max-w-none">
        <p class="text-lg text-gray-700 mb-6 leading-relaxed">Finding a Muslim spouse in the UK doesn't have to mean choosing between an outdated approach and a haram one. Here is a practical, step-by-step path that stays true to Islamic principles while using the tools available to you today.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">A Step-by-Step Guide</h2>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Step 1 — Set your niyyah. Be clear with yourself that this search is for marriage, not validation or distraction.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Step 2 — Make istikhara a habit. Pray for guidance before, not just after, a proposal comes your way.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Step 3 — Define your real priorities. Deen, character, and compatibility first; list everything else as secondary.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Step 4 — Involve your wali or family early. Don't wait until things are "serious" to bring them in.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Step 5 — Choose a halal-first platform. A marriage-only environment with verification saves you time and protects your deen.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Step 6 — Meet halal, decide clearly. Supervised conversation, honest questions, and a timely decision — yes or no.</span></li>
        </ul>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Where shadiAmour Fits In</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">shadiAmour is built around this exact journey — verified profiles, wali-friendly account options, and a marriage-only environment — so each step above has a practical home rather than staying theoretical.</p>

        <div class="bg-primary/5 rounded-2xl p-6 border border-primary/10 mt-8">
          <p class="text-gray-700 font-medium">Muslim Marriage London • Muslim Matchmaking Leicester • Muslim Rishta Birmingham • Halal Marriage Manchester • Muslim Matrimony Bradford • Islamic Marriage Luton • Muslim Shaadi Bolton • Muslim Matrimonial Sites Oldham • Online Nikah UK • Pakistani Muslim Marriage UK • Bengali Muslim Matrimony UK</p>
        </div>
      </div>
    `
  },
  {
    path: "/verified-muslim-profiles",
    pageTitle: "Verified Muslim Profiles — Why Authenticity Matters in Your Marriage Search | shadiAmour",
    h1: "Verified Muslim Profiles — Why Authenticity Matters in Your Marriage Search",
    heroSubtitle: "Fake profiles and time-wasters don't just waste your time — they damage trust in the whole matrimonial process. See how shadiAmour keeps every profile genuine.",
    metaDescription: "Learn why profile verification matters in Muslim matrimony and how shadiAmour's verification process protects you from fake accounts and time-wasters.",
    keywords: "verified Muslim profiles, verified Muslim matrimony, Muslim marriage site verification, genuine Muslim profiles UK, safe Muslim marriage site",
    canonicalPath: "/verified-muslim-profiles",
    ctaHeading: "Search With Confidence",
    ctaSubtext: "Every profile you see on shadiAmour has already passed our moderation review.",
    relatedLinks: [
      { url: "/trusted-muslim-matchmaking", label: "Why Trust Comes First" },
      { url: "/muslim-matrimonial", label: "Building Your Matrimonial Biodata" },
      { url: "/halal-marriage", label: "What Makes a Marriage Process Halal" },
      { url: "/best-muslim-marriage-website", label: "What Sets shadiAmour Apart" },
      { url: "/find-muslim-spouse", label: "A Step-by-Step Guide to Finding a Spouse" }
    ],
    pageFaqSchema: [
      { q: "Why does verification matter so much in Muslim matrimony?", a: "Fake profiles and time-wasters don't just waste your time — they can damage trust in the entire matrimonial process, and affect your family's reputation in tight-knit communities." },
      { q: "How can I spot a genuine profile?", a: "Genuine profiles tend to include consistent, specific details about family, religious practice, and intentions. Vague answers or pressure to move off-platform quickly are signs to treat with caution." },
      { q: "How does shadiAmour verify profiles?", a: "Every profile is reviewed by our moderation team before it goes live, with reporting tools available for ongoing checks." },
      { q: "Can parents review profiles with confidence?", a: "Yes — verification gives parents and guardians confidence when reviewing profiles on a son or daughter's behalf." },
      { q: "Does shadiAmour support family-managed accounts?", a: "Yes, family-managed accounts and wali involvement are both actively supported." }
    ],
    pageFaqs: [
      { q: "Why does verification matter so much in Muslim matrimony?", a: "Fake profiles and time-wasters don't just waste your time — they can damage trust in the entire matrimonial process, and affect your family's reputation in tight-knit communities." },
      { q: "How can I spot a genuine profile?", a: "Genuine profiles tend to include consistent, specific details about family, religious practice, and intentions. Vague answers or pressure to move off-platform quickly are signs to treat with caution." },
      { q: "How does shadiAmour verify profiles?", a: "Every profile is reviewed by our moderation team before it goes live, with reporting tools available for ongoing checks." },
      { q: "Can parents review profiles with confidence?", a: "Yes — verification gives parents and guardians confidence when reviewing profiles on a son or daughter's behalf." },
      { q: "Does shadiAmour support family-managed accounts?", a: "Yes, family-managed accounts and wali involvement are both actively supported." }
    ],
    bodyContent: `
      <div class="prose max-w-none">
        <p class="text-lg text-gray-700 mb-6 leading-relaxed">One of the biggest fears Muslims face when searching for a spouse online is simple: is this person who they say they are? Fake profiles, inactive accounts, and time-wasters don't just waste your time — they can damage trust in the entire matrimonial process.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Why Verification Should Never Be Optional</h2>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">It protects your family's reputation, especially in tight-knit communities.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">It reduces the emotional toll of investing time in a connection that was never real.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">It gives parents and guardians confidence when reviewing profiles on a son or daughter's behalf.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">It filters out the casual time-wasters that mainstream dating culture normalises.</span></li>
        </ul>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Spotting the Difference</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">Genuine matrimonial profiles tend to include consistent, specific details about family, religious practice, and intentions. Vague answers, reluctance to involve family, or pressure to move conversations off-platform quickly are all signs worth treating with caution.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">How shadiAmour Verifies Every Profile</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">Every profile on shadiAmour is reviewed by our moderation team before it goes live. We support family-managed accounts, encourage wali involvement, and provide reporting tools — giving you a matrimony search built on genuine, accountable profiles rather than guesswork.</p>

        <div class="bg-primary/5 rounded-2xl p-6 border border-primary/10 mt-8">
          <p class="text-gray-700 font-medium">Muslim Marriage London • Muslim Matchmaking Leicester • Muslim Rishta Birmingham • Halal Marriage Manchester • Muslim Matrimony Bradford • Islamic Marriage Luton • Muslim Shaadi Bolton • Muslim Matrimonial Sites Oldham • Online Nikah UK • Pakistani Muslim Marriage UK • Bengali Muslim Matrimony UK</p>
        </div>
      </div>
    `
  },
  {
    path: "/trusted-muslim-matchmaking",
    pageTitle: "Trusted Muslim Matchmaking — Why Reputation and Safety Come First | shadiAmour",
    h1: "Trusted Muslim Matchmaking — Why Reputation and Safety Come First",
    heroSubtitle: "Marriage decisions affect two families, not just two people. See what actually builds trust in a matchmaking platform, and how shadiAmour earns it.",
    metaDescription: "Discover why trust is the foundation of Muslim matchmaking and how shadiAmour has built a reputation as a trusted halal marriage platform in the UK.",
    keywords: "trusted Muslim matchmaking, trusted Muslim marriage site UK, reliable Muslim matchmaking, trustworthy Muslim matrimony site, safe Muslim matchmaking UK",
    canonicalPath: "/trusted-muslim-matchmaking",
    ctaHeading: "Join a Platform Built on Trust",
    ctaSubtext: "See why serious Muslim marriage seekers and their families rely on shadiAmour.",
    relatedLinks: [
      { url: "/verified-muslim-profiles", label: "Why Verified Profiles Matter" },
      { url: "/best-muslim-marriage-website", label: "What Sets shadiAmour Apart" },
      { url: "/halal-marriage", label: "What Makes a Marriage Process Halal" },
      { url: "/muslim-matchmaking", label: "How Our Matchmaking Works" },
      { url: "/free-muslim-marriage-site", label: "Halal Marriage Without the Price Barrier" }
    ],
    pageFaqSchema: [
      { q: "Why is trust so important in Muslim matchmaking?", a: "Marriage decisions affect not just two individuals but two families and, often, an entire community's perception of them — without trust, even a well-designed platform fails." },
      { q: "What builds real trust in a matchmaking platform?", a: "Consistent, visible moderation, transparent data policies, genuine support for family and wali involvement, and a track record of serious, marriage-focused users." },
      { q: "Why does reputation matter more in tight-knit communities?", a: "Word travels quickly, so a platform's reputation for discretion, safety, and seriousness directly affects whether families feel comfortable using it." },
      { q: "How does shadiAmour build this trust?", a: "By combining moderation, UK GDPR-compliant data protection, and wali-friendly account design with a strict marriage-only environment." },
      { q: "Is shadiAmour data handling compliant with UK law?", a: "Yes, shadiAmour follows UK GDPR-compliant data protection standards." }
    ],
    pageFaqs: [
      { q: "Why is trust so important in Muslim matchmaking?", a: "Marriage decisions affect not just two individuals but two families and, often, an entire community's perception of them — without trust, even a well-designed platform fails." },
      { q: "What builds real trust in a matchmaking platform?", a: "Consistent, visible moderation, transparent data policies, genuine support for family and wali involvement, and a track record of serious, marriage-focused users." },
      { q: "Why does reputation matter more in tight-knit communities?", a: "Word travels quickly, so a platform's reputation for discretion, safety, and seriousness directly affects whether families feel comfortable using it." },
      { q: "How does shadiAmour build this trust?", a: "By combining moderation, UK GDPR-compliant data protection, and wali-friendly account design with a strict marriage-only environment." },
      { q: "Is shadiAmour data handling compliant with UK law?", a: "Yes, shadiAmour follows UK GDPR-compliant data protection standards." }
    ],
    bodyContent: `
      <div class="prose max-w-none">
        <p class="text-lg text-gray-700 mb-6 leading-relaxed">Trust is the single most important currency in Muslim matchmaking. Without it, even the most well-designed platform fails — because marriage decisions affect not just two individuals, but two families and, often, an entire community's perception of them.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">What Builds Real Trust in a Matchmaking Platform</h2>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Consistent, visible moderation rather than a one-time sign-up check.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Transparent policies on data use, privacy, and how profiles are reviewed.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Genuine support for family and wali involvement, not just an optional checkbox.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">A track record of serious, marriage-focused users rather than casual browsers.</span></li>
        </ul>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Why Reputation Matters More in Tight-Knit Communities</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">In many British Muslim communities, word travels quickly. A platform's reputation for discretion, safety, and seriousness directly affects whether families feel comfortable using it — and whether a profile is taken seriously by others.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">How shadiAmour Earns That Trust</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">shadiAmour combines moderation, UK GDPR-compliant data protection, and wali-friendly account design with a strict marriage-only environment — building the kind of reputation that serious Muslim marriage seekers and their families can rely on.</p>

        <div class="bg-primary/5 rounded-2xl p-6 border border-primary/10 mt-8">
          <p class="text-gray-700 font-medium">Muslim Marriage London • Muslim Matchmaking Leicester • Muslim Rishta Birmingham • Halal Marriage Manchester • Muslim Matrimony Bradford • Islamic Marriage Luton • Muslim Shaadi Bolton • Muslim Matrimonial Sites Oldham • Online Nikah UK • Pakistani Muslim Marriage UK • Bengali Muslim Matrimony UK</p>
        </div>
      </div>
    `
  },
  {
    path: "/best-muslim-marriage-website",
    pageTitle: "Best Muslim Marriage Website UK — What Sets shadiAmour Apart | shadiAmour",
    h1: "Best Muslim Marriage Website UK — What Sets shadiAmour Apart",
    heroSubtitle: "\"Best\" means something different to everyone, but a few criteria separate a serious halal-first platform from a dating app wearing a matrimonial label.",
    metaDescription: "Looking for the best Muslim marriage website in the UK? See what makes shadiAmour the trusted choice for halal marriage, verified profiles, and wali-friendly matchmaking.",
    keywords: "best Muslim marriage website UK, best Muslim matrimony site, best halal marriage site UK, top Muslim marriage website, best Islamic marriage site UK",
    canonicalPath: "/best-muslim-marriage-website",
    ctaHeading: "See the Difference for Yourself",
    ctaSubtext: "Create a free profile and experience a platform built specifically around what matters.",
    relatedLinks: [
      { url: "/trusted-muslim-matchmaking", label: "Why Trust Comes First" },
      { url: "/verified-muslim-profiles", label: "Why Verified Profiles Matter" },
      { url: "/halal-marriage", label: "What Makes a Marriage Process Halal" },
      { url: "/free-muslim-marriage-site", label: "Halal Marriage Without the Price Barrier" },
      { url: "/muslim-marriage", label: "The Islamic Approach to Marriage" }
    ],
    pageFaqSchema: [
      { q: "What should I look for in a Muslim marriage website?", a: "A marriage-only environment, genuine profile verification and active moderation, built-in support for wali and family involvement, a UK-focused community, and clear GDPR-compliant data protection." },
      { q: "What makes shadiAmour stand out?", a: "It was built specifically around these criteria — a halal-first UK Muslim marriage platform with verified profiles, wali-friendly design, and a strict marriage-only intention behind every account." },
      { q: "Which communities is shadiAmour built for?", a: "British Pakistani, Bengali, Arab, and Indian Muslim communities who want a structured, dignified alternative to mainstream apps." },
      { q: "Who is shadiAmour best suited for?", a: "Serious marriage seekers, parents managing a profile on behalf of their child, and anyone who wants their search rooted in Islamic values rather than casual dating norms." },
      { q: "Is shadiAmour free to use?", a: "Yes, creating a profile and browsing is free." }
    ],
    pageFaqs: [
      { q: "What should I look for in a Muslim marriage website?", a: "A marriage-only environment, genuine profile verification and active moderation, built-in support for wali and family involvement, a UK-focused community, and clear GDPR-compliant data protection." },
      { q: "What makes shadiAmour stand out?", a: "It was built specifically around these criteria — a halal-first UK Muslim marriage platform with verified profiles, wali-friendly design, and a strict marriage-only intention behind every account." },
      { q: "Which communities is shadiAmour built for?", a: "British Pakistani, Bengali, Arab, and Indian Muslim communities who want a structured, dignified alternative to mainstream apps." },
      { q: "Who is shadiAmour best suited for?", a: "Serious marriage seekers, parents managing a profile on behalf of their child, and anyone who wants their search rooted in Islamic values rather than casual dating norms." },
      { q: "Is shadiAmour free to use?", a: "Yes, creating a profile and browsing is free." }
    ],
    bodyContent: `
      <div class="prose max-w-none">
        <p class="text-lg text-gray-700 mb-6 leading-relaxed">"Best" means something different for every Muslim marriage seeker — but a handful of criteria consistently separate a serious, halal-first platform from a generic dating app wearing a matrimonial label.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">What to Look for in a Muslim Marriage Website</h2>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">A marriage-only environment, with no casual chatting or dating culture.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Genuine profile verification and active moderation.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Built-in support for wali and family involvement.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">A UK-focused community that understands British Muslim cultural context.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Clear, GDPR-compliant data protection.</span></li>
        </ul>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Where shadiAmour Stands Out</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">shadiAmour was built specifically around these criteria — a halal-first UK Muslim marriage platform with verified profiles, wali-friendly design, and a strict marriage-only intention behind every account. It is built for British Pakistani, Bengali, Arab, and Indian Muslim communities who want a structured, dignified alternative to mainstream apps.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Who shadiAmour Is Best Suited For</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">Serious marriage seekers, parents managing a profile on behalf of their child, and anyone who wants their search rooted in Islamic values rather than casual dating norms will find shadiAmour designed with exactly their needs in mind.</p>

        <div class="bg-primary/5 rounded-2xl p-6 border border-primary/10 mt-8">
          <p class="text-gray-700 font-medium">Muslim Marriage London • Muslim Matchmaking Leicester • Muslim Rishta Birmingham • Halal Marriage Manchester • Muslim Matrimony Bradford • Islamic Marriage Luton • Muslim Shaadi Bolton • Muslim Matrimonial Sites Oldham • Online Nikah UK • Pakistani Muslim Marriage UK • Bengali Muslim Matrimony UK</p>
        </div>
      </div>
    `
  },
  {
    path: "/free-muslim-marriage-site",
    pageTitle: "Free Muslim Marriage Site UK — Halal Marriage Without the Price Barrier | shadiAmour",
    h1: "Free Muslim Marriage Site UK — Halal Marriage Without the Price Barrier",
    heroSubtitle: "Cost should never delay fulfilling half of your deen. See why free access matters, and how shadiAmour keeps standards high without charging for essentials.",
    metaDescription: "Find out how to search for a Muslim spouse in the UK without cost barriers — explore shadiAmour's free Muslim marriage site features for serious marriage seekers.",
    keywords: "free Muslim marriage site UK, free Muslim matrimony site, free Muslim marriage website, free halal marriage site UK, free Muslim matchmaking UK",
    canonicalPath: "/free-muslim-marriage-site",
    ctaHeading: "Join Free, Today",
    ctaSubtext: "Create a profile, browse verified matches, and begin your halal search — no cost, no compromise.",
    relatedLinks: [
      { url: "/best-muslim-marriage-website", label: "What Sets shadiAmour Apart" },
      { url: "/verified-muslim-profiles", label: "Why Verified Profiles Matter" },
      { url: "/trusted-muslim-matchmaking", label: "Why Trust Comes First" },
      { url: "/muslim-marriage", label: "The Islamic Approach to Marriage" },
      { url: "/find-muslim-spouse", label: "A Step-by-Step Guide to Finding a Spouse" }
    ],
    pageFaqSchema: [
      { q: "Why does free access matter for a Muslim marriage site?", a: "Cost should never be the reason a sincere Muslim marriage seeker delays fulfilling half of their deen — free access removes the price barrier so intention and compatibility decide who finds a spouse." },
      { q: "Who benefits most from free access?", a: "Marriage-minded young Muslims, students, those early in their careers, and parents managing a profile for their son or daughter without financial pressure." },
      { q: "Does free mean lower standards?", a: "No. A free Muslim marriage site can still maintain serious verification, moderation, and a marriage-only environment." },
      { q: "What does shadiAmour offer for free?", a: "Creating a profile, browsing verified matches, and beginning your halal marriage search — all without a financial barrier." },
      { q: "Are there any paid features?", a: "The core marriage search experience is free; the focus stays on finding a sincere, compatible spouse rather than monetisation." }
    ],
    pageFaqs: [
      { q: "Why does free access matter for a Muslim marriage site?", a: "Cost should never be the reason a sincere Muslim marriage seeker delays fulfilling half of their deen — free access removes the price barrier so intention and compatibility decide who finds a spouse." },
      { q: "Who benefits most from free access?", a: "Marriage-minded young Muslims, students, those early in their careers, and parents managing a profile for their son or daughter without financial pressure." },
      { q: "Does free mean lower standards?", a: "No. A free Muslim marriage site can still maintain serious verification, moderation, and a marriage-only environment." },
      { q: "What does shadiAmour offer for free?", a: "Creating a profile, browsing verified matches, and beginning your halal marriage search — all without a financial barrier." },
      { q: "Are there any paid features?", a: "The core marriage search experience is free; the focus stays on finding a sincere, compatible spouse rather than monetisation." }
    ],
    bodyContent: `
      <div class="prose max-w-none">
        <p class="text-lg text-gray-700 mb-6 leading-relaxed">Cost should never be the reason a sincere Muslim marriage seeker delays fulfilling half of their deen. A free-to-join Muslim marriage site removes the price barrier so that intention and compatibility — not budget — decide who finds a spouse.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Why Free Access Matters</h2>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Marriage-minded young Muslims, students, and those early in their careers shouldn't be priced out of a halal search.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Parents managing a profile for their son or daughter can explore options without financial pressure.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Free access encourages more genuine profiles to join, which strengthens the platform for everyone.</span></li>
        </ul>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Free Doesn't Mean Lower Standards</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">A free Muslim marriage site can still maintain serious verification, moderation, and a marriage-only environment. Affordability and authenticity are not in conflict — they simply require a platform built around community trust rather than aggressive monetisation.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">shadiAmour's Approach to Accessibility</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">shadiAmour lets you create a profile, browse verified matches, and begin your halal marriage search without a financial barrier standing between you and your niyyah — keeping the focus where it belongs: on finding a sincere, compatible spouse.</p>

        <div class="bg-primary/5 rounded-2xl p-6 border border-primary/10 mt-8">
          <p class="text-gray-700 font-medium">Muslim Marriage London • Muslim Matchmaking Leicester • Muslim Rishta Birmingham • Halal Marriage Manchester • Muslim Matrimony Bradford • Islamic Marriage Luton • Muslim Shaadi Bolton • Muslim Matrimonial Sites Oldham • Online Nikah UK • Pakistani Muslim Marriage UK • Bengali Muslim Matrimony UK</p>
        </div>
      </div>
    `
  }
];

seoPages.forEach(function(page) {
  app.get(page.path, (req, res) => {
    res.render("seo-page", page);
  });
});
// ============================================
// END SEO LANDING PAGES
// ============================================

// ============================================
// UK CITY LANDING PAGES
// ============================================
require("./views/citylandingpages")(app);
// ============================================
// END UK CITY LANDING PAGES
// ============================================

// ============================================
// RISHTA IN PAKISTAN PAGES
// ============================================
require("./views/rishta-in-pakistan-pages")(app);
// ============================================
// END RISHTA IN PAKISTAN PAGES
// ============================================

// ============================================
// UK & NICHE PAGES
// ============================================
require("./views/uk-and-niche-pages")(app);
// ============================================
// END UK & NICHE PAGES
// ============================================



app.get("/onboarding", isLoggedIn, findUser, (req, res) => {
  const user = req.userData;

  // Check if user has completed onboarding (has all required fields from 8 steps)
  // Step 1: profileFor, gender, username
  // Step 2: name, age, height, maritalStatus
  // Step 3: islamicSect, prays, bornMuslim, islamIsImportantToMeInfo
  // Step 4: city, country, nationality, ethnicity
  // Step 5: highestEducation, work
  // Step 6: lookingForASpouseThatIs, aboutMe
  // Step 7: preferredAgeRange, preferredHeightRange, preferredIslamicSect, willingToConsiderANonUkCitizen, acceptSomeoneWithChildren, acceptADivorcedPerson, acceptAWidow
  // Step 8: contact
  if (user.profileSlug && user.name && user.age && user.height && 
      user.maritalStatus && user.city && user.country && 
      user.highestEducation && user.work && 
      user.lookingForASpouseThatIs && user.aboutMe && user.contact &&
      user.islamicSect && user.prays !== undefined && 
      user.nationality && user.ethnicity) {
    return res.redirect(`/account/info`);
  }

  res.render("onboarding-new", { user });
});
// **NEW**: Save onboarding step
app.post("/api/onboarding/save", isLoggedIn, findUser, async (req, res) => {
  try {
    const user = req.userData;
    const { step, data } = req.body;

    

    // Server-side validation for step 8 (phone number)
    if (Number(step) === 8) {
      const countryCode = data.countryCode;
      const contactRaw = String(data.contact || "");
      const digits = contactRaw.replace(/\D/g, "");

      const phoneRules = {
        "+44": { min: 10, max: 10 },
        "+92": { min: 10, max: 10 },
        "+880": { min: 10, max: 10 },
        "+91": { min: 10, max: 10 },
        "+1": { min: 10, max: 10 },
        "+971": { min: 9, max: 9 },
        "+966": { min: 9, max: 9 },
        "+61": { min: 9, max: 9 },
        "+49": { min: 10, max: 11 },
        "+33": { min: 9, max: 9 },
        "+60": { min: 9, max: 10 },
        "+65": { min: 8, max: 8 },
      };

      const rule = phoneRules[countryCode];
      if (!rule || digits.length < rule.min || digits.length > rule.max) {
        return res.json({
          success: false,
          error: "invalid_phone",
          message: "Please enter a valid phone number for your selected country.",
        });
      }
    }

    // Update user fields based on step
    Object.keys(data).forEach((key) => {
  if (data[key] !== undefined && data[key] !== "" && data[key] !== "N/A") {
    // Handle numeric fields
    if (key === 'age' || key === 'height') {
      user[key] = Number(data[key]) || data[key];
    } else if (key === 'contact') {
      // Strip all non-numeric characters and convert to Number
      const cleanedContact = String(data[key]).replace(/\D/g, '');
      user[key] = cleanedContact ? Number(cleanedContact) : null;
    } else {
      user[key] = data[key];
    }
  }
});

    // Generate profile slug when we have the name (step 2)
    if (step === 2 && user.name && !user.profileSlug) {
      user.profileSlug = await generateUniqueSlug(user);
    }

    // Recompute profile completeness tier
    const newTier = computeProfileTier(user);
    if (user.profileCompletenessTier !== newTier) {
      user.profileCompletenessTier = newTier;
      user.profileTierCalculatedAt = new Date();
    }

    // Check if any scored field was updated (trigger match score recalculation)
    const { SCORED_FIELDS } = require("./config/matching");
    const hasScoredFieldChange = Object.keys(data).some(key => SCORED_FIELDS.includes(key));
    if (hasScoredFieldChange) {
      const QueueService = require("./services/queueService");
      user.matchScoresStaleSince = new Date();
      // Enqueue async score recompute (don't await — fire and forget)
      QueueService.queueRecomputeScores(user._id).catch(err =>
        console.error("Failed to enqueue match score recompute:", err.message)
      );
    }

    await user.save();

    // Update session
    req.session.user = user;

    res.json({
      success: true,
      message: `Step ${step} completed successfully!`,
      isLastStep: Number(step) === 8,
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
    }

    // Set onboarding completion and compute tier
    user.onboardingCompletedAt = new Date();
    user.profileCompletenessTier = computeProfileTier(user);
    user.profileTierCalculatedAt = new Date();
    user.matchScoresStaleSince = new Date();
    await user.save();

    // Enqueue full score recompute for this user
    const QueueService = require("./services/queueService");
    QueueService.queueRecomputeScores(user._id).catch(err =>
      console.error("Failed to enqueue match score recompute:", err.message)
    );

    // Check if KYC verification feature is enabled
    const siteSettings = await GlobalSeoSettings.getSettings();
    const kycEnabled = siteSettings.kycVerificationEnabled !== false; // default true

    // No server-side phone validation - handled on client side
    res.json({
      success: true,
      redirectUrl: kycEnabled ? `/verify-identity` : `/account/info?from=onboarding`,
    });
  } catch (error) {
    console.error("Complete onboarding error:", error);
    res.json({
      success: false,
      error: "Failed to complete onboarding",
    });
  }
});

// ── Legacy Profile Completion Form (for users who didn't do new onboarding) ──
app.get("/complete-missing-fields-for-older-profiles", isLoggedIn, findUser, async (req, res) => {
  const user = req.userData;
  // Build a safe data object for pre-populating the form
  const userData = {
    islamicSect: user.islamicSect || null,
    prays: user.prays,
    bornMuslim: user.bornMuslim,
    islamIsImportantToMeInfo: user.islamIsImportantToMeInfo || null,
    nationality: user.nationality || null,
    ethnicity: user.ethnicity || null,
    lookingForASpouseThatIs: user.lookingForASpouseThatIs || null,
    preferredAgeRange: user.preferredAgeRange || null,
    preferredHeightRange: user.preferredHeightRange || null,
    preferredIslamicSect: user.preferredIslamicSect || null,
    willingToConsiderANonUkCitizen: user.willingToConsiderANonUkCitizen || null,
    acceptSomeoneWithChildren: user.acceptSomeoneWithChildren,
    acceptADivorcedPerson: user.acceptADivorcedPerson,
    acceptAWidow: user.acceptAWidow,
  };
  res.render("complete-legacy-profile", {
    user: req.session.user,
    userData,
  });
});

// API: Save legacy profile completion and trigger score recalculation
app.post("/api/complete-legacy-profile", isLoggedIn, findUser, async (req, res) => {
  try {
    const user = req.userData;
    const data = req.body;

    // Save Islamic identity fields
    if (data.islamicSect) user.islamicSect = data.islamicSect;
    if (data.prays !== undefined && data.prays !== "") user.prays = data.prays === "true" || data.prays === true;
    if (data.bornMuslim !== undefined && data.bornMuslim !== "") user.bornMuslim = data.bornMuslim === "true" || data.bornMuslim === true;
    if (data.islamIsImportantToMeInfo && data.islamIsImportantToMeInfo.length >= 30) {
      user.islamIsImportantToMeInfo = data.islamIsImportantToMeInfo;
    }

    // Location
    if (data.nationality) user.nationality = data.nationality;
    if (data.ethnicity) user.ethnicity = data.ethnicity;

    // About
    if (data.lookingForASpouseThatIs) user.lookingForASpouseThatIs = data.lookingForASpouseThatIs;

    // Partner preferences — age range
    if (data.preferredAgeFrom && data.preferredAgeTo) {
      user.preferredAgeRange = `${data.preferredAgeFrom}-${data.preferredAgeTo}`;
    }
    // Partner preferences — height range
    if (data.preferredHeightFrom && data.preferredHeightTo) {
      user.preferredHeightRange = `${data.preferredHeightFrom}-${data.preferredHeightTo}`;
    }
    if (data.preferredIslamicSect) user.preferredIslamicSect = data.preferredIslamicSect;
    if (data.willingToConsiderANonUkCitizen) user.willingToConsiderANonUkCitizen = data.willingToConsiderANonUkCitizen;
    if (data.acceptSomeoneWithChildren !== undefined && data.acceptSomeoneWithChildren !== "") {
      user.acceptSomeoneWithChildren = data.acceptSomeoneWithChildren === "true" || data.acceptSomeoneWithChildren === true;
    }
    if (data.acceptADivorcedPerson !== undefined && data.acceptADivorcedPerson !== "") {
      user.acceptADivorcedPerson = data.acceptADivorcedPerson === "true" || data.acceptADivorcedPerson === true;
    }
    if (data.acceptAWidow !== undefined && data.acceptAWidow !== "") {
      user.acceptAWidow = data.acceptAWidow === "true" || data.acceptAWidow === true;
    }

    // Recompute profile tier
    user.profileCompletenessTier = computeProfileTier(user);
    user.profileTierCalculatedAt = new Date();
    user.matchScoresStaleSince = new Date();
    await user.save();

    // Enqueue score recompute
    const QueueService = require("./services/queueService");
    QueueService.queueRecomputeScores(user._id).catch(err =>
      console.error("Failed to enqueue match score recompute:", err.message)
    );

    res.json({ success: true, message: "Profile updated. Scores will be recalculated shortly." });
  } catch (error) {
    console.error("Legacy profile save error:", error);
    res.json({ success: false, error: "Failed to save profile: " + error.message });
  }
});

// ── KYC / Identity Verification ─────────────────────────────────────────────

// Step 1: Show KYC page (redirected here from onboarding completion)
app.get("/verify-identity", isLoggedIn, findUser, (req, res) => {
  res.render("verify-identity", { user: req.userData });
});

// Step 2: Receive images + liveness result, save to Cloudinary via KYC storage
app.post(
  "/api/verify-faceAndId",
  isLoggedIn,
  findUser,
  kycUpload.fields([
    { name: "idFront", maxCount: 1 },
    { name: "idBack", maxCount: 1 },
    { name: "selfie", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const user = req.userData;

      // Validate liveness flag
      if (req.body.livenessPassed !== "true") {
        return res.status(400).json({ success: false, error: "Liveness check was not completed." });
      }

      // Validate all three images were uploaded
      if (
        !req.files ||
        !req.files.idFront ||
        !req.files.idBack ||
        !req.files.selfie
      ) {
        return res.status(400).json({ success: false, error: "All three images (ID front, ID back, selfie) are required." });
      }

      user.idFrontUrl = req.files.idFront[0].path;
      user.idBackUrl  = req.files.idBack[0].path;
      user.selfieUrl  = req.files.selfie[0].path;
      user.idVerified   = true;
      user.faceVerified = true;

      await user.save();

      return res.json({
        success: true,
        redirectUrl: "/account/info?from=onboarding",
      });
    } catch (error) {
      console.error("KYC verification error:", error);
      return res.status(500).json({ success: false, error: "Failed to save verification. Please try again." });
    }
  }
);

// ── Admin: KYC verification review ──────────────────────────────────────────

// Toggle KYC verification feature on/off
app.post("/api/admin/settings/toggle-kyc-verification", requireAdminOrModerator, async (req, res) => {
  try {
    const { enabled } = req.body;
    const boolValue = enabled === true || enabled === "true";
    const settings = await GlobalSeoSettings.getSettings();
    settings.kycVerificationEnabled = boolValue;
    await settings.save();
    return res.json({ success: true, kycVerificationEnabled: boolValue });
  } catch (error) {
    console.error("Toggle KYC error:", error);
    return res.status(500).json({ success: false, error: "Failed to update setting." });
  }
});

app.get("/admin/verifications", requireAdminOrModerator, async (req, res) => {
  try {
    const PAGE_SIZE = 20;
    const { filter = "all", page = 1 } = req.query;
    const currentPage = parseInt(page, 10) || 1;

    let query = {};
    if (filter === "both")        query = { idVerified: true, faceVerified: true };
    else if (filter === "id")     query = { idVerified: true, faceVerified: false };
    else if (filter === "face")   query = { faceVerified: true, idVerified: false };
    else if (filter === "unverified") query = { idVerified: false, faceVerified: false };
    else if (filter === "submitted") query = { $or: [{ idFrontUrl: { $ne: '' } }, { selfieUrl: { $ne: '' } }] };

    const totalCount = await User.countDocuments(query);
    const users = await User.find(query)
      .select("username name profilePic idVerified faceVerified idFrontUrl idBackUrl selfieUrl createdAt approvalStatus")
      .sort({ createdAt: -1 })
      .skip((currentPage - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .lean();

    // Stats
    const totalSubmitted = await User.countDocuments({ $or: [{ idFrontUrl: { $ne: '' } }, { selfieUrl: { $ne: '' } }] });
    const bothVerified   = await User.countDocuments({ idVerified: true, faceVerified: true });
    const idOnly         = await User.countDocuments({ idVerified: true, faceVerified: false });
    const faceOnly       = await User.countDocuments({ idVerified: false, faceVerified: true });
    const unverified     = await User.countDocuments({ idVerified: false, faceVerified: false });

    const siteSettings = await GlobalSeoSettings.getSettings();

    res.render("admin/verifications", {
      users,
      stats: { totalSubmitted, bothVerified, idOnly, faceOnly, unverified },
      currentFilter: filter,
      totalCount,
      currentPage,
      totalPages: Math.ceil(totalCount / PAGE_SIZE),
      isAdmin: req.session.isAdmin || false,
      kycVerificationEnabled: siteSettings.kycVerificationEnabled !== false,
    });
  } catch (error) {
    console.error("Admin verifications error:", error);
    res.render("admin/verifications", {
      users: [],
      stats: { totalSubmitted: 0, bothVerified: 0, idOnly: 0, faceOnly: 0, unverified: 0 },
      currentFilter: "all",
      totalCount: 0,
      currentPage: 1,
      totalPages: 1,
      isAdmin: req.session.isAdmin || false,
      kycVerificationEnabled: true,
    });
  }
});

app.post("/api/admin/user/:id/update-verification", requireAdminOrModerator, async (req, res) => {
  try {
    const { id } = req.params;
    const { field, value } = req.body;

    // Whitelist — only allow toggling these two fields
    const allowedFields = ["idVerified", "faceVerified"];
    if (!allowedFields.includes(field)) {
      return res.status(400).json({ success: false, error: "Invalid field." });
    }

    const boolValue = value === "true" || value === true;

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ success: false, error: "User not found." });

    user[field] = boolValue;
    await user.save();

    return res.json({ success: true, message: `${field} updated to ${boolValue}.` });
  } catch (error) {
    console.error("Update verification error:", error);
    return res.status(500).json({ success: false, error: "Failed to update verification status." });
  }
});

// ── End KYC ─────────────────────────────────────────────────────────────────

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
    if (formData.contact) {
  // Strip all non-numeric characters and convert to Number
  const cleanedContact = String(formData.contact).replace(/\D/g, '');
  user.contact = cleanedContact ? Number(cleanedContact) : null;
}
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
      const previousSlug = user.profileSlug;
      user.profileSlug = await generateUniqueSlug(user);
      addProfileSlugHistory(user, previousSlug, user.profileSlug);

    }

    await user.save();

    // Update session user data
    req.session.user = user;

    res.json({ success: true, message: "Profile updated successfully!" });
  } catch (error) {
    console.error("Account update error:", error);
    res.json({ error: `Failed to update profile: ${error.message}` });
  }
});
// Update the existing /register POST route - NEW SIMPLIFIED FLOW
app.post("/register", async (req, res) => {

  const { email, password, confirmPassword, emailVerified } = req.body;

  // Validate required fields
  if (!email || !password) {
    return res.render("register-new", {
      error: "Email and password are required.",
    });
  }

  // Check email verification
  if (emailVerified !== 'true' || !req.session.emailVerified || req.session.verifiedEmail !== email.toLowerCase()) {
    return res.render("register-new", {
      error: "Please verify your email address first.",
    });
  }

  // Check password confirmation
  if (password !== confirmPassword) {
    return res.render("register-new", {
      error: "Passwords do not match.",
    });
  }

  // Check password length
  if (password.length < 5) {
    return res.render("register-new", {
      error: "Password must be at least 5 characters long.",
    });
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.render("register-new", {
      error: "Please enter a valid email address.",
    });
  }

  try {
    // Check if email already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.render("register-new", {
        error: "An account with this email already exists. Please login instead.",
      });
    }

    // Generate a unique username
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

    // Create new user
    const hashedPassword = await bcrypt.hash(password, 12);
    const newUser = new User({
      username,
      email: email.toLowerCase(),
      password: hashedPassword,
      registrationSource: "register",
      isApproved: false,
      approvalStatus: "pending",
      isEmailVerified: true, // Email was verified during registration
    });

    // Generate profile slug
    newUser.profileSlug = await generateUniqueSlug(newUser);
    await newUser.save();

   

    // Clean up verification session data
    delete req.session.emailVerified;
    delete req.session.verifiedEmail;

    // Set up session
    req.session.userId = newUser._id;
    req.session.user = newUser;

    // Save session before redirect to ensure data is persisted
    req.session.save((err) => {
      if (err) {
        console.error("Session save error:", err);
      }
      return res.redirect("/onboarding");
    });
  } catch (error) {
    console.error("Registration error:", error);
    return res.render("register-new", {
      error: "Registration failed. Please try again.",
    });
  }
});
// Keep old passcode verification route for backward compatibility but mark as deprecated
// **DEPRECATED**: Passcode verification route
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

    let cleanPasscode = passcode;
    let employeePrefix = null;

    if (passcode.includes("-")) {
      const parts = passcode.split("-");
      if (parts.length === 2) {
        employeePrefix = parts[0];
        cleanPasscode = parts[1];
      }
    }

    console.log("Passcode verification with employee tracking:", {
      mobile: countryCode + cleanMobile,
      originalPasscode: passcode,
      employeePrefix,
      cleanPasscode,
      expectedPasscode,
    });

    if (cleanPasscode === expectedPasscode) {
      // Store verification in session
      req.session.passcodeVerified = true;
      req.session.verifiedMobile = countryCode + cleanMobile;
      req.session.verifiedPasscode = passcode; // **CHANGED**: Store original passcode with employee prefix
      req.session.employeePrefix = employeePrefix; // **NEW**: Store employee info for analytics

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
// **NEW**: Save gender and username route
app.post("/api/savegenderandusername", async (req, res) => {
  try {
    const { gender, username } = req.body;

    if (!gender || !username) {
      return res.json({
        success: false,
        error: "Gender and username are required",
      });
    }

    // Validate gender
    if (gender !== "male" && gender !== "female") {
      return res.json({
        success: false,
        error: "Please select a valid gender",
      });
    }

    // Check if username already exists
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.json({
        success: false,
        error: "Username already exists. Please refresh to generate a new one.",
      });
    }

    // Check if passcode was verified
    if (!req.session.passcodeVerified || !req.session.verifiedMobile) {
      return res.json({
        success: false,
        error: "Please verify your passcode first",
      });
    }

    // Create temporary user record with basic info
    const hashedPassword = await bcrypt.hash(
      "temp_" + Math.random().toString(36).substring(2, 15),
      12
    );
    const randomNameForSeo = getRandomSeoName(gender);
    const newUser = new User({
      username,
      gender,
      password: hashedPassword, // Temporary password
      contact: req.session.verifiedMobile,
      passcodeUsed: req.session.verifiedPasscode,
      employeeRef: req.session.employeePrefix,
      registrationSource: "register",
      randomNameForSeo: randomNameForSeo
    });

    // Generate profile slug
    newUser.profileSlug = await generateUniqueSlug(newUser);
    await newUser.save();

    

    // Store user ID in session for next steps
    req.session.tempUserId = newUser._id;

    res.json({
      success: true,
      message: "Information saved successfully",
    });
  } catch (error) {
    console.error("Save gender and username error:", error);
    res.json({
      success: false,
      error: "Failed to save information. Please try again.",
    });
  }
});
app.post("/login", async (req, res) => {
  const { username, password, remember } = req.body;


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
// Google OAuth routes
app.get(
  "/auth/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
  })
);

app.get(
  "/auth/google/callback",
  passport.authenticate("google", {
    failureRedirect: "/register?error=no_account",
  }),
  (req, res) => {
    try {
      // Set session data
      req.session.userId = req.user._id;
      req.session.user = req.user;

      console.log("Google OAuth successful for user:", {
        id: req.user._id,
        username: req.user.username,
        name: req.user.name,
        gender: req.user.gender,
        contact: req.user.contact,
      });

      // Clean up any temporary session data
      if (req.session.verifiedMobile) {
     
        delete req.session.passcodeVerified;
        delete req.session.verifiedMobile;
      }

      // **UPDATED**: Different redirect logic based on user profile completeness
      // Check if user needs onboarding (new user or incomplete profile)
      if (!req.user.age || !req.user.gender || !req.user.city) {
        return res.redirect("/onboarding");
      }

      // **NEW**: For existing users with complete basic info, redirect to home
      res.redirect("/home");
    } catch (error) {
      console.error("Google OAuth callback error:", error);
      res.redirect("/login?error=oauth_error");
    }
  }
);
app.get("/auth/google/failure", (req, res) => {
  res.redirect("/login?error=oauth_error");
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

app.get(["/account", "/account/info"], isLoggedIn, findUser, requireOnboardingComplete, (req, res) => {
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

// Find the /requests/:id/accept route and update it

app.post("/requests/:id/accept", isLoggedIn, async (req, res) => {
  try {
    const requestId = req.params.id;
    const currentUserId = req.session.userId;

    // Find the request
    const request = await Request.findById(requestId).populate("from to");

    if (!request) {
      return res.status(404).json({ error: "Request not found" });
    }

    // Verify the current user is the recipient of the request
    if (request.to._id.toString() !== currentUserId) {
      return res
        .status(403)
        .json({ error: "You are not authorized to accept this request" });
    }

    // Check if request is still pending
    if (request.status !== "pending") {
      return res
        .status(400)
        .json({ error: "This request has already been processed" });
    }

    // Update request status
    request.status = "accepted";
    request.respondedAt = new Date();
    await request.save();

    // **RESTORED**: Give sender access to receiver's (acceptor's) full profile
    await User.findByIdAndUpdate(request.from._id, {
      $addToSet: { canAccessFullProfileOf: request.to._id },
    });

    // **NEW**: Queue background job for notifications and emails (non-blocking)
    // request.to is the acceptor (current user), request.from is the original requester
    QueueService.queueRequestAccepted(request.to, request.from);

    res.json({
      message: "Request accepted successfully",
      request: request,
    });
  } catch (error) {
    console.error("Error accepting request:", error);
    res.status(500).json({ error: "Failed to accept request" });
  }
});
// Replace the existing /requests/:id/reject route
// Find the /requests/:id/reject route and update it

app.post("/requests/:id/reject", isLoggedIn, async (req, res) => {
  try {
    const requestId = req.params.id;
    const currentUserId = req.session.userId;

    // Find the request with populated users
    const request = await Request.findById(requestId).populate("from to");

    if (!request) {
      return res.status(404).json({ error: "Request not found" });
    }

    // Verify the current user is the recipient of the request
    if (request.to._id.toString() !== currentUserId) {
      return res
        .status(403)
        .json({ error: "You are not authorized to reject this request" });
    }

    // Check if request is still pending
    if (request.status !== "pending") {
      return res
        .status(400)
        .json({ error: "This request has already been processed" });
    }

    // Update request status
    request.status = "rejected";
    request.respondedAt = new Date();
    await request.save();

    // Remove request from both users' likeRequests arrays
    await User.findByIdAndUpdate(request.from._id, {
      $pull: { likeRequests: request._id },
    });

    await User.findByIdAndUpdate(request.to._id, {
      $pull: { likeRequests: request._id },
    });

    // **RESTORED**: Remove receiver's access to sender's full profile
    await User.findByIdAndUpdate(request.to._id, {
      $pull: { canAccessFullProfileOf: request.from._id },
    });

    // **NEW**: Queue background job for notifications and emails (non-blocking)
    // request.to is the rejector (current user), request.from is the original requester
    QueueService.queueRequestRejected(request.to, request.from);

    res.json({
      message: "Request rejected successfully",
    });
  } catch (error) {
    console.error("Error rejecting request:", error);
    res.status(500).json({ error: "Failed to reject request" });
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
// Add after the /api/requests/:requestId/cancel route

// **NEW**: Revoke access to accepted request
app.post("/api/requests/:requestId/revoke", isLoggedIn, async (req, res) => {
  try {
    const { requestId } = req.params;
    const currentUserId = req.session.userId;

    const request = await Request.findById(requestId).populate("from to");

    if (!request) {
      return res
        .status(404)
        .json({ success: false, error: "Request not found" });
    }

    // Verify the current user is either the sender or receiver
    const isFromUser = request.from._id.toString() === currentUserId;
    const isToUser = request.to._id.toString() === currentUserId;

    if (!isFromUser && !isToUser) {
      return res.status(403).json({ success: false, error: "Unauthorized" });
    }

    // Only allow revoking accepted requests
    if (request.status !== "accepted") {
      return res.status(400).json({
        success: false,
        error: "Can only revoke accepted requests",
      });
    }

    const fromUserId = request.from._id;
    const toUserId = request.to._id;

    // Remove mutual access from both users
    await User.findByIdAndUpdate(fromUserId, {
      $pull: { canAccessFullProfileOf: toUserId },
    });

    await User.findByIdAndUpdate(toUserId, {
      $pull: { canAccessFullProfileOf: fromUserId },
    });

    // Update request status to revoked
    request.status = "revoked";
    request.respondedAt = new Date();
    await request.save();

    // Create notifications for both users
    const revokerUser = isFromUser ? request.from : request.to;
    const otherUser = isFromUser ? request.to : request.from;

    await NotificationService.createNotification({
      userId: otherUser._id,
      type: "request_revoked",
      title: "Connection Revoked",
      message: `${revokerUser.username} has revoked access to their profile.`,
      priority: "medium",
      actionUrl: "/profiles",
      actionText: "Browse Profiles",
    });

    res.json({
      success: true,
      message: "Access revoked successfully. You are now strangers.",
    });
  } catch (error) {
    console.error("Error revoking access:", error);
    res.status(500).json({
      success: false,
      error: "Failed to revoke access",
    });
  }
});
// ============================================
// STAFF-ADDED PROFILES PAGE
// ============================================
app.get("/profiles/addedBy/staff", requireOnboardingComplete, async (req, res) => {
  const page = parseInt(req.query.page) > 0 ? parseInt(req.query.page) : 1;
  const limit = 12;
  const skip = (page - 1) * limit;

  const { gender, minAge, maxAge, minHeight, maxHeight, city, country } = req.query;

  const filter = {
    approvalStatus: "approved",
    registrationSource: "admin",
    isDeactivated: { $ne: true },
  };

  if (gender) filter.gender = gender;
  if (city) filter.city = { $regex: new RegExp(city, "i") };
  if (country) filter.country = { $regex: new RegExp(country, "i") };
  if (minAge || maxAge) {
    filter.age = {};
    if (minAge) filter.age.$gte = parseInt(minAge);
    if (maxAge) filter.age.$lte = parseInt(maxAge);
  }
  if (minHeight || maxHeight) {
    filter.height = {};
    if (minHeight) { const v = parseFloat(minHeight); if (!isNaN(v)) filter.height.$gte = v; }
    if (maxHeight) { const v = parseFloat(maxHeight); if (!isNaN(v)) filter.height.$lte = v; }
  }

  try {
    const totalProfiles = await User.countDocuments(filter);
    const profiles = await User.find(filter)
      .sort({ registeredAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalPages = Math.ceil(totalProfiles / limit);

    const activeFilters = { gender, minAge, maxAge, minHeight, maxHeight, city, country };

    // Detect geo for filter UI
    const detectedCountryCode = detectCountry(req);
    const geoFilterUI = getFilterUIConfig(detectedCountryCode);

    let currentUserProfile = null;
    if (req.session.userId) {
      currentUserProfile = await User.findById(req.session.userId);
    }

    return res.render("staff-profiles", {
      profiles,
      filters: Object.keys(req.query).length > 0 ? activeFilters : null,
      sortBy: "newly-created",
      page,
      totalPages,
      totalProfiles,
      currentUserProfile,
      featuredProfiles: [],
      geoFilterUI,
      detectedCountryCode: detectedCountryCode || null,
    });
  } catch (error) {
    console.error("Error fetching staff-added profiles:", error);
    return res.status(500).render("error", {
      title: "Error",
      message: "Failed to fetch profiles",
      error: process.env.NODE_ENV === "development" ? error : {},
    });
  }
});

// app.get("/profiles",requireOnboardingComplete, async (req, res) => {
//   // Pagination params
//   const page = parseInt(req.query.page) > 0 ? parseInt(req.query.page) : 1;
//   const limit = 12;
//   const skip = (page - 1) * limit;

//   // Detect visitor country via Cloudflare header or MOCK_COUNTRY env
//   const detectedCountryCode = detectCountry(req);
//   const geoFilter = buildGeoFilter(detectedCountryCode);
//   const geoFilterUI = getFilterUIConfig(detectedCountryCode);

//   // Extract filter parameters
//   const { gender, minAge, maxAge, minHeight, maxHeight, city, country, nationality } =
//     req.query;

//   // Build filter object
//   const filter = {};

//   // Apply geo-based location filter (e.g. PK visitors only see Pakistan profiles)
//   if (geoFilter.$or) {
//     filter.$and = filter.$and || [];
//     filter.$and.push({ $or: geoFilter.$or });
//   }

//   // **NEW**: Only show approved profiles to regular users
//   // Admins and moderators can see all profiles
//   if (!req.session.isAdmin && !req.session.isModerator) {
//     filter.isApproved = true;
//     filter.approvalStatus = "approved";
//   }

//   if (gender) filter.gender = gender;
//   if (city) filter.city = { $regex: new RegExp(city, "i") };
//   if (country) filter.country = { $regex: new RegExp(country, "i") };
//   if (nationality) filter.nationality = nationality; // kept for backward compatibility

//   // Age range filter
//   if (minAge || maxAge) {
//     filter.age = {};
//     if (minAge) filter.age.$gte = parseInt(minAge);
//     if (maxAge) filter.age.$lte = parseInt(maxAge);
//   }

//   // Height range filter - FIXED VERSION
//   if (minHeight || maxHeight) {
//     filter.height = {};
//     if (minHeight) {
//       const minHeightNum = parseFloat(minHeight);
//       if (!isNaN(minHeightNum)) {
//         filter.height.$gte = minHeightNum;
//       }
//     }
//     if (maxHeight) {
//       const maxHeightNum = parseFloat(maxHeight);
//       if (!isNaN(maxHeightNum)) {
//         filter.height.$lte = maxHeightNum;
//       }
//     }
//   }

//   try {
//     // **NEW**: Get featured profiles (max 4, exclude current user)
//     const featuredFilter = { isFeatured: true };

//     const featuredProfiles = await User.find(featuredFilter)
//       .limit(4)
//       .sort({ featuredDate: -1 }); // Show most recently featured first

//     // **UPDATED**: Exclude featured profiles from regular profiles to avoid duplicates
//     // const excludeIds = [
//     //   ...(req.session.userId ? [req.session.userId] : []),
//     //   ...featuredProfiles.map((profile) => profile._id),
//     // ];
//     // filter._id = { $nin: excludeIds };
//     const excludeIds = featuredProfiles.map((profile) => profile._id);
//     if (excludeIds.length > 0) {
//       filter._id = { $nin: excludeIds };
//     }
//     const totalProfiles = await User.countDocuments(filter);

//     // **NEW**: Handle sorting
//     const { sortBy } = req.query;
//     let profiles;
//     const effectiveSort = sortBy || "top-matches";
//     const isScoreSort = effectiveSort === "top-matches" && req.session.userId;

//     if (isScoreSort) {
//       // Score-based sorting: fetch all filtered profiles, compute scores in-memory, exclude 0%, sort, paginate
//       const allFiltered = await User.find(filter)
//         .select("name username age height gender country city ethnicity highestEducation profileSlug profilePic isFeatured featuredDate maritalStatus islamicSect preferredIslamicSect prays bornMuslim willingToConsiderANonUkCitizen acceptSomeoneWithChildren acceptADivorcedPerson acceptAWidow children profileCompletenessTier isApproved approvalStatus isDeactivated")
//         .lean();

//       // Fetch viewer for score computation
//       const viewer = await User.findById(req.session.userId).select("name age height gender country city ethnicity highestEducation maritalStatus islamicSect preferredIslamicSect prays bornMuslim willingToConsiderANonUkCitizen acceptSomeoneWithChildren acceptADivorcedPerson acceptAWidow children isApproved approvalStatus isDeactivated profileCompletenessTier").lean();

//       if (viewer) {
//         const { runHardFilters, computeScore } = require("./services/matchScoringService");
//         for (const profile of allFiltered) {
//           const hf = runHardFilters(viewer, profile);
//           profile.matchScore = hf.passed ? computeScore(viewer, profile).finalScore : 0;
//         }
//         // Exclude incompatible (0%) profiles, then sort by score desc
//         const compatible = allFiltered.filter(p => (p.matchScore || 0) > 0);
//         compatible.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
//         profiles = compatible.slice(skip, skip + limit);
//       } else {
//         profiles = allFiltered.slice(skip, skip + limit);
//       }
//     } else if (effectiveSort === "random") {
//       profiles = await User.aggregate([
//         { $match: filter },
//         { $skip: skip },
//         { $sample: { size: Math.min(limit, totalProfiles) } },
//       ]);
//     } else {
//       // Default: newly created (most recent first)
//       const sortOptions = { createdAt: -1, _id: -1 };
//       profiles = await User.find(filter).sort(sortOptions).skip(skip).limit(limit);
//     }

//     const activeFilters = {
//       gender,
//       minAge,
//       maxAge,
//       minHeight,
//       maxHeight,
//       city,
//       country,
//       nationality,
//     };

//     const totalPages = Math.ceil(totalProfiles / limit);

//     // Get current user's profile if logged in
//     let currentUserProfile = null;
//     if (req.session.userId) {
//       currentUserProfile = await User.findById(req.session.userId);
//     }

//     // Compute scores in-memory for displayed profiles (logged-in only)
//     if (req.session.userId && profiles.length > 0) {
//       const viewer = await User.findById(req.session.userId).select("name age height gender country city ethnicity highestEducation maritalStatus islamicSect preferredIslamicSect prays bornMuslim willingToConsiderANonUkCitizen acceptSomeoneWithChildren acceptADivorcedPerson acceptAWidow children isApproved approvalStatus isDeactivated profileCompletenessTier").lean();
//       if (viewer) {
//         const { runHardFilters, computeScore } = require("./services/matchScoringService");
//         for (const profile of profiles) {
//           const filter = runHardFilters(viewer, profile);
//           profile.matchScore = filter.passed ? computeScore(viewer, profile).finalScore : 0;
//         }
//         if (featuredProfiles) {
//           for (const profile of featuredProfiles) {
//             const filter = runHardFilters(viewer, profile);
//             profile.matchScore = filter.passed ? computeScore(viewer, profile).finalScore : 0;
//           }
//         }
//       }
//     }

//     return res.render("profiles", {
//       featuredProfiles, // **NEW**
//       profiles,
//       filters: Object.keys(req.query).length > 0 ? activeFilters : null,
//       sortBy: effectiveSort, // **NEW**
//       page,
//       totalPages,
//       totalProfiles,
//       currentUserProfile, // **NEW**: Pass current user's profile for pending notice
//       geoFilterUI, // Geo-based filter UI config (null if no restriction)
//       detectedCountryCode: detectedCountryCode || null,
//     });
//   } catch (error) {
//     console.error("Error fetching profiles:", error);
//     return res.status(500).render("error", {
//       title: "Error",
//       message: "Failed to fetch profiles",
//       error: process.env.NODE_ENV === "development" ? error : {},
//     });
//   }
// });

app.get("/profiles", requireOnboardingComplete, async (req, res) => {
  const page = parseInt(req.query.page) > 0 ? parseInt(req.query.page) : 1;
  const limit = 12;
  const skip = (page - 1) * limit;

  const detectedCountryCode = detectCountry(req);
  const geoFilter = buildGeoFilter(detectedCountryCode);
  const geoFilterUI = getFilterUIConfig(detectedCountryCode);

  const { gender, minAge, maxAge, minHeight, maxHeight, city, country, nationality } = req.query;

  const filter = {};
  if (geoFilter.$or) {
    filter.$and = filter.$and || [];
    filter.$and.push({ $or: geoFilter.$or });
  }
  if (!req.session.isAdmin && !req.session.isModerator) {
    filter.isApproved = true;
    filter.approvalStatus = "approved";
  }
  if (gender) filter.gender = gender;
  if (city) filter.city = { $regex: new RegExp(city, "i") };
  if (country) filter.country = { $regex: new RegExp(country, "i") };
  if (nationality) filter.nationality = nationality;

  if (minAge || maxAge) {
    filter.age = {};
    if (minAge) filter.age.$gte = parseInt(minAge);
    if (maxAge) filter.age.$lte = parseInt(maxAge);
  }
  if (minHeight || maxHeight) {
    filter.height = {};
    if (minHeight) {
      const minHeightNum = parseFloat(minHeight);
      if (!isNaN(minHeightNum)) filter.height.$gte = minHeightNum;
    }
    if (maxHeight) {
      const maxHeightNum = parseFloat(maxHeight);
      if (!isNaN(maxHeightNum)) filter.height.$lte = maxHeightNum;
    }
  }

  try {
    // --- NEW: fetch viewer once, up front, and reuse everywhere below ---
    const viewerSelect =
      "name age height gender country city nationality ethnicity highestEducation maritalStatus islamicSect preferredIslamicSect prays bornMuslim preferredAgeRange preferredHeightRange willingToConsiderANonUkCitizen acceptSomeoneWithChildren acceptADivorcedPerson acceptAWidow children isApproved approvalStatus isDeactivated profileCompletenessTier";

    const viewer = req.session.userId
      ? await User.findById(req.session.userId).select(viewerSelect).lean()
      : null;

    // --- NEW: same-gender browse detection ---
    // True only when the visitor has explicitly filtered to their OWN gender.
    const isSameGenderBrowse = !!(viewer && gender && viewer.gender === gender);

    const featuredFilter = { isFeatured: true };
    const featuredProfiles = await User.find(featuredFilter)
      .limit(4)
      .sort({ featuredDate: -1 });

    const excludeIds = featuredProfiles.map((profile) => profile._id);
    if (excludeIds.length > 0) {
      filter._id = { $nin: excludeIds };
    }
    let totalProfiles = await User.countDocuments(filter);

    const { sortBy } = req.query;

    // --- CHANGED: default depends on same-gender browse, and top-matches
    // is never allowed to win when same-gender ---
    let effectiveSort = sortBy || (isSameGenderBrowse ? "newly-created" : "top-matches");
    if (isSameGenderBrowse && effectiveSort === "top-matches") {
      effectiveSort = "newly-created";
    }

    const isScoreSort = effectiveSort === "top-matches" && !!viewer;

    let profiles;
    if (isScoreSort) {
      const allFiltered = await User.find(filter)
        .select("name username age height gender country city nationality ethnicity highestEducation profileSlug profilePic isFeatured featuredDate maritalStatus islamicSect preferredIslamicSect prays bornMuslim preferredAgeRange preferredHeightRange willingToConsiderANonUkCitizen acceptSomeoneWithChildren acceptADivorcedPerson acceptAWidow children profileCompletenessTier isApproved approvalStatus isDeactivated")
        .lean();

      const { runHardFilters, computeScore } = require("./services/matchScoringService");
      for (const profile of allFiltered) {
        const hf = runHardFilters(viewer, profile);
        profile.matchScore = hf.passed ? computeScore(viewer, profile).finalScore : 0;
      }
      const compatible = allFiltered.filter((p) => (p.matchScore || 0) > 0);
      compatible.sort((a, b) =>
        (b.matchScore || 0) - (a.matchScore || 0) ||
        a._id.toString().localeCompare(b._id.toString()) // deterministic tiebreak — prevents
        // the same profile shifting between page 1 and page 2 on equal scores
      );
      totalProfiles = compatible.length; // hard filters exclude people the base count includes
      profiles = compatible.slice(skip, skip + limit);
    } else if (effectiveSort === "random") {
      profiles = await User.aggregate([
        { $match: filter },
        { $skip: skip },
        { $sample: { size: Math.min(limit, totalProfiles) } },
      ]);
    } else {
      const sortOptions = { createdAt: -1, _id: -1 };
      profiles = await User.find(filter).sort(sortOptions).skip(skip).limit(limit);
    }

    const activeFilters = { gender, minAge, maxAge, minHeight, maxHeight, city, country, nationality };
    const totalPages = Math.ceil(totalProfiles / limit);

    let currentUserProfile = null;
    if (req.session.userId) {
      currentUserProfile = await User.findById(req.session.userId);
    }

    // --- CHANGED: reuse `viewer` instead of re-fetching ---
    if (viewer && profiles.length > 0) {
      const { runHardFilters, computeScore } = require("./services/matchScoringService");
      for (const profile of profiles) {
        const hf = runHardFilters(viewer, profile);
        profile.matchScore = hf.passed ? computeScore(viewer, profile).finalScore : 0;
      }
      if (featuredProfiles) {
        for (const profile of featuredProfiles) {
          const hf = runHardFilters(viewer, profile);
          profile.matchScore = hf.passed ? computeScore(viewer, profile).finalScore : 0;
        }
      }
    }

    return res.render("profiles", {
      featuredProfiles,
      profiles,
      filters: Object.keys(req.query).length > 0 ? activeFilters : null,
      sortBy: effectiveSort,
      page,
      totalPages,
      totalProfiles,
      currentUserProfile,
      geoFilterUI,
      detectedCountryCode: detectedCountryCode || null,
      isSameGenderBrowse, // **NEW** — pass to template
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
// ── Matches Page ────────────────────────────────────────────────────────────
// app.get("/matches", async (req, res) => {
//   const page = parseInt(req.query.page) > 0 ? parseInt(req.query.page) : 1;
//   const limit = 12;
//   const skip = (page - 1) * limit;
//   const sortBy = req.query.sortBy || "top-matches";

//   try {
//     // Not logged in — show signup prompt
//     if (!req.session.userId) {
//       return res.render("matches", {
//         user: null, currentUser: null, matches: [], page: 1, totalPages: 0, sortBy,
//       });
//     }

//     const user = await User.findById(req.session.userId);
//     if (!user) {
//       return res.render("matches", { user: null, currentUser: null, matches: [], page: 1, totalPages: 0, sortBy });
//     }

//     // Fetch ALL match scores (no minimum threshold — show everything)
//     const totalMatches = await MatchScore.countDocuments({ viewerId: user._id, isTopMatch: true });

//     let scoreDocs;
//     if (sortBy === "random") {
//       const all = await MatchScore.find({ viewerId: user._id, isTopMatch: true }).lean();
//       scoreDocs = all.sort(() => Math.random() - 0.5).slice(skip, skip + limit);
//     } else {
//       const mongoSort = sortBy === "newly-created" ? { computedAt: -1 } : { finalScore: -1 };
//       scoreDocs = await MatchScore.find({ viewerId: user._id, isTopMatch: true })
//         .sort(mongoSort)
//         .skip(skip)
//         .limit(limit)
//         .lean();
//     }

//     // Fetch viewee profiles
//     const totalPages = Math.ceil(totalMatches / limit);
//     const matches = [];
//     if (scoreDocs.length > 0) {
//       const vieweeIds = scoreDocs.map(s => s.vieweeId);
//       const viewees = await User.find({ _id: { $in: vieweeIds } })
//         .select("name username age city country highestEducation profileSlug gender profilePic profileCompletenessTier")
//         .lean();
//       const vieweeMap = {};
//       for (const v of viewees) vieweeMap[v._id.toString()] = v;
//       for (const s of scoreDocs) {
//         const v = vieweeMap[s.vieweeId.toString()];
//         if (v) matches.push({ ...s, viewee: v });
//       }
//     }

//     return res.render("matches", {
//       user: req.session.user, currentUser: user, matches, page, totalPages, totalMatches, sortBy,
//     });
//   } catch (error) {
//     console.error("Error fetching matches:", error);
//     return res.render("matches", {
//       user: req.session.user || null, currentUser: null, matches: [], page: 1, totalPages: 0,
//       sortBy: "top-matches",
//     });
//   }
// });
app.get("/matches", async (req, res) => {
  const page = parseInt(req.query.page) > 0 ? parseInt(req.query.page) : 1;
  const limit = 12;
  const skip = (page - 1) * limit;
  const sortBy = req.query.sortBy || "top-matches";
  try {
    if (!req.session.userId) {
      return res.render("matches", { user: null, currentUser: null, matches: [], page: 1, totalPages: 0, sortBy });
    }
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.render("matches", { user: null, currentUser: null, matches: [], page: 1, totalPages: 0, sortBy });
    }

    // Union of both directions: docs where user is viewer OR viewee, isTopMatch true either way
    const baseFilter = {
      isTopMatch: true,
      $or: [{ viewerId: user._id }, { vieweeId: user._id }],
    };

    // Fetch ALL matching docs first — dedup must happen BEFORE pagination,
    // otherwise a page can silently shrink below `limit` after collapsing duplicates.
    const allScoreDocs = await MatchScore.find(baseFilter).lean();

    // Dedup: a mutual top-match produces two directional docs for the same pair
    // (viewer:A→viewee:B AND viewer:B→viewee:A). Keep the most recently computed one.
    const seen = new Map(); // otherUserId -> doc
    for (const s of allScoreDocs) {
      const otherId = (s.viewerId.toString() === user._id.toString() ? s.vieweeId : s.viewerId).toString();
      const existing = seen.get(otherId);
      if (!existing || new Date(s.computedAt) > new Date(existing.computedAt)) {
        seen.set(otherId, s);
      }
    }
    let dedupedDocs = Array.from(seen.values());

    // Sort the deduped set (was previously done in Mongo before dedup — now done after, in JS)
    if (sortBy === "random") {
      dedupedDocs = dedupedDocs.sort(() => Math.random() - 0.5);
    } else if (sortBy === "newly-created") {
      dedupedDocs.sort((a, b) => new Date(b.computedAt) - new Date(a.computedAt));
    } else {
      dedupedDocs.sort((a, b) =>
        (b.finalScore - a.finalScore) ||
        a.vieweeId.toString().localeCompare(b.vieweeId.toString()) // deterministic tiebreak
      );
    }

    const totalMatches = dedupedDocs.length; // was countDocuments(baseFilter) — inflated by mutual matches
    const totalPages = Math.ceil(totalMatches / limit);
    const scoreDocs = dedupedDocs.slice(skip, skip + limit);

    const matches = [];
    if (scoreDocs.length > 0) {
      const otherIds = scoreDocs.map(s =>
        s.viewerId.toString() === user._id.toString() ? s.vieweeId : s.viewerId
      );
      const viewees = await User.find({ _id: { $in: otherIds } })
        .select("name username age city country highestEducation profileSlug gender profilePic profileCompletenessTier")
        .lean();
      const vieweeMap = {};
      for (const v of viewees) vieweeMap[v._id.toString()] = v;

      for (const s of scoreDocs) {
        const otherId = (s.viewerId.toString() === user._id.toString() ? s.vieweeId : s.viewerId).toString();
        const v = vieweeMap[otherId];
        if (v) matches.push({ ...s, viewee: v });
      }
    }

    return res.render("matches", {
      user: req.session.user, currentUser: user, matches, page, totalPages, totalMatches, sortBy,
    });
  } catch (error) {
    console.error("Error fetching matches:", error);
    return res.render("matches", {
      user: req.session.user || null, currentUser: null, matches: [], page: 1, totalPages: 0, sortBy: "top-matches",
    });
  }
});
// ── Match Score API ─────────────────────────────────────────────────────────
app.get("/api/matches/score/:userId", isLoggedIn, findUser, async (req, res) => {
  try {
    const viewerId = req.userData._id;
    const vieweeId = req.params.userId;

    // Compute fresh on-the-fly (v2: direct sum scoring, no normalization)
    const viewee = await User.findById(vieweeId).select([
      "name", "age", "height", "gender", "maritalStatus",
      "country", "city", "nationality", "ethnicity",
      "islamicSect", "preferredIslamicSect", "prays", "bornMuslim",
      "highestEducation",
      "preferredAgeRange", "preferredHeightRange",
      "willingToConsiderANonUkCitizen",
      "acceptSomeoneWithChildren", "acceptADivorcedPerson", "acceptAWidow",
      "children",
      "isApproved", "approvalStatus", "isDeactivated",
      "profileCompletenessTier",
    ]);

    if (!viewee) {
      return res.json({ error: "User not found" });
    }

    const { runHardFilters, computeScore } = require("./services/matchScoringService");
    const filterResult = runHardFilters(req.userData, viewee);

    if (!filterResult.passed) {
      return res.json({
        finalScore: 0,
        hardFilterPassed: false,
        failures: filterResult.failures,
      });
    }

    const scoreResult = computeScore(req.userData, viewee);

    return res.json({
      finalScore: scoreResult.finalScore,
      subScores: scoreResult.subScores,
      hardFilterPassed: true,
    });
  } catch (error) {
    console.error("Match score API error:", error);
    return res.json({ error: "Failed to get match score" });
  }
});

// ── Match Narrative API ─────────────────────────────────────────────────────
app.get("/api/matches/narrative/:userId", isLoggedIn, findUser, async (req, res) => {
  try {
    const viewerId = req.userData._id;
    const vieweeId = req.params.userId;

    const { getNarrative } = require("./services/matchNarrativeService");
    const result = await getNarrative(viewerId, vieweeId);

    return res.json(result);
  } catch (error) {
    console.error("Match narrative API error:", error);
    return res.json({ error: "Failed to get match narrative" });
  }
});

app.get("/profiles/:slug", async (req, res) => {
  try {
    const { slug } = req.params;
    let foundProfile;
    let shouldRedirect = false;

    // Check if it's an old MongoDB ID format (for backward compatibility)
    if (mongoose.Types.ObjectId.isValid(slug) && slug.length === 24) {
      // Find by ID
      foundProfile = await User.findById(slug);
      shouldRedirect = true; // We found by ID, so we should redirect to slug
    } else {
      // It's a slug - find by slug field
      foundProfile = await User.findOne({ profileSlug: slug });
      if (!foundProfile) {
        foundProfile = await User.findOne({ profileSlugHistory: slug });
        shouldRedirect = Boolean(foundProfile);
      }
    }

    if (!foundProfile) {
      return res.status(404).render("404", {
        title: "Profile Not Found - shadiAmour",
        url: req.originalUrl,
      });
    }

    // **NEW**: Hide unapproved profiles from regular users
    // Only admins and moderators can view unapproved profiles
    // Also allow the user to see their own profile
    const isOwnProfile = req.session.userId && foundProfile._id.toString() === req.session.userId.toString();
    if (!foundProfile.isApproved && !req.session.isAdmin && !req.session.isModerator && !isOwnProfile) {
      return res.status(404).render("404", {
        title: "Profile Not Found - shadiamour",
        url: req.originalUrl,
      });
    }

    // **NEW**: If we found the profile by ID, redirect to the slug URL
    if (
      shouldRedirect &&
      foundProfile.profileSlug &&
      slug !== foundProfile.profileSlug
    ) {
      return res.redirect(301, `/profiles/${foundProfile.profileSlug}`);
    }

    // **NEW**: If profile doesn't have a slug, generate one and redirect

    let canAccessFullProfile = false;
    let hasalreadysentrequest = false;
    let connectionStatus = null; // NEW: Track connection status
    let incomingRequest = null;  // NEW: Track if profile owner sent us a request
    let outgoingRequest = null;  // NEW: Track our sent request to this profile

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
      const existingOutgoingRequest = await Request.findOne({
        from: req.session.userId,
        to: foundProfile._id,
        status: { $in: ["pending", "accepted"] },
      });

      if (existingOutgoingRequest) {
        hasalreadysentrequest = existingOutgoingRequest.status === "pending";
        outgoingRequest = existingOutgoingRequest; // Store the full request object
        
        if (existingOutgoingRequest.status === "accepted") {
          connectionStatus = "connected";
        }
      }

      // NEW: Check if profile owner has sent a request TO the logged-in user
      const existingIncomingRequest = await Request.findOne({
        from: foundProfile._id,
        to: req.session.userId,
        status: "pending",
      });

      if (existingIncomingRequest) {
        incomingRequest = existingIncomingRequest;
      }

      // NEW: Also check for accepted incoming request (they sent, we accepted)
      if (!connectionStatus) {
        const acceptedIncomingRequest = await Request.findOne({
          from: foundProfile._id,
          to: req.session.userId,
          status: "accepted",
        });
        if (acceptedIncomingRequest) {
          connectionStatus = "connected";
          outgoingRequest = acceptedIncomingRequest; // Use this for revoke action
        }
      }
    }
    const currentUserId = req.session.userId || null;

    // Get top matched profiles via TopMatch store (v2)
    let similarProfiles = [];
    if (req.session.userId) {
      const topScores = await MatchScore.find({
        viewerId: req.session.userId,
        isTopMatch: true,
      })
        .sort({ finalScore: -1 })
        .limit(4)
        .lean();

      const scoredIds = topScores.map(s => s.vieweeId);
      const allSimilar = await User.find({ _id: { $in: scoredIds } })
        .select("username name age city country ethnicity gender profileSlug profilePic")
        .lean();

      // Sort in score order
      const scoreOrder = {};
      topScores.forEach(s => { scoreOrder[s.vieweeId.toString()] = s.finalScore; });
      allSimilar.sort((a, b) => (scoreOrder[b._id.toString()] || 0) - (scoreOrder[a._id.toString()] || 0));

      similarProfiles = allSimilar.map(p => ({ ...p, matchScore: scoreOrder[p._id.toString()] || 0 }));
    } else {
      // Non-logged-in: show 3 random approved same-gender profiles as fallback
      similarProfiles = await User.aggregate([
        { $match: { gender: foundProfile.gender, isApproved: true, approvalStatus: "approved", _id: { $ne: foundProfile._id } } },
        { $sample: { size: 3 } },
        { $project: { username: 1, name: 1, age: 1, city: 1, country: 1, ethnicity: 1, gender: 1, profileSlug: 1, profilePic: 1 } },
      ]);
    }

    // Fetch current user's approval status for the EJS template
    let currentUser = null;
    if (req.session.userId) {
      currentUser = await User.findById(req.session.userId).select("isApproved approvalStatus profileCompletenessTier");
    }

    // Compute match score on-the-fly if logged-in user is viewing someone else's profile
    let matchScore = null;
    if (req.session.userId && !isOwnProfile) {
      const viewer = await User.findById(req.session.userId).select([
        "name", "age", "height", "gender", "maritalStatus",
        "country", "city", "nationality", "ethnicity",
        "islamicSect", "preferredIslamicSect", "prays", "bornMuslim",
        "highestEducation",
        "preferredAgeRange", "preferredHeightRange",
        "willingToConsiderANonUkCitizen",
        "acceptSomeoneWithChildren", "acceptADivorcedPerson", "acceptAWidow",
        "children",
        "isApproved", "approvalStatus", "isDeactivated",
        "profileCompletenessTier",
      ]);
      if (viewer) {
        const { runHardFilters, computeScore } = require("./services/matchScoringService");
        const filterResult = runHardFilters(viewer, foundProfile);
        if (filterResult.passed) {
          const scoreResult = computeScore(viewer, foundProfile);
          matchScore = {
            finalScore: scoreResult.finalScore,
            subScores: scoreResult.subScores,
          };
        }
      }
    }

    res.render("profile", {
      profile: foundProfile,
      canAccessFullProfile,
      hasalreadysentrequest,
      connectionStatus,     // NEW
      incomingRequest,      // NEW
      outgoingRequest,      // NEW
      user: req.session.user,
      currentUser,          // Full user doc (isApproved, etc)
      isAdmin: req.session.isAdmin,
      filters: null,
      similarProfiles,
      isOwnProfile,         // **NEW**: Pass if viewing own profile
      matchScore,           // **NEW**: Compatibility score for logged-in viewers
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
// Find the /interested/:id route and update it

app.post(
  "/interested/:id",
  isLoggedIn,
  requireProfileComplete,
  requireApprovedProfile,
  async (req, res) => {
    try {
      const interestedInUserId = req.params.id;
      const currentUserId = req.session.userId;

      // Get both users
      const currentUser = await User.findById(currentUserId);
      const interestedInUser = await User.findById(interestedInUserId);

      if (!currentUser || !interestedInUser) {
        return res.status(404).json({ error: "User not found" });
      }

      // **NEW**: Check if the target user is approved (can't send requests to unapproved profiles)
      if (!interestedInUser.isApproved) {
        return res.status(400).json({ 
          error: "cannot_send_to_unapproved",
          message: "This profile is pending approval and cannot receive requests yet." 
        });
      }

      // **NEW**: Check request limit (max 5 pending requests)
      const pendingSentRequests = await Request.countDocuments({
        from: currentUserId,
        status: "pending",
      });

      if (pendingSentRequests >= 5) {
        return res.status(400).json({
          error: "request_limit_reached",
          message:
            "You have reached the maximum of 5 pending requests. Please wait for responses or cancel existing requests.",
        });
      }

      // Check if request already exists
      const existingRequest = await Request.findOne({
  from: currentUserId,
  to: interestedInUserId,
  status: { $in: ["pending", "accepted"] } // Only block if pending or accepted
});

if (existingRequest) {
  if (existingRequest.status === "pending") {
    return res.status(400).json({ error: "You have already sent a pending request to this user" });
  } else if (existingRequest.status === "accepted") {
    return res.status(400).json({ error: "You already have an active connection with this user" });
  }
}

      // Check if reverse request exists (they already sent you a request)
      const reverseRequest = await Request.findOne({
        from: interestedInUserId,
        to: currentUserId,
        status: "pending",
      });

      if (reverseRequest) {
        return res.status(400).json({
          error: "This user has already sent you a request. Check your pending requests.",
        });
      }

      // Create the request
      const newRequest = new Request({
        from: currentUserId,
        to: interestedInUserId,
        status: "pending",
      });

      await newRequest.save();

      // Add request to both users' likeRequests arrays
      await User.findByIdAndUpdate(currentUserId, {
        $push: { likeRequests: newRequest._id },
      });

      await User.findByIdAndUpdate(interestedInUserId, {
        $push: { likeRequests: newRequest._id },
      });

      // **RESTORED**: Give receiver access to sender's full profile
      await User.findByIdAndUpdate(interestedInUserId, {
        $addToSet: { canAccessFullProfileOf: currentUserId },
      });

      // **NEW**: Queue background job for notifications and emails (non-blocking)
      QueueService.queueRequestSent(currentUser, interestedInUser);

      res.json({
        message: "Interest request sent successfully",
        requestId: newRequest._id,
      });
    } catch (error) {
      console.error("Error sending interest request:", error);
      res.status(500).json({ error: "Failed to send interest request" });
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
// Replace the existing /admin/dashboard route with this updated version

// ...existing code...
// ── Admin Matches Management ─────────────────────────────────────────────────
app.get("/admin/matches", requireAdminOrModerator, async (req, res) => {
  if (!req.session.isAdmin && !req.session.isModerator) {
    return res.redirect("/login");
  }
  res.render("admin/matches", {
    isAdmin: req.session.isAdmin || false,
    isModerator: req.session.isModerator || false,
  });
});

// API: Search users for admin matches page
app.get("/api/admin/matches/search", requireAdminOrModerator, async (req, res) => {
  try {
    const term = (req.query.term || "").trim();
    const by = req.query.by || "name";
    if (!term) return res.json({ success: true, users: [] });

    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    let query = {};

    if (by === "username") {
      query.username = { $regex: new RegExp(escaped, "i") };
    } else if (by === "phone") {
      query.$or = [
        { contact: { $regex: new RegExp(escaped, "i") } },
        { waliMyContactDetails: { $regex: new RegExp(escaped, "i") } },
      ];
    } else {
      // name (default)
      query.name = { $regex: new RegExp(escaped, "i") };
    }

    const users = await User.find(query)
      .select("name username age gender email contact city country isApproved profileCompletenessTier")
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    res.json({ success: true, users });
  } catch (error) {
    console.error("Admin match search error:", error);
    res.json({ success: false, error: "Search failed" });
  }
});

// API: Get a user's details and their matches
app.get("/api/admin/matches/user/:userId", requireAdminOrModerator, async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId)
      .select("name username age gender email contact city country nationality ethnicity height maritalStatus islamicSect preferredIslamicSect prays bornMuslim highestEducation work profileCompletenessTier isApproved isDeactivated preferredAgeRange preferredHeightRange willingToConsiderANonUkCitizen acceptSomeoneWithChildren acceptADivorcedPerson acceptAWidow")
      .lean();

    if (!user) return res.json({ success: false, error: "User not found" });

    // v2: Only TopMatch scores are persisted. Fetch isTopMatch:true for this viewer.
   // v2: Only TopMatch scores are persisted. Union both directions, same as /matches.
    const baseFilter = {
      isTopMatch: true,
      $or: [{ viewerId: userId }, { vieweeId: userId }],
    };
    const allScores = await MatchScore.find(baseFilter).lean();

    const seen = new Map();
    for (const s of allScores) {
      const otherId = (s.viewerId.toString() === userId ? s.vieweeId : s.viewerId).toString();
      const existing = seen.get(otherId);
      if (!existing || new Date(s.computedAt) > new Date(existing.computedAt)) {
        seen.set(otherId, s);
      }
    }
    const scores = Array.from(seen.values())
      .sort((a, b) => b.finalScore - a.finalScore)
      .slice(0, 15);

    // Fetch viewee profile data for all matches
    const vieweeIds = scores.map(s =>
      s.viewerId.toString() === userId ? s.vieweeId : s.viewerId
    );
    const matchSelect = "name username age gender email contact city country nationality ethnicity height maritalStatus islamicSect preferredIslamicSect prays bornMuslim highestEducation work profileCompletenessTier isApproved isDeactivated preferredAgeRange preferredHeightRange willingToConsiderANonUkCitizen acceptSomeoneWithChildren acceptADivorcedPerson acceptAWidow aboutMe lookingForASpouseThatIs children";
    const viewees = await User.find({ _id: { $in: vieweeIds } })
      .select(matchSelect)
      .lean();

    const vieweeMap = {};
    for (const v of viewees) {
      vieweeMap[v._id.toString()] = v;
    }

    const matches = scores.map(s => {
      const otherId = (s.viewerId.toString() === userId ? s.vieweeId : s.viewerId).toString();
      return { ...s, viewee: vieweeMap[otherId] || null };
    }).filter(m => m.viewee !== null);

    res.json({ success: true, user, matches, isTopMatchQuery: true });
  } catch (error) {
    console.error("Admin match user error:", error);
    res.json({ success: false, error: "Failed to load matches" });
  }
});

// API: Compare two users
app.get("/api/admin/matches/compare", requireAdminOrModerator, async (req, res) => {
  try {
    const { a, b } = req.query;
    if (!a || !b) return res.json({ success: false, error: "Both user IDs required" });

    const fullSelect = "name username age gender email contact city country nationality ethnicity height maritalStatus islamicSect preferredIslamicSect prays bornMuslim highestEducation work children profileCompletenessTier isApproved isDeactivated preferredAgeRange preferredHeightRange willingToConsiderANonUkCitizen acceptSomeoneWithChildren acceptADivorcedPerson acceptAWidow";

    const [userA, userB] = await Promise.all([
      User.findById(a).select("username age city country gender").lean(),
      User.findById(b).select("username age city country gender").lean(),
    ]);

    if (!userA || !userB) return res.json({ success: false, error: "User not found" });

    // Fetch full user profiles for cross-check display
    const [fullUserA, fullUserB] = await Promise.all([
      User.findById(a).select(fullSelect).lean(),
      User.findById(b).select(fullSelect).lean(),
    ]);

    // v2: Compute on-the-fly always (direct sum, no normalization)
    const [viewerFull, vieweeFull] = await Promise.all([
      User.findById(a).select([
        "name", "age", "height", "gender", "maritalStatus",
        "country", "city", "nationality", "ethnicity",
        "islamicSect", "preferredIslamicSect", "prays", "bornMuslim",
        "highestEducation",
        "preferredAgeRange", "preferredHeightRange",
        "willingToConsiderANonUkCitizen",
        "acceptSomeoneWithChildren", "acceptADivorcedPerson", "acceptAWidow",
        "children", "isApproved", "approvalStatus", "isDeactivated",
      ]),
      User.findById(b).select([
        "name", "age", "height", "gender", "maritalStatus",
        "country", "city", "nationality", "ethnicity",
        "islamicSect", "preferredIslamicSect", "prays", "bornMuslim",
        "highestEducation",
        "preferredAgeRange", "preferredHeightRange",
        "willingToConsiderANonUkCitizen",
        "acceptSomeoneWithChildren", "acceptADivorcedPerson", "acceptAWidow",
        "children", "isApproved", "approvalStatus", "isDeactivated",
      ]),
    ]);

    let scoreData = null;

    if (viewerFull && vieweeFull) {
      const { runHardFilters, computeScore } = require("./services/matchScoringService");
      const filterResult = runHardFilters(viewerFull, vieweeFull);
      if (filterResult.passed) {
        const result = computeScore(viewerFull, vieweeFull);
        scoreData = {
          finalScore: result.finalScore,
          subScores: result.subScores,
          hardFilterPassed: true,
          computedOnTheFly: true,
        };
      } else {
        scoreData = {
          finalScore: null,
          hardFilterPassed: false,
          failures: filterResult.failures,
          computedOnTheFly: true,
        };
      }
    }

    res.json({ success: true, userA, userB, fullUserA, fullUserB, score: scoreData });
  } catch (error) {
    console.error("Admin compare error:", error);
    res.json({ success: false, error: "Comparison failed" });
  }
});

// API: Get top matched profile pairs
app.get("/api/admin/matches/top", requireAdminOrModerator, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;
    const sort = req.query.sort || "score-desc";

    let sortOpt = {};
    if (sort === "score-asc") sortOpt = { finalScore: 1 };
    else if (sort === "recent") sortOpt = { computedAt: -1 };
    else sortOpt = { finalScore: -1 }; // score-desc (default)

    // Get total count for load-more tracking
   const pairKeyStage = {
      $addFields: {
        pairKey: {
          $cond: [
            { $lt: ["$viewerId", "$vieweeId"] },
            { $concat: [{ $toString: "$viewerId" }, "_", { $toString: "$vieweeId" }] },
            { $concat: [{ $toString: "$vieweeId" }, "_", { $toString: "$viewerId" }] },
          ],
        },
      },
    };

    // Get deduped total count for load-more tracking
    const totalCountAgg = await MatchScore.aggregate([
      { $match: { isTopMatch: true } },
      pairKeyStage,
      { $group: { _id: "$pairKey" } },
      { $count: "total" },
    ]);
    const totalCount = totalCountAgg[0]?.total || 0;

    const scores = await MatchScore.aggregate([
      { $match: { isTopMatch: true } },
      pairKeyStage,
      { $sort: { computedAt: -1 } },       // pick a deterministic "keep" doc per pair
      { $group: { _id: "$pairKey", doc: { $first: "$$ROOT" } } },
      { $replaceRoot: { newRoot: "$doc" } },
      { $sort: sortOpt },
      { $skip: offset },
      { $limit: limit },
    ]);
    // Guard: no scores computed yet
    if (!scores || scores.length === 0) {
      return res.json({ success: true, pairs: [], totalCount, hasMore: false });
    }

    // Fetch viewer and viewee profiles
    const userIds = new Set();
    scores.forEach(s => {
      userIds.add(s.viewerId.toString());
      userIds.add(s.vieweeId.toString());
    });

    const topSelect = "username name age city country gender email contact nationality ethnicity height maritalStatus islamicSect preferredIslamicSect prays bornMuslim highestEducation work profileCompletenessTier isApproved isDeactivated preferredAgeRange preferredHeightRange willingToConsiderANonUkCitizen acceptSomeoneWithChildren acceptADivorcedPerson acceptAWidow aboutMe lookingForASpouseThatIs children";
    const users = await User.find({ _id: { $in: Array.from(userIds) } })
      .select(topSelect)
      .lean();

    const userMap = {};
    users.forEach(u => { userMap[u._id.toString()] = u; });

    const pairs = scores.map(s => ({
      ...s,
      viewer: userMap[s.viewerId.toString()] || null,
      viewee: userMap[s.vieweeId.toString()] || null,
    })).filter(p => p.viewer && p.viewee);

    const hasMore = offset + limit < totalCount;

    res.json({ success: true, pairs, totalCount, hasMore });
  } catch (error) {
    console.error("Admin top matches error:", error);
    res.json({ success: false, error: "Failed to load top matches" });
  }
});

app.get("/admin/dashboard", requireAdminOrModerator, async (req, res) => {
  if (!req.session.isAdmin && !req.session.isModerator) {
    return res.redirect("/login");
  }

  try {
    const PAGE_SIZE = 20;

    // Get first 20 users
    const users = await User.find({})
      .sort({ createdAt: -1, _id: -1 })
      .limit(PAGE_SIZE);

    const totalCount = await User.countDocuments({});
    const hasMore = totalCount > PAGE_SIZE;

    // Calculate stats
    const allTotalUsers = totalCount;
    const byAdmin = await User.countDocuments({ registrationSource: "admin" });
    const bySelf = await User.countDocuments({ registrationSource: { $in: ["register", "google"] } });
    const featuredCount = await User.countDocuments({ isFeatured: true });
    const pendingCount = await User.countDocuments({ approvalStatus: "pending" });
    const approvedCount = await User.countDocuments({ approvalStatus: "approved" });

    // Extract unique employee/referrer names
    const allUsersPasscodes = await User.find({}, { passcodeUsed: 1 }).lean();
    const employeeNames = new Set();

    allUsersPasscodes.forEach(user => {
      if (user.passcodeUsed && typeof user.passcodeUsed === 'string') {
        const passcode = user.passcodeUsed.trim();
        if (passcode.includes('-')) {
          const parts = passcode.split('-');
          if (parts.length >= 2) {
            const employeeName = parts[0].trim();
            const passcodeDigits = parts[1];
            if (employeeName && passcodeDigits && /^\d+$/.test(passcodeDigits)) {
              employeeNames.add(employeeName);
            }
          }
        }
      }
    });

    const uniqueEmployees = Array.from(employeeNames).sort();

    // Calculate employee stats
    const employeeStats = {};
    for (const employeeName of uniqueEmployees) {
      const count = await User.countDocuments({
        passcodeUsed: { $regex: new RegExp(`^${employeeName}-`, "i") }
      });
      employeeStats[employeeName] = count;
    }

    const stats = {
      totalUsers: allTotalUsers,
      registrationSources: {
        byAdmin,
        bySelf,
      },
      featuredCount,
      pendingCount,
      approvedCount,
      employeeStats,
    };

    res.render("admin/dashboard", {
      users,
      stats,
      hasMore,
      currentFilter: "all",
      uniqueEmployees,
      isAdmin: req.session.isAdmin || false,
      isModerator: req.session.isModerator || false
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    res.render("admin/dashboard", {
      users: [],
      stats: {
        totalUsers: 0,
        registrationSources: { byAdmin: 0, bySelf: 0 },
        featuredCount: 0,
        pendingCount: 0,
        approvedCount: 0,
        employeeStats: {},
      },
      hasMore: false,
      currentFilter: "all",
      uniqueEmployees: [],
      isAdmin: req.session.isAdmin || false,
      isModerator: req.session.isModerator || false
    });
  }
});

// API endpoint for loading more users (pagination, filtering, searching)
app.get("/api/admin/users", requireAdminOrModerator, async (req, res) => {
  try {
    const PAGE_SIZE = 20;
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * PAGE_SIZE;
    const filter = req.query.filter || "all";
    const searchBy = req.query.searchBy; // "username", "name", or "phone"
    const searchTerm = req.query.search || "";

    // Build query based on filter
    let query = {};
    if (filter === "admin") {
      query.registrationSource = "admin";
    } else if (filter === "register") {
      query.registrationSource = { $ne: "admin" }; 
    } else if (filter === "featured") {
      query.isFeatured = true;
    } else if (filter === "pending") {
      query.approvalStatus = "pending";
    } else if (filter === "approved") {
      query.approvalStatus = "approved";
    } else if (filter.startsWith("employee-")) {
      const employeeName = filter.replace("employee-", "");
      query.passcodeUsed = { $regex: new RegExp(`^${employeeName}-`, "i") };
    }

    // Add search condition
    if (searchTerm && searchBy) {
      const escaped = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (searchBy === "username") {
        query.username = { $regex: new RegExp(escaped, "i") };
      } else if (searchBy === "name") {
        query.name = { $regex: new RegExp(escaped, "i") };
      } else if (searchBy === "phone") {
        query.$or = [
          { contact: { $regex: new RegExp(escaped, "i") } },
          { waliMyContactDetails: { $regex: new RegExp(escaped, "i") } }
        ];
      }
    }

    const totalCount = await User.countDocuments(query);
    const users = await User.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(PAGE_SIZE)
      .lean();

    const hasMore = skip + users.length < totalCount;

    res.json({ success: true, users, hasMore, totalCount, page });
  } catch (error) {
    console.error("API admin users error:", error);
    res.status(500).json({ success: false, error: "Failed to load users" });
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

// **NEW**: Approve user profile route
app.post("/api/admin/user/:id/approve", requireAdminOrModerator, async (req, res) => {
  try {
    const { id } = req.params;
    
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    user.isApproved = true;
    user.approvalStatus = "approved";
    user.approvedAt = new Date();
    user.approvedBy = req.session.adminUsername || "admin";
    
    await user.save();

    console.log(`User ${user.username} approved by ${user.approvedBy}`);

    // IndexNow: submit profile URL if approved and has slug
    if (user.profileSlug && !(user.seoSettings && user.seoSettings.noIndex)) {
      indexNow.submitUrls([`/profiles/${user.profileSlug}`, "/profiles"]);
    }

    // Send congratulations email if user has email
    if (user.email) {
      try {
        await sendProfileApprovalEmail(user.email, user.username, user.name);
        
      } catch (emailError) {
        console.error("Failed to send approval email:", emailError);
        // Don't fail the approval if email fails
      }
    }

    // Create notification for the user
    try {
      await NotificationService.createNotification({
        userId: user._id,
        type: "profile_approved",
        title: "🎉 Profile Approved!",
        message: "Congratulations! Your profile has been reviewed and approved by our team. You can now receive interest requests from other members.",
        priority: "high",
        actionUrl: "/account/info",
        actionText: "View Profile",
      });
      console.log(`Approval notification created for user ${user.username}`);
    } catch (notifError) {
      console.error("Failed to create approval notification:", notifError);
      // Don't fail the approval if notification fails
    }

    res.json({ 
      success: true, 
      message: `Profile for ${user.name || user.username} has been approved.` 
    });
  } catch (error) {
    console.error("Approve user error:", error);
    res.status(500).json({ success: false, error: "Failed to approve user" });
  }
});

// **NEW**: Reject user profile route
app.post("/api/admin/user/:id/reject", requireAdminOrModerator, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    user.isApproved = false;
    user.approvalStatus = "rejected";
    user.rejectedAt = new Date();
    user.rejectionReason = reason || "Profile did not meet our guidelines";
    
    await user.save();

    // IndexNow: notify removal if profile was previously approved and had a slug
    if (user.profileSlug) {
      indexNow.notifyUrlDeleted(`/profiles/${user.profileSlug}`);
      indexNow.submitUrls(["/profiles"]);
    }

    res.json({ 
      success: true, 
      message: `Profile for ${user.name || user.username} has been rejected.` 
    });
  } catch (error) {
    console.error("Reject user error:", error);
    res.status(500).json({ success: false, error: "Failed to reject user" });
  }
});
// **NEW**: Delete user account (with archive)
app.post("/api/admin/user/:id/delete", requireAdminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const adminUsername = req.session.user?.username || "Admin";
    const DeletedAccount = require("./models/deletedAccount");

    const user = await User.findById(id);
    if (!user) {
      return res.json({ success: false, error: "User not found" });
    }

    // Create archived copy of ALL user data before deletion
    const archivedAccount = new DeletedAccount({
      originalUserId: user._id,
      userData: user.toObject(), // Complete user data snapshot
      username: user.username,
      email: user.email,
      name: user.name,
      gender: user.gender,
      registeredAt: user.registeredAt,
      deletedBy: adminUsername,
      deletionReason: reason || "Account deleted by admin",
      canReactivate: false, // Account is permanently deleted
    });

    await archivedAccount.save();
    console.log(`User ${user.username} data archived successfully`);

    // Permanently delete the user (pre-delete middleware will clean up requests & notifications)
    const deletedUserSlug = user.profileSlug;
    await User.findByIdAndDelete(id);

    // IndexNow: notify removal if profile had a slug
    if (deletedUserSlug) {
      indexNow.notifyUrlDeleted(`/profiles/${deletedUserSlug}`);
      indexNow.submitUrls(["/profiles"]);
    }
    
    console.log(`User ${user.username} permanently deleted by ${adminUsername}`);

    res.json({
      success: true,
      message: "Account archived and permanently deleted",
    });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.json({
      success: false,
      error: "Failed to delete account: " + error.message,
    });
  }
});

// **NEW**: Get deleted accounts list
app.get("/admin/deletedaccounts", requireAdminOnly, async (req, res) => {
  try {
    const DeletedAccount = require("./models/deletedAccount");
    
    const deletedAccounts = await DeletedAccount.find({})
      .sort({ deletedAt: -1 })
      .limit(100);

    const totalDeleted = await DeletedAccount.countDocuments({});
    const canReactivateCount = await DeletedAccount.countDocuments({ canReactivate: true });
    const reactivatedCount = await DeletedAccount.countDocuments({ reactivatedAt: { $ne: null } });

    res.render("admin/deletedaccounts", {
      deletedAccounts,
      totalDeleted,
      canReactivateCount,
      reactivatedCount,
      currentUser: req.session.user,
      isAdmin: req.session.user.role === "admin",
      isProd: process.env.NODE_ENV === "production",
      GA_ID: process.env.GA_ID,
    });
  } catch (error) {
    console.error("Error loading deleted accounts:", error);
    res.status(500).send("Error loading deleted accounts");
  }
});

// **NEW**: View specific deleted account details
app.get("/admin/deletedaccounts/:id", requireAdminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const DeletedAccount = require("./models/deletedAccount");
    
    const deletedAccount = await DeletedAccount.findById(id);
    
    if (!deletedAccount) {
      return res.status(404).send("Deleted account not found");
    }

    // Check if user still exists (deactivated) or completely deleted
    const currentUser = await User.findById(deletedAccount.originalUserId);

    res.render("admin/deletedAccountDetail", {
      deletedAccount,
      currentUser, // null if permanently deleted, exists if just deactivated
      isAdmin: req.session.user.role === "admin",
      adminUser: req.session.user,
      isProd: process.env.NODE_ENV === "production",
      GA_ID: process.env.GA_ID,
    });
  } catch (error) {
    console.error("Error loading deleted account details:", error);
    res.status(500).send("Error loading deleted account details");
  }
});

// **NEW**: Permanently delete archive record (user is already deleted)
app.post("/admin/deletedaccounts/:id/permanent-delete", requireAdminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const DeletedAccount = require("./models/deletedAccount");
    
    const deletedAccount = await DeletedAccount.findById(id);
    if (!deletedAccount) {
      return res.json({ success: false, error: "Archive record not found" });
    }

    // Delete the archive record
    await DeletedAccount.findByIdAndDelete(id);

    console.log(`Archive record permanently deleted: ${deletedAccount.username}`);

    res.json({
      success: true,
      message: "Archive record permanently deleted",
    });
  } catch (error) {
    console.error("Error permanently deleting archive record:", error);
    res.json({
      success: false,
      error: "Failed to permanently delete archive record",
    });
  }
});
app.post("/admin/user/add", requireAdminOnly, async (req, res) => {

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
    const randomNameForSeo = getRandomSeoName(gender);
    // Create new user object with required fields
    const userData = {
      username,
      password: hashedPassword,
      gender,
      registrationSource: "admin",
      randomNameForSeo: randomNameForSeo
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
    if (req.body.seoField1 && req.body.seoField1 !== "N/A") userData.seoField1 = req.body.seoField1;
    if (req.body.seoField2 && req.body.seoField2 !== "N/A") userData.seoField2 = req.body.seoField2;
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
    // console.log("Generated slug:", user.profileSlug);
    await user.save();

    // console.log("User created successfully:", user.username); // Debug log
    res.json({ success: true, message: "User created successfully" });
  } catch (err) {
    console.error("Add user error:", err);
    res.json({ error: `Failed to add user: ${err.message}` });
  }
});
app.get("/admin/user/:id", requireAdminOrModerator, async (req, res) => {
  if (!req.session.isAdmin && !req.session.isModerator) {
    return res.redirect("/login");
  }
  
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
    isAdmin: req.session.isAdmin || false,
    isModerator: req.session.isModerator || false,
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

// Update User Route
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
      // console.log("JSON request - userId:", userId);
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
      // console.log("Files received:", Object.keys(req.files));

      // Handle profile picture
      if (req.files.profilePic && req.files.profilePic[0]) {
        const profilePicFile = req.files.profilePic[0];
        user.profilePic = {
          url: profilePicFile.path,
          filename: profilePicFile.filename,
        };
        // console.log("Profile picture uploaded:", user.profilePic);
      }

      // Handle cover photo
      if (req.files.coverPhoto && req.files.coverPhoto[0]) {
        const coverPhotoFile = req.files.coverPhoto[0];
        user.coverPhoto = {
          url: coverPhotoFile.path,
          filename: coverPhotoFile.filename,
        };
        // console.log("Cover photo uploaded:", user.coverPhoto);
      }
    }

    // Define field categories for cleaner processing
    const booleanFields = [
      "smoker",
      "bornMuslim",
      "prays",
      "celebratesMilaad",
      "celebrateKhatams",
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
      ethnicity: ["bangladeshi", "pakistani", "indian", "british", "British", "other", "N/A"],
      gender: ["male", "female", "rather not say"],
      preferredIslamicSect: [
        "Sunni", "Shia", "Ibadi", "Sufi", "Ahmadiyya", "Hanafi", "Maliki", "Shafi'i",
        "Hanbali", "Zahiri", "Twelver (Jafari)", "Ismaili", "Zaydi", "Alawite", "Alevi",
        "Druze", "Ash'ari", "Maturidi", "Athari", "Mu'tazila", "Murji'ah", "Kharijite",
        "Salafi", "Wahhabi", "Deobandi", "Barelvi", "Ahle Hadith", "Quranist",
        "Mahdavia", "Nation of Islam", "Moorish Science Temple", "Non-denominational",
      ],
    };

    // **IMPORTANT FIX**: Clear any existing "N/A" values in boolean fields |first
    booleanFields.forEach((field) => {
      if (user[field] === "N/A" || user[field] === null) {
        user[field] = undefined;
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

        // **FIX**: Clear boolean fields when N/A
        if (booleanFields.includes(key) && value === "N/A") {
          user[key] = undefined;

        }

        // **NEW**: Clear enum fields when N/A
        else if (enumFields[key] && value === "N/A") {
          user[key] = undefined;
        }

        // Skip truly empty values (but N/A was handled above)
        if (value === undefined || value === "" || value === null) {
          return;
        }

        // If we reach here, it was "N/A" and was handled above
        return;
      }


      // Handle BOOLEAN fields
      if (booleanFields.includes(key)) {
        user[key] = value === "true" || value === true;
      }
      // Handle NUMERIC fields
      else if (numericFields.includes(key)) {
        const num = parseInt(value);
        if (!isNaN(num)) {
          user[key] = num;
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
      }
      // Handle OBJECT ARRAY fields (education, children)
      else if (objectArrayFields.includes(key)) {
        if (Array.isArray(value)) {
          user[key] = value.filter(
            (item) =>
              item && Object.values(item).some((val) => val && val.trim())
          );
        }
      }
      // Handle ENUM fields with validation
      else if (enumFields[key]) {
        if (enumFields[key].includes(value)) {
          user[key] = value;
        } else {
        }
      }
      // Handle DISABILITY special case
      else if (key === "disability") {
        if (value === "no") {
          user[key] = "no";
        } else if (value && value.trim()) {
          user[key] = value.trim();
        }
      }
      // Handle all other STRING fields
      else {
        if (typeof value === "string" && value.trim()) {
          user[key] = value.trim();
        } else if (typeof value === "number") {
          user[key] = value;
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
      const previousSlug = user.profileSlug;
      user.profileSlug = await generateUniqueSlug(user);
      addProfileSlugHistory(user, previousSlug, user.profileSlug);
      // console.log("Admin updated profile slug:", user.profileSlug);
    }
    await user.save();

    // Recompute profile tier and trigger match score recalculation if scored fields changed
    const { SCORED_FIELDS } = require("./config/matching");
    const updatedKeys = Object.keys(updateData);
    const hasScoredFieldChange = updatedKeys.some(key => SCORED_FIELDS.includes(key));

    if (hasScoredFieldChange || updatedKeys.includes("profileCompletenessTier")) {
      const newTier = computeProfileTier(user);
      if (user.profileCompletenessTier !== newTier) {
        user.profileCompletenessTier = newTier;
        user.profileTierCalculatedAt = new Date();
        await user.save();
      }
    }

    if (hasScoredFieldChange) {
      const QueueService = require("./services/queueService");
      user.matchScoresStaleSince = new Date();
      await user.save();
      QueueService.queueRecomputeScores(user._id).catch(err =>
        console.error("Failed to enqueue match score recompute:", err.message)
      );
    }

    // console.log(`User ${user.username} updated successfully by admin`);
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


app.post("/api/requests/:requestId/respond", isLoggedIn, async (req, res) => {
  try {
    const { requestId } = req.params;
    const { action } = req.body; // 'accept' or 'reject'
    const currentUserId = req.session.userId;

    if (!["accept", "reject"].includes(action)) {
      return res.status(400).json({ error: "Invalid action" });
    }

    const request = await Request.findById(requestId).populate("from to");

    if (!request) {
      return res.status(404).json({ error: "Request not found" });
    }

    // Verify the current user is the recipient
    if (request.to._id.toString() !== currentUserId) {
      return res.status(403).json({ error: "Not authorized" });
    }

    if (request.status !== "pending") {
      return res.status(400).json({ error: "Request already processed" });
    }

    if (action === "accept") {
      request.status = "accepted";
      request.respondedAt = new Date();
      await request.save();

      // **RESTORED**: Give sender access to receiver's (acceptor's) full profile
      await User.findByIdAndUpdate(request.from._id, {
        $addToSet: { canAccessFullProfileOf: request.to._id },
      });

      // **NEW**: Queue notification
      QueueService.queueRequestAccepted(request.to, request.from);

      return res.json({ success: true, message: "Request accepted" });
    } else {
      request.status = "rejected";
      request.respondedAt = new Date();
      await request.save();

      // Remove from like requests
      await User.findByIdAndUpdate(request.from._id, {
        $pull: { likeRequests: request._id },
      });

      await User.findByIdAndUpdate(request.to._id, {
        $pull: { likeRequests: request._id },
      });

      // **RESTORED**: Remove receiver's access to sender's full profile
      await User.findByIdAndUpdate(request.to._id, {
        $pull: { canAccessFullProfileOf: request.from._id },
      });

      // **NEW**: Queue notification
      QueueService.queueRequestRejected(request.to, request.from);

      return res.json({ success: true, message: "Request rejected" });
    }
  } catch (error) {
    console.error("Error responding to request:", error);
    res.status(500).json({ error: "Failed to process request" });
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
        "username name gender age city country createdAt profileSlug contact"
      )
      .populate(
        "to",
        "username name gender age city country createdAt profileSlug contact"
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

// ============================================
// ADMIN CHATS MANAGEMENT ROUTES
// ============================================

// GET /admin/chats – View all conversations (admin & moderator)
app.get("/admin/chats", requireAdminOrModerator, async (req, res) => {
  try {
    // Get all conversations with participants
    const conversations = await Conversation.find({})
      .populate("participants", "username profilePic profileSlug gender city country")
      .sort({ lastMessageAt: -1 });

    // Get message count and last message for each conversation
    const conversationsWithMeta = await Promise.all(
      conversations.map(async (conv) => {
        const messageCount = await ChatMessage.countDocuments({ conversationId: conv._id });
        const lastMessage = await ChatMessage.findOne({ conversationId: conv._id })
          .sort({ createdAt: -1 })
          .populate("senderId", "username")
          .lean();

        return {
          _id: conv._id,
          participants: conv.participants,
          lastMessageAt: conv.lastMessageAt,
          createdAt: conv.createdAt,
          messageCount,
          lastMessage: lastMessage ? {
            text: lastMessage.text,
            senderName: lastMessage.senderId?.username || "Unknown"
          } : null
        };
      })
    );

    // Calculate stats
    const totalConversations = conversations.length;
    const totalMessages = await ChatMessage.countDocuments({});
    
    // Active today - conversations with messages in last 24 hours
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const activeToday = await Conversation.countDocuments({
      lastMessageAt: { $gte: yesterday }
    });

    res.render("admin/chats", {
      conversations: conversationsWithMeta,
      totalConversations,
      totalMessages,
      activeToday,
      isAdmin: req.session.isAdmin
    });
  } catch (error) {
    console.error("Admin chats error:", error);
    res.render("admin/chats", {
      conversations: [],
      totalConversations: 0,
      totalMessages: 0,
      activeToday: 0,
      isAdmin: req.session.isAdmin
    });
  }
});

// GET /admin/chats/:conversationId – View specific conversation details
app.get("/admin/chats/:conversationId", requireAdminOrModerator, async (req, res) => {
  try {
    const { conversationId } = req.params;

    const conversation = await Conversation.findById(conversationId)
      .populate("participants", "username profilePic profileSlug gender city country");

    if (!conversation) {
      return res.status(404).render("404", {
        title: "Conversation Not Found",
        url: req.originalUrl
      });
    }

    // Get all messages in this conversation
    const messages = await ChatMessage.find({ conversationId })
      .populate("senderId", "username profilePic")
      .sort({ createdAt: 1 });

    res.render("admin/chatDetail", {
      conversation,
      messages,
      isAdmin: req.session.isAdmin
    });
  } catch (error) {
    console.error("Admin chat detail error:", error);
    res.status(500).render("404", {
      title: "Error",
      url: req.originalUrl
    });
  }
});

// ============================================
// END ADMIN CHATS MANAGEMENT ROUTES
// ============================================

// Guide download lead magnet
const guideDownloadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { success: false, error: "Too many requests. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipKeyGenerator,
});

app.post("/api/guide/download", guideDownloadLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== "string") {
      return res.status(400).json({ success: false, error: "A valid email address is required." });
    }
    const trimmedEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      return res.status(400).json({ success: false, error: "Please enter a valid email address." });
    }
    const result = await sendMarriageGuide(trimmedEmail);
    if (!result.success) {
      return res.status(500).json({ success: false, error: "Failed to send the guide. Please try again." });
    }
    return res.json({ success: true });
  } catch (err) {
    console.error("Guide download error:", err);
    return res.status(500).json({ success: false, error: "Something went wrong. Please try again." });
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

// ============================================
// RESERVATION BOOKING API
// ============================================

app.post("/api/reservations/book", async (req, res) => {
  try {
    const { name, phone, countryCode, date, time, source, pageUrl } = req.body;

    // Validate required fields
    if (!name || !phone || !date || !time) {
      return res.status(400).json({
        success: false,
        error: "All fields are required (name, phone, date, time)",
      });
    }

    // Validate name length
    if (name.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: "Please provide a valid name",
      });
    }

    // Validate date is not in the past
    const bookingDate = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (bookingDate < today) {
      return res.status(400).json({
        success: false,
        error: "Please select a future date",
      });
    }

    // Create reservation
    const reservation = new Reservation({
      name: name.trim(),
      phoneOrEmail: phone.trim(),
      countryCode: (countryCode || "").trim(),
      date: bookingDate,
      time: time.trim(),
      source: source || "floating_button",
      pageUrl: pageUrl || "",
      userAgent: req.get("User-Agent") || "",
      ipAddress: req.ip || "",
    });

    await reservation.save();

    // Send email notification (fire-and-forget — don't block response)
    sendReservationNotification(reservation).catch(err =>
      console.error("Reservation notification email failed:", err)
    );

    console.log("New reservation booked:", reservation.name, reservation.date, reservation.source);

    res.json({
      success: true,
      message:
        "Your free reservation has been booked! We'll contact you soon.",
    });
  } catch (error) {
    console.error("Reservation booking error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to book reservation. Please try again later.",
    });
  }
});

// ============================================
// ADMIN RESERVATION ROUTES
// ============================================

app.get("/admin/reservations", requireAdminOnly, async (req, res) => {
  try {
    const { status } = req.query;

    const filter = {};
    if (status && ["pending", "contacted", "closed"].includes(status)) {
      filter.status = status;
    }

    const reservations = await Reservation.find(filter).sort({ createdAt: -1 });

    const stats = {
      total: await Reservation.countDocuments({}),
      pending: await Reservation.countDocuments({ status: "pending" }),
      contacted: await Reservation.countDocuments({ status: "contacted" }),
      closed: await Reservation.countDocuments({ status: "closed" }),
    };

    res.render("admin/reservations", {
      reservations,
      stats,
      currentFilter: status || "all",
    });
  } catch (error) {
    console.error("Admin reservations error:", error);
    res.render("admin/reservations", {
      reservations: [],
      stats: { total: 0, pending: 0, contacted: 0, closed: 0 },
      currentFilter: "all",
    });
  }
});

app.post("/admin/reservations/:id/status", requireAdminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!["pending", "contacted", "closed"].includes(status)) {
      return res.status(400).json({ success: false, error: "Invalid status" });
    }

    const reservation = await Reservation.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    );

    if (!reservation) {
      return res.status(404).json({ success: false, error: "Reservation not found" });
    }

    res.json({ success: true, reservation });
  } catch (error) {
    console.error("Update reservation status error:", error);
    res.status(500).json({ success: false, error: "Failed to update status" });
  }
});

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
    const filename = `newsletter_subscribers_${new Date().toISOString().split("T")[0]
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
          message: `Your request to ${request.to.name || request.to.username
            } was deleted.`,
          priority: "medium",
          actionUrl: "/profiles",
          actionText: "Browse Profiles",
        });

        // Delete the request permanently
        await Request.findByIdAndDelete(requestId);

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
          message: `Your accepted request with ${request.to.name || request.to.username
            } has been revoked by the other user.`,
          priority: "high",
          actionUrl: "/profiles",
          actionText: "Browse Profiles",
        });

        await NotificationService.createNotification({
          userId: request.to._id,
          type: "request_revoked",
          title: "Request Access Revoked",
          message: `Your connection with ${request.from.name || request.from.username
            } has been revoked by the other user.`,
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
          message: `Congratulations! Your request was accepted by ${request.to.name || request.to.username
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
          message: `Your request was declined by ${request.to.name || request.to.username
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
// ==================== Export Data Routes ====================

// IndexNow: Bulk submit ALL public URLs (admin-only, one-time trigger)
app.get("/admin/indexnow/bulk-submit", requireAdminOnly, async (req, res) => {
  try {
    res.json({ success: true, message: "Bulk submission started — check server logs for progress." });
    // Fire-and-forget: don't block the response
    indexNow.bulkSubmitAllPublicUrls().catch(err =>
      console.error("[IndexNow] Bulk submit failed:", err)
    );
  } catch (error) {
    console.error("Bulk-submit route error:", error);
    res.status(500).json({ success: false, error: "Failed to start bulk submission" });
  }
});

// Export page
app.get("/admin/export", requireAdminOnly, async (req, res) => {
  res.render("admin/export", {
    isAdmin: req.session.isAdmin,
    isModerator: req.session.isModerator,
  });
});

// Export newsletter subscriber emails as CSV with gender filter
app.get("/api/admin/export/newsletter", requireAdminOnly, async (req, res) => {
  try {
    const { interestedIn } = req.query;
    const filter = { isActive: true };
    if (interestedIn && ["male", "female", "both"].includes(interestedIn)) {
      filter.interestedIn = interestedIn;
    }
    const subscribers = await Newsletter.find(filter).sort({ subscribedAt: -1 });

    let csv = "Name,Email,Interested In,Subscribed Date\n";
    subscribers.forEach((s) => {
      const date = new Date(s.subscribedAt).toLocaleDateString();
      csv += `"${(s.name || "").replace(/"/g, '""')}","${s.email}","${s.interestedIn}","${date}"\n`;
    });

    const filename = `newsletter_subscribers_${new Date().toISOString().split("T")[0]}.csv`;
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    console.error("Export newsletter error:", error);
    res.status(500).json({ success: false, error: "Failed to export newsletter subscribers" });
  }
});

// Export chats (usernames + messages) as CSV
app.get("/api/admin/export/chats", requireAdminOnly, async (req, res) => {
  try {
    const Conversation = require("./models/Conversation");
    const ChatMessage = require("./models/Message");

    const conversations = await Conversation.find()
      .populate("participants", "username name")
      .sort({ lastMessageAt: -1 });

    let csv = "Conversation ID,Participant 1 Username,Participant 2 Username,Sender Username,Message,Date\n";

    for (const convo of conversations) {
      const p1 = convo.participants[0];
      const p2 = convo.participants[1];
      const p1Username = p1 ? p1.username : "Deleted User";
      const p2Username = p2 ? p2.username : "Deleted User";

      const messages = await ChatMessage.find({ conversationId: convo._id })
        .populate("senderId", "username")
        .sort({ createdAt: 1 });

      messages.forEach((msg) => {
        const senderUsername = msg.senderId ? msg.senderId.username : "Deleted User";
        const text = (msg.text || "").replace(/"/g, '""').replace(/\n/g, " ");
        const date = new Date(msg.createdAt).toLocaleString();
        csv += `"${convo._id}","${p1Username}","${p2Username}","${senderUsername}","${text}","${date}"\n`;
      });
    }

    const filename = `chats_export_${new Date().toISOString().split("T")[0]}.csv`;
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    console.error("Export chats error:", error);
    res.status(500).json({ success: false, error: "Failed to export chats" });
  }
});

// Export user emails with approval status filter as CSV
app.get("/api/admin/export/users", requireAdminOnly, async (req, res) => {
  try {
    const { status } = req.query;
    const filter = {};
    if (status && ["approved", "rejected", "pending"].includes(status)) {
      filter.approvalStatus = status;
    }
    const users = await User.find(filter).select("username name email gender approvalStatus registrationSource createdAt").sort({ createdAt: -1 });

    let csv = "Username,Name,Email,Gender,Approval Status,Registration Source,Registered Date\n";
    users.forEach((u) => {
      const date = new Date(u.createdAt).toLocaleDateString();
      csv += `"${u.username}","${(u.name || "").replace(/"/g, '""')}","${u.email || ""}","${u.gender || ""}","${u.approvalStatus}","${u.registrationSource || ""}","${date}"\n`;
    });

    const filename = `users_export_${new Date().toISOString().split("T")[0]}.csv`;
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    console.error("Export users error:", error);
    res.status(500).json({ success: false, error: "Failed to export users" });
  }
});

// Export requests as CSV
app.get("/api/admin/export/requests", requireAdminOnly, async (req, res) => {
  try {
    const requests = await Request.find()
      .populate("from", "username name")
      .populate("to", "username name")
      .sort({ createdAt: -1 });

    let csv = "From Username,From Name,To Username,To Name,Status,Date\n";
    requests.forEach((r) => {
      const fromUsername = r.from ? r.from.username : "Deleted User";
      const fromName = r.from ? (r.from.name || "").replace(/"/g, '""') : "Deleted User";
      const toUsername = r.to ? r.to.username : "Deleted User";
      const toName = r.to ? (r.to.name || "").replace(/"/g, '""') : "Deleted User";
      const date = new Date(r.createdAt).toLocaleDateString();
      csv += `"${fromUsername}","${fromName}","${toUsername}","${toName}","${r.status}","${date}"\n`;
    });

    const filename = `requests_export_${new Date().toISOString().split("T")[0]}.csv`;
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    console.error("Export requests error:", error);
    res.status(500).json({ success: false, error: "Failed to export requests" });
  }
});

// **NEW**: Blog Management Routes

// Blog listing page (admin)
app.get("/admin/blogs", requireAdminOnly, async (req, res) => {
  if (!req.session.isAdmin) {
    return res.redirect("/login");
  }

  try {
    const { filter } = req.query;

    // Build query based on filter
    let query = {};
    if (filter === "published") {
      query.isPublished = true;
    } else if (filter === "draft") {
      query.isPublished = false;
    }
    // For 'all' or no filter, query remains empty (gets all blogs)

    const blogs = await Blog.find(query).sort({ createdAt: -1 });

    // Calculate stats
    const totalBlogs = await Blog.countDocuments({});
    const publishedBlogs = await Blog.countDocuments({ isPublished: true });
    const draftBlogs = await Blog.countDocuments({ isPublished: false });

    const stats = {
      total: totalBlogs,
      published: publishedBlogs,
      drafts: draftBlogs,
    };

    res.render("admin/blogs", {
      blogs,
      stats,
      currentFilter: filter || "all",
    });
  } catch (error) {
    console.error("Blog listing error:", error);
    res.render("admin/blogs", {
      blogs: [],
      stats: { total: 0, published: 0, drafts: 0 },
      currentFilter: "all",
    });
  }
});

// Create blog page
app.get("/admin/blogs/create", requireAdminOnly, (req, res) => {
  if (!req.session.isAdmin) {
    return res.redirect("/login");
  }
  res.render("admin/createBlog");
});

// Create blog API
app.post("/admin/blogs", requireAdminOnly, async (req, res) => {
  if (!req.session.isAdmin) {
    return res.status(403).json({ success: false, error: "Forbidden" });
  }

  try {
    const {
      title,
      content,
      excerpt,
      category,
      tags,
      metaTitle,
      metaDescription,
      keywords,
      isPublished,
      featuredImageUrl,
      featuredImageAlt,
      featuredImageCaption,
    } = req.body;

    // Validate required fields
    if (!title || !content) {
      return res.json({
        success: false,
        error: "Title and content are required",
      });
    }

    // Process arrays from comma-separated strings
    const tagsArray = tags
      ? tags.split(",").map((tag) => tag.trim()).filter((tag) => tag)
      : [];
    const keywordsArray = keywords
      ? keywords.split(",").map((kw) => kw.trim()).filter((kw) => kw)
      : [];
    const featuredImage = featuredImageUrl ? {
      url: featuredImageUrl,
      alt: featuredImageAlt || '',
      caption: featuredImageCaption || ''
    } : undefined;
    // Create blog
    const blog = new Blog({
      title: title.trim(),
      content: content.trim(),
      excerpt: excerpt ? excerpt.trim() : "",
      category: category || "Matrimony Tips",
      tags: tagsArray,
      metaTitle: metaTitle ? metaTitle.trim() : "",
      metaDescription: metaDescription ? metaDescription.trim() : "",
      keywords: keywordsArray,
      isPublished: Boolean(isPublished),
      publishedAt: Boolean(isPublished) ? new Date() : null,
      featuredImage,
      author: {
        name: "shadiAmour Team",
        profileUrl: "",
      },
    });

    await blog.save();

    console.log(`Blog created: ${blog.title} (${blog.isPublished ? 'Published' : 'Draft'})`);

    // IndexNow: notify if published
    if (blog.isPublished) {
      indexNow.submitUrls([`/blog/${blog.slug}`, "/blog"]);
    }

    res.json({
      success: true,
      message: `Blog ${blog.isPublished ? 'published' : 'saved as draft'} successfully`,
      blog: blog,
    });
  } catch (error) {
    console.error("Create blog error:", error);
    res.json({
      success: false,
      error: `Failed to create blog: ${error.message}`,
    });
  }
});

// Edit blog page
app.get("/admin/blogs/:id/edit", requireAdminOnly, async (req, res) => {
  if (!req.session.isAdmin) {
    return res.redirect("/login");
  }

  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) {
      return res.status(404).render("404", {
        title: "Blog Not Found",
        url: req.originalUrl,
      });
    }

    res.render("admin/editBlog", { blog });
  } catch (error) {
    console.error("Edit blog page error:", error);
    res.redirect("/admin/blogs");
  }
});

// Update blog API
app.put("/admin/blogs/:id", requireAdminOnly, async (req, res) => {
  if (!req.session.isAdmin) {
    return res.status(403).json({ success: false, error: "Forbidden" });
  }

  try {
    const {
      title,
      content,
      excerpt,
      category,
      tags,
      metaTitle,
      metaDescription,
      keywords,
      isPublished,
      featuredImageUrl,
      featuredImageAlt,
      featuredImageCaption,
      slug,
    } = req.body;

    const blog = await Blog.findById(req.params.id);
    if (!blog) {
      return res.json({ success: false, error: "Blog not found" });
    }

    // Capture old slug before any changes (for IndexNow)
    const oldSlug = blog.slug;

    // Handle slug update
    if (slug && slug.trim()) {
      const sanitizedSlug = slug.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      if (sanitizedSlug) {
        const existingBlog = await Blog.findOne({ slug: sanitizedSlug, _id: { $ne: blog._id } });
        if (existingBlog) {
          return res.status(400).json({ success: false, error: "Slug already in use by another post" });
        }
        blog.slug = sanitizedSlug;
      }
    }

    // Process arrays from comma-separated strings
    const tagsArray = tags
      ? tags.split(",").map((tag) => tag.trim()).filter((tag) => tag)
      : [];
    const keywordsArray = keywords
      ? keywords.split(",").map((kw) => kw.trim()).filter((kw) => kw)
      : [];
    if (featuredImageUrl) {
      blog.featuredImage = {
        url: featuredImageUrl,
        alt: featuredImageAlt || '',
        caption: featuredImageCaption || ''
      };
    } else if (featuredImageUrl === null) {
      // Explicitly remove featured image if set to null
      blog.featuredImage = undefined;
    }
    // Update blog fields
    blog.title = title.trim();
    blog.content = content.trim();
    blog.excerpt = excerpt ? excerpt.trim() : "";
    blog.category = category || "Matrimony Tips";
    blog.tags = tagsArray;
    blog.metaTitle = metaTitle ? metaTitle.trim() : "";
    blog.metaDescription = metaDescription ? metaDescription.trim() : "";
    blog.keywords = keywordsArray;

    // Handle publication status
    const wasPublished = blog.isPublished;
    blog.isPublished = Boolean(isPublished);

    if (!wasPublished && blog.isPublished) {
      // Publishing for first time
      blog.publishedAt = new Date();
    } else if (wasPublished && !blog.isPublished) {
      // Unpublishing
      blog.publishedAt = null;
    }

    blog.updatedAt = new Date();

    await blog.save();

    console.log(`Blog updated: ${blog.title} (${blog.isPublished ? 'Published' : 'Draft'})`);

    // IndexNow: submit based on status/slug changes
    if (blog.isPublished) {
      const urls = [`/blog/${blog.slug}`, "/blog"];
      // If old slug was different and was also published, notify removal of old URL
      if (oldSlug !== blog.slug && wasPublished) {
        indexNow.notifyUrlDeleted(`/blog/${oldSlug}`);
      }
      indexNow.submitUrls(urls);
    } else if (wasPublished && !blog.isPublished) {
      // Unpublished — notify removal
      indexNow.notifyUrlDeleted(`/blog/${oldSlug}`);
      indexNow.submitUrls(["/blog"]);
    }

    res.json({
      success: true,
      message: `Blog ${blog.isPublished ? 'updated and published' : 'updated as draft'} successfully`,
    });
  } catch (error) {
    console.error("Update blog error:", error);
    res.json({
      success: false,
      error: `Failed to update blog: ${error.message}`,
    });
  }
});

// Delete blog API
app.delete("/admin/blogs/:id", requireAdminOnly, async (req, res) => {
  if (!req.session.isAdmin) {
    return res.status(403).json({ success: false, error: "Forbidden" });
  }

  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) {
      return res.json({ success: false, error: "Blog not found" });
    }

    await Blog.findByIdAndDelete(req.params.id);

    console.log(`Blog deleted: ${blog.title}`);

    // IndexNow: notify removal
    if (blog.isPublished) {
      indexNow.notifyUrlDeleted(`/blog/${blog.slug}`);
      indexNow.submitUrls(["/blog"]);
    }

    res.json({
      success: true,
      message: "Blog deleted successfully",
    });
  } catch (error) {
    console.error("Delete blog error:", error);
    res.json({
      success: false,
      error: "Failed to delete blog",
    });
  }
});

// Toggle blog publication status
app.post("/admin/blogs/:id/toggle-publish", requireAdminOnly, async (req, res) => {
  if (!req.session.isAdmin) {
    return res.status(403).json({ success: false, error: "Forbidden" });
  }

  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) {
      return res.json({ success: false, error: "Blog not found" });
    }

    // Toggle publication status
    blog.isPublished = !blog.isPublished;
    blog.publishedAt = blog.isPublished ? new Date() : null;
    blog.updatedAt = new Date();

    await blog.save();

    console.log(`Blog ${blog.isPublished ? 'published' : 'unpublished'}: ${blog.title}`);

    // IndexNow: notify based on new status
    if (blog.isPublished) {
      indexNow.submitUrls([`/blog/${blog.slug}`, "/blog"]);
    } else {
      indexNow.notifyUrlDeleted(`/blog/${blog.slug}`);
      indexNow.submitUrls(["/blog"]);
    }

    res.json({
      success: true,
      message: `Blog ${blog.isPublished ? 'published' : 'unpublished'} successfully`,
      isPublished: blog.isPublished,
    });
  } catch (error) {
    console.error("Toggle publish error:", error);
    res.json({
      success: false,
      error: "Failed to toggle publication status",
    });
  }
});
// ============================================
// ISLAMIC FAQ ROUTES (public + admin CRUD)
// ============================================

// Public: /islamic-faqs listing page
app.get("/islamic-faqs", async (req, res) => {
  try {
    const { category } = req.query;
    let query = { isPublished: true };
    if (category && category !== "all") query.category = category;

    const faqs = await IslamicFAQ.find(query)
      .sort({ publishedAt: -1, createdAt: -1 })
      .select("question slug category featuredImage excerpt publishedAt scholar");

    const allPublished = await IslamicFAQ.find({ isPublished: true }).select("category");
    const categories = [...new Set(allPublished.map((f) => f.category))];

    res.render("islamic-faqs/index", {
      faqs,
      categories,
      currentCategory: category || null,
      user: req.session.user || null,
    });
  } catch (error) {
    console.error("Islamic FAQs listing error:", error);
    res.render("islamic-faqs/index", {
      faqs: [],
      categories: [],
      currentCategory: null,
      user: req.session.user || null,
    });
  }
});

// Public: /islamic-faqs/:slug detail page
app.get("/islamic-faqs/:slug", async (req, res) => {
  try {
    const faq = await IslamicFAQ.findOne({ slug: req.params.slug, isPublished: true });
    if (!faq) {
      return res.status(404).render("404", {
        title: "Question Not Found",
        url: req.originalUrl,
        user: req.session.user || null,
      });
    }

    const related = await IslamicFAQ.find({
      isPublished: true,
      category: faq.category,
      _id: { $ne: faq._id },
    })
      .limit(3)
      .sort({ publishedAt: -1 })
      .select("question slug category featuredImage excerpt");

    res.render("islamic-faqs/detail", {
      faq,
      related,
      user: req.session.user || null,
    });
  } catch (error) {
    console.error("Islamic FAQ detail error:", error);
    res.status(500).render("404", {
      title: "Error",
      url: req.originalUrl,
      user: req.session.user || null,
    });
  }
});

// Admin: list FAQs
app.get("/admin/faqs", requireAdminOnly, async (req, res) => {
  if (!req.session.isAdmin) return res.redirect("/login");
  try {
    const { status, category } = req.query;
    let query = {};
    if (status === "published") query.isPublished = true;
    else if (status === "draft") query.isPublished = false;
    if (category && category !== "all") query.category = category;

    const faqs = await IslamicFAQ.find(query).sort({ createdAt: -1 });
    const total = await IslamicFAQ.countDocuments({});
    const published = await IslamicFAQ.countDocuments({ isPublished: true });
    const drafts = await IslamicFAQ.countDocuments({ isPublished: false });
    const faqCategories = await FaqCategory.find({}).sort({ name: 1 });

    res.render("admin/faqs", {
      faqs,
      stats: { total, published, drafts },
      currentFilter: { status: status || "all", category: category || "all" },
      faqCategories,
    });
  } catch (error) {
    console.error("FAQ admin listing error:", error);
    res.render("admin/faqs", {
      faqs: [],
      stats: { total: 0, published: 0, drafts: 0 },
      currentFilter: { status: "all", category: "all" },
      faqCategories: [],
    });
  }
});

// Admin: create FAQ form
app.get("/admin/faqs/create", requireAdminOnly, async (req, res) => {
  if (!req.session.isAdmin) return res.redirect("/login");
  const faqCategories = await FaqCategory.find({}).sort({ name: 1 });
  res.render("admin/createFaq", { faqCategories });
});

// Admin: create FAQ API
app.post("/admin/faqs", requireAdminOnly, async (req, res) => {
  if (!req.session.isAdmin) return res.status(403).json({ success: false, error: "Forbidden" });
  try {
    const {
      question, answer, excerpt, category, scholar,
      metaTitle, metaDescription, keywords, isPublished,
      featuredImageUrl, featuredImageAlt, featuredImageCaption, slug,
    } = req.body;

    if (!question || !answer) {
      return res.json({ success: false, error: "Question and answer are required" });
    }

    const keywordsArray = keywords
      ? keywords.split(",").map((k) => k.trim()).filter((k) => k)
      : [];
    const featuredImage = featuredImageUrl
      ? { url: featuredImageUrl, alt: featuredImageAlt || "", caption: featuredImageCaption || "" }
      : undefined;

    // If admin supplied a custom slug, sanitise and check uniqueness
    let customSlug;
    if (slug && slug.trim()) {
      customSlug = slug.trim().toLowerCase()
        .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      if (customSlug) {
        const existing = await IslamicFAQ.findOne({ slug: customSlug });
        if (existing) return res.json({ success: false, error: "Slug already in use" });
      }
    }

    const faq = new IslamicFAQ({
      question: question.trim(),
      ...(customSlug && { slug: customSlug }),
      answer: answer.trim(),
      excerpt: excerpt ? excerpt.trim() : "",
      category: category || "Spouse Search",
      scholar: scholar ? scholar.trim() : "",
      metaTitle: metaTitle ? metaTitle.trim() : "",
      metaDescription: metaDescription ? metaDescription.trim() : "",
      keywords: keywordsArray,
      isPublished: Boolean(isPublished),
      publishedAt: Boolean(isPublished) ? new Date() : null,
      featuredImage,
    });

    await faq.save();

    // IndexNow: notify if published
    if (faq.isPublished) {
      indexNow.submitUrls([`/islamic-faqs/${faq.slug}`, "/islamic-faqs"]);
    }

    res.json({
      success: true,
      message: `FAQ ${faq.isPublished ? "published" : "saved as draft"} successfully`,
      faq,
    });
  } catch (error) {
    console.error("Create FAQ error:", error);
    res.json({ success: false, error: `Failed to create FAQ: ${error.message}` });
  }
});

// Admin: edit FAQ form
app.get("/admin/faqs/:id/edit", requireAdminOnly, async (req, res) => {
  if (!req.session.isAdmin) return res.redirect("/login");
  try {
    const faq = await IslamicFAQ.findById(req.params.id);
    if (!faq) {
      return res.status(404).render("404", {
        title: "FAQ Not Found",
        url: req.originalUrl,
        user: req.session.user || null,
      });
    }
    const faqCategories = await FaqCategory.find({}).sort({ name: 1 });
    res.render("admin/editFaq", { faq, faqCategories });
  } catch (error) {
    console.error("Edit FAQ page error:", error);
    res.redirect("/admin/faqs");
  }
});

// Admin: update FAQ API
app.put("/admin/faqs/:id", requireAdminOnly, async (req, res) => {
  if (!req.session.isAdmin) return res.status(403).json({ success: false, error: "Forbidden" });
  try {
    const {
      question, answer, excerpt, category, scholar,
      metaTitle, metaDescription, keywords, isPublished,
      featuredImageUrl, featuredImageAlt, featuredImageCaption, slug,
    } = req.body;

    const faq = await IslamicFAQ.findById(req.params.id);
    if (!faq) return res.json({ success: false, error: "FAQ not found" });

    // Capture old slug for IndexNow
    const oldFaqSlug = faq.slug;

    if (slug && slug.trim()) {
      const sanitizedSlug = slug.trim().toLowerCase()
        .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      if (sanitizedSlug) {
        const existing = await IslamicFAQ.findOne({ slug: sanitizedSlug, _id: { $ne: faq._id } });
        if (existing) return res.status(400).json({ success: false, error: "Slug already in use" });
        faq.slug = sanitizedSlug;
      }
    }

    const keywordsArray = keywords
      ? keywords.split(",").map((k) => k.trim()).filter((k) => k)
      : [];

    if (featuredImageUrl) {
      faq.featuredImage = {
        url: featuredImageUrl,
        alt: featuredImageAlt || "",
        caption: featuredImageCaption || "",
      };
    }

    faq.question = question.trim();
    faq.answer = answer.trim();
    faq.excerpt = excerpt ? excerpt.trim() : "";
    faq.category = category || "Spouse Search";
    faq.scholar = scholar ? scholar.trim() : "";
    faq.metaTitle = metaTitle ? metaTitle.trim() : "";
    faq.metaDescription = metaDescription ? metaDescription.trim() : "";
    faq.keywords = keywordsArray;

    const wasPublished = faq.isPublished;
    faq.isPublished = Boolean(isPublished);
    if (!wasPublished && faq.isPublished) faq.publishedAt = new Date();
    else if (wasPublished && !faq.isPublished) faq.publishedAt = null;

    await faq.save();

    // IndexNow: submit based on status/slug changes
    if (faq.isPublished) {
      const urls = [`/islamic-faqs/${faq.slug}`, "/islamic-faqs"];
      if (oldFaqSlug !== faq.slug && wasPublished) {
        indexNow.notifyUrlDeleted(`/islamic-faqs/${oldFaqSlug}`);
      }
      indexNow.submitUrls(urls);
    } else if (wasPublished && !faq.isPublished) {
      indexNow.notifyUrlDeleted(`/islamic-faqs/${oldFaqSlug}`);
      indexNow.submitUrls(["/islamic-faqs"]);
    }

    res.json({
      success: true,
      message: `FAQ ${faq.isPublished ? "updated and published" : "updated as draft"} successfully`,
    });
  } catch (error) {
    console.error("Update FAQ error:", error);
    res.json({ success: false, error: `Failed to update FAQ: ${error.message}` });
  }
});

// Admin: delete FAQ API
app.delete("/admin/faqs/:id", requireAdminOnly, async (req, res) => {
  if (!req.session.isAdmin) return res.status(403).json({ success: false, error: "Forbidden" });
  try {
    const faq = await IslamicFAQ.findById(req.params.id);
    if (!faq) return res.json({ success: false, error: "FAQ not found" });
    const faqSlug = faq.slug;
    const wasFaqPublished = faq.isPublished;
    await IslamicFAQ.findByIdAndDelete(req.params.id);

    // IndexNow: notify removal if it was published
    if (wasFaqPublished) {
      indexNow.notifyUrlDeleted(`/islamic-faqs/${faqSlug}`);
      indexNow.submitUrls(["/islamic-faqs"]);
    }

    res.json({ success: true, message: "FAQ deleted successfully" });
  } catch (error) {
    console.error("Delete FAQ error:", error);
    res.json({ success: false, error: "Failed to delete FAQ" });
  }
});

// ============================================
// FAQ CATEGORY MANAGEMENT ROUTES
// ============================================

// Create a new FAQ category
app.post("/admin/faqs/categories", requireAdminOnly, async (req, res) => {
  if (!req.session.isAdmin) return res.status(403).json({ success: false, error: "Forbidden" });
  try {
    const { name } = req.body;
    if (!name || !name.trim()) return res.json({ success: false, error: "Category name is required" });
    const slugify = require("slugify");
    const slug = slugify(name.trim(), { lower: true, strict: true });
    const existing = await FaqCategory.findOne({ $or: [{ name: name.trim() }, { slug }] });
    if (existing) return res.json({ success: false, error: "A category with this name already exists" });
    const cat = new FaqCategory({ name: name.trim(), slug });
    await cat.save();
    res.json({ success: true, message: "Category created", category: cat });
  } catch (error) {
    console.error("Create FAQ category error:", error);
    res.json({ success: false, error: "Failed to create category" });
  }
});

// Delete an FAQ category (blocked if in use)
app.delete("/admin/faqs/categories/:id", requireAdminOnly, async (req, res) => {
  if (!req.session.isAdmin) return res.status(403).json({ success: false, error: "Forbidden" });
  try {
    const cat = await FaqCategory.findById(req.params.id);
    if (!cat) return res.json({ success: false, error: "Category not found" });
    const inUseFaq = await IslamicFAQ.countDocuments({ category: cat.name });
    if (inUseFaq > 0) {
      return res.json({ success: false, error: `Cannot delete: ${inUseFaq} FAQ(s) use this category` });
    }
    const inUsePage = await CategoryPage.countDocuments({ faqCategories: cat.name });
    if (inUsePage > 0) {
      return res.json({ success: false, error: `Cannot delete: ${inUsePage} page(s) reference this category` });
    }
    await FaqCategory.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Category deleted" });
  } catch (error) {
    console.error("Delete FAQ category error:", error);
    res.json({ success: false, error: "Failed to delete category" });
  }
});

// ============================================
// ADMIN PAGES (CATEGORY PAGES) ROUTES
// ============================================

// List all pages
app.get("/admin/pages", requireAdminOnly, async (req, res) => {
  if (!req.session.isAdmin) return res.redirect("/login");
  try {
    const pages = await CategoryPage.find({}).sort({ createdAt: -1 });
    const total = await CategoryPage.countDocuments({});
    const published = await CategoryPage.countDocuments({ isPublished: true });
    const drafts = await CategoryPage.countDocuments({ isPublished: false });
    res.render("admin/pages", { pages, stats: { total, published, drafts } });
  } catch (error) {
    console.error("Pages listing error:", error);
    res.render("admin/pages", { pages: [], stats: { total: 0, published: 0, drafts: 0 } });
  }
});

// Create page form
app.get("/admin/pages/create", requireAdminOnly, async (req, res) => {
  if (!req.session.isAdmin) return res.redirect("/login");
  const faqCategories = await FaqCategory.find({}).sort({ name: 1 });
  res.render("admin/createPage", { faqCategories });
});

// Create page handler
app.post("/admin/pages", requireAdminOnly, async (req, res) => {
  if (!req.session.isAdmin) return res.status(403).json({ success: false, error: "Forbidden" });
  try {
    const slugify = require("slugify");
    const { title, categorySlug, pageSlug, excerpt, content, faqCategories,
      metaTitle, metaDescription, keywords, focusKeyword, canonicalUrl, noIndex, isPublished } = req.body;
    if (!title || !categorySlug || !pageSlug) {
      return res.json({ success: false, error: "Title, category slug and page slug are required" });
    }
    const catSlug = categorySlug.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const pgSlug = pageSlug.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const existing = await CategoryPage.findOne({ categorySlug: catSlug, pageSlug: pgSlug });
    if (existing) return res.json({ success: false, error: "A page at that URL already exists" });
    const keywordsArray = keywords ? keywords.split(",").map(k => k.trim()).filter(Boolean) : [];
    const faqCatsArray = Array.isArray(faqCategories) ? faqCategories : (faqCategories ? [faqCategories] : []);
    const page = new CategoryPage({
      title: title.trim(),
      categorySlug: catSlug,
      pageSlug: pgSlug,
      excerpt: excerpt ? excerpt.trim() : "",
      content: content || "",
      faqCategories: faqCatsArray,
      metaTitle: metaTitle ? metaTitle.trim() : "",
      metaDescription: metaDescription ? metaDescription.trim() : "",
      keywords: keywordsArray,
      focusKeyword: focusKeyword ? focusKeyword.trim() : "",
      canonicalUrl: canonicalUrl ? canonicalUrl.trim() : "",
      noIndex: Boolean(noIndex),
      isPublished: Boolean(isPublished),
      publishedAt: Boolean(isPublished) ? new Date() : null,
    });
    await page.save();

    // IndexNow: notify if published and not noIndex
    if (page.isPublished && !page.noIndex) {
      indexNow.submitUrls([`/${page.categorySlug}/${page.pageSlug}`]);
    }

    res.json({ success: true, message: `Page ${Boolean(isPublished) ? "published" : "saved as draft"} successfully` });
  } catch (error) {
    console.error("Create page error:", error);
    res.json({ success: false, error: `Failed to create page: ${error.message}` });
  }
});

// Edit page form
app.get("/admin/pages/:id/edit", requireAdminOnly, async (req, res) => {
  if (!req.session.isAdmin) return res.redirect("/login");
  try {
    const page = await CategoryPage.findById(req.params.id);
    if (!page) return res.status(404).render("404", { title: "Page Not Found", url: req.originalUrl, user: req.session.user || null });
    const faqCategories = await FaqCategory.find({}).sort({ name: 1 });
    res.render("admin/editPage", { page, faqCategories });
  } catch (error) {
    console.error("Edit page form error:", error);
    res.redirect("/admin/pages");
  }
});

// Update page handler
app.post("/admin/pages/:id", requireAdminOnly, async (req, res) => {
  if (!req.session.isAdmin) return res.status(403).json({ success: false, error: "Forbidden" });
  try {
    const { title, categorySlug, pageSlug, excerpt, content, faqCategories,
      metaTitle, metaDescription, keywords, focusKeyword, canonicalUrl, noIndex, isPublished } = req.body;
    const page = await CategoryPage.findById(req.params.id);
    if (!page) return res.json({ success: false, error: "Page not found" });

    // Capture old slugs for IndexNow
    const oldCatSlug = page.categorySlug;
    const oldPageSlug = page.pageSlug;
    const oldWasPublished = page.isPublished;
    const oldNoIndex = page.noIndex;

    const catSlug = categorySlug.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const pgSlug = pageSlug.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    // Check uniqueness (exclude self)
    const conflict = await CategoryPage.findOne({ categorySlug: catSlug, pageSlug: pgSlug, _id: { $ne: page._id } });
    if (conflict) return res.json({ success: false, error: "Another page already uses that URL" });
    const keywordsArray = keywords ? keywords.split(",").map(k => k.trim()).filter(Boolean) : [];
    const faqCatsArray = Array.isArray(faqCategories) ? faqCategories : (faqCategories ? [faqCategories] : []);
    page.title = title.trim();
    page.categorySlug = catSlug;
    page.pageSlug = pgSlug;
    page.excerpt = excerpt ? excerpt.trim() : "";
    page.content = content || "";
    page.faqCategories = faqCatsArray;
    page.metaTitle = metaTitle ? metaTitle.trim() : "";
    page.metaDescription = metaDescription ? metaDescription.trim() : "";
    page.keywords = keywordsArray;
    page.focusKeyword = focusKeyword ? focusKeyword.trim() : "";
    page.canonicalUrl = canonicalUrl ? canonicalUrl.trim() : "";
    page.noIndex = Boolean(noIndex);
    page.isPublished = Boolean(isPublished);
    if (!oldWasPublished && page.isPublished) page.publishedAt = new Date();
    else if (oldWasPublished && !page.isPublished) page.publishedAt = null;
    await page.save();

    // IndexNow: submit based on status/slug changes
    if (page.isPublished && !page.noIndex) {
      const slugsChanged = (oldCatSlug !== page.categorySlug || oldPageSlug !== page.pageSlug);
      const url = `/${page.categorySlug}/${page.pageSlug}`;
      if (slugsChanged && oldWasPublished && !oldNoIndex) {
        indexNow.notifyUrlDeleted(`/${oldCatSlug}/${oldPageSlug}`);
      }
      indexNow.submitUrls([url]);
    } else if (oldWasPublished && !oldNoIndex && (!page.isPublished || page.noIndex)) {
      // Was published but now unpublished or noIndexed
      indexNow.notifyUrlDeleted(`/${oldCatSlug}/${oldPageSlug}`);
    }

    res.json({ success: true, message: `Page ${page.isPublished ? "updated and published" : "updated as draft"} successfully` });
  } catch (error) {
    console.error("Update page error:", error);
    res.json({ success: false, error: `Failed to update page: ${error.message}` });
  }
});

// Delete page handler
app.post("/admin/pages/:id/delete", requireAdminOnly, async (req, res) => {
  if (!req.session.isAdmin) return res.status(403).json({ success: false, error: "Forbidden" });
  try {
    const page = await CategoryPage.findById(req.params.id);
    if (!page) return res.json({ success: false, error: "Page not found" });
    const cpCatSlug = page.categorySlug;
    const cpPageSlug = page.pageSlug;
    const cpWasPublished = page.isPublished;
    const cpNoIndex = page.noIndex;
    await CategoryPage.findByIdAndDelete(req.params.id);

    // IndexNow: notify removal if it was published
    if (cpWasPublished && !cpNoIndex) {
      indexNow.notifyUrlDeleted(`/${cpCatSlug}/${cpPageSlug}`);
    }

    res.json({ success: true, message: "Page deleted successfully" });
  } catch (error) {
    console.error("Delete page error:", error);
    res.json({ success: false, error: "Failed to delete page" });
  }
});

// FAQ image upload
app.post("/api/upload-faq-image", requireAdminOnly, faqImageUpload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.json({ success: false, error: "No image uploaded" });
    res.json({ success: true, url: req.file.path, filename: req.file.filename });
  } catch (error) {
    console.error("FAQ image upload error:", error);
    res.json({ success: false, error: "Failed to upload image" });
  }
});

// ============================================
// PODCAST ROUTES (admin-only management + public page)
// ============================================

// Public: /podcasts page
app.get("/podcasts", async (req, res) => {
  try {
    const perPage = 12;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const totalCount = await Podcast.countDocuments({ isPublished: true });
    const totalPages = Math.ceil(totalCount / perPage);
    const podcasts = await Podcast.find({ isPublished: true })
      .sort({ order: 1, createdAt: -1 })
      .skip((page - 1) * perPage)
      .limit(perPage);
    const user = req.session.user || null;
    const globalSeoSettings = res.locals.globalSeoSettings || null;
    res.render("podcasts", { podcasts, currentPage: page, totalPages, user, globalSeoSettings });
  } catch (err) {
    console.error("Podcasts page error:", err);
    res.status(500).send("Error loading podcasts");
  }
});

// Admin: manage podcasts page
app.get("/admin/podcasts", requireAdminOnly, async (req, res) => {
  if (!req.session.isAdmin) return res.redirect("/login");
  try {
    const podcasts = await Podcast.find().sort({ order: 1, createdAt: -1 });
    res.render("admin/podcasts", { podcasts, user: req.session.user });
  } catch (err) {
    console.error("Admin podcasts error:", err);
    res.status(500).send("Error loading admin podcasts");
  }
});

// Admin: add podcast
app.post("/admin/podcasts", requireAdminOnly, async (req, res) => {
  if (!req.session.isAdmin) return res.status(403).json({ error: "Forbidden" });
  try {
    const { youtubeId, title, description, isPublished } = req.body;
    if (!youtubeId || !title) {
      return res.status(400).json({ error: "youtubeId and title are required" });
    }
    // Basic sanity check on ID format
    if (!/^[A-Za-z0-9_-]{11}$/.test(youtubeId)) {
      return res.status(400).json({ error: "Invalid YouTube video ID format" });
    }
    const existing = await Podcast.findOne({ youtubeId });
    if (existing) return res.status(409).json({ error: "This video has already been added" });
    const podcast = await Podcast.create({
      youtubeId,
      title: String(title).substring(0, 200),
      description: description ? String(description).substring(0, 500) : "",
      isPublished: isPublished !== false && isPublished !== "false",
      addedBy: "admin",
    });

    // IndexNow: notify if published
    if (podcast.isPublished) {
      indexNow.submitUrls(["/podcasts"]);
    }

    res.status(201).json({ success: true, podcast });
  } catch (err) {
    console.error("Add podcast error:", err);
    res.status(500).json({ error: "Failed to add podcast" });
  }
});

// Admin: delete podcast
app.delete("/admin/podcasts/:id", requireAdminOnly, async (req, res) => {
  if (!req.session.isAdmin) return res.status(403).json({ error: "Forbidden" });
  try {
    const podcast = await Podcast.findById(req.params.id);
    if (!podcast) return res.status(404).json({ error: "Podcast not found" });
    await Podcast.findByIdAndDelete(req.params.id);

    // IndexNow: notify listing page update
    indexNow.submitUrls(["/podcasts"]);

    res.json({ success: true });
  } catch (err) {
    console.error("Delete podcast error:", err);
    res.status(500).json({ error: "Failed to delete podcast" });
  }
});

// Admin: toggle publish
app.patch("/admin/podcasts/:id/toggle", requireAdminOnly, async (req, res) => {
  if (!req.session.isAdmin) return res.status(403).json({ error: "Forbidden" });
  try {
    const podcast = await Podcast.findById(req.params.id);
    if (!podcast) return res.status(404).json({ error: "Podcast not found" });
    podcast.isPublished = !podcast.isPublished;
    await podcast.save();

    // IndexNow: notify listing page update
    indexNow.submitUrls(["/podcasts"]);

    res.json({ success: true, podcast });
  } catch (err) {
    console.error("Toggle podcast error:", err);
    res.status(500).json({ error: "Failed to toggle podcast" });
  }
});

// Admin: edit podcast
app.patch("/admin/podcasts/:id", requireAdminOnly, async (req, res) => {
  if (!req.session.isAdmin) return res.status(403).json({ error: "Forbidden" });
  try {
    const podcast = await Podcast.findById(req.params.id);
    if (!podcast) return res.status(404).json({ error: "Podcast not found" });
    const { title, description, order, isPublished } = req.body;
    if (title !== undefined) podcast.title = String(title).substring(0, 200);
    if (description !== undefined) podcast.description = String(description).substring(0, 500);
    if (order !== undefined) podcast.order = parseInt(order, 10) || 0;
    if (isPublished !== undefined) podcast.isPublished = isPublished === true || isPublished === "true";
    await podcast.save();

    // IndexNow: notify listing page update
    indexNow.submitUrls(["/podcasts"]);

    res.json({ success: true, podcast });
  } catch (err) {
    console.error("Edit podcast error:", err);
    res.status(500).json({ error: "Failed to update podcast" });
  }
});

// ============================================
// ADMIN: AD MEDIA ROUTES
// ============================================
app.get("/admin/ads", requireAdminOnly, async (req, res) => {
  try {
    const ads = await AdMedia.find().sort({ order: 1, createdAt: -1 });
    res.render("admin/ads", { ads, user: req.session.user });
  } catch (err) {
    console.error("Admin ads error:", err);
    res.status(500).send("Error loading ads");
  }
});

app.post("/admin/ads", requireAdminOnly, adMediaUpload.single("media"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No file uploaded" });
    }
    const isVideo = req.file.mimetype.startsWith("video/");
    const ad = new AdMedia({
      url: req.file.path,
      publicId: req.file.filename,
      mediaType: isVideo ? "video" : "image",
      caption: (req.body.caption || "").trim().slice(0, 200),
      order: parseInt(req.body.order) || 0,
      isPublished: req.body.isPublished !== "false",
      addedBy: req.session.user?.username || "admin",
    });
    await ad.save();
    res.json({ success: true, ad });
  } catch (err) {
    console.error("Upload ad media error:", err);
    res.status(500).json({ success: false, error: "Failed to upload media" });
  }
});

app.delete("/admin/ads/:id", requireAdminOnly, async (req, res) => {
  try {
    const ad = await AdMedia.findById(req.params.id);
    if (!ad) return res.status(404).json({ error: "Ad not found" });
    // Delete from Cloudinary
    try {
      await cloudinary.uploader.destroy(ad.publicId, { resource_type: ad.mediaType === "video" ? "video" : "image" });
    } catch (cdnErr) {
      console.error("Cloudinary delete error:", cdnErr);
    }
    await AdMedia.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error("Delete ad error:", err);
    res.status(500).json({ error: "Failed to delete ad" });
  }
});

app.patch("/admin/ads/:id/toggle", requireAdminOnly, async (req, res) => {
  try {
    const ad = await AdMedia.findById(req.params.id);
    if (!ad) return res.status(404).json({ error: "Ad not found" });
    ad.isPublished = !ad.isPublished;
    await ad.save();
    res.json({ success: true, ad });
  } catch (err) {
    console.error("Toggle ad error:", err);
    res.status(500).json({ error: "Failed to toggle ad" });
  }
});

// ============================================
// ADMIN: TEAM MEMBER ROUTES
// ============================================
app.get("/admin/team", requireAdminOnly, async (req, res) => {
  try {
    const members = await TeamMember.find().sort({ order: 1, createdAt: -1 });
    res.render("admin/team", { members, user: req.session.user });
  } catch (err) {
    console.error("Admin team error:", err);
    res.status(500).send("Error loading team");
  }
});

app.post("/admin/team", requireAdminOnly, teamPhotoUpload.single("photo"), async (req, res) => {
  try {
    const { name, designation, bio, order } = req.body;
    if (!name || !designation) {
      return res.status(400).json({ success: false, error: "Name and designation are required" });
    }
    const member = new TeamMember({
      name: name.trim(),
      designation: designation.trim(),
      bio: (bio || "").trim().slice(0, 500),
      order: parseInt(order) || 0,
      photo: req.file ? { url: req.file.path, publicId: req.file.filename } : {},
      addedBy: req.session.user?.username || "admin",
    });
    await member.save();
    res.json({ success: true, member });
  } catch (err) {
    console.error("Add team member error:", err);
    res.status(500).json({ success: false, error: "Failed to add team member" });
  }
});

app.delete("/admin/team/:id", requireAdminOnly, async (req, res) => {
  try {
    const member = await TeamMember.findById(req.params.id);
    if (!member) return res.status(404).json({ error: "Team member not found" });
    if (member.photo?.publicId) {
      try {
        await cloudinary.uploader.destroy(member.photo.publicId);
      } catch (cdnErr) {
        console.error("Cloudinary delete error:", cdnErr);
      }
    }
    await TeamMember.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error("Delete team member error:", err);
    res.status(500).json({ error: "Failed to delete team member" });
  }
});

app.patch("/admin/team/:id/toggle", requireAdminOnly, async (req, res) => {
  try {
    const member = await TeamMember.findById(req.params.id);
    if (!member) return res.status(404).json({ error: "Team member not found" });
    member.isPublished = !member.isPublished;
    await member.save();
    res.json({ success: true, member });
  } catch (err) {
    console.error("Toggle team member error:", err);
    res.status(500).json({ error: "Failed to toggle team member" });
  }
});

// ============================================
// PUBLIC: /our-ads PAGE
// ============================================
app.get("/our-ads", async (req, res) => {
  try {
    const ads = await AdMedia.find({ isPublished: true }).sort({ order: 1, createdAt: -1 });
    res.render("our-ads", { user: req.session.user || null, ads });
  } catch (err) {
    console.error("Our Ads page error:", err);
    res.status(500).send("Error loading page");
  }
});

// ============================================
// PUBLIC: /our-team PAGE
// ============================================
app.get("/our-team", async (req, res) => {
  try {
    const members = await TeamMember.find({ isPublished: true }).sort({ order: 1, createdAt: -1 });
    res.render("our-team", { user: req.session.user || null, members });
  } catch (err) {
    console.error("Our Team page error:", err);
    res.status(500).send("Error loading page");
  }
});

// **FIX**: Blog image upload route — uses dedicated blogImageUpload to avoid user_profiles/ folder
app.post("/api/upload-blog-image", requireAdminOnly, blogImageUpload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.json({ success: false, error: "No image uploaded" });
    }

    // Image is automatically uploaded to Cloudinary via multer-storage-cloudinary
    const imageUrl = req.file.path;

    console.log('Blog image uploaded:', imageUrl);

    res.json({
      success: true,
      url: imageUrl,
      filename: req.file.filename
    });
  } catch (error) {
    console.error('Blog image upload error:', error);
    res.json({
      success: false,
      error: 'Failed to upload image'
    });
  }
});
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

      if (!email) {
        return res.json({
          success: false,
          error: "Email is required",
        });
      }

      // Check if email already exists and is verified
      const existingUser = await User.findOne({ email: email.toLowerCase() });
      if (existingUser) {
        return res.json({
          success: false,
          error: "This email is already registered. Please login instead.",
        });
      }

      // Generate verification code
      const code = generateVerificationCode();

      // Send email (username is optional for registration flow)
      const displayName = username || email.split('@')[0];
      const emailResult = await sendVerificationEmail(email, code, displayName);

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
        username: username || null,
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
    const { code, email } = req.body;

    if (!req.session.pendingVerification) {
      return res.json({
        success: false,
        error: "No pending verification found. Please request a new code.",
      });
    }

    const pending = req.session.pendingVerification;

    // Verify email matches
    if (email && email.toLowerCase() !== pending.email) {
      return res.json({
        success: false,
        error: "Email mismatch. Please request a new code.",
      });
    }

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
    title: "Terms and Conditions - shadiAmour",
  });
});
app.get("/privacy", (req, res) => {
  res.render("privacy", {
    title: "Privacy Policy - shadiAmour",
  });
});

// **NEW**: Company, Policy & Information Pages
app.get("/company-details", (req, res) => {
  res.render("company-details", {
    title: "Company Details - shadiamour",
  });
});

app.get("/refund-policy", (req, res) => {
  res.render("refund-policy", {
    title: "Refund Policy - shadiamour",
  });
});

app.get("/account-faqs", (req, res) => {
  res.render("account-faqs", {
    title: "Account FAQs - shadiamour",
  });
});

app.get("/pricing", (req, res) => {
  res.render("pricing", {
    title: "Pricing & Membership Plans - shadiamour",
  });
});

app.get("/gdpr-faqs", (req, res) => {
  res.render("gdpr-faqs", {
    title: "GDPR FAQs - shadiamour",
  });
});

app.get("/code-of-conduct", (req, res) => {
  res.render("code-of-conduct", {
    title: "Code of Conduct - shadiamour",
  });
});

// **UPDATED**: Dynamic blog routes

// Public blog listing page
// Replace the existing /blog route with this updated version

app.get("/blog",requireOnboardingComplete, async (req, res) => {
  try {
    const { category, tag } = req.query;

    // **NEW**: Define static blogs that were previously hardcoded
    const staticBlogs = [
      {
        title: "Ultimate Guide to Hiring a Muslim Wedding Planner: Everything You Need to Know",
        excerpt: "Planning a wedding is exciting — but for Muslim couples, it also comes with additional values, traditions, and sensitivities. Learn everything you need to know about hiring the right Muslim wedding planner.",
        author: { name: "shadiamour Team" },
        publishedAt: new Date("2025-01-11"),
        category: "Wedding Planning",
        tags: ["wedding", "planning", "muslim", "guide"],
        slug: "muslim-wedding-planner-guide",
        featuredImage: {
          url: "https://res.cloudinary.com/dhuc2plh0/image/upload/f_auto,q_auto:eco,w_800,h_450,c_fill,g_auto/v1760870954/jubair-ahmed-himu-5b0jgXvfimE-unsplash_tmjkew.jpg",
          alt: "Muslim Wedding Planning Guide"
        },
        isStatic: true // Flag to identify static blogs
      },
      {
        title: "UK Rishta WhatsApp Group: Your Gateway to Halal Marriage",
        excerpt: "Join our verified UK rishta WhatsApp group where serious Muslims connect for halal marriage. Discover how to find your perfect match through our trusted, moderated community across London, Leicester and the UK.",
        author: { name: "shadiamour Team" },
        publishedAt: new Date("2025-01-15"),
        category: "Muslim Rishta",
        tags: ["rishta", "whatsapp", "uk", "halal", "marriage"],
        slug: "uk-rishta-whatsapp-group",
        featuredImage: {
          url: "https://res.cloudinary.com/dhuc2plh0/image/upload/f_auto,q_auto:eco,w_800,h_450,c_fill,g_auto/v1760870946/brett-jordan-dMUeHGE8Dio-unsplash_eozw9p.jpg",
          alt: "UK Rishta WhatsApp Group"
        },
        isStatic: true
      },
      {
        title: "UK Muslim Rishta Service: Affordable Registration Fees & Matchmaking Charges (2025)",
        excerpt: "Discover transparent pricing for shadiamour's rishta service with four flexible plans: Standard (Free), Premium (£50), Premium Plus (£100+£200), and Executive (£150+£450). 100% money-back guarantee included.",
        author: { name: "shadiamour Team" },
        publishedAt: new Date("2025-01-20"),
        category: "Rishta Services",
        tags: ["pricing", "rishta", "service", "uk", "charges"],
        slug: "uk-muslim-rishta-service-charges",
        featuredImage: {
          url: "https://res.cloudinary.com/dhuc2plh0/image/upload/f_auto,q_auto:eco,w_800,h_450,c_fill,g_auto/v1760870921/jubair-ahmed-himu-XILfo8IMMjc-unsplash_qffxew.jpg",
          alt: "UK Muslim Rishta Service Pricing"
        },
        isStatic: true
      }
    ];

    // Build query for published blogs only
    let query = { isPublished: true };

    if (category) {
      query.category = category;
    }

    if (tag) {
      query.tags = { $in: [tag] };
    }

    // Get database blogs
    const databaseBlogs = await Blog.find(query)
      .sort({ publishedAt: -1 })
      .select('title excerpt slug category tags publishedAt author featuredImage');

    // **NEW**: Filter static blogs based on query parameters
    let filteredStaticBlogs = staticBlogs;

    if (category) {
      filteredStaticBlogs = staticBlogs.filter(blog =>
        blog.category.toLowerCase() === category.toLowerCase()
      );
    }

    if (tag) {
      filteredStaticBlogs = filteredStaticBlogs.filter(blog =>
        blog.tags.some(blogTag => blogTag.toLowerCase() === tag.toLowerCase())
      );
    }

    // **NEW**: Combine database and static blogs, then sort by publishedAt
    const allBlogs = [...databaseBlogs, ...filteredStaticBlogs];
    const sortedBlogs = allBlogs.sort((a, b) =>
      new Date(b.publishedAt) - new Date(a.publishedAt)
    );

    // Get all categories and tags for filters (including static blogs)
    const allBlogsForFilters = [...databaseBlogs, ...staticBlogs];
    const categories = [...new Set(allBlogsForFilters.map(blog => blog.category))];
    const allTags = allBlogsForFilters.reduce((tags, blog) => {
      if (blog.tags && Array.isArray(blog.tags)) {
        blog.tags.forEach(tag => tags.add(tag));
      }
      return tags;
    }, new Set());

    res.render("blog/index", {
      title: "Blog - shadiAmour",
      posts: sortedBlogs, // Combined and sorted blogs
      categories,
      tags: Array.from(allTags),
      currentCategory: category || null,
      currentTag: tag || null,
      user: req.session.user || null,
    });
  } catch (error) {
    console.error("Blog listing error:", error);
    res.render("blog/index", {
      title: "Blog - shadiAmour",
      posts: [], // Empty posts array on error
      categories: [],
      tags: [],
      currentCategory: null,
      currentTag: null,
      user: req.session.user || null,
    });
  }
});

// 301 Redirects for duplicate "WhatsApp Group" blog posts → canonical URL
const whatsappBlogRedirects = [
  "/blog/join-genuine-muslim-marriage-whatsapp-groups-for-nikah",
  "/blog/join-whatsapp-based-rishta-groups-by-muslim-matrimonial-uk",
  "/blog/muslim-marriage-whatsapp-groups-find-genuine-halal-rishta-online",
];
whatsappBlogRedirects.forEach((oldPath) => {
  app.get(oldPath, (req, res) => {
    res.redirect(301, "/blog/uk-rishta-whatsapp-group");
  });
});

// Public individual blog page

app.get("/blog/:slug",requireOnboardingComplete, async (req, res) => {
  try {
    const { slug } = req.params;

    // **NEW**: Check for static blog templates first

    // **EXISTING**: Check database for dynamic blogs
    const blog = await Blog.findOne({
      slug: slug,
      isPublished: true
    });

    if (!blog) {
      return res.status(404).render("404", {
        title: "Blog Post Not Found - shadiAmour",
        url: req.originalUrl,
      });
    }

    // Get related blogs (same category, excluding current blog)
    const relatedBlogs = await Blog.find({
      isPublished: true,
      category: blog.category,
      _id: { $ne: blog._id }
    })
      .sort({ publishedAt: -1 })
      .limit(3)
      .select('title excerpt slug publishedAt');

    // Generate structured data for SEO
    const structuredData = {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      "headline": blog.title,
      "description": blog.excerpt || blog.metaDescription,
      "image": blog.featuredImage?.url || "",
      "author": {
        "@type": "Organization",
        "name": blog.author.name || "shadiAmour Team"
      },
      "publisher": {
        "@type": "Organization",
        "name": "shadiAmour",
        "logo": {
          "@type": "ImageObject",
          "url": "https://shadiAmour.com/images/logo.png"
        }
      },
      "datePublished": blog.publishedAt?.toISOString(),
      "dateModified": blog.updatedAt.toISOString(),
      "mainEntityOfPage": {
        "@type": "WebPage",
        "@id": `https://shadiAmour.com/blog/${blog.slug}`
      }
    };

    res.render("blog/post", {
      title: blog.metaTitle || `${blog.title} - shadiAmour`,
      metaDescription: blog.metaDescription || blog.excerpt,
      canonicalUrl: blog.canonicalUrl || `https://shadiAmour.com/blog/${blog.slug}`,
      blog,
      relatedBlogs,
      structuredData,
      user: req.session.user || null,
    });
  } catch (error) {
    console.error("Individual blog error:", error);
    res.status(404).render("404", {
      title: "Blog Post Not Found - shadiAmour",
      url: req.originalUrl,
    });
  }
});
app.get('/marriage-profile-registration-form', (req, res) => {
  const googleFormUrl = process.env.marriageProfileGoogleFormUrl;
res.redirect(301, googleFormUrl);
});
// Update the sitemap.xml route to include static blogs
app.get("/sitemap.xml", async (req, res) => {
  try {
    // Individual profile URLs are intentionally excluded — profiles default to noindex.
    const blogs = await Blog.find({ isPublished: true }).select("slug updatedAt publishedAt");
    const categoryPageDocs = await CategoryPage.find({ isPublished: true, noIndex: { $ne: true } }).select("categorySlug pageSlug updatedAt createdAt");

    // **NEW**: Static blog slugs
    const staticBlogs = [
      { slug: "muslim-wedding-planner-guide", lastmod: "2025-01-11" },
      { slug: "uk-rishta-whatsapp-group", lastmod: "2025-01-15" },
      { slug: "uk-muslim-rishta-service-charges", lastmod: "2025-01-20" }
    ];

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
    <loc>https://shadiamour.com/matches</loc>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://shadiamour.com/islamic-faqs</loc>
    <loc>https://shadiamour.com/blog</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://shadiamour.com/podcasts</loc>
    <loc>https://shadiamour.com/islamic-faqs</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://shadiamour.com/podcasts</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://shadiamour.com/pricing</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://shadiamour.com/our-team</loc>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://shadiamour.com/our-ads</loc>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>https://shadiamour.com/company-details</loc>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>https://shadiamour.com/refund-policy</loc>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>https://shadiamour.com/account-faqs</loc>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://shadiamour.com/gdpr-faqs</loc>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>https://shadiamour.com/code-of-conduct</loc>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>https://shadiamour.com/terms</loc>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
  <url>
    <loc>https://shadiamour.com/privacy</loc>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
  <url>
    <loc>https://shadiamour.com/muslim-marriage</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://shadiamour.com/muslim-matrimonial</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://shadiamour.com/muslim-matchmaking</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://shadiamour.com/halal-marriage</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://shadiamour.com/muslim-rishta</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://shadiamour.com/find-muslim-spouse</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://shadiamour.com/best-muslim-marriage-website</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://shadiamour.com/free-muslim-marriage-site</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://shadiamour.com/trusted-muslim-matchmaking</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://shadiamour.com/verified-muslim-profiles</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://shadiamour.com/online-rishta-pakistan</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://shadiamour.com/rishta-lahore</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://shadiamour.com/rishta-karachi</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://shadiamour.com/muslim-marriage-uk</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://shadiamour.com/british-pakistani-marriage</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://shadiamour.com/muslim-singles-uk</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://shadiamour.com/muslim-second-marriage</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://shadiamour.com/divorced-muslim-marriage</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://shadiamour.com/muslim-marriage-over-30</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://shadiamour.com/profiles?gender=male</loc>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://shadiamour.com/profiles?gender=female</loc>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://shadiamour.com/profiles/addedBy/staff</loc>
    <changefreq>daily</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://shadiamour.com/muslim-matrimony-london</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://shadiamour.com/muslim-matrimony-birmingham</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://shadiamour.com/muslim-matrimony-manchester</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://shadiamour.com/muslim-matrimony-bradford</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://shadiamour.com/muslim-matrimony-leicester</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://shadiamour.com/muslim-matrimony-leeds</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`;

    // Add new UK city hub pages (Sheffield, Coventry, Luton, Glasgow, Nottingham)
    cityHubPages.filter(h => !["London","Birmingham","Manchester","Bradford","Leicester","Leeds"].includes(h.city)).forEach((hub) => {
      sitemap += `
  <url>
    <loc>https://shadiamour.com/${hub.slug}</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`;
    });

    // Add Pakistan city pages (Islamabad, Rawalpindi, Faisalabad)
    pakistanCityPages.forEach((pkCity) => {
      sitemap += `
  <url>
    <loc>https://shadiamour.com/${pkCity.slug}</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`;
    });

    // Add database blog posts
    blogs.forEach((blog) => {
      const lastmod = blog.updatedAt
        ? blog.updatedAt.toISOString().split("T")[0]
        : blog.publishedAt.toISOString().split("T")[0];
      sitemap += `
  <url>
    <loc>https://www.shadiamour.com/blog/${blog.slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`;
    });

    // Individual profile URLs are intentionally excluded from the sitemap —
    // profile pages default to noindex (see profile.ejs shouldNoIndex logic).

    // Add category pages
    categoryPageDocs.forEach((cp) => {
      const lastmod = cp.updatedAt
        ? cp.updatedAt.toISOString().split("T")[0]
        : cp.createdAt
          ? cp.createdAt.toISOString().split("T")[0]
          : new Date().toISOString().split("T")[0];
      sitemap += `
  <url>
    <loc>https://shadiamour.com/${cp.categorySlug}/${cp.pageSlug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
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

// SEO: Q&A Sitemap — /qa-sitemap.xml (Islamic FAQs)
app.get("/qa-sitemap.xml", async (req, res) => {
  try {
    const faqs = await IslamicFAQ.find({ isPublished: true })
      .select("slug updatedAt createdAt")
      .sort({ updatedAt: -1 });

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
          http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">
  <url>
    <loc>https://shadiamour.com/islamic-faqs</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;

    faqs.forEach((faq) => {
      const lastmod = (faq.updatedAt || faq.createdAt)
        ? new Date(faq.updatedAt || faq.createdAt).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0];
      xml += `
  <url>
    <loc>https://shadiamour.com/islamic-faqs/${faq.slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`;
    });

    xml += `
</urlset>`;

    res.set("Content-Type", "application/xml");
    res.send(xml);
  } catch (err) {
    console.error("QA sitemap error:", err);
    res.status(500).send("Error generating QA sitemap");
  }
});

// SEO: Video Sitemap — /video-sitemap.xml
app.get("/video-sitemap.xml", async (req, res) => {
  try {
    const podcasts = await Podcast.find({ isPublished: true }).sort({ order: 1, createdAt: -1 });

    const escXml = (str) =>
      String(str || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset
  xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
`;

    for (const p of podcasts) {
      const uploadDate = p.createdAt
        ? new Date(p.createdAt).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0];
      const description = escXml(
        p.description || "Watch this episode of the D\u2019amour Muslim podcast on Islamic marriage and matchmaking."
      );

      xml += `  <url>
    <loc>https://shadiamour.com/podcasts</loc>
    <video:video>
      <video:thumbnail_loc>https://img.youtube.com/vi/${escXml(p.youtubeId)}/maxresdefault.jpg</video:thumbnail_loc>
      <video:title>${escXml(p.title)}</video:title>
      <video:description>${description}</video:description>
      <video:player_loc>https://www.youtube.com/embed/${escXml(p.youtubeId)}</video:player_loc>
      <video:content_loc>https://www.youtube.com/watch?v=${escXml(p.youtubeId)}</video:content_loc>
      <video:publication_date>${uploadDate}</video:publication_date>
      <video:family_friendly>yes</video:family_friendly>
    </video:video>
  </url>
`;
    }

    xml += `</urlset>`;

    res.set("Content-Type", "application/xml");
    res.send(xml);
  } catch (err) {
    console.error("Video sitemap error:", err);
    res.status(500).send("Error generating video sitemap");
  }
});

// SEO: Robots.txt
app.get("/robots.txt", (req, res) => {
  const robots = `User-agent: *
Allow: /

# Block Faceted Navigation / Filter Combinations
Disallow: /*minAge=
Disallow: /*maxAge=
Disallow: /*minHeight=
Disallow: /*maxHeight=
Disallow: /*city=
Disallow: /*country=
Disallow: /*nationality=
Disallow: /*sortBy=

# Block Private & Functional Routes
Disallow: /admin/
Disallow: /account/
Disallow: /api/
Disallow: /logout
Disallow: /chats/
Disallow: /chat/

Sitemap: https://shadiamour.com/sitemap.xml
Sitemap: https://shadiamour.com/video-sitemap.xml
Sitemap: https://shadiamour.com/qa-sitemap.xml`;

  res.set("Content-Type", "text/plain");
  res.send(robots);
});
// ============================================
// SEO ADMIN PANEL ROUTES
// ============================================

// SEO Admin Login Page
app.get("/seoadmin/login", (req, res) => {
  if (req.session.isSeoAdmin) {
    return res.redirect("/seoadmin/dashboard");
  }
  res.render("seoadmin/login", { error: null });
});

// SEO Admin Login Handler
app.post("/seoadmin/login", (req, res) => {
  const { password } = req.body;
  
  if (password === process.env.SEO_ADMIN_PASSWORD) {
    req.session.isSeoAdmin = true;
    return res.redirect("/seoadmin/dashboard");
  }
  
  res.render("seoadmin/login", { error: "Invalid password" });
});

// SEO Admin Logout
app.get("/seoadmin/logout", (req, res) => {
  req.session.isSeoAdmin = false;
  res.redirect("/seoadmin/login");
});

// SEO Admin Dashboard
app.get("/seoadmin/dashboard", requireSeoAdmin, async (req, res) => {
  try {
    const stats = {
      totalProfiles: await User.countDocuments(),
      customSeoProfiles: await User.countDocuments({
        $or: [
          { "seoSettings.customMetaTitle": { $exists: true, $ne: "" } },
          { "seoSettings.customMetaDescription": { $exists: true, $ne: "" } }
        ]
      }),
      noIndexProfiles: await User.countDocuments({ "seoSettings.noIndex": true }),
      totalBlogs: await Blog.countDocuments(),
      profilesWithCustomTitle: await User.countDocuments({ "seoSettings.customMetaTitle": { $exists: true, $ne: "" } }),
      profilesWithCustomDesc: await User.countDocuments({ "seoSettings.customMetaDescription": { $exists: true, $ne: "" } }),
      approvedProfiles: await User.countDocuments({ isApproved: true, "seoSettings.noIndex": { $ne: true } })
    };
    
    // Get recent SEO edits
    const recentEdits = await User.find({ "seoSettings.lastSeoEditedAt": { $exists: true } })
      .sort({ "seoSettings.lastSeoEditedAt": -1 })
      .limit(5)
      .select("username profilePic seoSettings");
    
    res.render("seoadmin/dashboard", { stats, recentEdits });
  } catch (error) {
    console.error("SEO Dashboard error:", error);
    res.status(500).send("Error loading dashboard");
  }
});

// SEO Admin - Profile Listing
app.get("/seoadmin/profiles", requireSeoAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const skip = (page - 1) * limit;
    const { search, gender, filter } = req.query;
    
    let query = {};
    
    // Search filter
    if (search) {
      query.$or = [
        { username: { $regex: search, $options: "i" } },
        { city: { $regex: search, $options: "i" } },
        { ethnicity: { $regex: search, $options: "i" } },
        { profileSlug: { $regex: search, $options: "i" } }
      ];
    }
    
    // Gender filter
    if (gender) {
      query.gender = gender;
    }
    
    // SEO status filter
    if (filter === "hasCustomSeo") {
      query.$or = [
        { "seoSettings.customMetaTitle": { $exists: true, $ne: "" } },
        { "seoSettings.customMetaDescription": { $exists: true, $ne: "" } }
      ];
    } else if (filter === "noCustomSeo") {
      query.$and = [
        { $or: [{ "seoSettings.customMetaTitle": { $exists: false } }, { "seoSettings.customMetaTitle": "" }] },
        { $or: [{ "seoSettings.customMetaDescription": { $exists: false } }, { "seoSettings.customMetaDescription": "" }] }
      ];
    } else if (filter === "noIndex") {
      query["seoSettings.noIndex"] = true;
    } else if (filter === "approved") {
      query.isApproved = true;
    }
    
    const profiles = await User.find(query)
      .sort({ "seoSettings.lastSeoEditedAt": -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select("username gender age city ethnicity profilePic profileSlug isApproved seoSettings");
    
    const totalCount = await User.countDocuments(query);
    const totalPages = Math.ceil(totalCount / limit);
    
    res.render("seoadmin/profiles", {
      profiles,
      currentPage: page,
      totalPages,
      totalCount,
      search: search || "",
      gender: gender || "",
      filter: filter || ""
    });
  } catch (error) {
    console.error("SEO Profiles error:", error);
    res.status(500).send("Error loading profiles");
  }
});

// SEO Admin - Edit Profile SEO
app.get("/seoadmin/profile/:id", requireSeoAdmin, async (req, res) => {
  try {
    const profile = await User.findById(req.params.id);
    if (!profile) {
      return res.status(404).send("Profile not found");
    }
    
    res.render("seoadmin/editProfile", {
      profile,
      success: req.query.success || null,
      error: req.query.error || null
    });
  } catch (error) {
    console.error("SEO Edit Profile error:", error);
    res.status(500).send("Error loading profile");
  }
});

// SEO Admin - Update Profile SEO
app.post("/seoadmin/profile/:id/update", requireSeoAdmin, async (req, res) => {
  try {
    const profile = await User.findById(req.params.id);
    if (!profile) {
      return res.status(404).send("Profile not found");
    }
    
    // Capture old values for IndexNow
    const oldProfileSlug = profile.profileSlug;
    const oldNoIndex = profile.seoSettings && profile.seoSettings.noIndex;
    
    const {
      profileSlug,
      randomNameForSeo,
      customMetaTitle,
      customMetaDescription,
      focusKeyword,
      customKeywords,
      noIndex,
      indexOverride,
      ogImageOverride,
      canonicalUrlOverride,
      seoField1,
      seoField2,
      internalNotes
    } = req.body;
    
    // Handle profile slug update with validation
    if (profileSlug && profileSlug !== profile.profileSlug) {
      const previousSlug = profile.profileSlug;
      // Validate slug format (lowercase, alphanumeric, hyphens only)
      const slugRegex = /^[a-z0-9-]+$/;
      if (!slugRegex.test(profileSlug)) {
        return res.redirect(`/seoadmin/profile/${req.params.id}?error=Invalid slug format. Use lowercase letters, numbers, and hyphens only.`);
      }
      
      // Check if slug already exists for another user
      const existingUser = await User.findOne({ 
        profileSlug: profileSlug, 
        _id: { $ne: profile._id } 
      });
      
      if (existingUser) {
        return res.redirect(`/seoadmin/profile/${req.params.id}?error=This profile slug is already in use by another profile.`);
      }
      
      // Update the slug
      profile.profileSlug = profileSlug;
      addProfileSlugHistory(profile, previousSlug, profile.profileSlug);
      console.log(
        `SEO Admin updated profile slug from ${previousSlug} to ${profile.profileSlug}`
      );
    }
    
    // Update root-level SEO fields
    profile.randomNameForSeo = randomNameForSeo || profile.randomNameForSeo;
    profile.seoField1 = seoField1 || "";
    profile.seoField2 = seoField2 || "";
    
    // Initialize seoSettings if not exists
    if (!profile.seoSettings) {
      profile.seoSettings = {};
    }
    
    // Update nested seoSettings
    profile.seoSettings.customMetaTitle = customMetaTitle || "";
    profile.seoSettings.customMetaDescription = customMetaDescription || "";
    profile.seoSettings.focusKeyword = focusKeyword || "";
    profile.seoSettings.customKeywords = customKeywords ? customKeywords.split(",").map(k => k.trim()).filter(k => k) : [];
    profile.seoSettings.noIndex = noIndex === "true";
    profile.seoSettings.indexOverride = indexOverride === "true";
    profile.seoSettings.ogImageOverride = ogImageOverride || "";
    profile.seoSettings.canonicalUrlOverride = canonicalUrlOverride || "";
    profile.seoSettings.internalNotes = internalNotes || "";
    profile.seoSettings.lastSeoEditedAt = new Date();
    profile.seoSettings.lastSeoEditedBy = "SEO Admin";
    
    await profile.save();

    // IndexNow: handle slug/noIndex changes for approved profiles
    if (profile.isApproved && profile.approvalStatus === "approved") {
      const newSlug = profile.profileSlug;
      const newNoIndex = profile.seoSettings && profile.seoSettings.noIndex;

      if (newNoIndex && !oldNoIndex) {
        // Was indexable, now noIndexed — notify removal
        if (oldProfileSlug) indexNow.notifyUrlDeleted(`/profiles/${oldProfileSlug}`);
        indexNow.submitUrls(["/profiles"]);
      } else if (!newNoIndex && oldNoIndex) {
        // Was noIndexed, now indexable — submit
        if (newSlug) indexNow.submitUrls([`/profiles/${newSlug}`, "/profiles"]);
      } else if (!newNoIndex) {
        // Still indexable — handle slug changes
        if (newSlug && oldProfileSlug !== newSlug) {
          indexNow.submitUrls([`/profiles/${newSlug}`, "/profiles"]);
          if (oldProfileSlug) indexNow.notifyUrlDeleted(`/profiles/${oldProfileSlug}`);
        } else if (newSlug) {
          indexNow.submitUrls([`/profiles/${newSlug}`, "/profiles"]);
        }
      }
    }
    
    res.redirect(`/seoadmin/profile/${req.params.id}?success=SEO settings updated successfully`);
  } catch (error) {
    console.error("SEO Update Profile error:", error);
    res.redirect(`/seoadmin/profile/${req.params.id}?error=Failed to update SEO settings`);
  }
});

// SEO Admin - Blog Listing
app.get("/seoadmin/blogs", requireSeoAdmin, async (req, res) => {
  try {
    const { search, status } = req.query;
    let query = {};
    
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { slug: { $regex: search, $options: "i" } }
      ];
    }
    
    if (status) {
      query.status = status;
    }
    
    const blogs = await Blog.find(query)
      .sort({ publishedAt: -1 })
      .select("title slug featuredImage status metaTitle metaDescription keywords views publishedAt");
    
    res.render("seoadmin/blogs", {
      blogs,
      search: search || "",
      status: status || ""
    });
  } catch (error) {
    console.error("SEO Blogs error:", error);
    res.status(500).send("Error loading blogs");
  }
});

// SEO Admin - Edit Blog SEO
app.get("/seoadmin/blog/:id", requireSeoAdmin, async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) {
      return res.status(404).send("Blog not found");
    }
    
    res.render("seoadmin/editBlog", {
      blog,
      success: req.query.success || null,
      error: req.query.error || null
    });
  } catch (error) {
    console.error("SEO Edit Blog error:", error);
    res.status(500).send("Error loading blog");
  }
});

// SEO Admin - Update Blog SEO
app.post("/seoadmin/blog/:id/update", requireSeoAdmin, async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) {
      return res.status(404).send("Blog not found");
    }
    
    const {
      metaTitle,
      metaDescription,
      keywords,
      canonicalUrl,
      slug,
      "faqQuestion[]": faqQuestions,
      "faqAnswer[]": faqAnswers
    } = req.body;
    
    // Handle slug update
    if (slug && slug.trim()) {
      const sanitizedSlug = slug.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      if (sanitizedSlug) {
        const existingBlog = await Blog.findOne({ slug: sanitizedSlug, _id: { $ne: blog._id } });
        if (existingBlog) {
          return res.redirect(`/seoadmin/blog/${req.params.id}?error=Slug already in use by another post`);
        }
        blog.slug = sanitizedSlug;
      }
    }
    
    blog.metaTitle = metaTitle || "";
    blog.metaDescription = metaDescription || "";
    blog.keywords = keywords ? keywords.split(",").map(k => k.trim()).filter(k => k) : [];
    blog.canonicalUrl = canonicalUrl || "";
    
    // Handle FAQ schema
    if (faqQuestions && faqAnswers) {
      const questions = Array.isArray(faqQuestions) ? faqQuestions : [faqQuestions];
      const answers = Array.isArray(faqAnswers) ? faqAnswers : [faqAnswers];
      
      blog.faqSchema = questions
        .map((q, i) => ({ question: q, answer: answers[i] || "" }))
        .filter(faq => faq.question && faq.answer);
    } else {
      blog.faqSchema = [];
    }
    
    await blog.save();
    
    res.redirect(`/seoadmin/blog/${req.params.id}?success=Blog SEO updated successfully`);
  } catch (error) {
    console.error("SEO Update Blog error:", error);
    res.redirect(`/seoadmin/blog/${req.params.id}?error=Failed to update blog SEO`);
  }
});

// SEO Admin - Global Settings
app.get("/seoadmin/global-settings", requireSeoAdmin, async (req, res) => {
  try {
    const settings = await GlobalSeoSettings.getSettings();
    
    res.render("seoadmin/globalSettings", {
      settings,
      success: req.query.success || null,
      error: req.query.error || null
    });
  } catch (error) {
    console.error("SEO Global Settings error:", error);
    res.status(500).send("Error loading global settings");
  }
});

// SEO Admin - Update Global Settings
app.post("/seoadmin/global-settings/update", requireSeoAdmin, async (req, res) => {
  try {
    const {
      siteName,
      defaultMetaTitleSuffix,
      defaultMetaDescription,
      defaultOgImage,
      globalKeywords,
      twitterHandle,
      facebookPageUrl,
      instagramHandle,
      googleAnalyticsId,
      googleSearchConsoleVerification,
      bingVerification,
      homepageMetaTitle,
      homepageMetaDescription,
      profilesPageMetaTitle,
      profilesPageMetaDescription,
      organizationName,
      organizationUrl,
      organizationLogo,
      organizationEmail,
      organizationPhone,
      globalNoIndex,
      robotsTxtAdditions,
      footerSeoText
    } = req.body;
    
    const updates = {
      siteName,
      defaultMetaTitleSuffix,
      defaultMetaDescription,
      defaultOgImage,
      globalKeywords: globalKeywords ? globalKeywords.split(",").map(k => k.trim()).filter(k => k) : [],
      twitterHandle,
      facebookPageUrl,
      instagramHandle,
      googleAnalyticsId,
      googleSearchConsoleVerification,
      bingVerification,
      homepageMetaTitle,
      homepageMetaDescription,
      profilesPageMetaTitle,
      profilesPageMetaDescription,
      organizationName,
      organizationUrl,
      organizationLogo,
      organizationEmail,
      organizationPhone,
      globalNoIndex: globalNoIndex === "true",
      robotsTxtAdditions,
      footerSeoText
    };
    
    await GlobalSeoSettings.updateSettings(updates, "SEO Admin");
    
    res.redirect("/seoadmin/global-settings?success=Global settings updated successfully");
  } catch (error) {
    console.error("SEO Update Global Settings error:", error);
    res.redirect("/seoadmin/global-settings?error=Failed to update global settings");
  }
});

// SEO Admin - Redirect base /seoadmin to dashboard
app.get("/seoadmin", (req, res) => {
  if (req.session.isSeoAdmin) {
    return res.redirect("/seoadmin/dashboard");
  }
  res.redirect("/seoadmin/login");
});

// ============================================
// END SEO ADMIN ROUTES
// ============================================

// ============================================
// CHAT ROUTES
// ============================================
const Conversation = require("./models/Conversation");
const ChatMessage = require("./models/Message");

// GET /chats – Inbox page showing all conversations
app.get("/chats", isLoggedIn, findUser, async (req, res) => {
  try {
    const userId = req.session.userId;

    const conversations = await Conversation.find({
      participants: userId,
    })
      .populate("participants", "username profilePic profileSlug gender")
      .sort({ lastMessageAt: -1 });

    // Attach last message and unread count to each conversation
    const conversationsWithMeta = await Promise.all(
      conversations.map(async (conv) => {
        const lastMessage = await ChatMessage.findOne({ conversationId: conv._id })
          .sort({ createdAt: -1 })
          .lean();

        const unreadCount = await ChatMessage.countDocuments({
          conversationId: conv._id,
          senderId: { $ne: userId },
          status: { $in: ["sent", "delivered"] },
        });

        const otherParticipant = conv.participants.find(
          (p) => p._id.toString() !== userId
        );

        return {
          _id: conv._id,
          otherUser: otherParticipant,
          lastMessage,
          unreadCount,
          lastMessageAt: conv.lastMessageAt,
        };
      })
    );

    // Find accepted requests where no conversation exists yet
    const acceptedRequests = await Request.find({
      $or: [{ from: userId }, { to: userId }],
      status: "accepted",
    })
      .populate("from", "username profilePic profileSlug gender")
      .populate("to", "username profilePic profileSlug gender");

    // Filter out requests that already have conversations
    const existingConversationUserIds = new Set(
      conversationsWithMeta.map((c) => c.otherUser._id.toString())
    );

    const potentialChats = acceptedRequests
      .map((req) => {
        const otherUser =
          req.from._id.toString() === userId ? req.to : req.from;
        return {
          otherUser,
          requestId: req._id,
        };
      })
      .filter((chat) => !existingConversationUserIds.has(chat.otherUser._id.toString()));

    res.render("chat/inbox", {
      conversations: conversationsWithMeta,
      potentialChats,
      user: req.session.user,
      isAdmin: req.session.isAdmin,
    });
  } catch (err) {
    console.error("Chat inbox error:", err);
    res.status(500).render("404", {
      title: "Error",
      url: req.originalUrl,
    });
  }
});

// GET /chats/:conversationId – Chat room page
app.get("/chats/:conversationId", isLoggedIn, findUser, async (req, res) => {
  try {
    const userId = req.session.userId;
    const { conversationId } = req.params;

    const conversation = await Conversation.findById(conversationId)
      .populate("participants", "username profilePic profileSlug gender name city country");

    if (!conversation) {
      return res.status(404).render("404", {
        title: "Chat Not Found",
        url: req.originalUrl,
      });
    }

    // Verify user is a participant
    const isParticipant = conversation.participants.some(
      (p) => p._id.toString() === userId
    );
    if (!isParticipant) {
      return res.status(403).render("404", {
        title: "Access Denied",
        url: req.originalUrl,
      });
    }

    const otherUser = conversation.participants.find(
      (p) => p._id.toString() !== userId
    );

    res.render("chat/room", {
      conversation,
      otherUser,
      user: req.session.user,
      currentUserId: userId,
      isAdmin: req.session.isAdmin,
    });
  } catch (err) {
    console.error("Chat room error:", err);
    res.status(500).render("404", {
      title: "Error",
      url: req.originalUrl,
    });
  }
});

// GET /api/chat/unread/count – Get total unread message count for header badge
app.get("/api/chat/unread/count", isLoggedIn, async (req, res) => {
  try {
    const userId = req.session.userId;

    // Find all conversations the user is in
    const conversations = await Conversation.find({ participants: userId });
    const conversationIds = conversations.map((c) => c._id);

    const unreadCount = await ChatMessage.countDocuments({
      conversationId: { $in: conversationIds },
      senderId: { $ne: userId },
      status: { $in: ["sent", "delivered"] },
    });

    res.json({ success: true, unreadCount });
  } catch (err) {
    console.error("Unread count error:", err);
    res.json({ success: true, unreadCount: 0 });
  }
});

// GET /api/chat/:conversationId – Fetch chat history (API)
app.get("/api/chat/:conversationId", isLoggedIn, async (req, res) => {
  try {
    const userId = req.session.userId;
    const { conversationId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    // Verify user is a participant
    const isParticipant = conversation.participants.some(
      (p) => p.toString() === userId
    );
    if (!isParticipant) {
      return res.status(403).json({ error: "Access denied" });
    }

    const totalMessages = await ChatMessage.countDocuments({ conversationId });
    const messages = await ChatMessage.find({ conversationId })
      .populate("senderId", "username profilePic profileSlug")
      .sort({ createdAt: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    res.json({
      success: true,
      messages,
      pagination: {
        page,
        limit,
        total: totalMessages,
        pages: Math.ceil(totalMessages / limit),
      },
    });
  } catch (err) {
    console.error("Chat history error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/chat/start/:profileId – Start or get existing conversation
app.post("/api/chat/start/:profileId", isLoggedIn, findUser, async (req, res) => {
  try {
    const currentUserId = req.session.userId;
    const targetUserId = req.params.profileId;

    if (currentUserId === targetUserId) {
      return res.status(400).json({ error: "Cannot chat with yourself" });
    }

    // Check for accepted connection (either direction)
    const acceptedRequest = await Request.findOne({
      $or: [
        { from: currentUserId, to: targetUserId, status: "accepted" },
        { from: targetUserId, to: currentUserId, status: "accepted" },
      ],
    });

    if (!acceptedRequest) {
      return res.status(403).json({
        error: "You can only chat with accepted connections",
      });
    }

    // Find or create conversation
    const conversation = await Conversation.findOrCreate(currentUserId, targetUserId);

    res.json({
      success: true,
      conversationId: conversation._id,
      redirectUrl: `/chats/${conversation._id}`,
    });
  } catch (err) {
    console.error("Start chat error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ============================================
// END CHAT ROUTES
// ============================================

// ============================================
// PUBLIC CATEGORY PAGES — catch-all /:categorySlug/:pageSlug
// MUST be registered LAST before the 404 handler
// ============================================
app.get("/:categorySlug/:pageSlug", async (req, res, next) => {
  try {
    const { categorySlug, pageSlug } = req.params;
    // Skip internal route prefixes that should never match this handler
    const reserved = ["admin", "api", "blog", "profiles", "islamic-faqs", "chats", "seoadmin", "auth", "account", "newsletter"];
    if (reserved.includes(categorySlug)) return next();
    const page = await CategoryPage.findOne({ categorySlug, pageSlug, isPublished: true });
    if (!page) return next();
    const faqs = page.faqCategories && page.faqCategories.length > 0
      ? await IslamicFAQ.find({ isPublished: true, category: { $in: page.faqCategories } })
          .sort({ publishedAt: -1 })
          .select("question slug excerpt category scholar")
      : [];
    res.render("category-page", { page, faqs, user: req.session.user || null });
  } catch (error) {
    console.error("Category page render error:", error);
    next();
  }
});

app.use((req, res) => {
  res.status(404).render("404", {
    title: "Page Not Found - shadiAmour",
    url: req.originalUrl,
  });
});
// **NEW**: Graceful shutdown handler
process.on("SIGTERM", async () => {
  console.log("🛑 SIGTERM received. Closing queue connections...");
  await QueueService.close();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("🛑 SIGINT received. Closing queue connections...");
  await QueueService.close();
  process.exit(0);
});
// Create HTTP server and attach Socket.io
const server = http.createServer(app);
const { initializeSocket } = require("./services/socketService");
const io = initializeSocket(server, sessionMiddleware);

server.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
  console.log("💬 Socket.io chat ready");
});
