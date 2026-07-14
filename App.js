require("dotenv").config(); // MUST be first!
const { muslimMaleNames, muslimFemaleNames } = require("./config/seoData");
const Blog = require("./models/Blog");
const IslamicFAQ = require("./models/IslamicFAQ");
const FaqCategory = require("./models/FaqCategory");
const CategoryPage = require("./models/CategoryPage");
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
const Newsletter = require("./models/Newsletter");
const { countryOptions, countryPlaceholders } = require("./config/countries");
const { detectCountry, buildGeoFilter, getFilterUIConfig } = require("./config/geoFilter");
const path = require("path");
const Request = require("./models/Request");
const Notification = require("./models/Notification");
const NotificationService = require("./services/notificationService");
const QueueService = require("./services/queueService");
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
    pageTitle: "Islamic Marriage Explained — The Nikah Journey Step by Step | D'amour Muslim",
    h1: "Islamic Marriage — Understanding the Nikah Journey",
    heroSubtitle: "From sincere intention to istikhara to the wali's involvement — walk through the Islamic roadmap for finding a spouse, and see how D'amour Muslim supports every stage of it.",
    metaDescription: "A practical guide to Islamic marriage: Quranic foundations, the Prophet's guidance on choosing a spouse, the wali's role, and how to search for a halal partner in the UK. Free to join.",
    keywords: "islamic marriage guide, nikah process, muslim marriage islam, halal marriage uk, wali marriage islam, islamic spouse search, muslim marriage guidance",
    canonicalPath: "/muslim-marriage",
    ctaHeading: "Take the First Step Toward Nikah",
    ctaSubtext: "Join the UK Muslims who have found their spouse through D'amour Muslim — a platform built on halal principles from day one.",
    relatedLinks: [
      { url: "/muslim-matrimony-london", label: "Muslim Singles in London" },
      { url: "/muslim-matrimony-birmingham", label: "Muslim Singles in Birmingham" },
      { url: "/muslim-matrimony-manchester", label: "Muslim Singles in Manchester" },
      { url: "/halal-marriage", label: "What Makes a Platform Halal" },
      { url: "/muslim-matchmaking", label: "How Our Matchmaking Works" },
      { url: "/blog/benefits-of-halal-matchmaking-services-uk-muslim-marriage-rishta-guide", label: "Why Halal Matchmaking Works" }
    ],
    pageFaqSchema: [
      { q: "What does Islam actually say about marriage?", a: "Nikah is strongly encouraged in Islam and is often described as completing half of a believer's faith. It is a sacred bond meant to establish a household rooted in Islamic values, offering both spouses calm, closeness, and compassion, as reflected in the Quran's description of spouses as a source of tranquillity for one another." },
      { q: "Will using a marriage website compromise my deen?", a: "Not on D'amour Muslim. The platform exists exclusively for Muslims with genuine marriage intentions. There is no dating culture, no encouragement of unsupervised private chatting, and every member joins knowing the purpose is Nikah, not casual connection." },
      { q: "Do I need my wali to be involved if I use D'amour Muslim?", a: "We actively encourage wali participation, consistent with Islamic guidance. The platform is structured to make family involvement easy, not to sidestep it." },
      { q: "How is this different from a regular dating app?", a: "D'amour Muslim exists solely for marriage. Every profile is checked by a real moderator before it appears, there is no swipe-based browsing culture, and the whole experience is oriented around Nikah and Islamic conduct." },
      { q: "Does it cost anything to search for a spouse here?", a: "No. Creating a profile, browsing verified members, and expressing interest are all free. Some optional extras exist, but nothing essential sits behind a paywall." }
    ],
    pageFaqs: [
      { q: "What does Islam actually say about marriage?", a: "Nikah is strongly encouraged in Islam and is often described as completing half of a believer's faith. It is a sacred bond meant to establish a household rooted in Islamic values, offering both spouses calm, closeness, and compassion, as reflected in the Quran's description of spouses as a source of tranquillity for one another." },
      { q: "Will using a marriage website compromise my deen?", a: "Not on D'amour Muslim. The platform exists exclusively for Muslims with genuine marriage intentions. There is no dating culture, no encouragement of unsupervised private chatting, and every member joins knowing the purpose is Nikah, not casual connection." },
      { q: "Do I need my wali to be involved if I use D'amour Muslim?", a: "We actively encourage wali participation, consistent with Islamic guidance. The platform is structured to make family involvement easy, not to sidestep it." },
      { q: "How is this different from a regular dating app?", a: "D'amour Muslim exists solely for marriage. Every profile is checked by a real moderator before it appears, there is no swipe-based browsing culture, and the whole experience is oriented around Nikah and Islamic conduct." },
      { q: "Does it cost anything to search for a spouse here?", a: "No. Creating a profile, browsing verified members, and expressing interest are all free. Some optional extras exist, but nothing essential sits behind a paywall." }
    ],
    bodyContent: `
      <div class="prose max-w-none">
        <p class="text-lg text-gray-700 mb-6 leading-relaxed">Marriage in Islam is never treated as a mere legal formality. Nikah is regarded as one of the most spiritually weighty steps a Muslim will take, described in the tradition as completing half of one's faith. Approaching this search with the right framework — patience, sincerity, and trust in Allah — changes the entire experience from a stressful hunt into an act of worship.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">The Quranic Basis for Marriage</h2>
        <p class="text-gray-700 mb-4 leading-relaxed">The Quran frames the marital bond in strikingly gentle terms — describing spouses as a means of finding rest and comfort in one another, with love and mercy placed between them by design.</p>
        <blockquote class="border-l-4 border-primary pl-6 py-3 bg-primary/5 rounded-r-xl mb-6">
          <p class="text-gray-700 italic">The Quran describes spouses as signs of Allah's wisdom — created so that partners find peace in one another, with affection and mercy placed between them for those who reflect. (see Surah Ar-Rum, 30:21)</p>
        </blockquote>
        <p class="text-gray-700 mb-6">Tranquillity, affection, and mercy do not appear automatically the moment a nikah contract is signed — they are cultivated deliberately, day after day, by both spouses.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">The Islamic Roadmap for Finding a Spouse</h2>
        <p class="text-gray-700 mb-4">Islamic scholarship gives Muslims a clear, dignified sequence to follow. Understanding it helps you approach any platform — including ours — the right way.</p>

        <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-6">1. Set Your Intention</h3>
        <p class="text-gray-700 mb-4">Everything begins with niyyah. Searching for a spouse in order to follow the Sunnah and build a household on taqwa turns even the hard parts of the process — rejection, waiting, uncertainty — into worship.</p>

        <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-6">2. Make Istikhara</h3>
        <p class="text-gray-700 mb-4">The prayer of guidance is one of the most underused tools available to a Muslim in this process. It is a humble admission that our own judgement is limited, and that Allah alone knows what is best. Scholars across the madhabs recommend it before committing to any serious proposal.</p>

        <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-6">3. Bring In the Wali</h3>
        <p class="text-gray-700 mb-4">For women, a wali's involvement is a core part of the process — a protective, supportive role rather than a bureaucratic hurdle. D'amour Muslim is built to make this easy, with support for family-managed accounts.</p>

        <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-6">4. Meet with Purpose</h3>
        <p class="text-gray-700 mb-4">Islam allows prospective spouses to meet and talk with the specific goal of assessing compatibility — a far cry from dating. These conversations should be modest, supervised where appropriate, and purposeful. Long unsupervised chats without family knowledge fall outside this framework.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">What Matters Most in a Spouse</h2>
        <blockquote class="border-l-4 border-primary pl-6 py-3 bg-primary/5 rounded-r-xl mb-6">
          <p class="text-gray-700 italic">A well-known hadith teaches that people are often drawn to a spouse for wealth, lineage, or looks — but advises choosing the one grounded in faith above all else.</p>
        </blockquote>
        <p class="text-gray-700 mb-4">Wealth, family name, and appearance all carry weight, but deen is presented as the deciding factor — a partner anchored in genuine faith supports a household built to last, spiritually and practically.</p>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Consciousness of Allah:</strong> Do they hold themselves accountable even when no one is watching?</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Character:</strong> Are they patient, honest, and dependable in daily life?</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Shared direction:</strong> Do your long-term goals and approach to raising a family align?</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Honest communication:</strong> Can you disagree respectfully and still be heard?</span></li>
        </ul>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Why the Search Is Harder for UK Muslims</h2>
        <p class="text-gray-700 mb-4 leading-relaxed">British Muslims face a distinct combination of obstacles that earlier generations, or Muslims living in Muslim-majority countries, rarely encountered in the same way:</p>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Thinly spread Muslim communities in smaller towns, leaving few local prospects</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Friction between British-raised children and parents who grew up in Pakistan, Bangladesh, or elsewhere</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Social pull toward mainstream dating apps that sit uneasily with Islamic values</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Narrow pools of religiously matched partners within a specific ethnic circle</span></li>
        </ul>
        <p class="text-gray-700 mb-6">D'amour Muslim was built specifically to answer these pressures — a halal-first platform British and Pakistani Muslims can rely on without compromising their values.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">How D'amour Muslim Supports Every Step</h2>
        <div class="grid md:grid-cols-2 gap-4 mb-8">
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="font-semibold text-gray-800 mb-2">Built Only for Marriage</h3>
            <p class="text-gray-600 text-sm">No casual chat culture. Every account is created with a clear intention: Nikah.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="font-semibold text-gray-800 mb-2">Family-Ready</h3>
            <p class="text-gray-600 text-sm">Parents and guardians can support or manage a profile from the very first step.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="font-semibold text-gray-800 mb-2">Human-Checked Profiles</h3>
            <p class="text-gray-600 text-sm">A moderator reviews every submission before it becomes visible — no bots, no fakes.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="font-semibold text-gray-800 mb-2">UK GDPR Compliant</h3>
            <p class="text-gray-600 text-sm">Your data stays protected under UK law and is never sold to outside parties.</p>
          </div>
        </div>

        <div class="bg-primary/5 rounded-2xl p-6 border border-primary/10 mt-8">
          <p class="text-gray-700 font-medium">Search by city: <a href="/muslim-matrimony-london" class="text-primary hover:underline">London</a> &bull; <a href="/muslim-matrimony-birmingham" class="text-primary hover:underline">Birmingham</a> &bull; <a href="/muslim-matrimony-manchester" class="text-primary hover:underline">Manchester</a> &bull; <a href="/muslim-matrimony-bradford" class="text-primary hover:underline">Bradford</a> &bull; <a href="/muslim-matrimony-leicester" class="text-primary hover:underline">Leicester</a> &bull; <a href="/muslim-matrimony-leeds" class="text-primary hover:underline">Leeds</a>. See also our <a href="/halal-marriage" class="text-primary hover:underline">Halal Marriage Platform</a>.</p>
        </div>
      </div>
    `
  },
  {
    path: "/muslim-matrimonial",
    pageTitle: "Inside D'amour Muslim — How Our Matrimonial Platform Works | D'amour Muslim",
    h1: "How D'amour Muslim Works — A Look Under the Hood",
    heroSubtitle: "From profile verification to privacy controls to the messaging system — here is exactly how D'amour Muslim was built for serious Muslims seeking marriage.",
    metaDescription: "A full walkthrough of D'amour Muslim's features: manual profile checks, privacy settings, smart filters, and halal-first messaging tools. Free to register.",
    keywords: "muslim matrimonial platform, muslim matrimonial uk, islamic marriage platform features, halal matrimonial site, muslim matrimony uk, verified muslim matrimonial",
    canonicalPath: "/muslim-matrimonial",
    ctaHeading: "Build Your Verified Profile Today",
    ctaSubtext: "Registration is free and every profile is reviewed before it goes live.",
    relatedLinks: [
      { url: "/muslim-marriage", label: "The Islamic Basis for Marriage" },
      { url: "/verified-muslim-profiles", label: "How Verification Works" },
      { url: "/trusted-muslim-matchmaking", label: "Our Safety Approach" },
      { url: "/find-muslim-spouse", label: "Search & Filter Tips" },
      { url: "/blog/benefits-of-halal-matchmaking-services-uk-muslim-marriage-rishta-guide", label: "The Case for Halal Matchmaking" }
    ],
    pageFaqSchema: [
      { q: "Is every profile actually checked by a person?", a: "Yes. A member of our moderation team looks at each submission before it becomes visible, checking for completeness, authenticity, and appropriate content. No profile goes live on autopilot." },
      { q: "How private is my information?", a: "Your phone number and exact address are never shown publicly, and you decide what appears on your profile page. D'amour Muslim follows UK GDPR rules and never sells data to advertisers." },
      { q: "Can my parents run my profile for me?", a: "Yes — this is actively supported. A parent or wali can register on your behalf, manage the profile, and handle incoming interest requests." },
      { q: "What can I search by?", a: "Gender, age range, city or region, country, height, and more. Every profile in your results has already passed moderation, so nothing you see is unverified." },
      { q: "How does messaging work?", a: "Once two members have both expressed interest in one another, secure messaging opens up. Nothing is sent before that mutual step happens." }
    ],
    pageFaqs: [
      { q: "Is every profile actually checked by a person?", a: "Yes. A member of our moderation team looks at each submission before it becomes visible, checking for completeness, authenticity, and appropriate content. No profile goes live on autopilot." },
      { q: "How private is my information?", a: "Your phone number and exact address are never shown publicly, and you decide what appears on your profile page. D'amour Muslim follows UK GDPR rules and never sells data to advertisers." },
      { q: "Can my parents run my profile for me?", a: "Yes — this is actively supported. A parent or wali can register on your behalf, manage the profile, and handle incoming interest requests." },
      { q: "What can I search by?", a: "Gender, age range, city or region, country, height, and more. Every profile in your results has already passed moderation, so nothing you see is unverified." },
      { q: "How does messaging work?", a: "Once two members have both expressed interest in one another, secure messaging opens up. Nothing is sent before that mutual step happens." }
    ],
    bodyContent: `
      <div class="prose max-w-none">
        <p class="text-lg text-gray-700 mb-6 leading-relaxed">D'amour Muslim was not adapted from a generic dating template — it was engineered around the specific expectations, privacy needs, and Islamic sensibilities of Muslims searching for a spouse. This page walks through exactly how the platform functions, from your first click to your first conversation.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Building Your Profile the Right Way</h2>
        <p class="text-gray-700 mb-4">Creating a profile is a guided process, structured around the information that genuinely matters in a marriage search:</p>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Basics:</strong> Age, height, ethnicity, nationality, and marital background</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Religious practice:</strong> Sect, prayer habits, and level of observance</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Career & education:</strong> Qualifications, profession, and ambitions</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Your story:</strong> A written section describing yourself and what you're seeking</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Preferences:</strong> What matters to you in a spouse</span></li>
        </ul>
        <p class="text-gray-700 mb-6">The more complete your profile, the more visible it becomes in search — and the easier it is for a genuine match to make an informed decision.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Every Profile Passes Through Moderation</h2>
        <p class="text-gray-700 mb-4">Nothing goes live untouched. Our team checks each submission for:</p>
        <div class="grid md:grid-cols-2 gap-4 mb-8">
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="font-semibold text-gray-800 mb-2">Authenticity</h3>
            <p class="text-gray-600 text-sm">Flagging stock photos, inconsistent details, and anything that doesn't add up.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="font-semibold text-gray-800 mb-2">Appropriateness</h3>
            <p class="text-gray-600 text-sm">All written content is reviewed; misleading or inappropriate submissions are rejected.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="font-semibold text-gray-800 mb-2">Genuine Intent</h3>
            <p class="text-gray-600 text-sm">Profiles showing casual, non-marriage intent are removed from the platform.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="font-semibold text-gray-800 mb-2">Ongoing Checks</h3>
            <p class="text-gray-600 text-sm">Live profiles can still be reported, and flagged content is reviewed within 24 hours.</p>
          </div>
        </div>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">You Control What's Visible</h2>
        <p class="text-gray-700 mb-4">Privacy is not an afterthought — it is a core value baked into the design:</p>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Your phone number stays off your public profile, always</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Only your city or region shows — never a precise location</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">You choose who can see your full details</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">All data handling follows UK GDPR — nothing is sold on</span></li>
        </ul>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Families Can Take the Wheel</h2>
        <p class="text-gray-700 mb-4">One of the platform's standout features is genuine support for family-run accounts. A parent, sibling, or wali can:</p>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Set up and finish a profile for their son or daughter</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Handle incoming interest requests</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Speak directly with other families through the platform</span></li>
        </ul>
        <p class="text-gray-700 mb-6">This means D'amour Muslim works just as well for a whole family navigating a rishta together as it does for an individual acting alone.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Structured, Respectful Communication</h2>
        <p class="text-gray-700 mb-4">Unlike a dating app where anyone can message anyone, contact on D'amour Muslim follows a clear sequence:</p>
        <div class="grid md:grid-cols-3 gap-4 mb-8">
          <div class="bg-gray-50 rounded-xl p-4 text-center border border-gray-100">
            <span class="text-primary font-bold text-2xl block mb-2">1</span>
            <p class="font-semibold text-gray-800 text-sm mb-1">Express Interest</p>
            <p class="text-gray-600 text-xs">Signal interest in a profile with respect</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-4 text-center border border-gray-100">
            <span class="text-primary font-bold text-2xl block mb-2">2</span>
            <p class="font-semibold text-gray-800 text-sm mb-1">Both Say Yes</p>
            <p class="text-gray-600 text-xs">Contact opens only once both parties agree</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-4 text-center border border-gray-100">
            <span class="text-primary font-bold text-2xl block mb-2">3</span>
            <p class="font-semibold text-gray-800 text-sm mb-1">Message Securely</p>
            <p class="text-gray-600 text-xs">Talk through the platform with full privacy</p>
          </div>
        </div>

        <div class="bg-primary/5 rounded-2xl p-6 border border-primary/10 mt-8">
          <p class="text-gray-700 font-medium">New here? Start with <a href="/muslim-marriage" class="text-primary hover:underline">the Islamic basis for marriage</a>. Ready to search? See our <a href="/find-muslim-spouse" class="text-primary hover:underline">Search &amp; Filter Guide</a>, or learn <a href="/verified-muslim-profiles" class="text-primary hover:underline">how verification works</a>.</p>
        </div>
      </div>
    `
  },
  {
    path: "/muslim-matchmaking",
    pageTitle: "Halal Muslim Matchmaking, Done Properly | D'amour Muslim",
    h1: "Muslim Matchmaking — Built on Compatibility, Not Chemistry Alone",
    heroSubtitle: "A structured process rooted in Islamic values, not endless swiping. Thousands of UK Muslims are finding compatible matches on D'amour Muslim.",
    metaDescription: "Muslim matchmaking in the UK — a structured, halal process weighing deen, lifestyle, and family background. Free to join. No casual browsing culture.",
    keywords: "muslim matchmaking, muslim matchmaking uk, halal matchmaking service, islamic matchmaking, muslim matchmaker online",
    canonicalPath: "/muslim-matchmaking",
    ctaHeading: "Begin Your Matchmaking Journey",
    ctaSubtext: "Registration is free — start finding compatible matches through a structured, Islamic process.",
    relatedLinks: [
      { url: "/muslim-marriage", label: "The Islamic Basis for Marriage" },
      { url: "/verified-muslim-profiles", label: "Verified Profiles" },
      { url: "/trusted-muslim-matchmaking", label: "Our Safety Approach" },
      { url: "/halal-marriage", label: "Halal Marriage Platform" },
      { url: "/find-muslim-spouse", label: "Find a Spouse" }
    ],
    pageFaqSchema: [
      { q: "How is matchmaking different from just scrolling through profiles?", a: "Scrolling is passive. Matchmaking on D'amour Muslim is deliberate — you set your non-negotiables (deen level, lifestyle, family background, location), and the platform surfaces genuinely compatible people rather than whoever happens to be popular." },
      { q: "Can my family take part in the process?", a: "Yes, fully. A parent or wali can register and run a profile for their son or daughter, browse matches, send interest, and speak with other families — exactly as the traditional process works, just online." },
      { q: "What compatibility factors can I search on?", a: "Religious practice level, lifestyle (diet, hijab status), ethnic and cultural background, location, age range, and views on children. You set the terms of compatibility yourself, starting with deen." },
      { q: "How long does matchmaking usually take?", a: "It varies — a lot depends on activity level and how specific your criteria are. Many members hear from someone within days of going live. A complete, honest profile speeds things up considerably." },
      { q: "Is using a matchmaking service actually halal?", a: "Yes. A structured, purpose-driven search for a spouse is entirely permitted in Islam. D'amour Muslim mirrors the traditional rishta process online: no open mixing, no chat before mutual interest, and family involvement encouraged throughout." }
    ],
    pageFaqs: [
      { q: "How is matchmaking different from just scrolling through profiles?", a: "Scrolling is passive. Matchmaking on D'amour Muslim is deliberate — you set your non-negotiables (deen level, lifestyle, family background, location), and the platform surfaces genuinely compatible people rather than whoever happens to be popular." },
      { q: "Can my family take part in the process?", a: "Yes, fully. A parent or wali can register and run a profile for their son or daughter, browse matches, send interest, and speak with other families — exactly as the traditional process works, just online." },
      { q: "What compatibility factors can I search on?", a: "Religious practice level, lifestyle (diet, hijab status), ethnic and cultural background, location, age range, and views on children. You set the terms of compatibility yourself, starting with deen." },
      { q: "How long does matchmaking usually take?", a: "It varies — a lot depends on activity level and how specific your criteria are. Many members hear from someone within days of going live. A complete, honest profile speeds things up considerably." },
      { q: "Is using a matchmaking service actually halal?", a: "Yes. A structured, purpose-driven search for a spouse is entirely permitted in Islam. D'amour Muslim mirrors the traditional rishta process online: no open mixing, no chat before mutual interest, and family involvement encouraged throughout." }
    ],
    bodyContent: `
      <div class="prose max-w-none">
        <p class="text-lg text-gray-700 mb-6 leading-relaxed">Muslim matchmaking isn't the same game as a Western dating app. Islam treats the search for a spouse as intentional and structured — guided by clear principles, not algorithms designed to keep you swiping. D'amour Muslim was built on that understanding: finding a compatible Muslim partner needs a framework, not just a filter bar.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">What Sets Muslim Matchmaking Apart</h2>
        <p class="text-gray-700 mb-4 leading-relaxed">Mainstream dating platforms are designed to maximise engagement — more swipes, more subscriptions, more time in-app. Muslim matchmaking has the opposite goal: get you to a serious, halal connection that leads to Nikah as efficiently as possible. That single shift in objective changes everything about how the process should work.</p>
        <p class="text-gray-700 mb-4 leading-relaxed">Compatibility, in this context, is assessed holistically — religious practice, character, lifestyle, family background, and long-term intentions all carry weight. There's no ambiguous "let's see where this goes" phase. Both sides know the destination from the start, which protects everyone involved and reflects the timeless guidance to prioritise deen above all else when choosing a spouse.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">How the Process Works on D'amour Muslim</h2>
        <div class="grid md:grid-cols-2 gap-4 mb-8">
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <span class="text-primary font-bold text-xl block mb-2">1. Build Your Profile</span>
            <p class="text-gray-700 text-sm leading-relaxed">Fill it out honestly — deen level, lifestyle, family background, and your non-negotiables. A thorough profile draws in compatible people and filters out mismatches early.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <span class="text-primary font-bold text-xl block mb-2">2. Set Your Criteria</span>
            <p class="text-gray-700 text-sm leading-relaxed">Use search filters for religious practice, ethnicity, location, age, and lifestyle. This is structured matchmaking, not casual scrolling.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <span class="text-primary font-bold text-xl block mb-2">3. Express Interest First</span>
            <p class="text-gray-700 text-sm leading-relaxed">Nothing opens until both sides accept — no unsolicited messages, no free chat, full alignment with Islamic etiquette.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <span class="text-primary font-bold text-xl block mb-2">4. Involve the Family</span>
            <p class="text-gray-700 text-sm leading-relaxed">Once mutual interest is confirmed, bring in your wali or family. Marriage in Islam is a family matter, and the platform is built to reflect that.</p>
          </div>
        </div>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Compatibility Means More Than Chemistry</h2>
        <p class="text-gray-700 mb-4 leading-relaxed">Compatibility for Muslims goes well beyond attraction or shared hobbies. These are the dimensions that shape whether a marriage will hold up long-term:</p>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Deen &amp; practice:</strong> Prayer, fasting, halal habits — mismatched practice levels are a leading cause of tension after marriage.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Lifestyle:</strong> Hijab status, food, entertainment views, career ambitions, and expectations at home.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Family expectations:</strong> Will you live with in-laws? How involved will both families stay after marriage?</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Cultural fit:</strong> Shared language and community reduce friction — especially for British Muslims balancing two cultures.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Long-term goals:</strong> Children, finances, and where you'll live — the real pillars of a shared future.</span></li>
        </ul>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Why Families Trust the Platform</h2>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Every profile is manually reviewed — no bots, no fake accounts</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Family accounts supported end to end</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">No unsolicited messages — ever</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">UK GDPR compliant, data never sold</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Free to join and browse</span></li>
        </ul>

        <blockquote class="border-l-4 border-primary pl-4 italic text-gray-600 my-6">Tradition holds that when a suitable proposal comes — someone whose faith and character you trust — accepting it protects against far greater harm down the line.</blockquote>

        <p class="text-gray-700 mb-6 leading-relaxed">Whether you're just starting out or have been searching for a while, D'amour Muslim gives you the structure to make it count. Register free, be honest in your profile, and let a purpose-built halal process do what endless scrolling never could.</p>

        <div class="bg-primary/5 rounded-2xl p-6 border border-primary/10 mt-8">
          <p class="text-gray-700 font-medium">Also see: <a href="/muslim-marriage" class="text-primary hover:underline">The Islamic Basis for Marriage</a> &bull; <a href="/verified-muslim-profiles" class="text-primary hover:underline">Verified Profiles</a> &bull; <a href="/trusted-muslim-matchmaking" class="text-primary hover:underline">Our Safety Approach</a></p>
        </div>
      </div>
    `
  },
  {
    path: "/halal-marriage",
    pageTitle: "A Genuinely Halal Marriage Platform | D'amour Muslim",
    h1: "Halal Marriage — Built Around Islamic Etiquette, Not Just Labelled With It",
    heroSubtitle: "The destination isn't the only thing that matters — the journey needs to be halal too. D'amour Muslim was designed from scratch with that principle in mind.",
    metaDescription: "D'amour Muslim is a genuinely halal marriage platform — gated messaging, profile privacy, family involvement, and real moderation. Free to join.",
    keywords: "halal marriage, halal marriage platform, halal marriage site uk, halal matrimony, islamically compliant marriage site",
    canonicalPath: "/halal-marriage",
    ctaHeading: "Join a Platform That Shares Your Values",
    ctaSubtext: "Free registration on a platform engineered around Islamic etiquette.",
    relatedLinks: [
      { url: "/muslim-marriage", label: "The Islamic Basis for Marriage" },
      { url: "/trusted-muslim-matchmaking", label: "Our Safety Approach" },
      { url: "/verified-muslim-profiles", label: "Verified Profiles" },
      { url: "/muslim-matchmaking", label: "Muslim Matchmaking" },
      { url: "/find-muslim-spouse", label: "Find a Spouse" }
    ],
    pageFaqSchema: [
      { q: "Is it okay in Islam to use an online matrimonial site?", a: "Generally, yes — scholars accept it when the interaction follows proper etiquette: clear marriage intent, no seclusion, guardian involvement, and modest communication. D'amour Muslim is designed to meet each of these conditions." },
      { q: "How do you stop free mixing between members?", a: "By design. You cannot message anyone who hasn't accepted your interest first. Photos are visible only to approved members, and there is no open chat room or social feed to encourage casual mixed-gender interaction." },
      { q: "Can I bring in my wali before I talk to anyone?", a: "Yes, and we encourage it. A parent or wali can register on your behalf, manage the profile, and handle all early communication. You can also share a profile with a family member before responding to interest." },
      { q: "Is there any music, video, or casual chat feature on the platform?", a: "No. There's no background music, no reels, no social feed, and no open chat. Photos are moderated before going live, and every feature is checked against whether it could normalise casual interaction." },
      { q: "What happens if someone acts inappropriately?", a: "Any profile or message can be reported instantly. Our team reviews reports and removes violators; repeat offenders are permanently banned." }
    ],
    pageFaqs: [
      { q: "Is it okay in Islam to use an online matrimonial site?", a: "Generally, yes — scholars accept it when the interaction follows proper etiquette: clear marriage intent, no seclusion, guardian involvement, and modest communication. D'amour Muslim is designed to meet each of these conditions." },
      { q: "How do you stop free mixing between members?", a: "By design. You cannot message anyone who hasn't accepted your interest first. Photos are visible only to approved members, and there is no open chat room or social feed to encourage casual mixed-gender interaction." },
      { q: "Can I bring in my wali before I talk to anyone?", a: "Yes, and we encourage it. A parent or wali can register on your behalf, manage the profile, and handle all early communication. You can also share a profile with a family member before responding to interest." },
      { q: "Is there any music, video, or casual chat feature on the platform?", a: "No. There's no background music, no reels, no social feed, and no open chat. Photos are moderated before going live, and every feature is checked against whether it could normalise casual interaction." },
      { q: "What happens if someone acts inappropriately?", a: "Any profile or message can be reported instantly. Our team reviews reports and removes violators; repeat offenders are permanently banned." }
    ],
    bodyContent: `
      <div class="prose max-w-none">
        <p class="text-lg text-gray-700 mb-6 leading-relaxed">A halal marriage isn't just about a halal wedding day — it's about a halal path to get there. Plenty of Muslims accept that Nikah itself is halal, without ever questioning whether the process of finding a spouse actually honours Islamic principles. D'amour Muslim was built to answer that question head-on. Can a matrimonial platform genuinely be halal, in its design and not just its name?</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Built for Halal Interaction from the Ground Up</h2>
        <p class="text-gray-700 mb-4 leading-relaxed">Most matrimonial sites are dating apps with an Islamic coat of paint — open inboxes, casual browsing, social feeds that quietly encourage exactly the kind of interaction Islam cautions against between non-mahrams. D'amour Muslim took a different approach from the architecture up: how messaging works, who can see what, and even the language on the platform.</p>
        <p class="text-gray-700 mb-6 leading-relaxed">The rule is simple: <strong>no messaging without mutual consent, and no consent without a clear marriage intention.</strong> Every feature was built around that one principle.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Design Choices That Prevent Haram</h2>
        <div class="grid md:grid-cols-2 gap-4 mb-8">
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Gated Messaging</h3>
            <p class="text-gray-700 text-sm leading-relaxed">You can't message anyone who hasn't accepted your interest first. No open inboxes, no group chats, no unsolicited messages — communication is gated the way a formal rishta introduction would be.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Photo Privacy</h3>
            <p class="text-gray-700 text-sm leading-relaxed">Photos are only visible to logged-in, approved members — never to guests, the public, or search engines. This protects sisters especially from having images circulate without their intention.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Room for Family</h3>
            <p class="text-gray-700 text-sm leading-relaxed">Parents and walis can create and run a full profile — browsing matches, starting contact, and staying involved throughout, matching the traditional family-driven rishta approach.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Active Moderation</h3>
            <p class="text-gray-700 text-sm leading-relaxed">Every profile is manually checked before going live. Anything inappropriate can be reported instantly and is reviewed promptly by our team.</p>
          </div>
        </div>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">The Islamic Etiquette Baked Into the Platform</h2>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Marriage intent is required — this isn't a space for casual connections</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">No khalwa by design — all communication is purpose-driven and gated</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Wali involvement supported from registration through to communication</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Modest profile design — no social feed, reels, or provocative imagery</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">No music or distracting entertainment features</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Fully UK GDPR compliant — your data is treated with the same care your deen demands</span></li>
        </ul>

        <blockquote class="border-l-4 border-primary pl-4 italic text-gray-600 my-6">The Quran instructs believing women to guard their modesty in what they reveal — a principle this platform's privacy design was built to honour, not undermine.</blockquote>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Is It Really Halal?</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">Scholars who look closely at online matrimonial platforms draw a line between those replicating casual dating and those replicating a wali-supervised introduction. D'amour Muslim sits firmly in the second camp. You are searching for a spouse — with your family's involvement if you choose it — on a platform that enforces Islamic etiquette by design, not just as a stated policy.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Join a Platform Built for Your Values</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">Your deen shouldn't be a trade-off in your search for a spouse. Register free today and find your match the halal way — on a platform built with Islamic values, not just decorated with them.</p>

        <div class="bg-primary/5 rounded-2xl p-6 border border-primary/10 mt-8">
          <p class="text-gray-700 font-medium">Also see: <a href="/muslim-marriage" class="text-primary hover:underline">The Islamic Basis for Marriage</a> &bull; <a href="/trusted-muslim-matchmaking" class="text-primary hover:underline">Our Safety Approach</a> &bull; <a href="/verified-muslim-profiles" class="text-primary hover:underline">Verified Profiles</a></p>
        </div>
      </div>
    `
  },
  {
    path: "/muslim-rishta",
    pageTitle: "Muslim Rishta Online — Tradition Meets Modern Search | D'amour Muslim",
    h1: "Muslim Rishta — An Old Tradition, Now Online",
    heroSubtitle: "The rishta process, digitised without losing its soul. A family-friendly, halal platform for British Pakistanis, Bangladeshis, and Muslim families around the world.",
    metaDescription: "Muslim rishta online — D'amour Muslim brings the traditional rishta process to the UK and global diaspora. Full family involvement supported. Free to join.",
    keywords: "muslim rishta, muslim rishta online, rishta for marriage, rishta uk, rishta service online, rishta proposal",
    canonicalPath: "/muslim-rishta",
    ctaHeading: "Start Your Rishta Search",
    ctaSubtext: "Create a free profile and join the thousands of Muslims already using D'amour Muslim for rishta.",
    relatedLinks: [
      { url: "/online-rishta-pakistan", label: "Rishta Across Pakistan" },
      { url: "/british-pakistani-marriage", label: "British Pakistani Marriage" },
      { url: "/muslim-matchmaking", label: "Muslim Matchmaking" },
      { url: "/halal-marriage", label: "Halal Marriage Platform" },
      { url: "/rishta-lahore", label: "Rishta in Lahore" },
      { url: "/rishta-karachi", label: "Rishta in Karachi" }
    ],
    pageFaqSchema: [
      { q: "What exactly is a rishta?", a: "A rishta is a formal marriage enquiry rooted in South Asian Muslim culture — a family affair, not just a conversation between two individuals. It signals a structured, family-supervised search with clear marriage intent, distinct from anything casual." },
      { q: "Can my parents send rishta proposals for me?", a: "Yes. D'amour Muslim fully supports family-managed profiles — parents or a wali can register, build a profile, browse suitable matches, and start contact on your behalf, just like the traditional process." },
      { q: "Do you have profiles for overseas and British Pakistanis?", a: "Yes. There are members across the UK — London, Birmingham, Manchester, Bradford, Leicester, Leeds — as well as Pakistan (Lahore, Karachi, Islamabad, and beyond) and diaspora communities in the US, Canada, and Europe." },
      { q: "How is this different from asking the rishta aunty network?", a: "An aunty's network is capped by geography and personal contacts. D'amour Muslim gives you direct access to thousands of verified profiles — you browse, you decide who to approach, and there's no middleman adding their own spin." },
      { q: "Is it acceptable for South Asian families to look for a rishta online?", a: "Increasingly so. The stigma has faded significantly over the past decade, especially among British-raised Pakistanis. Many families now treat platforms like D'amour Muslim as a first step — private browsing before extended family gets involved." }
    ],
    pageFaqs: [
      { q: "What exactly is a rishta?", a: "A rishta is a formal marriage enquiry rooted in South Asian Muslim culture — a family affair, not just a conversation between two individuals. It signals a structured, family-supervised search with clear marriage intent, distinct from anything casual." },
      { q: "Can my parents send rishta proposals for me?", a: "Yes. D'amour Muslim fully supports family-managed profiles — parents or a wali can register, build a profile, browse suitable matches, and start contact on your behalf, just like the traditional process." },
      { q: "Do you have profiles for overseas and British Pakistanis?", a: "Yes. There are members across the UK — London, Birmingham, Manchester, Bradford, Leicester, Leeds — as well as Pakistan (Lahore, Karachi, Islamabad, and beyond) and diaspora communities in the US, Canada, and Europe." },
      { q: "How is this different from asking the rishta aunty network?", a: "An aunty's network is capped by geography and personal contacts. D'amour Muslim gives you direct access to thousands of verified profiles — you browse, you decide who to approach, and there's no middleman adding their own spin." },
      { q: "Is it acceptable for South Asian families to look for a rishta online?", a: "Increasingly so. The stigma has faded significantly over the past decade, especially among British-raised Pakistanis. Many families now treat platforms like D'amour Muslim as a first step — private browsing before extended family gets involved." }
    ],
    bodyContent: `
      <div class="prose max-w-none">
        <p class="text-lg text-gray-700 mb-6 leading-relaxed">A rishta is bigger than a proposal — it's a family institution. In South Asian Muslim culture, it means parents, elders, and community wisdom all playing a part in a decision as important as marriage. It reflects an Islamic tradition of approaching marriage with seriousness and collective judgement. For millions of British Pakistanis, Bangladeshis, and diaspora Muslims, that's simply how marriage is done properly — and D'amour Muslim was built to bring that tradition online without hollowing it out.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Taking Rishta Online, Without Losing What Made It Work</h2>
        <p class="text-gray-700 mb-4 leading-relaxed">The old system ran on networks — aunties who knew aunties, extended family ties, community gatherings. D'amour Muslim removes the bottlenecks — limited reach, dependence on middlemen, geographic limits — while keeping what actually mattered: seriousness, family involvement, and respect throughout.</p>
        <p class="text-gray-700 mb-6 leading-relaxed">On the platform, you or your family can browse thousands of verified profiles, filter by city and background, and send a formal expression of interest — all within an environment built for halal interaction. No casual chat, no open messaging, just a structured path toward Nikah.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Where the Old Approach Falls Short</h2>
        <div class="grid md:grid-cols-2 gap-4 mb-8">
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">A Small Pool</h3>
            <p class="text-gray-700 text-sm leading-relaxed">A family's rishta network only stretches as far as its social circle — in diaspora communities, that can mean a handful of eligible names for a decision this significant.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Biradari Pressure</h3>
            <p class="text-gray-700 text-sm leading-relaxed">Unspoken expectations around caste and family standing often shadow traditional rishta searching. Online platforms let individuals and families set their own terms.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100 md:col-span-2">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Slow, Informal Channels</h3>
            <p class="text-gray-700 text-sm leading-relaxed">Word of mouth and family WhatsApp groups move slowly and often leak the wrong information too early. D'amour Muslim gives you speed and privacy in equal measure.</p>
          </div>
        </div>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">A Modern Take on the Rishta Approach</h2>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Family accounts:</strong> Parents or a wali can run the whole profile — the traditional approach, brought online.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Formal by design:</strong> No open chat — interest has to be accepted before any conversation starts.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>No middleman:</strong> You deal directly with the other family, without a matchmaker's own spin.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>A wide pool:</strong> UK-wide, Pakistan-wide, and diaspora profiles that no single network could match.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Verified only:</strong> Every profile is checked — no fake proposals, no wasted time.</span></li>
        </ul>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Profiles From Every Background</h2>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700"><strong>UK-based:</strong> British Pakistanis, Bangladeshis, Indians, and Muslims of every background across England, Scotland, and Wales</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700"><strong>Pakistan-based:</strong> Lahore, Karachi, Islamabad, Rawalpindi, Faisalabad, and beyond — see our <a href="/online-rishta-pakistan" class="text-primary hover:underline">Pakistan rishta hub</a></span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700"><strong>Wider diaspora:</strong> Muslims across the US, Canada, Europe, and the Gulf seeking UK or Pakistan-based matches</span></li>
        </ul>

        <blockquote class="border-l-4 border-primary pl-4 italic text-gray-600 my-6">Prophetic tradition describes marriage between two people who genuinely care for one another as one of life's finest blessings.</blockquote>

        <p class="text-gray-700 mb-6 leading-relaxed">Rishta is one of the more beautiful parts of Islamic marriage culture — centred on family, honour, and clear intention. D'amour Muslim carries that tradition into the digital age without stripping out what made it meaningful. Register free and start your search the right way.</p>

        <div class="bg-primary/5 rounded-2xl p-6 border border-primary/10 mt-8">
          <p class="text-gray-700 font-medium">Also see: <a href="/online-rishta-pakistan" class="text-primary hover:underline">Rishta Across Pakistan</a> &bull; <a href="/british-pakistani-marriage" class="text-primary hover:underline">British Pakistani Marriage</a> &bull; <a href="/muslim-matchmaking" class="text-primary hover:underline">Muslim Matchmaking</a></p>
        </div>
      </div>
    `
  },
  {
    path: "/find-muslim-spouse",
    pageTitle: "How to Find a Muslim Spouse — A Practical Search Guide | D'amour Muslim",
    h1: "Finding a Muslim Spouse on D'amour Muslim — A Practical Walkthrough",
    heroSubtitle: "How to actually use D'amour Muslim's filters to surface your most compatible matches — by city, age, religious values, and more.",
    metaDescription: "How to find a Muslim spouse using D'amour Muslim's search filters: city, age, religion, education, and more. A practical guide for serious UK marriage seekers.",
    keywords: "find muslim spouse, find muslim partner uk, search muslim profiles, muslim spouse search, how to find muslim spouse, halal spouse finder, muslim marriage search uk",
    canonicalPath: "/find-muslim-spouse",
    ctaHeading: "Start Your Search Now",
    ctaSubtext: "Browse verified Muslim profiles, filter by city and age, and it's all free.",
    relatedLinks: [
      { url: "/muslim-marriage", label: "The Islamic Basis for Marriage" },
      { url: "/muslim-matrimonial", label: "How the Platform Works" },
      { url: "/verified-muslim-profiles", label: "Verified Profiles" },
      { url: "/muslim-matchmaking", label: "Muslim Matchmaking" },
      { url: "/blog/how-to-find-a-muslim-spouse-in-the-uk-simple-real-guide", label: "The Full Spouse-Search Guide" }
    ],
    pageFaqSchema: [
      { q: "What can I filter profiles by?", a: "Gender, age range, city or region, country, and height, among others. You can also sort by newest additions or browse the full set of approved profiles." },
      { q: "Can I search a specific UK city?", a: "Yes — search Muslim singles by city, whether that's London, Birmingham, Manchester, Bradford, Leicester, or Leeds. Combine it with age or gender for a tighter result set." },
      { q: "How do I get more views on my own profile?", a: "Fill it out completely — bio, spouse preferences, education, career. Profiles with a photo and real detail get seen far more often, and completeness signals genuine intent." },
      { q: "What should I actually write in my profile?", a: "Be specific and honest — your values, family background, career, and exactly what you're looking for. State your city preference if you have one. Specificity attracts higher-quality interest." },
      { q: "How long does it usually take to find a match?", a: "It varies person to person. A complete profile, quick responses to interest, and realistic expectations all help. Some find a match within weeks; others need more time. Patience is part of the process." }
    ],
    pageFaqs: [
      { q: "What can I filter profiles by?", a: "Gender, age range, city or region, country, and height, among others. You can also sort by newest additions or browse the full set of approved profiles." },
      { q: "Can I search a specific UK city?", a: "Yes — search Muslim singles by city, whether that's London, Birmingham, Manchester, Bradford, Leicester, or Leeds. Combine it with age or gender for a tighter result set." },
      { q: "How do I get more views on my own profile?", a: "Fill it out completely — bio, spouse preferences, education, career. Profiles with a photo and real detail get seen far more often, and completeness signals genuine intent." },
      { q: "What should I actually write in my profile?", a: "Be specific and honest — your values, family background, career, and exactly what you're looking for. State your city preference if you have one. Specificity attracts higher-quality interest." },
      { q: "How long does it usually take to find a match?", a: "It varies person to person. A complete profile, quick responses to interest, and realistic expectations all help. Some find a match within weeks; others need more time. Patience is part of the process." }
    ],
    bodyContent: `
      <div class="prose max-w-none">
        <p class="text-lg text-gray-700 mb-6 leading-relaxed">Finding a Muslim spouse online takes more than scrolling — it means using the right tools with intention, so that you can find the right people and they can find you. Here's exactly how to get the most out of D'amour Muslim's search and filter system.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Step 1 — Make Yourself Findable First</h2>
        <p class="text-gray-700 mb-4">Before you search, get searchable. Complete profiles pull in far more views than sparse ones. Focus on:</p>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>A clear, recent photo.</strong> Profiles with photos get noticed far more often.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>A real "About Me."</strong> Vague profiles get vague responses — be honest about your values and personality.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Clear spouse preferences.</strong> Use this section deliberately — it defines your compatibility criteria.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Accurate city and background.</strong> Location is one of the most common filters, so make sure yours is right.</span></li>
        </ul>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Step 2 — Learn the Filters</h2>
        <p class="text-gray-700 mb-4">The filter system narrows thousands of verified profiles down to what's actually relevant to you:</p>
        <div class="grid md:grid-cols-2 gap-4 mb-8">
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="font-semibold text-gray-800 mb-2">Gender</h3>
            <p class="text-gray-600 text-sm">Browse male or female profiles specifically, rather than everything at once.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="font-semibold text-gray-800 mb-2">Age Range</h3>
            <p class="text-gray-600 text-sm">Be realistic — an overly narrow range can quietly rule out great matches nearby.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="font-semibold text-gray-800 mb-2">City / Location</h3>
            <p class="text-gray-600 text-sm">Filter by any UK city, or search by country for profiles based overseas.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="font-semibold text-gray-800 mb-2">Height Range</h3>
            <p class="text-gray-600 text-sm">Set your preferred range in centimetres if height matters to you.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="font-semibold text-gray-800 mb-2">Nationality</h3>
            <p class="text-gray-600 text-sm">Useful if you're seeking a particular background, or combining with a city filter.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="font-semibold text-gray-800 mb-2">Sort Order</h3>
            <p class="text-gray-600 text-sm">Sort by newest, or browse more broadly for wider discovery.</p>
          </div>
        </div>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Step 3 — Read Before You Reach Out</h2>
        <p class="text-gray-700 mb-4">Before sending interest, take a moment with the profile. Look for:</p>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700"><strong>Religious alignment:</strong> Does their stated practice match yours?</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700"><strong>Realistic fit:</strong> Age, location, education, lifestyle — genuinely compatible with what you need?</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700"><strong>Thoughtful writing:</strong> A detailed bio usually signals a serious person.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700"><strong>Their stated preferences:</strong> Do you genuinely fit what they've said they're looking for?</span></li>
        </ul>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Step 4 — Send Interest, Then Wait</h2>
        <p class="text-gray-700 mb-4">Once you send interest, the other person is notified. Acceptance opens up secure messaging. A decline just means moving on — each interaction narrows in on the right match.</p>

        <blockquote class="border-l-4 border-primary pl-6 py-3 bg-primary/5 rounded-r-xl mb-6">
          <p class="text-gray-700 italic">Remember: every "no" in this process is protection and redirection. Keep your intention sincere, keep making dua, and trust the timing.</p>
        </blockquote>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Search by UK City</h2>
        <div class="flex flex-wrap gap-2 mb-6">
          <a href="/muslim-matrimony-london" class="px-4 py-2 bg-primary/10 text-primary rounded-full text-sm font-semibold hover:bg-primary hover:text-white transition-all duration-300">London</a>
          <a href="/muslim-matrimony-birmingham" class="px-4 py-2 bg-primary/10 text-primary rounded-full text-sm font-semibold hover:bg-primary hover:text-white transition-all duration-300">Birmingham</a>
          <a href="/muslim-matrimony-manchester" class="px-4 py-2 bg-primary/10 text-primary rounded-full text-sm font-semibold hover:bg-primary hover:text-white transition-all duration-300">Manchester</a>
          <a href="/muslim-matrimony-bradford" class="px-4 py-2 bg-primary/10 text-primary rounded-full text-sm font-semibold hover:bg-primary hover:text-white transition-all duration-300">Bradford</a>
          <a href="/muslim-matrimony-leicester" class="px-4 py-2 bg-primary/10 text-primary rounded-full text-sm font-semibold hover:bg-primary hover:text-white transition-all duration-300">Leicester</a>
          <a href="/muslim-matrimony-leeds" class="px-4 py-2 bg-primary/10 text-primary rounded-full text-sm font-semibold hover:bg-primary hover:text-white transition-all duration-300">Leeds</a>
        </div>

        <div class="bg-primary/5 rounded-2xl p-6 border border-primary/10 mt-8">
          <p class="text-gray-700 font-medium">New here? Start with our <a href="/muslim-matrimonial" class="text-primary hover:underline">Platform Features Guide</a>, or read <a href="/muslim-marriage" class="text-primary hover:underline">The Islamic Basis for Marriage</a> first.</p>
        </div>
      </div>
    `
  },
  {
    path: "/best-muslim-marriage-website",
    pageTitle: "Picking the Best Muslim Marriage Website — A Practical Guide | D'amour Muslim",
    h1: "How to Choose the Best Muslim Marriage Website",
    heroSubtitle: "Not every Muslim marriage website is built the same way. Here's what separates the good ones from the rest — and how D'amour Muslim measures up.",
    metaDescription: "What actually makes a Muslim marriage website good? Verification, halal design, privacy, moderation, and free access — scored against D'amour Muslim. Join free.",
    keywords: "best muslim marriage website, best muslim matrimonial site, best halal marriage app, top muslim marriage platform uk, muslim marriage website review",
    canonicalPath: "/best-muslim-marriage-website",
    ctaHeading: "Make an Informed Choice Today",
    ctaSubtext: "Join D'amour Muslim free — a platform that scores well across the board.",
    relatedLinks: [
      { url: "/verified-muslim-profiles", label: "Verified Profiles" },
      { url: "/trusted-muslim-matchmaking", label: "Our Safety Approach" },
      { url: "/halal-marriage", label: "Halal Marriage Platform" },
      { url: "/free-muslim-marriage-site", label: "Free Muslim Marriage Site" },
      { url: "/muslim-matchmaking", label: "Muslim Matchmaking" }
    ],
    pageFaqSchema: [
      { q: "What separates a strong Muslim marriage website from a weak one?", a: "Five things: manual profile verification, a halal-first interaction design that prevents free mixing, real data privacy, fast and effective moderation, and free access to core features. D'amour Muslim was built around all five." },
      { q: "How does D'amour Muslim compare to other well-known apps?", a: "D'amour Muslim is built specifically for the UK Muslim community, with an emphasis on manual verification and halal-by-design interaction. Unlike platforms optimised for engagement, it requires clear marriage intent and doesn't allow unsolicited messaging. Try it and compare directly — registration is free with no strings attached." },
      { q: "Are paid platforms automatically better than free ones?", a: "Not necessarily. A subscription fee is a business model, not a quality guarantee. D'amour Muslim is free because we believe cost shouldn't be a gatekeeper to marriage — quality here comes from moderation standards and design, not pricing." },
      { q: "How can I tell if a matrimonial site is actually safe?", a: "Check for UK GDPR compliance, manual profile review before anything goes live, an easy reporting system, and gated messaging that prevents unsolicited contact. D'amour Muslim meets all of these." },
      { q: "Is there a genuinely free option for UK Muslims?", a: "Yes — D'amour Muslim offers real free access rather than a freemium model with core features locked away. Registration, profile browsing, and sending interest are all free." }
    ],
    pageFaqs: [
      { q: "What separates a strong Muslim marriage website from a weak one?", a: "Five things: manual profile verification, a halal-first interaction design that prevents free mixing, real data privacy, fast and effective moderation, and free access to core features. D'amour Muslim was built around all five." },
      { q: "How does D'amour Muslim compare to other well-known apps?", a: "D'amour Muslim is built specifically for the UK Muslim community, with an emphasis on manual verification and halal-by-design interaction. Unlike platforms optimised for engagement, it requires clear marriage intent and doesn't allow unsolicited messaging. Try it and compare directly — registration is free with no strings attached." },
      { q: "Are paid platforms automatically better than free ones?", a: "Not necessarily. A subscription fee is a business model, not a quality guarantee. D'amour Muslim is free because we believe cost shouldn't be a gatekeeper to marriage — quality here comes from moderation standards and design, not pricing." },
      { q: "How can I tell if a matrimonial site is actually safe?", a: "Check for UK GDPR compliance, manual profile review before anything goes live, an easy reporting system, and gated messaging that prevents unsolicited contact. D'amour Muslim meets all of these." },
      { q: "Is there a genuinely free option for UK Muslims?", a: "Yes — D'amour Muslim offers real free access rather than a freemium model with core features locked away. Registration, profile browsing, and sending interest are all free." }
    ],
    bodyContent: `
      <div class="prose max-w-none">
        <p class="text-lg text-gray-700 mb-6 leading-relaxed">Choosing where to look for a spouse is a genuinely consequential decision. Pick poorly, and you burn months on fake profiles and dead-end conversations. Pick well, and you're connected with serious, verified, compatible Muslims in a halal environment. This isn't just self-promotion — it's a practical checklist for evaluating any Muslim marriage website, D'amour Muslim included.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Five Things Worth Checking</h2>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">1.</span><span class="text-gray-700"><strong>Manual verification:</strong> Are profiles reviewed by a real person before going live, or does the platform rely on automation alone? Fake profiles are the biggest recurring problem — only manual review solves it properly.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">2.</span><span class="text-gray-700"><strong>Halal-by-design interaction:</strong> Is messaging gated behind mutual acceptance, or can anyone message anyone freely?</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">3.</span><span class="text-gray-700"><strong>Data privacy:</strong> Is the platform UK GDPR compliant? Is your data ever sold on? Privacy is a right, not a bonus feature.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">4.</span><span class="text-gray-700"><strong>Real moderation:</strong> How easily can you report something suspicious, and how quickly is it acted on?</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">5.</span><span class="text-gray-700"><strong>Free access:</strong> Can you actually browse and search without hitting a paywall? Cost shouldn't decide who gets access to marriage.</span></li>
        </ul>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">How D'amour Muslim Measures Up</h2>
        <div class="grid md:grid-cols-2 gap-4 mb-8">
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Verification ✓</h3>
            <p class="text-gray-700 text-sm leading-relaxed">Every profile is manually checked by a moderator before it goes live — no automatic approval, ever.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Halal Design ✓</h3>
            <p class="text-gray-700 text-sm leading-relaxed">Communication only opens after mutual acceptance — no open inboxes, no social feed, no group chat.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Data Privacy ✓</h3>
            <p class="text-gray-700 text-sm leading-relaxed">Fully UK GDPR compliant, no data sold to advertisers, and photos are hidden from the general public.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Moderation ✓</h3>
            <p class="text-gray-700 text-sm leading-relaxed">Report anything instantly; the team reviews and acts, and repeat offenders are permanently removed.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100 md:col-span-2">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Free Access ✓</h3>
            <p class="text-gray-700 text-sm leading-relaxed">Registration, profile creation, browsing, and sending interest are all free — no paywall on the essentials.</p>
          </div>
        </div>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">What Members Say</h2>
        <div class="grid md:grid-cols-2 gap-4 mb-8">
          <blockquote class="border-l-4 border-primary pl-4 italic text-gray-600">"I tried two other sites first. What stood out here was how genuine the profiles felt — real people, real intentions. I felt comfortable from week one." <br/><cite class="text-sm not-italic text-gray-500 mt-2 block">— Sister from Birmingham, 27</cite></blockquote>
          <blockquote class="border-l-4 border-primary pl-4 italic text-gray-600">"My parents took some convincing at first, but once they saw the family features and the lack of random messaging, they came around fast. We had a proposal within a month." <br/><cite class="text-sm not-italic text-gray-500 mt-2 block">— Brother from Manchester, 31</cite></blockquote>
        </div>

        <blockquote class="border-l-4 border-primary pl-4 italic text-gray-600 my-6">Islamic teaching frames marriage as something to be actively facilitated for anyone able to pursue it — not made harder than it needs to be.</blockquote>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Red Flags Worth Avoiding</h2>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✗</span><span class="text-gray-700"><strong>No verification:</strong> If any email creates a live profile instantly, expect a flood of fakes</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✗</span><span class="text-gray-700"><strong>Open messaging:</strong> Free-for-all inboxes normalise casual interaction — not appropriate here</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✗</span><span class="text-gray-700"><strong>Pay to message:</strong> Subscription walls around basic contact put revenue ahead of the community</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✗</span><span class="text-gray-700"><strong>No GDPR compliance:</strong> A real risk when you're sharing sensitive personal and family details</span></li>
        </ul>

        <div class="bg-primary/5 rounded-2xl p-6 border border-primary/10 mt-8">
          <p class="text-gray-700 font-medium">Also see: <a href="/verified-muslim-profiles" class="text-primary hover:underline">Verified Profiles</a> &bull; <a href="/trusted-muslim-matchmaking" class="text-primary hover:underline">Our Safety Approach</a> &bull; <a href="/halal-marriage" class="text-primary hover:underline">Halal Marriage Platform</a></p>
        </div>
      </div>
    `
  },
  {
    path: "/free-muslim-marriage-site",
    pageTitle: "A Genuinely Free Muslim Marriage Site | D'amour Muslim",
    h1: "Free Muslim Marriage Site — No Paywall, No Fine Print",
    heroSubtitle: "Helping Muslims marry is an act of faith, not a revenue stream. That's why D'amour Muslim is, and stays, free.",
    metaDescription: "D'amour Muslim is a genuinely free Muslim marriage site — register, browse verified profiles, and send interest with no subscription needed. Join free.",
    keywords: "free muslim marriage site, free muslim marriage website, free halal marriage site, free muslim matrimonial, free muslim matchmaking uk",
    canonicalPath: "/free-muslim-marriage-site",
    ctaHeading: "Join Free, No Catch",
    ctaSubtext: "Register on D'amour Muslim today — no subscription, no paywall, nothing hidden.",
    relatedLinks: [
      { url: "/muslim-marriage", label: "The Islamic Basis for Marriage" },
      { url: "/best-muslim-marriage-website", label: "Choosing the Best Website" },
      { url: "/verified-muslim-profiles", label: "Verified Profiles" },
      { url: "/halal-marriage", label: "Halal Marriage Platform" },
      { url: "/muslim-matchmaking", label: "Muslim Matchmaking" }
    ],
    pageFaqSchema: [
      { q: "Is D'amour Muslim actually free — what's the catch?", a: "No catch. Registration, browsing every verified profile, and sending interest are all free. No subscription is required for core features. We believe finances shouldn't stand between a Muslim and their marriage search." },
      { q: "Do I have to pay to message someone?", a: "No. Sending interest — the first step toward contact — is free. Once mutual interest is confirmed, secure messaging opens, again with no payment wall in the way." },
      { q: "Which features are actually free?", a: "Registration, full profile creation, photo upload, browsing all verified profiles, using every search filter, sending interest, and messaging accepted connections. Nothing essential sits behind a paywall." },
      { q: "Why does a free site beat a paid one?", a: "Free access doesn't automatically mean good, and paid doesn't automatically mean bad — but free means no Muslim is excluded because of their finances. A platform charging for basic contact tells less well-off Muslims their search matters less. We reject that." },
      { q: "How is D'amour Muslim funded if it's free?", a: "The platform is run lean and doesn't rely on subscription income. Data is never sold to advertisers. The founding idea is simple: every Muslim deserves access to a serious halal matrimonial platform, regardless of budget." }
    ],
    pageFaqs: [
      { q: "Is D'amour Muslim actually free — what's the catch?", a: "No catch. Registration, browsing every verified profile, and sending interest are all free. No subscription is required for core features. We believe finances shouldn't stand between a Muslim and their marriage search." },
      { q: "Do I have to pay to message someone?", a: "No. Sending interest — the first step toward contact — is free. Once mutual interest is confirmed, secure messaging opens, again with no payment wall in the way." },
      { q: "Which features are actually free?", a: "Registration, full profile creation, photo upload, browsing all verified profiles, using every search filter, sending interest, and messaging accepted connections. Nothing essential sits behind a paywall." },
      { q: "Why does a free site beat a paid one?", a: "Free access doesn't automatically mean good, and paid doesn't automatically mean bad — but free means no Muslim is excluded because of their finances. A platform charging for basic contact tells less well-off Muslims their search matters less. We reject that." },
      { q: "How is D'amour Muslim funded if it's free?", a: "The platform is run lean and doesn't rely on subscription income. Data is never sold to advertisers. The founding idea is simple: every Muslim deserves access to a serious halal matrimonial platform, regardless of budget." }
    ],
    bodyContent: `
      <div class="prose max-w-none">
        <p class="text-lg text-gray-700 mb-6 leading-relaxed">There's a growing pattern in the Muslim matrimonial space: charge a monthly fee, lock essential features behind it, and profit from the urgency of Muslims trying to find a halal spouse. D'amour Muslim was built to push back against exactly that. If you're after a genuinely free Muslim marriage site, here's what's free — and more importantly, why.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">What Costs Nothing on D'amour Muslim</h2>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Registration:</strong> Set up your account in minutes, no card details needed</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Full profile:</strong> Photos, bio, and spouse preferences, all included</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Every verified profile:</strong> No teaser wall, no locked previews</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>All search filters:</strong> City, age, gender, nationality, height — unrestricted</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Sending interest:</strong> No subscription required to reach out</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Secure messaging:</strong> Free once a connection is mutually accepted</span></li>
        </ul>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Why We Think Access Should Be Free</h2>
        <p class="text-gray-700 mb-4 leading-relaxed">Islamic tradition speaks about helping the unmarried among the community find a spouse — and that guidance was never meant only for those who can afford a monthly fee. A subscription standing between a young Muslim and their search for a halal spouse runs against that spirit.</p>
        <p class="text-gray-700 mb-6 leading-relaxed">D'amour Muslim exists on the belief that money should never be why a Muslim can't access a serious matrimonial platform. A student, a young professional saving for their first home, a single parent on a tight budget — they all deserve the same access as anyone else. That's a value we hold, not a marketing angle.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Why This Benefits Everyone</h2>
        <div class="grid md:grid-cols-2 gap-4 mb-8">
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">A Wider, Genuine Pool</h3>
            <p class="text-gray-700 text-sm leading-relaxed">No financial barrier means more serious Muslims register, not just those who can pay. That builds a broader, more representative, more genuinely verified pool.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">No Perverse Incentive</h3>
            <p class="text-gray-700 text-sm leading-relaxed">Subscription platforms profit from keeping you searching, not finding. Free access removes that conflict of interest entirely — our goal and yours are the same.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100 md:col-span-2">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Equal Access, Full Stop</h3>
            <p class="text-gray-700 text-sm leading-relaxed">A professional in London, a family in Lahore, a student in Birmingham, a widow in Bradford — all get exactly the same access to the same platform.</p>
          </div>
        </div>

        <blockquote class="border-l-4 border-primary pl-4 italic text-gray-600 my-6">The Prophetic tradition urges the community to actively support the unmarried in finding a spouse, framing marriage as a genuine protection for faith and character.</blockquote>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Registering Free — Step by Step</h2>
        <div class="grid md:grid-cols-5 gap-3 mb-8">
          <div class="bg-gray-50 rounded-xl p-4 text-center border border-gray-100">
            <span class="text-primary font-bold text-xl block mb-2">1</span>
            <p class="text-gray-700 text-xs leading-relaxed">Sign up with name &amp; email — no card required</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-4 text-center border border-gray-100">
            <span class="text-primary font-bold text-xl block mb-2">2</span>
            <p class="text-gray-700 text-xs leading-relaxed">Build your profile with photos and preferences</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-4 text-center border border-gray-100">
            <span class="text-primary font-bold text-xl block mb-2">3</span>
            <p class="text-gray-700 text-xs leading-relaxed">Browse verified profiles, filtered your way</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-4 text-center border border-gray-100">
            <span class="text-primary font-bold text-xl block mb-2">4</span>
            <p class="text-gray-700 text-xs leading-relaxed">Send interest — free, no limit</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-4 text-center border border-gray-100">
            <span class="text-primary font-bold text-xl block mb-2">5</span>
            <p class="text-gray-700 text-xs leading-relaxed">Message accepted connections securely</p>
          </div>
        </div>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Nothing Hidden, No Surprises</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">You won't be asked for card details on sign-up. You won't hit a paywall the moment you try to message someone. You won't get nudged to "upgrade" after some arbitrary limit. D'amour Muslim is free in the full sense of the word, not a free trial dressed up as one.</p>

        <div class="bg-primary/5 rounded-2xl p-6 border border-primary/10 mt-8">
          <p class="text-gray-700 font-medium">Also see: <a href="/muslim-marriage" class="text-primary hover:underline">The Islamic Basis for Marriage</a> &bull; <a href="/best-muslim-marriage-website" class="text-primary hover:underline">Choosing the Best Website</a> &bull; <a href="/verified-muslim-profiles" class="text-primary hover:underline">Verified Profiles</a></p>
        </div>
      </div>
    `
  },
  {
    path: "/trusted-muslim-matchmaking",
    pageTitle: "Trusted Muslim Matchmaking — How Our Safety System Works | D'amour Muslim",
    h1: "Trusted Muslim Matchmaking — The Safety Work Behind the Scenes",
    heroSubtitle: "Trust isn't a slogan — it's built through process. Here's exactly how D'amour Muslim's safety system works, from moderation to GDPR compliance.",
    metaDescription: "What makes D'amour Muslim trustworthy? Moderation process, fake-profile prevention, GDPR compliance, and Islamic conduct standards, explained in full.",
    keywords: "trusted muslim matchmaking, safe muslim marriage site, reliable muslim matchmaking, trustworthy muslim matrimonial, secure muslim marriage platform",
    canonicalPath: "/trusted-muslim-matchmaking",
    ctaHeading: "Join With Confidence",
    ctaSubtext: "Register on a platform built on safety, transparency, and Islamic principles.",
    relatedLinks: [
      { url: "/verified-muslim-profiles", label: "How Verification Works" },
      { url: "/halal-marriage", label: "Halal Marriage Platform" },
      { url: "/best-muslim-marriage-website", label: "Choosing the Best Website" },
      { url: "/muslim-matchmaking", label: "Muslim Matchmaking" }
    ],
    pageFaqSchema: [
      { q: "How do you stop fake profiles from appearing?", a: "Every profile passes through a human moderator before going live — checking identity plausibility, photo appropriateness, and content quality. Anything failing review is rejected or sent back for revision." },
      { q: "Is my data actually safe here?", a: "Yes. D'amour Muslim is fully UK GDPR compliant. Data is never sold to advertisers or brokers, profile details are only visible to approved members, and you can request full deletion at any time." },
      { q: "What should I do if a profile looks off?", a: "Use the Report button right away. Reports go straight to the moderation team as a priority. You can also block the user immediately to stop further contact." },
      { q: "Is D'amour Muslim a registered UK business?", a: "Yes — it's a registered UK business compliant with UK GDPR and the Data Protection Act 2018, following ICO guidance on handling user data online." },
      { q: "How fast are new profiles reviewed?", a: "We aim to review submissions promptly, typically within 24–48 hours during busier periods. You'll get an email once approved. Until then, the profile isn't visible to anyone else." }
    ],
    pageFaqs: [
      { q: "How do you stop fake profiles from appearing?", a: "Every profile passes through a human moderator before going live — checking identity plausibility, photo appropriateness, and content quality. Anything failing review is rejected or sent back for revision." },
      { q: "Is my data actually safe here?", a: "Yes. D'amour Muslim is fully UK GDPR compliant. Data is never sold to advertisers or brokers, profile details are only visible to approved members, and you can request full deletion at any time." },
      { q: "What should I do if a profile looks off?", a: "Use the Report button right away. Reports go straight to the moderation team as a priority. You can also block the user immediately to stop further contact." },
      { q: "Is D'amour Muslim a registered UK business?", a: "Yes — it's a registered UK business compliant with UK GDPR and the Data Protection Act 2018, following ICO guidance on handling user data online." },
      { q: "How fast are new profiles reviewed?", a: "We aim to review submissions promptly, typically within 24–48 hours during busier periods. You'll get an email once approved. Until then, the profile isn't visible to anyone else." }
    ],
    bodyContent: `
      <div class="prose max-w-none">
        <p class="text-lg text-gray-700 mb-6 leading-relaxed">Trust on a matrimonial platform can't just be claimed — it has to be earned through consistent process. For a Muslim marriage search, that means confidence that every profile is a genuine person with real intentions, that your data is treated with proper care, and that Islamic conduct is enforced structurally, not just written into a policy page.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">How We Keep the Platform Safe</h2>
        <div class="grid md:grid-cols-2 gap-4 mb-8">
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Real Human Review</h3>
            <p class="text-gray-700 text-sm leading-relaxed">Every profile is checked by a trained moderator before going live — no automated approval anywhere in the process.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Catching Fakes Early</h3>
            <p class="text-gray-700 text-sm leading-relaxed">Moderators watch for stock photos, inconsistent details, and bios that don't add up — flagged profiles never reach live search results.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">UK GDPR Compliance</h3>
            <p class="text-gray-700 text-sm leading-relaxed">Your data is never sold. Profile photos and details stay visible only to approved, logged-in members.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Reporting & Blocking</h3>
            <p class="text-gray-700 text-sm leading-relaxed">Every profile and message can be reported instantly, with repeat violators permanently banned.</p>
          </div>
        </div>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Our Review Process, Step by Step</h2>
        <div class="grid md:grid-cols-5 gap-3 mb-8">
          <div class="bg-gray-50 rounded-xl p-4 text-center border border-gray-100">
            <span class="text-primary font-bold text-xl block mb-2">1</span>
            <p class="text-gray-700 text-xs leading-relaxed">Register with email and basic details</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-4 text-center border border-gray-100">
            <span class="text-primary font-bold text-xl block mb-2">2</span>
            <p class="text-gray-700 text-xs leading-relaxed">Email confirmed, account activated</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-4 text-center border border-gray-100">
            <span class="text-primary font-bold text-xl block mb-2">3</span>
            <p class="text-gray-700 text-xs leading-relaxed">Photo, bio, and preferences submitted</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-4 text-center border border-gray-100">
            <span class="text-primary font-bold text-xl block mb-2">4</span>
            <p class="text-gray-700 text-xs leading-relaxed">Moderator reviews the full submission</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-4 text-center border border-gray-100">
            <span class="text-primary font-bold text-xl block mb-2">5</span>
            <p class="text-gray-700 text-xs leading-relaxed">Approved and goes live, or returned with feedback</p>
          </div>
        </div>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Data Privacy in Practice</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">We collect only what's needed to run the platform — name, email, profile details, and basic usage data. None of it is sold or handed to advertisers. Everything is stored securely, and you can request full deletion of your account and data at any time, in line with UK GDPR. Full details are available on our Privacy Policy page.</p>

        <blockquote class="border-l-4 border-primary pl-4 italic text-gray-600 my-6">Islamic teaching consistently links honesty with righteousness — a principle this platform's moderation standards are built to reflect.</blockquote>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Trust Signals at a Glance</h2>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">100% manual review, no exceptions</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">UK GDPR compliant, data never sold</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Zero unsolicited messages</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Instant reporting and blocking on every profile</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Photos hidden from non-members and search engines</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Registered UK business with transparent company details</span></li>
        </ul>

        <div class="bg-primary/5 rounded-2xl p-6 border border-primary/10 mt-8">
          <p class="text-gray-700 font-medium">Also see: <a href="/verified-muslim-profiles" class="text-primary hover:underline">How Verification Works</a> &bull; <a href="/halal-marriage" class="text-primary hover:underline">Halal Marriage Platform</a> &bull; <a href="/best-muslim-marriage-website" class="text-primary hover:underline">Choosing the Best Website</a></p>
        </div>
      </div>
    `
  },
  {
    path: "/verified-muslim-profiles",
    pageTitle: "Verified Muslim Profiles — What That Word Actually Means | D'amour Muslim",
    h1: "Verified Muslim Profiles — What Gets Checked, and Why It Matters",
    heroSubtitle: "Not every 'verified' badge means the same thing. Here's precisely what D'amour Muslim's review process checks before a profile ever appears in search.",
    metaDescription: "What does 'verified' mean on D'amour Muslim? The full profile approval process, from submission to live listing, explained step by step. Free to join.",
    keywords: "verified muslim profiles, verified muslim marriage profiles, authentic muslim profiles, real muslim matrimonial profiles, screened muslim profiles",
    canonicalPath: "/verified-muslim-profiles",
    ctaHeading: "Join a Platform Where Every Profile Is Real",
    ctaSubtext: "Register free and browse only verified, approved profiles.",
    relatedLinks: [
      { url: "/trusted-muslim-matchmaking", label: "Our Safety Approach" },
      { url: "/muslim-matchmaking", label: "Muslim Matchmaking" },
      { url: "/best-muslim-marriage-website", label: "Choosing the Best Website" },
      { url: "/halal-marriage", label: "Halal Marriage Platform" }
    ],
    pageFaqSchema: [
      { q: "What does 'verified' actually mean here — is it ID verification?", a: "It means a human moderator manually reviewed your profile before approval. We don't run automated ID checks, but our review does assess identity plausibility, photo authenticity, bio quality, conduct compliance, and completeness." },
      { q: "How long does verification take?", a: "Usually completed within 24 hours; up to 48 during busy periods. You'll get an email once approved — until then, the profile stays invisible to others." },
      { q: "Could a verified profile still turn out fake?", a: "Manual review cuts the risk sharply, but no system is perfect. That's why ongoing reporting exists too — any member can flag a profile at any time, and moderators act promptly on it." },
      { q: "What should I do if I suspect a verified profile isn't genuine?", a: "Report it immediately. You don't need proof — if something feels off, flag it. The team will re-check it against the original submission and act if warranted. You can block the user right away too." },
      { q: "Is every visible profile guaranteed to have passed review?", a: "Yes. There's no way to publish a profile instantly without moderation — no unreviewed profile ever appears in search results." }
    ],
    pageFaqs: [
      { q: "What does 'verified' actually mean here — is it ID verification?", a: "It means a human moderator manually reviewed your profile before approval. We don't run automated ID checks, but our review does assess identity plausibility, photo authenticity, bio quality, conduct compliance, and completeness." },
      { q: "How long does verification take?", a: "Usually completed within 24 hours; up to 48 during busy periods. You'll get an email once approved — until then, the profile stays invisible to others." },
      { q: "Could a verified profile still turn out fake?", a: "Manual review cuts the risk sharply, but no system is perfect. That's why ongoing reporting exists too — any member can flag a profile at any time, and moderators act promptly on it." },
      { q: "What should I do if I suspect a verified profile isn't genuine?", a: "Report it immediately. You don't need proof — if something feels off, flag it. The team will re-check it against the original submission and act if warranted. You can block the user right away too." },
      { q: "Is every visible profile guaranteed to have passed review?", a: "Yes. There's no way to publish a profile instantly without moderation — no unreviewed profile ever appears in search results." }
    ],
    bodyContent: `
      <div class="prose max-w-none">
        <p class="text-lg text-gray-700 mb-6 leading-relaxed">The word "verified" gets thrown around loosely in the matrimonial industry. On some platforms it means a confirmed email. On others, it's a badge earned by uploading a selfie nobody actually looks at. On D'amour Muslim it means something concrete: a real moderator checks every single profile before another member ever sees it. Here's exactly what that involves.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">What "Verified" Actually Means Here</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">A verified profile has been looked at and approved by a trained moderator — not an algorithm. That means someone has checked your photo, read your bio, reviewed your stated background, and judged that the profile meets our standards for authenticity and conduct before it's published. Without that approval, your profile simply doesn't appear in search.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">From Registration to Live Profile</h2>
        <div class="grid md:grid-cols-5 gap-3 mb-8">
          <div class="bg-gray-50 rounded-xl p-4 text-center border border-gray-100">
            <span class="text-primary font-bold text-xl block mb-2">1</span>
            <p class="text-gray-700 text-xs leading-relaxed font-semibold mb-1">Register</p>
            <p class="text-gray-600 text-xs leading-relaxed">Create your account — no payment required</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-4 text-center border border-gray-100">
            <span class="text-primary font-bold text-xl block mb-2">2</span>
            <p class="text-gray-700 text-xs leading-relaxed font-semibold mb-1">Confirm Email</p>
            <p class="text-gray-600 text-xs leading-relaxed">A basic identity anchor before anything else</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-4 text-center border border-gray-100">
            <span class="text-primary font-bold text-xl block mb-2">3</span>
            <p class="text-gray-700 text-xs leading-relaxed font-semibold mb-1">Complete Profile</p>
            <p class="text-gray-600 text-xs leading-relaxed">Bio, photo, preferences, and background</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-4 text-center border border-gray-100">
            <span class="text-primary font-bold text-xl block mb-2">4</span>
            <p class="text-gray-700 text-xs leading-relaxed font-semibold mb-1">Submit for Review</p>
            <p class="text-gray-600 text-xs leading-relaxed">Enters the moderation queue</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-4 text-center border border-gray-100">
            <span class="text-primary font-bold text-xl block mb-2">5</span>
            <p class="text-gray-700 text-xs leading-relaxed font-semibold mb-1">Approved & Live</p>
            <p class="text-gray-600 text-xs leading-relaxed">You're notified by email, or given feedback to fix</p>
          </div>
        </div>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">What Moderators Actually Check</h2>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Identity plausibility:</strong> Does the profile represent a real, consistent person?</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Photo quality:</strong> Is it a genuine personal photo — not stock, not a celebrity, not lifted from elsewhere?</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Bio content:</strong> Coherent, genuine, and matched to the stated background?</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Conduct standards:</strong> Does everything about the profile fit our Islamic conduct guidelines?</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Completeness:</strong> Is there enough here to be genuinely useful to a match?</span></li>
        </ul>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">If a Profile Doesn't Pass</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">Profiles that fail review are either rejected outright or sent back with specific feedback — an inappropriate photo, a bio too thin to assess, or content that breaches our conduct standards. Users get a chance to fix and resubmit. Clearly fraudulent or seriously inappropriate submissions are rejected permanently, and the account may be suspended.</p>

        <blockquote class="border-l-4 border-primary pl-4 italic text-gray-600 my-6">Islamic teaching links honesty directly to righteousness — the same principle our review standards are built around.</blockquote>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Why This Leads to Better Matches</h2>
        <div class="grid md:grid-cols-2 gap-4 mb-8">
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Real People, Real Time Well Spent</h3>
            <p class="text-gray-700 text-sm leading-relaxed">Knowing every profile has already been checked means you can focus your energy on reading, not second-guessing.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">A Self-Selecting, Serious Pool</h3>
            <p class="text-gray-700 text-sm leading-relaxed">The friction of a real review filters in genuinely serious people and filters out the thirty-second sign-ups.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100 md:col-span-2">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Family Confidence</h3>
            <p class="text-gray-700 text-sm leading-relaxed">For families new to online rishta searching, knowing every profile is reviewed provides real peace of mind — it's what makes family participation feel safe.</p>
          </div>
        </div>

        <div class="bg-primary/5 rounded-2xl p-6 border border-primary/10 mt-8">
          <p class="text-gray-700 font-medium">Also see: <a href="/trusted-muslim-matchmaking" class="text-primary hover:underline">Our Safety Approach</a> &bull; <a href="/muslim-matchmaking" class="text-primary hover:underline">Muslim Matchmaking</a> &bull; <a href="/best-muslim-marriage-website" class="text-primary hover:underline">Choosing the Best Website</a></p>
        </div>
      </div>
    `
  },
  {
    path: "/online-rishta-pakistan",
    pageTitle: "Online Rishta Pakistan — A National Hub for Pakistani Muslims | D'amour Muslim",
    h1: "Online Rishta Pakistan — Connecting Families Across the Country",
    heroSubtitle: "Lahore to Karachi, Islamabad to the UK diaspora — D'amour Muslim connects Pakistani Muslim families with serious, verified rishta proposals.",
    metaDescription: "Online rishta in Pakistan — D'amour Muslim serves Lahore, Karachi, Islamabad, Rawalpindi, Faisalabad, and the global Pakistani diaspora. Free to join.",
    keywords: "online rishta pakistan, rishta pakistan online, pakistan matrimonial online, online rishta service pakistan, pakistan marriage website",
    canonicalPath: "/online-rishta-pakistan",
    ctaHeading: "Start Your Rishta Search in Pakistan",
    ctaSubtext: "Register free and browse verified proposals from across Pakistan and the global Pakistani community.",
    relatedLinks: [
      { url: "/rishta-lahore", label: "Rishta in Lahore" },
      { url: "/rishta-karachi", label: "Rishta in Karachi" },
      { url: "/british-pakistani-marriage", label: "British Pakistani Marriage" },
      { url: "/muslim-rishta", label: "Muslim Rishta" }
    ],
    pageFaqSchema: [
      { q: "Can I search by specific Pakistani cities?", a: "Yes — including Lahore, Karachi, Islamabad, Rawalpindi, and Faisalabad. Members list their city on their profile, so you can search by exactly where you're looking." },
      { q: "Does D'amour Muslim work from within Pakistan?", a: "Yes, fully. It's accessible via any browser with no country restriction, making it valuable for linking Pakistan-based families with the UK diaspora and beyond." },
      { q: "Can a Pakistani family find an overseas match for their child?", a: "Absolutely — one of the platform's most common use cases. A parent in Lahore or Karachi can build a profile, mark their child as open to an overseas match, and browse or receive proposals accordingly." },
      { q: "Does the platform account for Pakistani rishta culture?", a: "Yes. Profile fields cover biradari background, language, family values, and expected level of family involvement — respecting the formal, family-centred nature of the process." },
      { q: "Is it free for families in Pakistan?", a: "Yes, entirely. Registration, browsing, and sending interest are all free — no Pakistani family should be priced out of a proper matrimonial service." }
    ],
    pageFaqs: [
      { q: "Can I search by specific Pakistani cities?", a: "Yes — including Lahore, Karachi, Islamabad, Rawalpindi, and Faisalabad. Members list their city on their profile, so you can search by exactly where you're looking." },
      { q: "Does D'amour Muslim work from within Pakistan?", a: "Yes, fully. It's accessible via any browser with no country restriction, making it valuable for linking Pakistan-based families with the UK diaspora and beyond." },
      { q: "Can a Pakistani family find an overseas match for their child?", a: "Absolutely — one of the platform's most common use cases. A parent in Lahore or Karachi can build a profile, mark their child as open to an overseas match, and browse or receive proposals accordingly." },
      { q: "Does the platform account for Pakistani rishta culture?", a: "Yes. Profile fields cover biradari background, language, family values, and expected level of family involvement — respecting the formal, family-centred nature of the process." },
      { q: "Is it free for families in Pakistan?", a: "Yes, entirely. Registration, browsing, and sending interest are all free — no Pakistani family should be priced out of a proper matrimonial service." }
    ],
    bodyContent: `
      <div class="prose max-w-none">
        <p class="text-lg text-gray-700 mb-6 leading-relaxed">In Pakistan, a rishta is rarely a private conversation between two people. It's a family project — aunties consult aunties, biradari connections activate, and a father quietly asks around before an introduction is even arranged. It's deeply communal, deeply considered, and tied to the Islamic view of marriage as joining two families, not just two individuals. D'amour Muslim was built to respect that tradition while extending it beyond any single neighbourhood or network.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Coverage Across Pakistan</h2>
        <p class="text-gray-700 mb-4 leading-relaxed">D'amour Muslim has members across Pakistan's major cities. Browse rishta profiles from your own city, or open the search nationally:</p>
        <div class="flex flex-wrap gap-2 mb-6">
          <a href="/rishta-lahore" class="px-4 py-2 bg-primary/10 text-primary rounded-full text-sm font-medium hover:bg-primary/20 transition-colors">Lahore</a>
          <a href="/rishta-karachi" class="px-4 py-2 bg-primary/10 text-primary rounded-full text-sm font-medium hover:bg-primary/20 transition-colors">Karachi</a>
          <a href="/rishta-islamabad" class="px-4 py-2 bg-primary/10 text-primary rounded-full text-sm font-medium hover:bg-primary/20 transition-colors">Islamabad</a>
          <a href="/rishta-rawalpindi" class="px-4 py-2 bg-primary/10 text-primary rounded-full text-sm font-medium hover:bg-primary/20 transition-colors">Rawalpindi</a>
          <a href="/rishta-faisalabad" class="px-4 py-2 bg-primary/10 text-primary rounded-full text-sm font-medium hover:bg-primary/20 transition-colors">Faisalabad</a>
        </div>
        <p class="text-gray-700 mb-6 leading-relaxed">Whether you're seeking someone from your own city or open to proposals nationwide, you can set your location preferences accordingly — members from smaller towns are equally welcome.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Linking Overseas Pakistanis With Families Back Home</h2>
        <p class="text-gray-700 mb-4 leading-relaxed">One of the most common — and most delicate — scenarios in Pakistani rishta culture is the overseas match. D'amour Muslim was built exactly for this dynamic.</p>
        <div class="grid md:grid-cols-2 gap-4 mb-6">
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">British Pakistanis Seeking a Match in Pakistan</h3>
            <p class="text-gray-700 text-sm leading-relaxed">Many British Pakistanis with strong ties to home prefer a spouse from Pakistan. Search directly for Pakistan-based profiles rather than relying only on family contacts.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Pakistani Families Seeking an Overseas Match</h3>
            <p class="text-gray-700 text-sm leading-relaxed">Families across Pakistan frequently look for an overseas partner, particularly in the UK. D'amour Muslim makes that search systematic, not dependent on knowing the right uncle.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100 md:col-span-2">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Diaspora Pakistanis Reconnecting With Their Roots</h3>
            <p class="text-gray-700 text-sm leading-relaxed">Second and third-generation Pakistanis abroad often want a spouse who shares their cultural heritage. D'amour Muslim gives that search structure, without the pressure of extended family gossip.</p>
          </div>
        </div>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">How Pakistani Families Use the Platform</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">Unlike Western apps where individuals search alone, Pakistani rishta culture often has the family managing the search — particularly for a first marriage. D'amour Muslim supports this fully: a parent can run a profile, browse and send interest, and communicate with other families, before ever involving their son or daughter directly. It mirrors the traditional process, minus the gossip and the limited social network.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Why Online Rishta Makes Sense for Pakistan</h2>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Wider reach:</strong> Even a well-connected family only knows so many households — an online platform opens the national and international pool.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Discretion:</strong> Browsing privately is a different experience from being seen at rishta introductions in person.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Detail upfront:</strong> Verified profiles surface education, profession, and religious practice before any contact begins.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>No geographic ceiling:</strong> A family in Faisalabad can connect with a family in London as easily as one across town.</span></li>
        </ul>

        <blockquote class="border-l-4 border-primary pl-4 italic text-gray-600 my-6">Tradition holds that welcoming a suitable proposal — someone whose faith and character are respected — is far preferable to the harm caused by delay.</blockquote>

        <div class="bg-primary/5 rounded-2xl p-6 border border-primary/10 mt-8">
          <p class="text-gray-700 font-medium">Explore by city: <a href="/rishta-lahore" class="text-primary hover:underline">Rishta in Lahore</a> &bull; <a href="/rishta-karachi" class="text-primary hover:underline">Rishta in Karachi</a> &bull; <a href="/british-pakistani-marriage" class="text-primary hover:underline">British Pakistani Marriage</a> &bull; <a href="/muslim-rishta" class="text-primary hover:underline">Muslim Rishta</a></p>
        </div>
      </div>
    `
  },
  {
    path: "/rishta-lahore",
    pageTitle: "Rishta Lahore — Verified Marriage Proposals in the Heart of Pakistan | D'amour Muslim",
    h1: "Rishta Lahore — Verified Proposals From Pakistan's Cultural Capital",
    heroSubtitle: "Lahore is Pakistan's cultural heartbeat. D'amour Muslim connects Lahori families with verified, serious rishta proposals — honouring the city's deep tradition of family-centred marriage.",
    metaDescription: "Find rishta in Lahore — verified profiles from Gulberg, DHA, Johar Town, Model Town, Bahria Town and beyond. Free to join D'amour Muslim.",
    keywords: "rishta lahore, rishta in lahore, lahore matrimonial, lahore rishta service, marriage proposals lahore, lahore muslim marriage",
    canonicalPath: "/rishta-lahore",
    ctaHeading: "Find Your Lahore Rishta",
    ctaSubtext: "Register free and browse verified rishta proposals from Lahore and beyond.",
    relatedLinks: [
      { url: "/online-rishta-pakistan", label: "Rishta Across Pakistan" },
      { url: "/rishta-karachi", label: "Rishta in Karachi" },
      { url: "/muslim-rishta", label: "Muslim Rishta" }
    ],
    pageFaqSchema: [
      { q: "Are there profiles from specific Lahore areas?", a: "Yes — Gulberg, DHA, Johar Town, Model Town, Bahria Town, Garden Town, and Iqbal Town are all well represented. Members typically list their area on their profile." },
      { q: "How does a Lahore family get started?", a: "Register directly — the individual or a parent on their behalf. Once your profile clears moderation, browse verified proposals from Lahore and across Pakistan, filter by city, and send interest." },
      { q: "Does the platform serve overseas Pakistanis looking for a Lahore match?", a: "Yes — this is one of the most common uses of D'amour Muslim. An overseas Pakistani can specify openness to Lahore-based matches, and Lahori families can indicate the same in reverse." },
      { q: "What's distinctive about Lahore's rishta culture?", a: "It's strongly rooted in Punjabi tradition — typically more family-driven than Karachi's more cosmopolitan approach, with biradari networks and family elders playing a significant role, and multiple family meetings expected before a decision." },
      { q: "Is it free for Lahore families?", a: "Yes — registration and core use are entirely free. No family should face a financial barrier to a trustworthy matrimonial service." }
    ],
    pageFaqs: [
      { q: "Are there profiles from specific Lahore areas?", a: "Yes — Gulberg, DHA, Johar Town, Model Town, Bahria Town, Garden Town, and Iqbal Town are all well represented. Members typically list their area on their profile." },
      { q: "How does a Lahore family get started?", a: "Register directly — the individual or a parent on their behalf. Once your profile clears moderation, browse verified proposals from Lahore and across Pakistan, filter by city, and send interest." },
      { q: "Does the platform serve overseas Pakistanis looking for a Lahore match?", a: "Yes — this is one of the most common uses of D'amour Muslim. An overseas Pakistani can specify openness to Lahore-based matches, and Lahori families can indicate the same in reverse." },
      { q: "What's distinctive about Lahore's rishta culture?", a: "It's strongly rooted in Punjabi tradition — typically more family-driven than Karachi's more cosmopolitan approach, with biradari networks and family elders playing a significant role, and multiple family meetings expected before a decision." },
      { q: "Is it free for Lahore families?", a: "Yes — registration and core use are entirely free. No family should face a financial barrier to a trustworthy matrimonial service." }
    ],
    bodyContent: `
      <div class="prose max-w-none">
        <p class="text-lg text-gray-700 mb-6 leading-relaxed">Lahore, the "Heart of Pakistan," is the country's cultural, intellectual, and spiritual capital, and its second largest city with roughly 14 million residents. Its skyline carries the weight of Mughal history — the Badshahi Mosque, the Data Darbar shrine, the Wazir Khan Mosque — and its people carry that same weight into how they approach marriage: with pride, patience, and a strong sense of family.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Rishta Culture in Lahore</h2>
        <p class="text-gray-700 mb-4 leading-relaxed">In Lahore, a rishta involves the whole family from day one — respect for elders, the weight of family reputation, mothers and aunties as the first scouts, and the expectation that a child's marriage reflects on the wider family network.</p>
        <p class="text-gray-700 mb-6 leading-relaxed">Biradari still shapes traditional rishta searching, though it's loosening among the educated middle class of Gulberg, DHA, and Johar Town, where education and profession increasingly sit alongside — and sometimes ahead of — family background as key criteria.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Where Our Lahore Members Are</h2>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Gulberg:</strong> Lahore's most prestigious district — professionals, business families, high demand for proposals.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>DHA:</strong> A planned housing scheme known for educated, professional families.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Johar Town:</strong> Large, diverse, and strongly middle-class.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Model Town:</strong> One of Lahore's oldest planned areas, home to long-established families.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Bahria Town:</strong> A fast-growing township popular with young professional families.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Garden Town &amp; Iqbal Town:</strong> Well-established neighbourhoods with strong community and mosque ties.</span></li>
        </ul>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Lahore's Islamic Heritage</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">The Badshahi Mosque, commissioned in 1673, remains one of the largest mosques ever built, with a courtyard holding over 100,000 worshippers. The Data Darbar shrine, resting place of the great Sufi scholar who brought Islam to the Punjab, draws hundreds of thousands of devotees and anchors the city spiritually. This heritage isn't just architectural — it shapes how Lahoris understand family, faith, and the obligations of a well-lived life.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Three Steps to a Lahore Rishta</h2>
        <div class="grid md:grid-cols-3 gap-4 mb-8">
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <span class="text-primary font-bold text-2xl block mb-2">1</span>
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Build Your Profile</h3>
            <p class="text-gray-700 text-sm leading-relaxed">Register free, add your background, family details, and criteria. Submit for review — typically approved within 24 hours.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <span class="text-primary font-bold text-2xl block mb-2">2</span>
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Browse Lahore Profiles</h3>
            <p class="text-gray-700 text-sm leading-relaxed">Filter by area, age, and education. Take your time, and share profiles with family as needed.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <span class="text-primary font-bold text-2xl block mb-2">3</span>
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Express Interest & Connect</h3>
            <p class="text-gray-700 text-sm leading-relaxed">Once both sides express interest, secure messaging opens for families to properly introduce themselves.</p>
          </div>
        </div>

        <blockquote class="border-l-4 border-primary pl-4 italic text-gray-600 my-6">The Quran describes humanity as created into different peoples and tribes so that they may come to know one another — with true honour measured by righteousness, not lineage.</blockquote>

        <div class="bg-primary/5 rounded-2xl p-6 border border-primary/10 mt-8">
          <p class="text-gray-700 font-medium">Also explore: <a href="/online-rishta-pakistan" class="text-primary hover:underline">Rishta Across Pakistan</a> &bull; <a href="/rishta-karachi" class="text-primary hover:underline">Rishta in Karachi</a> &bull; <a href="/muslim-rishta" class="text-primary hover:underline">Muslim Rishta</a></p>
        </div>
      </div>
    `
  },
  {
    path: "/rishta-karachi",
    pageTitle: "Rishta Karachi — Verified Proposals in Pakistan's Most Diverse City | D'amour Muslim",
    h1: "Rishta Karachi — Verified Proposals From Pakistan's Most Cosmopolitan City",
    heroSubtitle: "Home to over 20 million people and every Muslim ethnicity in Pakistan, Karachi's diversity calls for a smarter search. D'amour Muslim connects the city's Muslim community with verified proposals — free to join.",
    metaDescription: "Find rishta in Karachi — verified profiles from DHA, Clifton, Gulshan-e-Iqbal, North Nazimabad, PECHS and beyond. Free to join D'amour Muslim.",
    keywords: "rishta karachi, rishta in karachi, karachi matrimonial, karachi rishta service, marriage proposals karachi, karachi muslim marriage",
    canonicalPath: "/rishta-karachi",
    ctaHeading: "Find Your Karachi Rishta",
    ctaSubtext: "Register free and browse verified proposals from Karachi and the wider Pakistani community.",
    relatedLinks: [
      { url: "/online-rishta-pakistan", label: "Rishta Across Pakistan" },
      { url: "/rishta-lahore", label: "Rishta in Lahore" },
      { url: "/muslim-rishta", label: "Muslim Rishta" }
    ],
    pageFaqSchema: [
      { q: "Are there profiles from specific Karachi areas?", a: "Yes — DHA, Clifton, Gulshan-e-Iqbal, North Nazimabad, PECHS, Korangi, and Saddar are all represented, with members typically listing their area." },
      { q: "Are Urdu-speaking (Muhajir) families represented on the platform?", a: "Yes — as Pakistan's most ethnically diverse city, Karachi's members span Muhajir, Punjabi, Sindhi, Pashtun, Balochi, and Bengali backgrounds, and profiles let you specify your own." },
      { q: "Can a Karachi family find an overseas match?", a: "Yes, one of the most common use cases. Families can register on behalf of a son or daughter, note openness to overseas matches, and browse or receive proposals from diaspora communities." },
      { q: "How does Karachi's rishta culture differ from Lahore's?", a: "It's notably more cosmopolitan — inter-ethnic marriages are common and generally accepted, education and career are weighted heavily, and biradari considerations are typically less rigid than in Lahore." },
      { q: "Is registration free for Karachi families?", a: "Yes — registration, browsing, and sending interest are all free, with no financial barrier for any family in Karachi or across Pakistan." }
    ],
    pageFaqs: [
      { q: "Are there profiles from specific Karachi areas?", a: "Yes — DHA, Clifton, Gulshan-e-Iqbal, North Nazimabad, PECHS, Korangi, and Saddar are all represented, with members typically listing their area." },
      { q: "Are Urdu-speaking (Muhajir) families represented on the platform?", a: "Yes — as Pakistan's most ethnically diverse city, Karachi's members span Muhajir, Punjabi, Sindhi, Pashtun, Balochi, and Bengali backgrounds, and profiles let you specify your own." },
      { q: "Can a Karachi family find an overseas match?", a: "Yes, one of the most common use cases. Families can register on behalf of a son or daughter, note openness to overseas matches, and browse or receive proposals from diaspora communities." },
      { q: "How does Karachi's rishta culture differ from Lahore's?", a: "It's notably more cosmopolitan — inter-ethnic marriages are common and generally accepted, education and career are weighted heavily, and biradari considerations are typically less rigid than in Lahore." },
      { q: "Is registration free for Karachi families?", a: "Yes — registration, browsing, and sending interest are all free, with no financial barrier for any family in Karachi or across Pakistan." }
    ],
    bodyContent: `
      <div class="prose max-w-none">
        <p class="text-lg text-gray-700 mb-6 leading-relaxed">Karachi doesn't resemble any other city in Pakistan — or arguably anywhere in the Muslim world. With around 22 million people, it's Pakistan's largest city and economic engine, and what defines it above all is its diversity. Every major Muslim ethnicity in the country has a significant presence: Urdu-speaking Muhajirs, Punjabis, Sindhis, Pashtuns, Balochis, Bengalis, and more, all calling Karachi home. That mix shapes how marriage works here just as much as it shapes everything else.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Marriage Culture in Karachi</h2>
        <p class="text-gray-700 mb-4 leading-relaxed">Karachi's history as a city of migrants — built largely by the Muhajir community after Partition, and continually reshaped by internal migration from every province — has made it notably more open to inter-ethnic marriage than most Pakistani cities. Education and professional standing often carry as much weight as family name in Karachi's marriage market.</p>
        <p class="text-gray-700 mb-6 leading-relaxed">The traditional rishta aunty still plays a role, but Karachi's professional culture has pushed many families toward more structured, independent approaches, including online searching, as long as it's conducted with the same seriousness as any traditional route.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Where Our Karachi Members Are</h2>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>DHA:</strong> Karachi's most prestigious district, popular across every ethnic background.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Clifton:</strong> Cosmopolitan, established, strong professional presence.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Gulshan-e-Iqbal:</strong> One of Karachi's largest and most diverse middle-class areas.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>North Nazimabad:</strong> A well-established, predominantly Urdu-speaking community.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>PECHS:</strong> Central, mixed-ethnic, and long associated with established Karachi families.</span></li>
        </ul>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Karachi's Multi-Ethnic Muslim Community</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">D'amour Muslim's real strength in Karachi is its openness to that full diversity. Muhajir families brought a strong emphasis on education and literary tradition; Punjabi families often arrived through business or government careers; Sindhi Muslims trace roots in the region back centuries; Pashtun communities, concentrated in areas like Korangi, bring their own deep sense of family honour. Members can specify — or leave open — the ethnic and linguistic background they're seeking.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">How the Platform Serves Karachi</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">Profile fields cover ethnicity, mother tongue, area, education, and profession — exactly the information Karachi families use to assess a proposal before contact. Moderation ensures every profile is genuine, and families or individuals can manage a profile directly. Communication opens only after mutual interest, preserving the propriety Karachi's families expect. The Masjid-e-Tooba, the largest single-dome mosque in the world, sits in the city's Defence area as a reminder that beneath the cosmopolitan energy, faith remains central.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Three Steps to a Karachi Rishta</h2>
        <div class="grid md:grid-cols-3 gap-4 mb-8">
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <span class="text-primary font-bold text-2xl block mb-2">1</span>
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Register & Build Your Profile</h3>
            <p class="text-gray-700 text-sm leading-relaxed">Include ethnic background, area, education, and criteria. Submit for review — typically completed within 24 hours.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <span class="text-primary font-bold text-2xl block mb-2">2</span>
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Browse Karachi Proposals</h3>
            <p class="text-gray-700 text-sm leading-relaxed">Filter by area, ethnicity, education, and age. Browse privately, at your own pace.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <span class="text-primary font-bold text-2xl block mb-2">3</span>
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Connect When Ready</h3>
            <p class="text-gray-700 text-sm leading-relaxed">Send interest, and secure messaging opens once both sides agree.</p>
          </div>
        </div>

        <blockquote class="border-l-4 border-primary pl-4 italic text-gray-600 my-6">Prophetic guidance urges choosing a spouse for their faith above all else — a principle that transcends any single ethnic community.</blockquote>

        <div class="bg-primary/5 rounded-2xl p-6 border border-primary/10 mt-8">
          <p class="text-gray-700 font-medium">Also explore: <a href="/online-rishta-pakistan" class="text-primary hover:underline">Rishta Across Pakistan</a> &bull; <a href="/rishta-lahore" class="text-primary hover:underline">Rishta in Lahore</a> &bull; <a href="/muslim-rishta" class="text-primary hover:underline">Muslim Rishta</a></p>
        </div>
      </div>
    `
  },
  {
    path: "/muslim-marriage-uk",
    pageTitle: "Muslim Marriage in the UK — A Complete Guide for British Muslims | D'amour Muslim",
    h1: "Muslim Marriage in the UK — What Every British Muslim Should Know",
    heroSubtitle: "Home to 3.9 million Muslims — the most ethnically diverse Muslim community in Europe. D'amour Muslim is built for every one of them.",
    metaDescription: "Muslim marriage in the UK — a complete guide for British Muslims, city-by-city coverage, and how D'amour Muslim serves the community. Free to join.",
    keywords: "muslim marriage uk, muslim marriage in the uk, british muslim marriage, uk muslim matrimony, halal marriage uk",
    canonicalPath: "/muslim-marriage-uk",
    ctaHeading: "Join Thousands of UK Muslims",
    ctaSubtext: "Register free and find your match, wherever you are in the UK.",
    relatedLinks: [
      { url: "/muslim-matrimony-london", label: "Muslim Singles in London" },
      { url: "/muslim-matrimony-birmingham", label: "Muslim Singles in Birmingham" },
      { url: "/british-pakistani-marriage", label: "British Pakistani Marriage" },
      { url: "/muslim-matchmaking", label: "Muslim Matchmaking" }
    ],
    pageFaqSchema: [
      { q: "How many Muslims live in the UK?", a: "The 2021 Census recorded approximately 3.9 million Muslims in England and Wales, around 6.5% of the population, making Muslims the second largest religious group after Christians." },
      { q: "Which UK cities have the biggest Muslim communities?", a: "London (over 1.1 million Muslims), Birmingham (around 340,000), Manchester (around 130,000), Bradford (around 130,000), Leicester (around 115,000), and Leeds (around 80,000). D'amour Muslim has dedicated pages for each." },
      { q: "Does D'amour Muslim only serve the UK?", a: "No — it has strong UK membership plus members across Pakistan and beyond. UK Muslims can filter for a UK-based spouse, or search more broadly if open to overseas matches." },
      { q: "How does British Muslim marriage differ from marriage in Pakistan?", a: "British Muslims navigate a distinct set of pressures — blending a British upbringing with family expectations often rooted in South Asian or other cultures, first vs second generation dynamics, and the challenge of meeting suitable Muslims in a predominantly non-Muslim social environment." },
      { q: "Are there in-person events for UK Muslim singles too?", a: "Yes — various marriage events and wali-facilitated introductions run across major UK cities. D'amour Muslim complements these by giving serious seekers a place to browse and connect between events, or as a primary search method." }
    ],
    pageFaqs: [
      { q: "How many Muslims live in the UK?", a: "The 2021 Census recorded approximately 3.9 million Muslims in England and Wales, around 6.5% of the population, making Muslims the second largest religious group after Christians." },
      { q: "Which UK cities have the biggest Muslim communities?", a: "London (over 1.1 million Muslims), Birmingham (around 340,000), Manchester (around 130,000), Bradford (around 130,000), Leicester (around 115,000), and Leeds (around 80,000). D'amour Muslim has dedicated pages for each." },
      { q: "Does D'amour Muslim only serve the UK?", a: "No — it has strong UK membership plus members across Pakistan and beyond. UK Muslims can filter for a UK-based spouse, or search more broadly if open to overseas matches." },
      { q: "How does British Muslim marriage differ from marriage in Pakistan?", a: "British Muslims navigate a distinct set of pressures — blending a British upbringing with family expectations often rooted in South Asian or other cultures, first vs second generation dynamics, and the challenge of meeting suitable Muslims in a predominantly non-Muslim social environment." },
      { q: "Are there in-person events for UK Muslim singles too?", a: "Yes — various marriage events and wali-facilitated introductions run across major UK cities. D'amour Muslim complements these by giving serious seekers a place to browse and connect between events, or as a primary search method." }
    ],
    bodyContent: `
      <div class="prose max-w-none">
        <p class="text-lg text-gray-700 mb-6 leading-relaxed">The UK is home to roughly 3.9 million Muslims — the most ethnically diverse Muslim population anywhere in Europe. Pakistani, Bangladeshi, Arab, Somali, Turkish, West African, and dozens of other communities live side by side, shaped equally by Islamic faith and British upbringing. For most of them, marriage is a religious duty, a family event, and a cultural statement all at once — and finding the right spouse has never been simple. D'amour Muslim exists to make it more manageable.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">British Muslim Identity and the Marriage Search</h2>
        <p class="text-gray-700 mb-4 leading-relaxed">The British Muslim experience sits at a productive tension between two identities: a British upbringing, education, and career on one side; Islamic values and family expectations rooted in South Asian, Arab, or African tradition on the other. This dual identity produces a genuinely unique marriage landscape — someone wants a partner who understands both worlds at once, and D'amour Muslim was designed for exactly that complexity.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Search by City Across the UK</h2>
        <div class="flex flex-wrap gap-2 mb-6">
          <a href="/muslim-matrimony-london" class="px-4 py-2 bg-primary/10 text-primary rounded-full text-sm font-medium hover:bg-primary/20 transition-colors">London</a>
          <a href="/muslim-matrimony-birmingham" class="px-4 py-2 bg-primary/10 text-primary rounded-full text-sm font-medium hover:bg-primary/20 transition-colors">Birmingham</a>
          <a href="/muslim-matrimony-manchester" class="px-4 py-2 bg-primary/10 text-primary rounded-full text-sm font-medium hover:bg-primary/20 transition-colors">Manchester</a>
          <a href="/muslim-matrimony-bradford" class="px-4 py-2 bg-primary/10 text-primary rounded-full text-sm font-medium hover:bg-primary/20 transition-colors">Bradford</a>
          <a href="/muslim-matrimony-leicester" class="px-4 py-2 bg-primary/10 text-primary rounded-full text-sm font-medium hover:bg-primary/20 transition-colors">Leicester</a>
          <a href="/muslim-matrimony-leeds" class="px-4 py-2 bg-primary/10 text-primary rounded-full text-sm font-medium hover:bg-primary/20 transition-colors">Leeds</a>
        </div>
        <p class="text-gray-700 mb-6 leading-relaxed">Each city page covers the local Muslim community, key areas, and how D'amour Muslim serves that specific population. The location filter is precise enough to be genuinely useful without limiting your options too tightly.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">What UK Muslims Prioritise in a Spouse</h2>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Deen and practice:</strong> Consistently the top factor — prayer, halal lifestyle, and genuine religious seriousness.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>British understanding:</strong> Many, especially second and third generation, want a partner who gets the British-Muslim experience.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Education and career:</strong> Consistently important, especially among the professional class.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Family background:</strong> A window into the values, habits, and expectations that will shape the marriage.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Cultural fit:</strong> Language, food, and community ties, whether within one's own ethnicity or open more broadly.</span></li>
        </ul>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">How D'amour Muslim Serves British Muslims</h2>
        <div class="grid md:grid-cols-2 gap-4 mb-6">
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">UK GDPR Compliant</h3>
            <p class="text-gray-700 text-sm leading-relaxed">Your data is handled lawfully and never sold, with full data rights for UK users.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">City-Based Search</h3>
            <p class="text-gray-700 text-sm leading-relaxed">Search London, Birmingham, Manchester, Bradford, Leicester, Leeds, and beyond.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Free for Every UK Muslim</h3>
            <p class="text-gray-700 text-sm leading-relaxed">No subscription required to browse, send interest, or communicate.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Family-Friendly</h3>
            <p class="text-gray-700 text-sm leading-relaxed">Parents can manage a profile, and communication opens only after mutual interest.</p>
          </div>
        </div>

        <blockquote class="border-l-4 border-primary pl-4 italic text-gray-600 my-6">Spouses are described in the Quran as a source of comfort for one another, with love and mercy placed between them — a description that transcends any single culture or postcode.</blockquote>

        <div class="bg-primary/5 rounded-2xl p-6 border border-primary/10 mt-8">
          <p class="text-gray-700 font-medium">Find your city: <a href="/muslim-matrimony-london" class="text-primary hover:underline">London</a> &bull; <a href="/muslim-matrimony-birmingham" class="text-primary hover:underline">Birmingham</a> &bull; <a href="/british-pakistani-marriage" class="text-primary hover:underline">British Pakistani Marriage</a> &bull; <a href="/muslim-matchmaking" class="text-primary hover:underline">Muslim Matchmaking</a></p>
        </div>
      </div>
    `
  },
  {
    path: "/british-pakistani-marriage",
    pageTitle: "British Pakistani Marriage — Navigating the Search With Confidence | D'amour Muslim",
    h1: "British Pakistani Marriage — Between Two Worlds, Finding the Right One",
    heroSubtitle: "British Pakistanis carry a dual identity into every big decision, marriage included. D'amour Muslim is built for that full complexity, without judgment.",
    metaDescription: "British Pakistani marriage — navigating biradari expectations, UK vs Pakistan dynamics, and dual identity. D'amour Muslim serves this community with understanding. Free to join.",
    keywords: "british pakistani marriage, british pakistani rishta, british pakistani matrimonial, uk pakistani marriage, british pakistani marriage site",
    canonicalPath: "/british-pakistani-marriage",
    ctaHeading: "Find Your British Pakistani Match",
    ctaSubtext: "Register free on a platform that understands the British Pakistani experience.",
    relatedLinks: [
      { url: "/muslim-rishta", label: "Muslim Rishta" },
      { url: "/online-rishta-pakistan", label: "Rishta Across Pakistan" },
      { url: "/muslim-marriage-uk", label: "Muslim Marriage UK" },
      { url: "/muslim-matchmaking", label: "Muslim Matchmaking" }
    ],
    pageFaqSchema: [
      { q: "Can I find a British-born partner specifically?", a: "Yes — a significant share of members are British-born, particularly from Birmingham, Bradford, Manchester, London, and Leeds. Many state their background in their bio, and you can specify this in your own criteria too." },
      { q: "Can families in Pakistan search specifically for UK-based matches?", a: "Yes — very common. Families in Pakistan can register on behalf of their child, mark them as seeking a UK-based partner, and browse British Pakistani members who are open to that." },
      { q: "How do I handle family expectations around biradari?", a: "Profile fields cover biradari, cultural background, family values, and expected family involvement — so both sides know where they stand from the outset, reducing the risk of mismatched expectations later." },
      { q: "Are there profiles from specific British Pakistani cities?", a: "Yes — Birmingham, Bradford, Manchester, London, Leeds, and Leicester are all represented, and you can filter by city." },
      { q: "Does the platform support Pakistan-based families searching for a UK match?", a: "Yes — connecting Pakistan-based families with the British Pakistani diaspora is one of the platform's core use cases." }
    ],
    pageFaqs: [
      { q: "Can I find a British-born partner specifically?", a: "Yes — a significant share of members are British-born, particularly from Birmingham, Bradford, Manchester, London, and Leeds. Many state their background in their bio, and you can specify this in your own criteria too." },
      { q: "Can families in Pakistan search specifically for UK-based matches?", a: "Yes — very common. Families in Pakistan can register on behalf of their child, mark them as seeking a UK-based partner, and browse British Pakistani members who are open to that." },
      { q: "How do I handle family expectations around biradari?", a: "Profile fields cover biradari, cultural background, family values, and expected family involvement — so both sides know where they stand from the outset, reducing the risk of mismatched expectations later." },
      { q: "Are there profiles from specific British Pakistani cities?", a: "Yes — Birmingham, Bradford, Manchester, London, Leeds, and Leicester are all represented, and you can filter by city." },
      { q: "Does the platform support Pakistan-based families searching for a UK match?", a: "Yes — connecting Pakistan-based families with the British Pakistani diaspora is one of the platform's core use cases." }
    ],
    bodyContent: `
      <div class="prose max-w-none">
        <p class="text-lg text-gray-700 mb-6 leading-relaxed">Being British and Pakistani means living comfortably in two worlds — until marriage comes up, and suddenly you feel caught between them. You carry a serious Islamic faith and a Pakistani heritage you value, alongside a British education and sense of self. That single search has to satisfy your own heart, your family's expectations, and your community's standards, all at once. D'amour Muslim exists for exactly this moment.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">The British Pakistani Marriage Experience</h2>
        <p class="text-gray-700 mb-4 leading-relaxed">British Pakistanis are the UK's second largest Muslim ethnic group, over 1.6 million strong, concentrated in Birmingham, Bradford, Manchester, London, Leeds, and Leicester. Marriage remains a communal event, not just a personal one — but for second and third generations, the traditional route through family networks and mosque connections has become harder to navigate given work schedules and dispersed communities.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Balancing Family Expectations and Personal Fit</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">The search often involves negotiating two legitimate sets of concerns: parents' preferences around biradari, region, or UK vs Pakistan-based partners, and the individual's own priorities around shared values and personality. D'amour Muslim's profile fields let both dimensions be stated transparently — biradari, cultural background, expected family involvement, and personal criteria — giving everyone enough information before an introduction is even made.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">UK-Born or Pakistan-Based — Both Are Valid</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">One of the biggest decisions British Pakistanis face is whether to consider a partner from Pakistan or specifically look for someone with a British upbringing. Both are entirely valid choices, and D'amour Muslim has substantial membership on both sides — UK-based members open to overseas matches can connect directly with Pakistan-based profiles, and those wanting a UK-born partner can indicate that in their search.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">How D'amour Muslim Helps</h2>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>City-specific search:</strong> Birmingham, Bradford, Manchester, London, Leeds, or any UK city.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Pakistan connection:</strong> Reach or receive proposals from Pakistan-based families directly.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Family-managed profiles:</strong> Parents can run the whole process on behalf of their child.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Transparent background fields:</strong> Biradari, mother tongue, religious practice, and family values, upfront.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Complete privacy:</strong> No community gossip, no aunty knowing you registered.</span></li>
        </ul>

        <blockquote class="border-l-4 border-primary pl-4 italic text-gray-600 my-6">A well-known hadith teaches that while wealth, family standing, and appearance often draw attention, choosing a spouse for their faith is the wiser path.</blockquote>

        <p class="text-gray-700 mb-6 leading-relaxed">The British Pakistani marriage search is one of the more specific and layered searches in the Muslim world. D'amour Muslim isn't a repurposed dating app — it's built to understand the real dynamics of this culture, with the seriousness it deserves.</p>

        <div class="bg-primary/5 rounded-2xl p-6 border border-primary/10 mt-8">
          <p class="text-gray-700 font-medium">Also explore: <a href="/muslim-rishta" class="text-primary hover:underline">Muslim Rishta</a> &bull; <a href="/online-rishta-pakistan" class="text-primary hover:underline">Rishta Across Pakistan</a> &bull; <a href="/muslim-marriage-uk" class="text-primary hover:underline">Muslim Marriage UK</a> &bull; <a href="/muslim-matchmaking" class="text-primary hover:underline">Muslim Matchmaking</a></p>
        </div>
      </div>
    `
  },
  {
    path: "/muslim-singles-uk",
    pageTitle: "Muslim Singles UK — The Halal Path Forward | D'amour Muslim",
    h1: "Muslim Singles UK — A Halal Way Forward Exists",
    heroSubtitle: "Being a single Muslim in the UK comes with its own pressures. D'amour Muslim offers a structured, serious, halal space to start your journey toward Nikah, at your own pace.",
    metaDescription: "Muslim singles UK — find verified singles serious about marriage. D'amour Muslim is free, halal, and built for UK Muslims ready to take the next step.",
    keywords: "muslim singles uk, single muslims uk, muslim single women uk, muslim single men uk, uk muslim singles marriage",
    canonicalPath: "/muslim-singles-uk",
    ctaHeading: "Take the First Step",
    ctaSubtext: "Join free — thousands of UK Muslim singles are already searching.",
    relatedLinks: [
      { url: "/muslim-marriage-uk", label: "Muslim Marriage UK" },
      { url: "/find-muslim-spouse", label: "Find a Spouse" },
      { url: "/muslim-matchmaking", label: "Muslim Matchmaking" },
      { url: "/halal-marriage", label: "Halal Marriage Platform" }
    ],
    pageFaqSchema: [
      { q: "Is this platform specifically for marriage, not casual dating?", a: "Yes, entirely. D'amour Muslim exists purely to help single Muslims find a spouse. There's no swipe culture and no ambiguity about intent — everyone here is here for Nikah." },
      { q: "Are there really that many Muslim singles in the UK looking for marriage?", a: "Yes — hundreds of thousands, spread across London, Birmingham, Manchester, Bradford, Leicester, Leeds, and beyond. The challenge isn't a shortage of people — it's finding the right structured, halal space to meet them." },
      { q: "How do I actually get started?", a: "Register free, verify your email, complete your profile honestly, and submit for review. Once approved (usually within 24 hours), browse verified singles and send interest — messaging opens once it's mutual." },
      { q: "Is it Islamically fine to use a matrimonial site as a single Muslim?", a: "Yes, provided the intention is marriage, communication stays within Islamic etiquette, and family involvement is included when appropriate. D'amour Muslim is designed around exactly those conditions." },
      { q: "How is this different from apps aimed at Muslim singles generally?", a: "D'amour Muslim is a matrimonial platform, not a singles app. Every feature — review, gated messaging, family accounts — is built around one goal: helping serious Muslims reach Nikah." }
    ],
    pageFaqs: [
      { q: "Is this platform specifically for marriage, not casual dating?", a: "Yes, entirely. D'amour Muslim exists purely to help single Muslims find a spouse. There's no swipe culture and no ambiguity about intent — everyone here is here for Nikah." },
      { q: "Are there really that many Muslim singles in the UK looking for marriage?", a: "Yes — hundreds of thousands, spread across London, Birmingham, Manchester, Bradford, Leicester, Leeds, and beyond. The challenge isn't a shortage of people — it's finding the right structured, halal space to meet them." },
      { q: "How do I actually get started?", a: "Register free, verify your email, complete your profile honestly, and submit for review. Once approved (usually within 24 hours), browse verified singles and send interest — messaging opens once it's mutual." },
      { q: "Is it Islamically fine to use a matrimonial site as a single Muslim?", a: "Yes, provided the intention is marriage, communication stays within Islamic etiquette, and family involvement is included when appropriate. D'amour Muslim is designed around exactly those conditions." },
      { q: "How is this different from apps aimed at Muslim singles generally?", a: "D'amour Muslim is a matrimonial platform, not a singles app. Every feature — review, gated messaging, family accounts — is built around one goal: helping serious Muslims reach Nikah." }
    ],
    bodyContent: `
      <div class="prose max-w-none">
        <p class="text-lg text-gray-700 mb-6 leading-relaxed">If you're a single Muslim in the UK, you already know the weight of it — the questions from family that start soft and get pointed, the wedding introductions that go nowhere, the quiet frustration of taking your deen seriously and still not knowing where to begin. D'amour Muslim was built directly in response to that experience, and you're far from the only one carrying it.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Why the Search Is Genuinely Hard</h2>
        <div class="grid md:grid-cols-2 gap-4 mb-6">
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Limited Halal Social Circles</h3>
            <p class="text-gray-700 text-sm leading-relaxed">University, work, and social life in the UK are largely mixed environments where purposeful, halal marriage-seeking doesn't come naturally.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Family Pressure Without a Path</h3>
            <p class="text-gray-700 text-sm leading-relaxed">Pressure to marry, without a structured way forward, tends to create anxiety rather than results.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100 md:col-span-2">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Balancing Deen, Culture, and British Identity</h3>
            <p class="text-gray-700 text-sm leading-relaxed">The challenge isn't just finding someone — it's finding someone who fits the whole picture, religiously and culturally compatible, and genuinely British enough to understand your life.</p>
          </div>
        </div>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">A Halal Way Out of Singlehood</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">Islam doesn't leave this question unanswered. Making the intention, seeking through legitimate means, involving family, and moving forward when a suitable match appears — this is a clear, dignified path. A purpose-built, moderated platform is exactly the kind of structured, legitimate means Islamic principles support. The path exists — it just needs a first step.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">What D'amour Muslim Offers</h2>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Completely free:</strong> No subscription, no paywall.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Verified profiles only:</strong> Manual review before anything goes live.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>City-based search:</strong> London, Birmingham, Manchester, Bradford, Leicester, Leeds, or nationwide.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Halal by design:</strong> No unsolicited messages, no free mixing.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Family-friendly:</strong> Involve your wali from the beginning.</span></li>
        </ul>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Getting Started</h2>
        <div class="grid md:grid-cols-2 gap-4 mb-8">
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <span class="text-primary font-bold text-xl block mb-2">Step 1</span>
            <p class="text-gray-700 text-sm leading-relaxed"><strong>Register free</strong> — name, email, and a quick verification.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <span class="text-primary font-bold text-xl block mb-2">Step 2</span>
            <p class="text-gray-700 text-sm leading-relaxed"><strong>Complete your profile</strong> honestly, then submit for review.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <span class="text-primary font-bold text-xl block mb-2">Step 3</span>
            <p class="text-gray-700 text-sm leading-relaxed"><strong>Browse verified profiles</strong> — by city, age, and background.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <span class="text-primary font-bold text-xl block mb-2">Step 4</span>
            <p class="text-gray-700 text-sm leading-relaxed"><strong>Send interest and connect</strong> once it's mutual.</p>
          </div>
        </div>

        <blockquote class="border-l-4 border-primary pl-4 italic text-gray-600 my-6">Marriage is described in Islamic tradition as completing half of one's faith — a reminder that this pursuit, done sincerely, is itself an act of worship.</blockquote>

        <p class="text-gray-700 mb-6 leading-relaxed">Being a single Muslim in the UK, serious about marriage but unsure of the path, is one of the most widely shared experiences in the British Muslim community. It's not a personal failing — it's a structural challenge with a structured solution, and D'amour Muslim exists precisely for it.</p>

        <div class="bg-primary/5 rounded-2xl p-6 border border-primary/10 mt-8">
          <p class="text-gray-700 font-medium">Also explore: <a href="/muslim-marriage-uk" class="text-primary hover:underline">Muslim Marriage UK</a> &bull; <a href="/find-muslim-spouse" class="text-primary hover:underline">Find a Spouse</a> &bull; <a href="/muslim-matchmaking" class="text-primary hover:underline">Muslim Matchmaking</a> &bull; <a href="/halal-marriage" class="text-primary hover:underline">Halal Marriage Platform</a></p>
        </div>
      </div>
    `
  },
  {
    path: "/muslim-second-marriage",
    pageTitle: "Muslim Second Marriage — A New Chapter Islam Fully Supports | D'amour Muslim",
    h1: "Muslim Second Marriage — A Fresh Start, Fully Honoured in Islam",
    heroSubtitle: "Whether you're widowed, divorced, or considering a second marriage, Islam supports your journey without reservation. D'amour Muslim offers a judgment-free space to find your next chapter.",
    metaDescription: "Muslim second marriage — the Islamic view on remarriage after widowhood or divorce, polygyny under Quran 4:3, and how D'amour Muslim supports second-marriage seekers without judgment. Free to join.",
    keywords: "muslim second marriage, muslim second wife, second marriage in islam, muslim remarriage, second nikah islam, muslim widow marriage",
    canonicalPath: "/muslim-second-marriage",
    ctaHeading: "Begin Your Next Chapter",
    ctaSubtext: "Register free on a platform with zero judgment and full support for second-marriage seekers.",
    relatedLinks: [
      { url: "/divorced-muslim-marriage", label: "Divorced Muslim Marriage" },
      { url: "/muslim-marriage", label: "The Islamic Basis for Marriage" },
      { url: "/muslim-matchmaking", label: "Muslim Matchmaking" },
      { url: "/halal-marriage", label: "Halal Marriage Platform" }
    ],
    pageFaqSchema: [
      { q: "Is remarrying acceptable in Islam?", a: "Absolutely. Remarriage after widowhood or divorce isn't just allowed — it's encouraged. The Prophet ﷺ himself remarried after Khadijah's (ra) passing, as did many of his companions. There's no concept of a marriage limit in Islamic teaching." },
      { q: "Can widows and widowers find a spouse here?", a: "Yes. The profile includes a marital status field for widowed members, and D'amour Muslim treats these searches with exactly the same seriousness as any first marriage." },
      { q: "Does the platform support polygyny searches?", a: "D'amour Muslim serves all Shariah-permitted forms of marriage. Polygyny, under the just-treatment conditions set out in Quran 4:3, is one of them, and both a man seeking a second wife and a woman open to that arrangement are welcome here." },
      { q: "Will I be judged for seeking a second marriage?", a: "No. There's no rating system, no visible label marking previous marriage, and the moderation team treats every legitimate Islamic marriage path with identical respect." },
      { q: "Do I need to disclose my marital history?", a: "Yes — honesty here is both an Islamic obligation and a platform requirement. The marital status field must be filled in accurately so potential matches can make an informed decision." }
    ],
    pageFaqs: [
      { q: "Is remarrying acceptable in Islam?", a: "Absolutely. Remarriage after widowhood or divorce isn't just allowed — it's encouraged. The Prophet ﷺ himself remarried after Khadijah's (ra) passing, as did many of his companions. There's no concept of a marriage limit in Islamic teaching." },
      { q: "Can widows and widowers find a spouse here?", a: "Yes. The profile includes a marital status field for widowed members, and D'amour Muslim treats these searches with exactly the same seriousness as any first marriage." },
      { q: "Does the platform support polygyny searches?", a: "D'amour Muslim serves all Shariah-permitted forms of marriage. Polygyny, under the just-treatment conditions set out in Quran 4:3, is one of them, and both a man seeking a second wife and a woman open to that arrangement are welcome here." },
      { q: "Will I be judged for seeking a second marriage?", a: "No. There's no rating system, no visible label marking previous marriage, and the moderation team treats every legitimate Islamic marriage path with identical respect." },
      { q: "Do I need to disclose my marital history?", a: "Yes — honesty here is both an Islamic obligation and a platform requirement. The marital status field must be filled in accurately so potential matches can make an informed decision." }
    ],
    bodyContent: `
      <div class="prose max-w-none">
        <p class="text-lg text-gray-700 mb-6 leading-relaxed">A second marriage in Islam carries no lesser weight than a first. It's not a compromise or a consolation — it's a genuine fresh start, fully sanctioned by Allah and reflected in the Prophet's ﷺ own life. The fear of judgment and the uncertainty of starting again are real, but the path forward is clear, and D'amour Muslim is here to walk it with you.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">The Islamic View on Remarriage</h2>
        <p class="text-gray-700 mb-4 leading-relaxed">Islam's stance on second marriages — after widowhood, divorce, or as part of a polygynous marriage — is clear and compassionate. The Prophet ﷺ lost his beloved wife Khadijah (ra) after 25 years together and remarried afterward. Many of his closest companions were widowers or divorced men who went on to remarry. Nothing in the tradition stigmatises this — if anything, it's normalised and honoured.</p>
        <p class="text-gray-700 mb-6 leading-relaxed">On polygyny specifically, the Quran permits a man to marry up to four wives while placing a serious condition on that permission: the obligation to treat every wife justly (Quran 4:3). D'amour Muslim doesn't rule on individual situations but does provide a platform for every form of marriage that is Shariah-compliant.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Who Seeks a Second Marriage</h2>
        <div class="grid md:grid-cols-2 gap-4 mb-6">
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Widows and Widowers</h3>
            <p class="text-gray-700 text-sm leading-relaxed">Losing a spouse is devastating, and after mourning, the desire to remarry is natural and Islamically encouraged. D'amour Muslim treats widowed members with the same seriousness as anyone else.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Divorced Muslims</h3>
            <p class="text-gray-700 text-sm leading-relaxed">Divorce exists because marrying the wrong person can cause real harm. Seeking to remarry after divorce shows resilience, not failure — and there's a significant, sincere community of divorced members here.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100 md:col-span-2">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Those Considering Polygyny</h3>
            <p class="text-gray-700 text-sm leading-relaxed">A married man seeking a second wife under the Quranic conditions of just treatment, or a woman willing to enter that arrangement with full informed consent, are both exercising a legitimate religious choice — and both are welcome here.</p>
          </div>
        </div>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">The Real Challenges</h2>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Social stigma:</strong> Cultural stigma around second marriages, especially for divorced women, is real in some communities — a judgment-free platform matters.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Children from a previous marriage:</strong> Finding a spouse genuinely enthusiastic about a step-parent role requires honesty from the start.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Family opposition:</strong> Some families push back, particularly on a woman's second marriage — navigating this with dignity requires exactly the private, structured process D'amour Muslim provides.</span></li>
        </ul>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">How the Platform Supports You</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">The marital status field covers single, divorced, widowed, and openness to polygynous arrangements, with no visible badge that marks you differently. What you share, and when, stays within your control. The moderation team treats every member equally, regardless of marital history.</p>

        <blockquote class="border-l-4 border-primary pl-4 italic text-gray-600 my-6">Choosing a spouse for their faith above wealth, lineage, or appearance is guidance that applies to a first marriage — or a second, or a third.</blockquote>

        <div class="bg-primary/5 rounded-2xl p-6 border border-primary/10 mt-8">
          <p class="text-gray-700 font-medium">Also explore: <a href="/divorced-muslim-marriage" class="text-primary hover:underline">Divorced Muslim Marriage</a> &bull; <a href="/muslim-marriage" class="text-primary hover:underline">The Islamic Basis for Marriage</a> &bull; <a href="/muslim-matchmaking" class="text-primary hover:underline">Muslim Matchmaking</a></p>
        </div>
      </div>
    `
  },
  {
    path: "/divorced-muslim-marriage",
    pageTitle: "Divorced Muslim Marriage — Moving Forward With Dignity | D'amour Muslim",
    h1: "Divorced Muslim Marriage — Islam Gives You a Way Forward",
    heroSubtitle: "Divorce isn't a failure in Islam — it's an acknowledgement that some marriages don't work, and a door to a better one. D'amour Muslim supports divorced Muslims with privacy and zero judgment.",
    metaDescription: "Divorced Muslim marriage — the Islamic view on divorce and remarriage, practical considerations, and how D'amour Muslim supports divorced Muslims. Free to join.",
    keywords: "divorced muslim marriage, muslim divorce remarriage, divorced muslim singles, divorced muslim uk, muslim marriage after divorce, muslim divorcee",
    canonicalPath: "/divorced-muslim-marriage",
    ctaHeading: "Your Next Chapter Starts Here",
    ctaSubtext: "Register free — no stigma, just a serious path toward a better marriage.",
    relatedLinks: [
      { url: "/muslim-second-marriage", label: "Muslim Second Marriage" },
      { url: "/trusted-muslim-matchmaking", label: "Our Safety Approach" },
      { url: "/halal-marriage", label: "Halal Marriage Platform" },
      { url: "/muslim-matchmaking", label: "Muslim Matchmaking" }
    ],
    pageFaqSchema: [
      { q: "Is remarrying after divorce allowed in Islam?", a: "Yes, fully permitted and encouraged. Divorce is a legitimate exit from a marriage that isn't working, and the Islamic system explicitly provides a route back to marriage afterward — it's treated as a last resort, not a permanent mark against you." },
      { q: "Does D'amour Muslim accept divorced members?", a: "Yes, without any lesser treatment. Divorced Muslims are a significant part of the community here and are treated with the same seriousness as anyone else." },
      { q: "Do I have to disclose that I'm divorced?", a: "Yes — full honesty is both an Islamic obligation and a platform requirement. Concealing it would be a form of deception that isn't permitted, and transparency protects both you and any future match." },
      { q: "Are there many divorced Muslims here looking to remarry?", a: "Yes, a meaningful and growing segment of members are divorced Muslims seeking a better, more compatible second marriage." },
      { q: "What about iddah — can I start searching during it?", a: "Iddah must be completed before a divorced or widowed woman can accept a new proposal. Some scholars view early, passive registration during iddah as acceptable preparation rather than a formal step — but we'd recommend checking with your own scholar for guidance specific to your situation." }
    ],
    pageFaqs: [
      { q: "Is remarrying after divorce allowed in Islam?", a: "Yes, fully permitted and encouraged. Divorce is a legitimate exit from a marriage that isn't working, and the Islamic system explicitly provides a route back to marriage afterward — it's treated as a last resort, not a permanent mark against you." },
      { q: "Does D'amour Muslim accept divorced members?", a: "Yes, without any lesser treatment. Divorced Muslims are a significant part of the community here and are treated with the same seriousness as anyone else." },
      { q: "Do I have to disclose that I'm divorced?", a: "Yes — full honesty is both an Islamic obligation and a platform requirement. Concealing it would be a form of deception that isn't permitted, and transparency protects both you and any future match." },
      { q: "Are there many divorced Muslims here looking to remarry?", a: "Yes, a meaningful and growing segment of members are divorced Muslims seeking a better, more compatible second marriage." },
      { q: "What about iddah — can I start searching during it?", a: "Iddah must be completed before a divorced or widowed woman can accept a new proposal. Some scholars view early, passive registration during iddah as acceptable preparation rather than a formal step — but we'd recommend checking with your own scholar for guidance specific to your situation." }
    ],
    bodyContent: `
      <div class="prose max-w-none">
        <p class="text-lg text-gray-700 mb-6 leading-relaxed">Divorce happens, and in Islam it isn't treated as a catastrophe — it's a provision. Allah built in a way for a harmful marriage to end with dignity, so both people can move on. The stigma some communities attach to divorce is cultural, not Islamic. If you're a divorced Muslim ready to search again, D'amour Muslim is built for exactly that journey.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Islam's View on Divorce and Remarriage</h2>
        <p class="text-gray-700 mb-4 leading-relaxed">Talaq is a structured, graduated process designed to allow reconciliation where possible, and a dignified exit where it isn't. The Quran addresses divorce with genuine compassion, describing Allah's capacity to enrich each party after a separation from His own abundance. After iddah is completed, a divorced woman is free to remarry; a divorced man may remarry right away. Islam sets no shame and no arbitrary limit on remarriage.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">The Emotional Reality of Starting Again</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">A search after divorce feels different from a first search. You arrive with clearer priorities, shaped sometimes painfully by experience — which is both a gift and a weight. You may also be managing co-parenting, family opinion, or simple exhaustion. D'amour Muslim doesn't pretend these things away — it offers a structured, private, judgment-free space to search at your own pace.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Things Worth Thinking Through Before Remarrying</h2>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Iddah completion:</strong> Confirm this is fully complete before entering any new marriage engagement.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Children and custody:</strong> Being upfront about your situation lets a potential spouse choose with clear eyes.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Honesty with matches:</strong> Enough transparency about the previous marriage to allow genuine compatibility assessment.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Emotional readiness:</strong> The right time to begin again is when you've genuinely processed what came before — not simply when family pressure suggests you should.</span></li>
        </ul>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">How D'amour Muslim Supports Divorced Members</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">The marital status field lets you represent yourself honestly, with no visible label marking you out. Your history only appears in details shared with mutual matches. The moderation team treats divorced members equally, and free access means financial strain — sometimes a practical reality after divorce — is never a barrier to using the platform fully.</p>

        <blockquote class="border-l-4 border-primary pl-4 italic text-gray-600 my-6">The Quran reassures that Allah's mercy is never out of reach for anyone who turns back to Him — every closed door tends to open a new one.</blockquote>

        <div class="bg-primary/5 rounded-2xl p-6 border border-primary/10 mt-8">
          <p class="text-gray-700 font-medium">Also explore: <a href="/muslim-second-marriage" class="text-primary hover:underline">Muslim Second Marriage</a> &bull; <a href="/trusted-muslim-matchmaking" class="text-primary hover:underline">Our Safety Approach</a> &bull; <a href="/halal-marriage" class="text-primary hover:underline">Halal Marriage Platform</a></p>
        </div>
      </div>
    `
  },
  {
    path: "/muslim-marriage-over-30",
    pageTitle: "Muslim Marriage Over 30 — Later Is Not Too Late | D'amour Muslim",
    h1: "Muslim Marriage Over 30 — Islam Sets No Deadline, and Neither Do We",
    heroSubtitle: "Marrying in your 30s is more common than ever among British Muslims, and often leads to more grounded, compatible marriages. D'amour Muslim serves Muslims at every life stage.",
    metaDescription: "Muslim marriage over 30 — why more Muslims marry later, the real advantages of it, Islam's view, and how D'amour Muslim serves over-30 Muslims. Free to join.",
    keywords: "muslim marriage over 30, muslim marriage 30s, muslim marriage older, marrying late islam, muslim marriage 35, late muslim marriage",
    canonicalPath: "/muslim-marriage-over-30",
    ctaHeading: "Your Match Is Still Out There",
    ctaSubtext: "Register free — thousands of Muslims in their 30s and 40s are searching right now.",
    relatedLinks: [
      { url: "/muslim-singles-uk", label: "Muslim Singles UK" },
      { url: "/muslim-matchmaking", label: "Muslim Matchmaking" },
      { url: "/find-muslim-spouse", label: "Find a Spouse" },
      { url: "/verified-muslim-profiles", label: "Verified Profiles" }
    ],
    pageFaqSchema: [
      { q: "Is there an age cap on using D'amour Muslim?", a: "No upper limit at all. The platform serves Muslim marriage seekers of every age, from young adults through their 40s, 50s, and beyond, with equal functionality and respect." },
      { q: "Are there many members in their 30s and 40s?", a: "Yes — a large and growing share of the platform, reflecting longer education, later career establishment, and the presence of divorced or widowed members seeking a second marriage." },
      { q: "Is marrying later seen as shameful in Islam?", a: "No — there's no Islamic basis for that. The Prophet ﷺ married Khadijah (ra) when she was around 40. The shame around late marriage is a cultural construct, not a religious one." },
      { q: "Can I filter by age range?", a: "Yes — set a minimum and maximum age to search within your own demographic, or any range that reflects your genuine preferences." },
      { q: "What's the biggest challenge for over-30 Muslim marriage seekers?", a: "A narrower pool of never-married candidates, cultural pressure treating delay as unusual, and needing a more precisely compatible match given clearer life priorities. D'amour Muslim addresses this with a large national pool including both never-married and previously-married members." }
    ],
    pageFaqs: [
      { q: "Is there an age cap on using D'amour Muslim?", a: "No upper limit at all. The platform serves Muslim marriage seekers of every age, from young adults through their 40s, 50s, and beyond, with equal functionality and respect." },
      { q: "Are there many members in their 30s and 40s?", a: "Yes — a large and growing share of the platform, reflecting longer education, later career establishment, and the presence of divorced or widowed members seeking a second marriage." },
      { q: "Is marrying later seen as shameful in Islam?", a: "No — there's no Islamic basis for that. The Prophet ﷺ married Khadijah (ra) when she was around 40. The shame around late marriage is a cultural construct, not a religious one." },
      { q: "Can I filter by age range?", a: "Yes — set a minimum and maximum age to search within your own demographic, or any range that reflects your genuine preferences." },
      { q: "What's the biggest challenge for over-30 Muslim marriage seekers?", a: "A narrower pool of never-married candidates, cultural pressure treating delay as unusual, and needing a more precisely compatible match given clearer life priorities. D'amour Muslim addresses this with a large national pool including both never-married and previously-married members." }
    ],
    bodyContent: `
      <div class="prose max-w-none">
        <p class="text-lg text-gray-700 mb-6 leading-relaxed">Let's say it plainly: some communities carry a narrative that not marrying by your late twenties means you've missed a window, or that something must be wrong. That narrative has no basis in Islamic teaching. The Prophet ﷺ married Khadijah (ra), roughly 40 at the time, in what was by every account the most devoted marriage of his life. If you're a Muslim in your 30s still searching, you're not late — you're right on time.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Why More Muslims Marry in Their 30s</h2>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Extended education:</strong> Degrees and postgraduate training routinely stretch into the mid-to-late twenties.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Career establishment:</strong> Reaching a stable footing in medicine, law, or business often takes until the early 30s.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Cost of living:</strong> Establishing a home in major UK cities is a genuine structural constraint, not a personal failing.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Genuine difficulty finding the right person:</strong> Often a sign of healthy standards, not a problem needing fixing.</span></li>
        </ul>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">The Real Advantages of Marrying Later</h2>
        <div class="grid md:grid-cols-2 gap-4 mb-6">
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Clarity of Purpose</h3>
            <p class="text-gray-700 text-sm leading-relaxed">By your 30s, you know what you need and what you can't compromise on — leading to more honest profiles and better decisions.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Emotional Maturity</h3>
            <p class="text-gray-700 text-sm leading-relaxed">Patience, communication, and prioritising another person's needs are skills built through life experience.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Financial Stability</h3>
            <p class="text-gray-700 text-sm leading-relaxed">A stronger financial footing reduces one of the most common early-marriage stressors.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Genuine Seriousness</h3>
            <p class="text-gray-700 text-sm leading-relaxed">A Muslim in their 30s actively searching is, almost by definition, serious about getting married.</p>
          </div>
        </div>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Islam Sets No Age Limit</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">There is no concept in Islamic jurisprudence of being "too old" for marriage. The Sunnah encourages marriage for anyone able to pursue it, at any age, as a mercy and a blessing. What matters is seeking a spouse good for your deen and your worldly life, conducted with sincerity and patience — the timing is between you and Allah.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">What Over-30s Look For</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">Practical, day-to-day compatibility tends to matter more than surface attraction at this stage — shared views on practising Islam in a British context, financial alignment, and mutual respect for each other's careers often outweigh cultural background alone. D'amour Muslim's detailed profile fields surface exactly this kind of information.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">How D'amour Muslim Serves Over-30 Muslims</h2>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Age filters:</strong> Search from 30 upward, or any range that fits your preferences.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>All life stages represented:</strong> Never-married, divorced, and widowed members across every age group.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Compatibility-first profiles:</strong> Career, practice, and family plans surfaced clearly, not just age and photo.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>No urgency imposed:</strong> Search and engage entirely at your own pace.</span></li>
        </ul>

        <blockquote class="border-l-4 border-primary pl-4 italic text-gray-600 my-6">The Quran describes Allah guiding those who felt lost — a reminder that the right time arrives when He wills it, and sincerity is what carries you there.</blockquote>

        <div class="bg-primary/5 rounded-2xl p-6 border border-primary/10 mt-8">
          <p class="text-gray-700 font-medium">Also explore: <a href="/muslim-singles-uk" class="text-primary hover:underline">Muslim Singles UK</a> &bull; <a href="/muslim-matchmaking" class="text-primary hover:underline">Muslim Matchmaking</a> &bull; <a href="/find-muslim-spouse" class="text-primary hover:underline">Find a Spouse</a> &bull; <a href="/verified-muslim-profiles" class="text-primary hover:underline">Verified Profiles</a></p>
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



app.get("/onboarding", isLoggedIn, findUser, (req, res) => {
  const user = req.userData;

  // Check if user has completed onboarding (has all required fields from 5 steps)
  // Step 1: profileFor, gender, username
  // Step 2: name, age, height, maritalStatus  
  // Step 3: city, country
  // Step 4: highestEducation, work
  // Step 5: lookingForASpouseThatIs, aboutMe, contact
  if (user.profileSlug && user.name && user.age && user.height && 
      user.maritalStatus && user.city && user.country && 
      user.highestEducation && user.work && 
      user.lookingForASpouseThatIs && user.aboutMe && user.contact) {
    return res.redirect(`/account/info`);
  }

  res.render("onboarding-new", { user });
});
// **NEW**: Save onboarding step
app.post("/api/onboarding/save", isLoggedIn, findUser, async (req, res) => {
  try {
    const user = req.userData;
    const { step, data } = req.body;

    

    // Server-side validation for step 6 (phone number)
    if (Number(step) === 6) {
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

    await user.save();

    // Update session
    req.session.user = user;

    res.json({
      success: true,
      message: `Step ${step} completed successfully!`,
      isLastStep: Number(step) === 6,
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

app.get("/profiles",requireOnboardingComplete, async (req, res) => {
  // Pagination params
  const page = parseInt(req.query.page) > 0 ? parseInt(req.query.page) : 1;
  const limit = 12;
  const skip = (page - 1) * limit;

  // Detect visitor country via Cloudflare header or MOCK_COUNTRY env
  const detectedCountryCode = detectCountry(req);
  const geoFilter = buildGeoFilter(detectedCountryCode);
  const geoFilterUI = getFilterUIConfig(detectedCountryCode);

  // Extract filter parameters
  const { gender, minAge, maxAge, minHeight, maxHeight, city, country, nationality } =
    req.query;

  // Build filter object
  const filter = {};

  // Apply geo-based location filter (e.g. PK visitors only see Pakistan profiles)
  if (geoFilter.$or) {
    filter.$and = filter.$and || [];
    filter.$and.push({ $or: geoFilter.$or });
  }

  // **NEW**: Only show approved profiles to regular users
  // Admins and moderators can see all profiles
  if (!req.session.isAdmin && !req.session.isModerator) {
    filter.isApproved = true;
    filter.approvalStatus = "approved";
  }

  if (gender) filter.gender = gender;
  if (city) filter.city = { $regex: new RegExp(city, "i") };
  if (country) filter.country = { $regex: new RegExp(country, "i") };
  if (nationality) filter.nationality = nationality; // kept for backward compatibility

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
      country,
      nationality,
    };

    const totalPages = Math.ceil(totalProfiles / limit);

    // Get current user's profile if logged in
    let currentUserProfile = null;
    if (req.session.userId) {
      currentUserProfile = await User.findById(req.session.userId);
    }

    return res.render("profiles", {
      featuredProfiles, // **NEW**
      profiles,
      filters: Object.keys(req.query).length > 0 ? activeFilters : null,
      sortBy: sortBy || "newly-created", // **NEW**
      page,
      totalPages,
      totalProfiles,
      currentUserProfile, // **NEW**: Pass current user's profile for pending notice
      geoFilterUI, // Geo-based filter UI config (null if no restriction)
      detectedCountryCode: detectedCountryCode || null,
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
    const { findSimilarProfiles } = require("./utils/profileHelpers");
    const currentUserId = req.session.userId || null;
    const similarProfiles = await findSimilarProfiles(foundProfile, 3, currentUserId);

    res.render("profile", {
      profile: foundProfile,
      canAccessFullProfile,
      hasalreadysentrequest,
      connectionStatus,     // NEW
      incomingRequest,      // NEW
      outgoingRequest,      // NEW
      user: req.session.user,
      isAdmin: req.session.isAdmin,
      filters: null,
      similarProfiles,
      isOwnProfile,         // **NEW**: Pass if viewing own profile
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
    await User.findByIdAndDelete(id);
    
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
      ethnicity: ["bangladeshi", "pakistani", "indian", "british", "other"],
      gender: ["male", "female", "rather not say"],
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
    await IslamicFAQ.findByIdAndDelete(req.params.id);
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
    const catSlug = categorySlug.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const pgSlug = pageSlug.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    // Check uniqueness (exclude self)
    const conflict = await CategoryPage.findOne({ categorySlug: catSlug, pageSlug: pgSlug, _id: { $ne: page._id } });
    if (conflict) return res.json({ success: false, error: "Another page already uses that URL" });
    const keywordsArray = keywords ? keywords.split(",").map(k => k.trim()).filter(Boolean) : [];
    const faqCatsArray = Array.isArray(faqCategories) ? faqCategories : (faqCategories ? [faqCategories] : []);
    const wasPublished = page.isPublished;
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
    if (!wasPublished && page.isPublished) page.publishedAt = new Date();
    else if (wasPublished && !page.isPublished) page.publishedAt = null;
    await page.save();
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
    await CategoryPage.findByIdAndDelete(req.params.id);
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
    const users = await User.find({
      approvalStatus: "approved",
      "seoSettings.noIndex": { $ne: true },
      isDeactivated: { $ne: true },
      profileSlug: { $exists: true, $ne: null }
    }).select("_id updatedAt createdAt profileSlug");
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
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
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

    // Add profile URLs (existing code continues...)
    users.forEach((user) => {
      if (user.profileSlug) {
        const lastmod = user.updatedAt
          ? user.updatedAt.toISOString().split("T")[0]
          : user.createdAt
            ? user.createdAt.toISOString().split("T")[0]
            : new Date().toISOString().split("T")[0];
        sitemap += `
  <url>
    <loc>https://www.shadiamour.com/profiles/${user._id}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>`;
      }
    });

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
    
    const {
      profileSlug,
      randomNameForSeo,
      customMetaTitle,
      customMetaDescription,
      focusKeyword,
      customKeywords,
      noIndex,
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
    profile.seoSettings.ogImageOverride = ogImageOverride || "";
    profile.seoSettings.canonicalUrlOverride = canonicalUrlOverride || "";
    profile.seoSettings.internalNotes = internalNotes || "";
    profile.seoSettings.lastSeoEditedAt = new Date();
    profile.seoSettings.lastSeoEditedBy = "SEO Admin";
    
    await profile.save();
    
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
