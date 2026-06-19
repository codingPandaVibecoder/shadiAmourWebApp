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

// ============================================
// SEO LANDING PAGES
// ============================================
const seoPages = [
  {
    path: "/muslim-marriage",
    pageTitle: "Muslim Marriage in Islam – The Islamic Approach to Nikah | D'amour Muslim",
    h1: "Muslim Marriage — The Islamic Approach to Finding a Spouse",
    heroSubtitle: "Understand the Quranic principles, Prophetic guidance, and step-by-step Islamic process of seeking a spouse — and how D'amour Muslim supports every stage.",
    metaDescription: "Discover the Islamic approach to Muslim marriage: Quranic foundations, Prophetic guidance on choosing a spouse, the role of the wali, and how to find a halal partner in the UK. Join free.",
    keywords: "muslim marriage islam, islamic marriage, nikah, muslim marriage uk, halal marriage islam, islamic approach to marriage, muslim marriage guidance",
    canonicalPath: "/muslim-marriage",
    ctaHeading: "Begin Your Halal Marriage Journey",
    ctaSubtext: "Join thousands of Muslims across the UK who found their spouse through D'amour Muslim — the halal-first marriage platform.",
    relatedLinks: [
      { url: "/muslim-matrimony-london", label: "Muslim Matrimony London" },
      { url: "/muslim-matrimony-birmingham", label: "Muslim Matrimony Birmingham" },
      { url: "/muslim-matrimony-manchester", label: "Muslim Matrimony Manchester" },
      { url: "/halal-marriage", label: "Halal Marriage Platform" },
      { url: "/muslim-matchmaking", label: "Muslim Matchmaking" },
      { url: "/blog/benefits-of-halal-matchmaking-services-uk-muslim-marriage-rishta-guide", label: "Halal Matchmaking Guide" }
    ],
    pageFaqSchema: [
      { q: "What is the Islamic ruling on marriage?", a: "Marriage (Nikah) is highly recommended (mustahabb) in Islam and is described as completing half of one's deen. It is a sacred contract intended to build a family grounded in Islamic values, providing both spouses tranquillity, affection, and mercy as described in Quran 30:21." },
      { q: "Can I use a Muslim marriage website without compromising my faith?", a: "Yes. D'amour Muslim is built exclusively for Muslims who want to find a spouse without engaging in haram interactions. There is no casual dating, no unchaperoned private messaging encouraged, and all users must register with serious marriage intention." },
      { q: "Is wali involvement required when using D'amour Muslim?", a: "We strongly encourage wali involvement as per Islamic guidelines. The platform is designed to support and facilitate family participation throughout the process, not bypass it." },
      { q: "How is D'amour Muslim different from mainstream dating apps?", a: "D'amour Muslim is exclusively marriage-focused. All profiles are manually verified by our moderation team. There is no 'swiping' culture. The entire platform is built around the intention of Nikah and Islamic principles." },
      { q: "Is Muslim marriage free to join on D'amour Muslim?", a: "Yes. Creating a profile, browsing verified Muslim profiles, and sending interest is completely free. There are optional premium features available but the core service requires no payment." }
    ],
    pageFaqs: [
      { q: "What is the Islamic ruling on marriage?", a: "Marriage (Nikah) is highly recommended (mustahabb) in Islam and is described as completing half of one's deen. It is a sacred contract intended to build a family grounded in Islamic values, providing both spouses tranquillity, affection, and mercy as described in Quran 30:21." },
      { q: "Can I use a Muslim marriage website without compromising my faith?", a: "Yes. D'amour Muslim is built exclusively for Muslims who want to find a spouse without engaging in haram interactions. There is no casual dating, no unchaperoned private messaging encouraged, and all users must register with serious marriage intention." },
      { q: "Is wali involvement required when using D'amour Muslim?", a: "We strongly encourage wali involvement as per Islamic guidelines. The platform is designed to support and facilitate family participation throughout the process, not bypass it." },
      { q: "How is D'amour Muslim different from mainstream dating apps?", a: "D'amour Muslim is exclusively marriage-focused. All profiles are manually verified by our moderation team. There is no 'swiping' culture. The entire platform is built around the intention of Nikah and Islamic principles." },
      { q: "Is Muslim marriage free to join on D'amour Muslim?", a: "Yes. Creating a profile, browsing verified Muslim profiles, and sending interest is completely free. There are optional premium features available but the core service requires no payment." }
    ],
    bodyContent: `
      <div class="prose max-w-none">
        <p class="text-lg text-gray-700 mb-6 leading-relaxed">In Islam, marriage (<em>Nikah</em>) is far more than a civil contract — it is half of one's deen and one of the most spiritually significant acts a Muslim can undertake. The Prophet Muhammad ﷺ said: <strong>"When a man marries, he has fulfilled half of his religion, so let him fear Allah regarding the remaining half."</strong> (Al-Bayhaqi). Understanding the Islamic framework for marriage helps Muslims approach this sacred search with clarity, patience, and genuine tawakkul in Allah.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">The Quranic Foundation of Muslim Marriage</h2>
        <p class="text-gray-700 mb-4 leading-relaxed">Allah describes the marital relationship in the Quran with profound depth:</p>
        <blockquote class="border-l-4 border-primary pl-6 py-3 bg-primary/5 rounded-r-xl mb-6">
          <p class="text-gray-700 italic">"And of His signs is that He created for you from yourselves mates that you may find tranquillity in them; and He placed between you affection and mercy. Indeed in that are signs for a people who give thought." — <strong>Quran 30:21</strong></p>
        </blockquote>
        <p class="text-gray-700 mb-6">These three qualities — <strong>sakeenah</strong> (tranquillity), <strong>mawaddah</strong> (deep affection), and <strong>rahmah</strong> (mercy) — are the pillars upon which every Islamic marriage is built. They are not passive outcomes that arrive automatically; they are active responsibilities that both spouses cultivate every day.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">The Islamic Process of Seeking a Spouse</h2>
        <p class="text-gray-700 mb-4">Islamic scholars outline a structured, dignified approach to the marriage search. Understanding these steps helps Muslims navigate any platform — including ours — in a way that aligns with their faith.</p>

        <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-6">1. Sincere Intention (Niyyah)</h3>
        <p class="text-gray-700 mb-4">The marriage search begins and ends with intention. Approaching the process to fulfil the Sunnah, build a family upon taqwa, and please Allah sets a firm spiritual foundation. When intentions are right, the entire journey becomes an act of worship — even the difficult moments of patience and rejection.</p>

        <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-6">2. Seeking Divine Guidance (Istikhara)</h3>
        <p class="text-gray-700 mb-4">Salat al-Istikhara is one of the most underutilised yet most powerful Sunnah practices in the marriage process. It is an acknowledgement that our knowledge is limited and that true guidance belongs to Allah alone. Performing istikhara before committing to or proceeding with a proposal is highly recommended by scholars across all madhabs.</p>

        <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-6">3. Guardian Involvement (Wali)</h3>
        <p class="text-gray-700 mb-4">For women, the involvement of a wali (marriage guardian) is a fundamental component of the Islamic marriage process. The majority of classical and contemporary scholars emphasise the wali's role as a protector and supporter, not an obstacle. D'amour Muslim actively encourages wali involvement and supports family-managed accounts for this reason.</p>

        <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-6">4. Halal Meeting and Consultation</h3>
        <p class="text-gray-700 mb-4">Islam permits prospective spouses to meet and have supervised conversations for the purpose of making an informed marriage decision. This is distinct from dating. The purpose is specific and the interaction should be respectful, modest, and purposeful. Extended private chatting without family knowledge or unchaperoned meetings are not consistent with the Islamic process.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">What to Prioritise in a Spouse — Prophetic Guidance</h2>
        <blockquote class="border-l-4 border-primary pl-6 py-3 bg-primary/5 rounded-r-xl mb-6">
          <p class="text-gray-700 italic">"A woman is married for four things: her wealth, her lineage, her beauty, and her religion. Choose the one with religion — may your hands be blessed." — <strong>Bukhari &amp; Muslim</strong></p>
        </blockquote>
        <p class="text-gray-700 mb-4">This hadith — applicable equally to both men and women — establishes a clear hierarchy of priority. While wealth, lineage, and appearance are acknowledged, <strong>deen is the decisive factor</strong>. A partner grounded in genuine faith will support you in raising righteous children, anchor the household in Islamic values, and be a companion through life's tests.</p>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Taqwa:</strong> Does this person fear Allah in their private choices, not just in public?</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Akhlaq:</strong> Are they patient, honest, humble, and responsible in their dealings?</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Compatibility:</strong> Do your long-term goals, parenting values, and Islamic practice align?</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Communication:</strong> Can you speak honestly and respectfully with each other, even in disagreement?</span></li>
        </ul>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Challenges Facing UK Muslims in the Marriage Search</h2>
        <p class="text-gray-700 mb-4 leading-relaxed">British Muslims face a specific set of challenges that previous generations — or Muslims in predominantly Muslim countries — did not encounter to the same degree:</p>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Smaller Muslim communities in suburban and rural areas with limited local marriage prospects</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Generational cultural tension between British-born Muslims and parents raised in Pakistan, Bangladesh, or other Muslim countries</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Social pressure to use mainstream dating apps that directly conflict with Islamic values and encourage haram interactions</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Difficulty finding religiously compatible partners within one's specific ethnic community</span></li>
        </ul>
        <p class="text-gray-700 mb-6">D'amour Muslim was created as a direct response to these challenges — a purpose-built, halal-first platform that British and Pakistani Muslims can trust to navigate the marriage search in a way that honours their faith.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">How D'amour Muslim Supports the Islamic Marriage Process</h2>
        <div class="grid md:grid-cols-2 gap-4 mb-8">
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="font-semibold text-gray-800 mb-2">Marriage-Only Environment</h3>
            <p class="text-gray-600 text-sm">No casual chatting or dating culture. Every profile is registered with the explicit intention of Nikah.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="font-semibold text-gray-800 mb-2">Wali-Friendly Design</h3>
            <p class="text-gray-600 text-sm">Family involvement is encouraged at every stage. Parents and guardians are welcome to manage or support a profile.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="font-semibold text-gray-800 mb-2">Verified Profiles Only</h3>
            <p class="text-gray-600 text-sm">Every profile is reviewed by our moderation team before it goes live — eliminating fake accounts and time-wasters.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="font-semibold text-gray-800 mb-2">UK GDPR Compliant</h3>
            <p class="text-gray-600 text-sm">Your personal information is protected under UK data protection law. We never sell your data to third parties.</p>
          </div>
        </div>

        <div class="bg-primary/5 rounded-2xl p-6 border border-primary/10 mt-8">
          <p class="text-gray-700 font-medium">Find Muslims in your city: <a href="/muslim-matrimony-london" class="text-primary hover:underline">Muslim Matrimony London</a> &bull; <a href="/muslim-matrimony-birmingham" class="text-primary hover:underline">Birmingham</a> &bull; <a href="/muslim-matrimony-manchester" class="text-primary hover:underline">Manchester</a> &bull; <a href="/muslim-matrimony-bradford" class="text-primary hover:underline">Bradford</a> &bull; <a href="/muslim-matrimony-leicester" class="text-primary hover:underline">Leicester</a> &bull; <a href="/muslim-matrimony-leeds" class="text-primary hover:underline">Leeds</a>. Also explore our <a href="/halal-marriage" class="text-primary hover:underline">Halal Marriage Platform</a>.</p>
        </div>
      </div>
    `
  },
  {
    path: "/muslim-matrimonial",
    pageTitle: "Muslim Matrimonial Platform Features – How D'amour Muslim Works | D'amour Muslim",
    h1: "Inside the D'amour Muslim Matrimonial Platform — Features Built for Serious Muslims",
    heroSubtitle: "Explore the verification system, privacy controls, profile builder, and communication tools that make D'amour Muslim the UK's most trusted Muslim matrimonial platform.",
    metaDescription: "A complete guide to D'amour Muslim's matrimonial platform features: profile verification, privacy settings, smart search filters, and halal communication tools. Free to join.",
    keywords: "muslim matrimonial platform, muslim matrimonial uk, islamic marriage platform features, halal matrimonial site, muslim matrimony uk, verified muslim matrimonial",
    canonicalPath: "/muslim-matrimonial",
    ctaHeading: "Create Your Verified Matrimonial Profile",
    ctaSubtext: "Join the platform built specifically for serious Muslims — free to register and browse.",
    relatedLinks: [
      { url: "/muslim-marriage", label: "About Muslim Marriage in Islam" },
      { url: "/verified-muslim-profiles", label: "Verified Profiles" },
      { url: "/trusted-muslim-matchmaking", label: "Trusted Matchmaking" },
      { url: "/find-muslim-spouse", label: "Search & Filter Guide" },
      { url: "/blog/benefits-of-halal-matchmaking-services-uk-muslim-marriage-rishta-guide", label: "Matchmaking Benefits Guide" }
    ],
    pageFaqSchema: [
      { q: "How does profile verification work on D'amour Muslim?", a: "Every profile submitted to D'amour Muslim goes through a manual review by our moderation team. We check for completeness, authenticity, and appropriate content before approving any profile to go live. This ensures every profile you see is a real person with genuine marriage intentions." },
      { q: "Is my personal information private on D'amour Muslim?", a: "Yes. Your contact details, phone number, and precise location are never displayed publicly. You control what information is shown on your profile. D'amour Muslim is fully compliant with UK GDPR and never sells your data to third parties." },
      { q: "Can my family manage my profile?", a: "Yes. D'amour Muslim supports and encourages family involvement. A parent or wali can register and manage a profile on behalf of their son or daughter. This is a core feature of our family-friendly matrimonial platform." },
      { q: "What types of profiles can I search on D'amour Muslim?", a: "You can browse and filter profiles by gender, age range, city or region, country, height, and other preferences. All listed profiles have passed our manual verification process, so every result you see is an approved, genuine profile." },
      { q: "Is there a messaging or communication feature?", a: "Yes. Once you and another member have exchanged an interest request, you can communicate through our platform's secure messaging system. All communication is designed to maintain respect and purposeful interaction aligned with Islamic norms." }
    ],
    pageFaqs: [
      { q: "How does profile verification work on D'amour Muslim?", a: "Every profile submitted to D'amour Muslim goes through a manual review by our moderation team. We check for completeness, authenticity, and appropriate content before approving any profile to go live. This ensures every profile you see is a real person with genuine marriage intentions." },
      { q: "Is my personal information private on D'amour Muslim?", a: "Yes. Your contact details, phone number, and precise location are never displayed publicly. You control what information is shown on your profile. D'amour Muslim is fully compliant with UK GDPR and never sells your data to third parties." },
      { q: "Can my family manage my profile?", a: "Yes. D'amour Muslim supports and encourages family involvement. A parent or wali can register and manage a profile on behalf of their son or daughter. This is a core feature of our family-friendly matrimonial platform." },
      { q: "What types of profiles can I search on D'amour Muslim?", a: "You can browse and filter profiles by gender, age range, city or region, country, height, and other preferences. All listed profiles have passed our manual verification process, so every result you see is an approved, genuine profile." },
      { q: "Is there a messaging or communication feature?", a: "Yes. Once you and another member have exchanged an interest request, you can communicate through our platform's secure messaging system. All communication is designed to maintain respect and purposeful interaction aligned with Islamic norms." }
    ],
    bodyContent: `
      <div class="prose max-w-none">
        <p class="text-lg text-gray-700 mb-6 leading-relaxed">D'amour Muslim is not just another matrimonial directory — it is a purpose-engineered platform built around the specific needs, values, and privacy requirements of Muslims seeking marriage in the UK and beyond. This page explains exactly how the platform works, from the moment you register to the moment you find your match.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">The Profile Builder — Telling Your Story the Halal Way</h2>
        <p class="text-gray-700 mb-4">Building a profile on D'amour Muslim is a guided, step-by-step process designed to capture the information that matters most in a marriage search:</p>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Personal Background:</strong> Age, height, ethnicity, nationality, and marital history</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Religious Practice:</strong> Sect, prayer habits, hijab/beard preferences, and level of Islamic observance</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Education &amp; Career:</strong> Qualifications, profession, and career goals</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>About Me:</strong> A personal written section where you describe yourself and what you're looking for</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Spouse Preferences:</strong> What you are looking for in a partner</span></li>
        </ul>
        <p class="text-gray-700 mb-6">Profiles with more detail perform significantly better in searches — and richer profiles make it easier for potential matches to make an informed, halal decision.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">The Verification System — No Fake Profiles</h2>
        <p class="text-gray-700 mb-4">Every single profile submitted to D'amour Muslim goes through a manual review before it becomes visible to other users. Our moderation team checks for:</p>
        <div class="grid md:grid-cols-2 gap-4 mb-8">
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="font-semibold text-gray-800 mb-2">Profile Authenticity</h3>
            <p class="text-gray-600 text-sm">We flag inconsistencies, check for stock images, and ensure the person is who they say they are.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="font-semibold text-gray-800 mb-2">Content Standards</h3>
            <p class="text-gray-600 text-sm">All written content is reviewed for appropriateness. Inappropriate or misleading profiles are rejected immediately.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="font-semibold text-gray-800 mb-2">Marriage Intention</h3>
            <p class="text-gray-600 text-sm">Profiles that show casual or non-marriage intent are removed from the platform.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="font-semibold text-gray-800 mb-2">Ongoing Monitoring</h3>
            <p class="text-gray-600 text-sm">Approved profiles can be reported. Our team reviews flagged content and takes action within 24 hours.</p>
          </div>
        </div>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Privacy Controls — You Decide What Is Visible</h2>
        <p class="text-gray-700 mb-4">Privacy is a core Islamic value. On D'amour Muslim, you control your visibility:</p>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Your contact number is <strong>never</strong> displayed on your public profile</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Your precise location is not shown — only your city or region</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">You can choose who can see your full profile details</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">All data is processed under UK GDPR regulations — no selling of personal data</span></li>
        </ul>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Family-Managed Accounts — Wali Involvement Made Easy</h2>
        <p class="text-gray-700 mb-4">One of D'amour Muslim's most distinctive features is support for family-managed accounts. A parent, sibling, or wali can:</p>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Register and complete a profile on behalf of their son or daughter</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Manage incoming interest requests</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Communicate with other families directly through the platform</span></li>
        </ul>
        <p class="text-gray-700 mb-6">This makes D'amour Muslim suitable not just for individuals, but for entire families navigating the rishta process together — in full accordance with Islamic guidelines.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Communication Tools — Purposeful, Respectful Interaction</h2>
        <p class="text-gray-700 mb-4">Unlike dating apps where anyone can message anyone at any time, D'amour Muslim uses a structured interest system:</p>
        <div class="grid md:grid-cols-3 gap-4 mb-8">
          <div class="bg-gray-50 rounded-xl p-4 text-center border border-gray-100">
            <span class="text-primary font-bold text-2xl block mb-2">1</span>
            <p class="font-semibold text-gray-800 text-sm mb-1">Send Interest</p>
            <p class="text-gray-600 text-xs">Express your interest in a profile respectfully</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-4 text-center border border-gray-100">
            <span class="text-primary font-bold text-2xl block mb-2">2</span>
            <p class="font-semibold text-gray-800 text-sm mb-1">Mutual Acceptance</p>
            <p class="text-gray-600 text-xs">Both parties must accept before communication opens</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-4 text-center border border-gray-100">
            <span class="text-primary font-bold text-2xl block mb-2">3</span>
            <p class="font-semibold text-gray-800 text-sm mb-1">Secure Messaging</p>
            <p class="text-gray-600 text-xs">Communicate through our platform with full privacy</p>
          </div>
        </div>

        <div class="bg-primary/5 rounded-2xl p-6 border border-primary/10 mt-8">
          <p class="text-gray-700 font-medium">Understand the Islamic basis of marriage first: <a href="/muslim-marriage" class="text-primary hover:underline">Muslim Marriage in Islam</a>. Ready to search? Learn about our <a href="/find-muslim-spouse" class="text-primary hover:underline">Search &amp; Filter System</a>. Or <a href="/verified-muslim-profiles" class="text-primary hover:underline">see how verification works</a> in detail.</p>
        </div>
      </div>
    `
  },
  {
    path: "/muslim-matchmaking",
    pageTitle: "Muslim Matchmaking UK — Halal, Structured & Free | D'amour Muslim",
    h1: "Muslim Matchmaking — Find Compatible Halal Matches",
    heroSubtitle: "Real compatibility assessment, Islamic values, and a structured process — not just swiping. Join thousands of UK Muslims finding their match the halal way.",
    metaDescription: "Muslim matchmaking UK — a structured, halal process that assesses compatibility by deen, lifestyle, and family background. Free to join. No casual connections.",
    keywords: "muslim matchmaking, muslim matchmaking uk, halal matchmaking service, islamic matchmaking, muslim matchmaker online",
    canonicalPath: "/muslim-matchmaking",
    ctaHeading: "Start Your Halal Matchmaking Journey",
    ctaSubtext: "Join D'amour Muslim free — find your compatible match through a structured, Islamic process.",
    relatedLinks: [
      { url: "/muslim-marriage", label: "Muslim Marriage in Islam" },
      { url: "/verified-muslim-profiles", label: "Verified Muslim Profiles" },
      { url: "/trusted-muslim-matchmaking", label: "Trusted Muslim Matchmaking" },
      { url: "/halal-marriage", label: "Halal Marriage Platform" },
      { url: "/find-muslim-spouse", label: "Find a Muslim Spouse" }
    ],
    pageFaqSchema: [
      { q: "How is matchmaking different from just browsing profiles on D'amour Muslim?", a: "Browsing profiles is passive — you scroll and hope something catches your eye. Matchmaking on D'amour Muslim is structured: you define your must-haves (deen level, lifestyle, family background, location), and the platform filters to surface genuinely compatible profiles rather than just popular ones. The process is intentional and purpose-driven, not casual." },
      { q: "Can families get involved in the matchmaking process on D'amour Muslim?", a: "Yes — family involvement is actively supported. Parents or a wali can register and manage a profile on behalf of their son or daughter. Families can browse matches, send expressions of interest, and communicate with potential partners' families. D'amour Muslim is built for the traditional family-driven marriage process, not just for individuals acting alone." },
      { q: "What compatibility factors does D'amour Muslim consider?", a: "D'amour Muslim allows you to filter and search by: religious practice level (practising, moderate, cultural), lifestyle (dietary preferences, hijab status), ethnicity and cultural background, location (UK city or country), age range, and whether children are wanted. This lets you define compatibility on your own terms — Islamic compatibility first, then cultural and practical fit." },
      { q: "How long does the matchmaking process typically take on D'amour Muslim?", a: "There is no fixed timeline — it depends on how active you are and how specific your criteria are. Many members receive their first expressions of interest within days of going live. The key is a complete, honest profile and clear criteria. The platform is designed to speed up the discovery phase so you spend your time on genuine prospects, not sifting through mismatches." },
      { q: "Is using an online matchmaking service halal and Islamically approved?", a: "Yes — seeking a spouse through a structured, chaperoned, and intention-focused process is entirely permissible in Islam. The Prophet ﷺ encouraged seeking a spouse for their deen. What matters is how you go about it: D'amour Muslim is designed to replicate the formal rishta process online — no free mixing, no casual chat before mutual interest is established, and family involvement encouraged at every stage." }
    ],
    pageFaqs: [
      { q: "How is matchmaking different from just browsing profiles on D'amour Muslim?", a: "Browsing profiles is passive — you scroll and hope something catches your eye. Matchmaking on D'amour Muslim is structured: you define your must-haves (deen level, lifestyle, family background, location), and the platform filters to surface genuinely compatible profiles rather than just popular ones. The process is intentional and purpose-driven, not casual." },
      { q: "Can families get involved in the matchmaking process on D'amour Muslim?", a: "Yes — family involvement is actively supported. Parents or a wali can register and manage a profile on behalf of their son or daughter. Families can browse matches, send expressions of interest, and communicate with potential partners' families. D'amour Muslim is built for the traditional family-driven marriage process, not just for individuals acting alone." },
      { q: "What compatibility factors does D'amour Muslim consider?", a: "D'amour Muslim allows you to filter and search by: religious practice level (practising, moderate, cultural), lifestyle (dietary preferences, hijab status), ethnicity and cultural background, location (UK city or country), age range, and whether children are wanted. This lets you define compatibility on your own terms — Islamic compatibility first, then cultural and practical fit." },
      { q: "How long does the matchmaking process typically take on D'amour Muslim?", a: "There is no fixed timeline — it depends on how active you are and how specific your criteria are. Many members receive their first expressions of interest within days of going live. The key is a complete, honest profile and clear criteria. The platform is designed to speed up the discovery phase so you spend your time on genuine prospects, not sifting through mismatches." },
      { q: "Is using an online matchmaking service halal and Islamically approved?", a: "Yes — seeking a spouse through a structured, chaperoned, and intention-focused process is entirely permissible in Islam. The Prophet ﷺ encouraged seeking a spouse for their deen. What matters is how you go about it: D'amour Muslim is designed to replicate the formal rishta process online — no free mixing, no casual chat before mutual interest is established, and family involvement encouraged at every stage." }
    ],
    bodyContent: `
      <div class="prose max-w-none">
        <p class="text-lg text-gray-700 mb-6 leading-relaxed">Muslim matchmaking is not what a Western dating app does. In Islam, the process of finding a spouse is intentional, structured, and guided by clear principles — not algorithms, not swipes, and certainly not chemistry alone. D'amour Muslim was built around this understanding: that finding a compatible Muslim partner requires a framework, not just a filter.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">What Makes Muslim Matchmaking Different?</h2>
        <p class="text-gray-700 mb-4 leading-relaxed">Western dating platforms are designed to maximise engagement — keep you swiping, keep you subscribed, keep you coming back. Muslim matchmaking has an entirely different objective: facilitate a serious, halal connection that leads to Nikah. That shift in goal changes everything about how the process works.</p>
        <p class="text-gray-700 mb-4 leading-relaxed">In Islamic marriage culture, compatibility is assessed holistically: religious practice, character, lifestyle, family background, and long-term intentions all matter. There is no casual phase, no "let's see where this goes" ambiguity. Both parties — and often their families — approach the process knowing the destination is marriage. This clarity protects everyone involved and aligns with what the Prophet ﷺ guided us toward when he said: <em>"A woman is married for four reasons: her wealth, her lineage, her beauty, and her deen — so choose the one with deen, and may your hands be blessed."</em></p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">The D'amour Muslim Matchmaking Process</h2>
        <div class="grid md:grid-cols-2 gap-4 mb-8">
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <span class="text-primary font-bold text-xl block mb-2">1. Build Your Profile</span>
            <p class="text-gray-700 text-sm leading-relaxed">Complete your profile with honesty — your deen level, lifestyle, family background, what you are looking for, and your non-negotiables. A thorough profile attracts compatible prospects and filters out mismatches before they waste your time.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <span class="text-primary font-bold text-xl block mb-2">2. Define Compatibility</span>
            <p class="text-gray-700 text-sm leading-relaxed">Use the search filters to narrow down by religious practice, ethnicity, location, age, and lifestyle preferences. This is where structured matchmaking diverges from casual browsing — you are applying criteria, not just scrolling.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <span class="text-primary font-bold text-xl block mb-2">3. Express Interest — No Free Chat</span>
            <p class="text-gray-700 text-sm leading-relaxed">Send an expression of interest. Communication only opens once both parties accept — preventing unwanted contact and maintaining Islamic etiquette. No messages arrive unsolicited.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <span class="text-primary font-bold text-xl block mb-2">4. Proceed with Family</span>
            <p class="text-gray-700 text-sm leading-relaxed">Once mutual interest is confirmed, involve your wali or family. D'amour Muslim supports family-level profiles and family involvement at every stage — because Islamic marriage is a family matter, not just an individual one.</p>
          </div>
        </div>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">What Compatibility Actually Means for Muslims</h2>
        <p class="text-gray-700 mb-4 leading-relaxed">Compatibility in Islamic matchmaking is multi-layered. It is not just about attraction or shared hobbies. Here are the dimensions that actually determine whether a Muslim marriage will be harmonious long-term:</p>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Deen &amp; religious practice:</strong> Does your potential match pray? Do they observe fasting, halal dietary requirements? Are they practising, moderate, or cultural Muslims? Mismatched deen levels are one of the most common sources of post-marriage conflict.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Lifestyle alignment:</strong> Hijab status, dietary preferences, attitudes toward music and entertainment, career ambitions, and views on gender roles within the home. These everyday realities shape married life far more than first-date conversation.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Family background &amp; expectations:</strong> Is the family conservative or liberal? Are they expecting you to live with the in-laws? What role will both families play after marriage? These questions matter and should be asked early.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Cultural &amp; ethnic compatibility:</strong> Shared cultural references, language, and community expectations reduce friction — especially for British Muslims navigating between heritage cultures and British life.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Long-term life goals:</strong> Children, location, financial approach, education — these are the pillars of a shared future. D'amour Muslim profiles are designed to surface this information before you invest emotionally.</span></li>
        </ul>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Why Families Trust D'amour Muslim</h2>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">All profiles are manually reviewed before going live — no bots, no fake accounts</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Family profiles supported — parents can register and manage their child's profile</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">No unsolicited messages — communication requires mutual acceptance first</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">UK GDPR compliant — your data is never sold or shared with third parties</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Free to join and browse — no paywall blocking access to potential matches</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Islamic etiquette built into the platform design — not an afterthought</span></li>
        </ul>

        <blockquote class="border-l-4 border-primary pl-4 italic text-gray-600 my-6">"When someone with whose religion and character you are satisfied asks for your daughter in marriage, accede to his request. If you do not do so, there will be temptation on Earth and extensive corruption." — Prophet Muhammad ﷺ (Tirmidhi)</blockquote>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Start Your Halal Matchmaking Journey</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">Whether you are just beginning your search or have been looking for a while, D'amour Muslim offers the structure and community to make that search meaningful. Register free, complete your profile with honesty, and let a purpose-built halal matchmaking process do what browsing alone cannot — help you find someone genuinely compatible, not just available.</p>

        <div class="bg-primary/5 rounded-2xl p-6 border border-primary/10 mt-8">
          <p class="text-gray-700 font-medium">Also see: <a href="/muslim-marriage" class="text-primary hover:underline">Muslim Marriage in Islam</a> &bull; <a href="/verified-muslim-profiles" class="text-primary hover:underline">Verified Muslim Profiles</a> &bull; <a href="/trusted-muslim-matchmaking" class="text-primary hover:underline">Trusted Muslim Matchmaking</a></p>
        </div>
      </div>
    `
  },
  {
    path: "/halal-marriage",
    pageTitle: "Halal Marriage Platform — Shariah-Compliant & Free to Join | D'amour Muslim",
    h1: "Halal Marriage — A Platform Built for Islamic Values",
    heroSubtitle: "Not just a halal outcome — a halal journey. D'amour Muslim is built from the ground up to honour Islamic etiquette at every step.",
    metaDescription: "D'amour Muslim is a genuinely halal marriage platform — no free mixing, profile privacy, family involvement, and moderation built in. Free to join today.",
    keywords: "halal marriage, halal marriage platform, halal marriage site uk, halal matrimony, islamically compliant marriage site",
    canonicalPath: "/halal-marriage",
    ctaHeading: "Join a Platform That Shares Your Values",
    ctaSubtext: "Register free on D'amour Muslim — a halal marriage platform built around Islamic etiquette.",
    relatedLinks: [
      { url: "/muslim-marriage", label: "Muslim Marriage in Islam" },
      { url: "/trusted-muslim-matchmaking", label: "Trusted Muslim Matchmaking" },
      { url: "/verified-muslim-profiles", label: "Verified Muslim Profiles" },
      { url: "/muslim-matchmaking", label: "Muslim Matchmaking" },
      { url: "/find-muslim-spouse", label: "Find a Muslim Spouse" }
    ],
    pageFaqSchema: [
      { q: "Is it permissible to use online matrimonial sites in Islam?", a: "Yes — scholars generally permit the use of online matrimonial platforms when the interaction is conducted with proper Islamic etiquette: clear marriage intention, no khalwa (seclusion), guardian involvement, and modest communication. D'amour Muslim is designed specifically to meet these conditions — communication only opens after mutual acceptance, family involvement is supported at every stage, and all interactions are moderated." },
      { q: "How does D'amour Muslim prevent free mixing between non-mahrams?", a: "Free mixing is prevented by design. No messages can be sent to someone who hasn't accepted your expression of interest. Profile photos are only visible to approved members, not to the general public. The platform does not have open chat rooms, group features, or social feed elements that would enable casual mixed-gender interaction." },
      { q: "Can I involve my wali or family before communicating with a potential match?", a: "Yes — and this is actively encouraged. Parents or a wali can register on behalf of their son or daughter, manage the profile, and conduct all initial communication. The platform is fully designed for this family-driven approach. You can also share a profile with a family member for their input before responding to an expression of interest." },
      { q: "Are there any haram elements on D'amour Muslim — music, inappropriate images, casual chat?", a: "No. D'amour Muslim does not play background music, does not host videos or reels, and does not have a social feed or casual chat function. Profile photos are moderated before going live. All profiles are reviewed for inappropriate content. The platform intentionally avoids every feature that could normalise casual interaction between non-mahrams." },
      { q: "What happens if someone behaves inappropriately on the platform?", a: "Any user can report a profile or message instantly using the report feature. Reported profiles are reviewed by the moderation team and removed if the report is upheld. Repeat offenders are permanently banned. Maintaining Islamic conduct standards is not optional on D'amour Muslim — it is enforced." }
    ],
    pageFaqs: [
      { q: "Is it permissible to use online matrimonial sites in Islam?", a: "Yes — scholars generally permit the use of online matrimonial platforms when the interaction is conducted with proper Islamic etiquette: clear marriage intention, no khalwa (seclusion), guardian involvement, and modest communication. D'amour Muslim is designed specifically to meet these conditions — communication only opens after mutual acceptance, family involvement is supported at every stage, and all interactions are moderated." },
      { q: "How does D'amour Muslim prevent free mixing between non-mahrams?", a: "Free mixing is prevented by design. No messages can be sent to someone who hasn't accepted your expression of interest. Profile photos are only visible to approved members, not to the general public. The platform does not have open chat rooms, group features, or social feed elements that would enable casual mixed-gender interaction." },
      { q: "Can I involve my wali or family before communicating with a potential match?", a: "Yes — and this is actively encouraged. Parents or a wali can register on behalf of their son or daughter, manage the profile, and conduct all initial communication. The platform is fully designed for this family-driven approach. You can also share a profile with a family member for their input before responding to an expression of interest." },
      { q: "Are there any haram elements on D'amour Muslim — music, inappropriate images, casual chat?", a: "No. D'amour Muslim does not play background music, does not host videos or reels, and does not have a social feed or casual chat function. Profile photos are moderated before going live. All profiles are reviewed for inappropriate content. The platform intentionally avoids every feature that could normalise casual interaction between non-mahrams." },
      { q: "What happens if someone behaves inappropriately on the platform?", a: "Any user can report a profile or message instantly using the report feature. Reported profiles are reviewed by the moderation team and removed if the report is upheld. Repeat offenders are permanently banned. Maintaining Islamic conduct standards is not optional on D'amour Muslim — it is enforced." }
    ],
    bodyContent: `
      <div class="prose max-w-none">
        <p class="text-lg text-gray-700 mb-6 leading-relaxed">A halal marriage is not just about the destination — it is about the journey. Many Muslims understand that the Nikah itself is halal, but give less thought to whether the <em>process</em> of finding a spouse honours Islamic principles. D'amour Muslim was built to answer that question directly: can a matrimonial platform be genuinely halal to use? Not just in name, but in its actual design, features, and culture.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">How D'amour Muslim Is Built for Halal Interaction</h2>
        <p class="text-gray-700 mb-4 leading-relaxed">Most matrimonial websites are repurposed dating apps with an Islamic veneer. They still have open messaging, casual browse features, and social feed elements that encourage the kind of interaction Islam specifically cautions against between non-mahrams. D'amour Muslim was built differently — from the architecture of communication, to profile visibility, to the language used throughout the platform.</p>
        <p class="text-gray-700 mb-6 leading-relaxed">The foundation is simple: <strong>no communication happens without mutual consent, and no consent is given without a clear intention of marriage.</strong> Every feature on the platform was designed around this principle.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Platform Features That Prevent Haram</h2>
        <div class="grid md:grid-cols-2 gap-4 mb-8">
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">No Free Chat</h3>
            <p class="text-gray-700 text-sm leading-relaxed">You cannot message someone who has not accepted your expression of interest. There are no open inboxes, no unsolicited messages, and no group chat features. Communication is gated behind mutual acceptance — just as a formal rishta approach would be.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Profile Privacy</h3>
            <p class="text-gray-700 text-sm leading-relaxed">Profile photos are only visible to approved, logged-in members — not to the general public, search engines, or guests. This protects sisters especially, ensuring photos are not indexed online or viewed by those with no marriage intention.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Family Involvement</h3>
            <p class="text-gray-700 text-sm leading-relaxed">Parents and walis can register and fully manage a profile. Families can browse matches, initiate contact, and participate in the process — making D'amour Muslim compatible with the formal family-driven rishta approach practised across Muslim communities.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Moderation &amp; Reporting</h3>
            <p class="text-gray-700 text-sm leading-relaxed">All profiles are manually reviewed before going live. Any inappropriate content, behaviour, or suspicious profiles can be reported instantly. The team reviews and acts on reports — protecting the community's integrity and ensuring the platform remains a safe, halal space.</p>
          </div>
        </div>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">The Islamic Etiquette We Follow</h2>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Marriage intention required — the platform is explicitly for Nikah, not casual connections</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">No khalwa by design — communication is transparent, recorded, and purpose-driven</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Wali involvement supported — families can manage profiles from registration to communication</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Modesty in profile design — no inappropriate images, no social feed, no reels or videos</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">No music or haram entertainment — a clean, distraction-free environment</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">GDPR compliant — your personal data is handled with the same care your Islamic values demand</span></li>
        </ul>

        <blockquote class="border-l-4 border-primary pl-4 italic text-gray-600 my-6">"And tell the believing women to reduce some of their vision and guard their private parts and not expose their adornment except that which appears thereof..." — Quran 24:31</blockquote>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Is This Platform Really Halal?</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">Scholars who have examined online matrimonial platforms distinguish between those that replicate casual dating and those that replicate the formal rishta or wali-supervised introduction process. D'amour Muslim is firmly in the second category. You are not browsing for a date — you are searching for a spouse, with your family's potential involvement, through a platform that enforces Islamic etiquette at the point of design, not just at the point of policy. Whether you choose to involve your wali or manage your own profile as an adult Muslim, the framework ensures the interaction remains honourable.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Join a Platform Built for Your Values</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">You should not have to compromise your deen to find a spouse. D'amour Muslim exists to make sure you don't. Register free today and join thousands of UK Muslims who are finding their matches the halal way — through a platform that was built with Islamic values, not just labelled with them.</p>

        <div class="bg-primary/5 rounded-2xl p-6 border border-primary/10 mt-8">
          <p class="text-gray-700 font-medium">Also see: <a href="/muslim-marriage" class="text-primary hover:underline">Muslim Marriage in Islam</a> &bull; <a href="/trusted-muslim-matchmaking" class="text-primary hover:underline">Trusted Muslim Matchmaking</a> &bull; <a href="/verified-muslim-profiles" class="text-primary hover:underline">Verified Muslim Profiles</a></p>
        </div>
      </div>
    `
  },
  {
    path: "/muslim-rishta",
    pageTitle: "Muslim Rishta Online — Bridging Tradition & Technology | D'amour Muslim",
    h1: "Muslim Rishta — Where Tradition Meets Technology",
    heroSubtitle: "The rishta tradition, brought online. A family-friendly, halal platform for British Pakistanis, British Bangladeshis, and diaspora Muslims seeking serious marriage proposals.",
    metaDescription: "Muslim rishta online — D'amour Muslim modernises the traditional rishta process for UK and diaspora Muslims. Family involvement supported. Free to join.",
    keywords: "muslim rishta, muslim rishta online, rishta for marriage, rishta uk, rishta service online, rishta proposal",
    canonicalPath: "/muslim-rishta",
    ctaHeading: "Find Your Rishta Today",
    ctaSubtext: "Create your free profile and join thousands of Muslims already using D'amour Muslim for rishta.",
    relatedLinks: [
      { url: "/online-rishta-pakistan", label: "Online Rishta Pakistan" },
      { url: "/british-pakistani-marriage", label: "British Pakistani Marriage" },
      { url: "/muslim-matchmaking", label: "Muslim Matchmaking" },
      { url: "/halal-marriage", label: "Halal Marriage Platform" },
      { url: "/rishta-lahore", label: "Rishta Lahore" },
      { url: "/rishta-karachi", label: "Rishta Karachi" }
    ],
    pageFaqSchema: [
      { q: "What is a rishta and how is it different from a regular marriage proposal?", a: "A rishta is a formal marriage enquiry rooted in South Asian Muslim culture — it involves families, not just individuals. When someone says they are 'looking for a rishta', they mean they are seeking a formal proposal through a structured, family-supervised process with the clear intention of Nikah. It is different from a casual proposal or a dating-style approach: a rishta is a family affair from the beginning, with parents, uncles, aunties, and elders often involved at every stage." },
      { q: "Can parents or family members browse and send rishta proposals on behalf of their child?", a: "Yes — absolutely. D'amour Muslim fully supports family-managed profiles. Parents or a wali can register, build a profile for their son or daughter, browse suitable matches, and initiate contact on their behalf. This mirrors the traditional rishta process and makes D'amour Muslim one of the few online platforms truly designed for family participation, not just for individuals." },
      { q: "Are there rishta profiles for overseas Pakistanis and British Pakistanis on D'amour Muslim?", a: "Yes. D'amour Muslim has profiles from across the UK (London, Birmingham, Manchester, Bradford, Leicester, Leeds) as well as from Pakistan (Lahore, Karachi, Islamabad and beyond) and other diaspora communities in the US, Canada, and Europe. The platform is particularly popular with British Pakistanis seeking both UK-based and Pakistan-based rishta proposals." },
      { q: "How is D'amour Muslim different from traditional rishta aunty networks?", a: "Traditional rishta aunty networks are limited by geography, personal bias, and the size of one individual's network. D'amour Muslim gives you direct access to thousands of verified profiles without relying on a third party. You retain full control — you browse, you decide who to approach, and your family can be as involved as you choose. No middleman means no miscommunication and no hidden agendas." },
      { q: "Is rishta-finding on a website accepted in Pakistani and South Asian Muslim families?", a: "Increasingly, yes. The stigma around online rishta searching has reduced significantly over the past decade, particularly as first and second-generation British Pakistanis have become more open to it. Many families now use platforms like D'amour Muslim as a first step — browsing profiles privately before involving extended family. The key is that the intention is marriage, the process is formal, and family remains involved — which D'amour Muslim fully supports." }
    ],
    pageFaqs: [
      { q: "What is a rishta and how is it different from a regular marriage proposal?", a: "A rishta is a formal marriage enquiry rooted in South Asian Muslim culture — it involves families, not just individuals. When someone says they are 'looking for a rishta', they mean they are seeking a formal proposal through a structured, family-supervised process with the clear intention of Nikah. It is different from a casual proposal or a dating-style approach: a rishta is a family affair from the beginning, with parents, uncles, aunties, and elders often involved at every stage." },
      { q: "Can parents or family members browse and send rishta proposals on behalf of their child?", a: "Yes — absolutely. D'amour Muslim fully supports family-managed profiles. Parents or a wali can register, build a profile for their son or daughter, browse suitable matches, and initiate contact on their behalf. This mirrors the traditional rishta process and makes D'amour Muslim one of the few online platforms truly designed for family participation, not just for individuals." },
      { q: "Are there rishta profiles for overseas Pakistanis and British Pakistanis on D'amour Muslim?", a: "Yes. D'amour Muslim has profiles from across the UK (London, Birmingham, Manchester, Bradford, Leicester, Leeds) as well as from Pakistan (Lahore, Karachi, Islamabad and beyond) and other diaspora communities in the US, Canada, and Europe. The platform is particularly popular with British Pakistanis seeking both UK-based and Pakistan-based rishta proposals." },
      { q: "How is D'amour Muslim different from traditional rishta aunty networks?", a: "Traditional rishta aunty networks are limited by geography, personal bias, and the size of one individual's network. D'amour Muslim gives you direct access to thousands of verified profiles without relying on a third party. You retain full control — you browse, you decide who to approach, and your family can be as involved as you choose. No middleman means no miscommunication and no hidden agendas." },
      { q: "Is rishta-finding on a website accepted in Pakistani and South Asian Muslim families?", a: "Increasingly, yes. The stigma around online rishta searching has reduced significantly over the past decade, particularly as first and second-generation British Pakistanis have become more open to it. Many families now use platforms like D'amour Muslim as a first step — browsing profiles privately before involving extended family. The key is that the intention is marriage, the process is formal, and family remains involved — which D'amour Muslim fully supports." }
    ],
    bodyContent: `
      <div class="prose max-w-none">
        <p class="text-lg text-gray-700 mb-6 leading-relaxed">A rishta is not just a marriage proposal. In South Asian Muslim culture, a rishta is a formal, family-driven enquiry — a process that involves parents, elders, and the whole apparatus of community and family approval. It is rooted in the Islamic tradition of approaching marriage with seriousness, modesty, and collective wisdom. For millions of British Pakistanis, British Bangladeshis, and diaspora Muslims around the world, the rishta process is how marriage is done properly. D'amour Muslim was built to honour that tradition — and bring it online.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">How D'amour Muslim Brings Rishta Online</h2>
        <p class="text-gray-700 mb-4 leading-relaxed">The rishta process traditionally worked through networks: aunties who knew aunties, extended family connections, community events. D'amour Muslim replaces the bottlenecks of that system — the limited reach, the reliance on intermediaries, the geographic constraints — while preserving everything that made it work: seriousness of intention, family involvement, and respectful process.</p>
        <p class="text-gray-700 mb-6 leading-relaxed">On D'amour Muslim, you or your family can browse thousands of verified profiles, filter by city, background, and religious values, and send a formal expression of interest — all within a platform that enforces halal interaction at every stage. No casual chat, no open messaging, no inappropriate content. Just a structured process that leads toward Nikah.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Why Traditional Rishta Searching Has Limitations</h2>
        <div class="grid md:grid-cols-2 gap-4 mb-8">
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Limited Network</h3>
            <p class="text-gray-700 text-sm leading-relaxed">A family's rishta network is only as large as their social circle. In a diaspora community, this often means a pool of a few dozen eligible matches — far too small for a decision as significant as marriage.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Biradari Pressure</h3>
            <p class="text-gray-700 text-sm leading-relaxed">Traditional rishta often comes with unspoken expectations around caste, biradari, and family standing. Online platforms give individuals and families the freedom to define compatibility on their own terms.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100 md:col-span-2">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Outdated Methods</h3>
            <p class="text-gray-700 text-sm leading-relaxed">Relying on word-of-mouth, community matchmakers, or family WhatsApp groups is slow, unreliable, and often involves the wrong people knowing too much of your business too early. D'amour Muslim gives you privacy and control.</p>
          </div>
        </div>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">The D'amour Muslim Approach to Modern Rishta</h2>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Family profiles supported:</strong> Parents or a wali can register and manage the full profile on behalf of their child — just like the traditional approach, but online.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Formal interest process:</strong> No open chat — interest must be sent and accepted before any communication begins, preserving the formality of the rishta approach.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>No intermediary required:</strong> You deal directly with the other family — no matchmaker aunty filtering information or adding their own spin.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Thousands of profiles:</strong> Access a pool that no individual's network could provide — UK-wide, Pakistan-wide, and international diaspora.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Verified and moderated:</strong> Every profile is reviewed — no fake proposals, no time-wasters, no unserious approaches.</span></li>
        </ul>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Rishta Profiles for Every Background</h2>
        <p class="text-gray-700 mb-4 leading-relaxed">D'amour Muslim serves the full spectrum of Muslim diaspora communities:</p>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700"><strong>UK-based profiles:</strong> British Pakistanis, British Bangladeshis, British Indians, and Muslims from all backgrounds across England, Scotland, and Wales</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700"><strong>Pakistan-based profiles:</strong> Lahore, Karachi, Islamabad, Rawalpindi, Faisalabad, and beyond — see our <a href="/online-rishta-pakistan" class="text-primary hover:underline">Pakistan rishta hub</a></span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700"><strong>Overseas diaspora:</strong> Muslims in the US, Canada, Europe, and the Gulf seeking UK or Pakistan-based matches</span></li>
        </ul>

        <blockquote class="border-l-4 border-primary pl-4 italic text-gray-600 my-6">"There is nothing like marriage for two who love each other." — Prophet Muhammad ﷺ (Ibn Majah)</blockquote>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Find Your Rishta Today</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">The rishta tradition is one of Islam's most beautiful inheritances — a process that centres family, honour, and intention. D'amour Muslim was built to carry that tradition forward into the digital age, without losing what makes it meaningful. Register free today and start your rishta search the right way.</p>

        <div class="bg-primary/5 rounded-2xl p-6 border border-primary/10 mt-8">
          <p class="text-gray-700 font-medium">Also see: <a href="/online-rishta-pakistan" class="text-primary hover:underline">Online Rishta Pakistan</a> &bull; <a href="/british-pakistani-marriage" class="text-primary hover:underline">British Pakistani Marriage</a> &bull; <a href="/muslim-matchmaking" class="text-primary hover:underline">Muslim Matchmaking</a></p>
        </div>
      </div>
    `
  },
  {
    path: "/find-muslim-spouse",
    pageTitle: "How to Find a Muslim Spouse Online — Search & Filter Guide | D'amour Muslim",
    h1: "How to Find a Muslim Spouse on D'amour Muslim — A Complete Search Guide",
    heroSubtitle: "A step-by-step guide to using D'amour Muslim's search and filter system to find your most compatible halal match — by city, age, religious values, and more.",
    metaDescription: "Learn how to find a Muslim spouse using D'amour Muslim's smart search filters: filter by city, age, religion, education, and more. A practical guide for serious marriage seekers in the UK.",
    keywords: "find muslim spouse, find muslim partner uk, search muslim profiles, muslim spouse search, how to find muslim spouse, halal spouse finder, muslim marriage search uk",
    canonicalPath: "/find-muslim-spouse",
    ctaHeading: "Start Searching for Your Spouse",
    ctaSubtext: "Browse verified Muslim profiles now — filter by city, age, and religious values. Free to join.",
    relatedLinks: [
      { url: "/muslim-marriage", label: "About Muslim Marriage in Islam" },
      { url: "/muslim-matrimonial", label: "Platform Features Guide" },
      { url: "/verified-muslim-profiles", label: "Verified Profiles" },
      { url: "/muslim-matchmaking", label: "Muslim Matchmaking" },
      { url: "/blog/how-to-find-a-muslim-spouse-in-the-uk-simple-real-guide", label: "Full Spouse Search Guide" }
    ],
    pageFaqSchema: [
      { q: "What filters can I use to find a Muslim spouse on D'amour Muslim?", a: "D'amour Muslim lets you filter profiles by gender, age range, city or region, country, height, and more. You can also browse by who was most recently added or search across all approved profiles. All filter results only show verified, approved profiles." },
      { q: "Can I search for a Muslim spouse in a specific UK city?", a: "Yes. You can filter profiles by city name — for example, searching for Muslim singles in London, Birmingham, Manchester, Bradford, Leicester, or Leeds. You can also combine city filters with other criteria like age and gender for more precise results." },
      { q: "How do I get my profile seen by more potential matches?", a: "Complete your profile fully — including your about me section, spouse preferences, education, and career details. Profiles with photos and detailed descriptions receive significantly more views. A detailed profile also signals genuine intentions to potential matches." },
      { q: "What should I include in my profile to attract serious marriage proposals?", a: "Be honest and specific. Include your religious values, family background, career, and what you genuinely seek in a spouse. Mention if you prefer a specific city or are open to relocating. Profiles that are authentic and specific receive higher quality interest requests." },
      { q: "How long does it take to find a match on D'amour Muslim?", a: "The timeline varies for every person. Completing your profile fully, being responsive to interest requests, and having clear, realistic expectations all improve your chances. Many users find their match within weeks; for others it takes longer. Patience and tawakkul are part of the journey." }
    ],
    pageFaqs: [
      { q: "What filters can I use to find a Muslim spouse on D'amour Muslim?", a: "D'amour Muslim lets you filter profiles by gender, age range, city or region, country, height, and more. You can also browse by who was most recently added or search across all approved profiles. All filter results only show verified, approved profiles." },
      { q: "Can I search for a Muslim spouse in a specific UK city?", a: "Yes. You can filter profiles by city name — for example, searching for Muslim singles in London, Birmingham, Manchester, Bradford, Leicester, or Leeds. You can also combine city filters with other criteria like age and gender for more precise results." },
      { q: "How do I get my profile seen by more potential matches?", a: "Complete your profile fully — including your about me section, spouse preferences, education, and career details. Profiles with photos and detailed descriptions receive significantly more views. A detailed profile also signals genuine intentions to potential matches." },
      { q: "What should I include in my profile to attract serious marriage proposals?", a: "Be honest and specific. Include your religious values, family background, career, and what you genuinely seek in a spouse. Mention if you prefer a specific city or are open to relocating. Profiles that are authentic and specific receive higher quality interest requests." },
      { q: "How long does it take to find a match on D'amour Muslim?", a: "The timeline varies for every person. Completing your profile fully, being responsive to interest requests, and having clear, realistic expectations all improve your chances. Many users find their match within weeks; for others it takes longer. Patience and tawakkul are part of the journey." }
    ],
    bodyContent: `
      <div class="prose max-w-none">
        <p class="text-lg text-gray-700 mb-6 leading-relaxed">Finding a Muslim spouse online is about more than just browsing profiles — it is about using the right tools strategically so that the right people can find you, and you can find them. This guide explains exactly how to use D'amour Muslim's search and filter system to make your spouse search as effective and efficient as possible.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Step 1 — Build a Complete, Honest Profile</h2>
        <p class="text-gray-700 mb-4">Before you start searching, you need to be searchable. Profiles with complete information receive significantly more views and interest requests than incomplete ones. Here is what to focus on:</p>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Upload a clear, recent photo.</strong> Profiles with photos receive far more views. Use a respectful, appropriate image that presents you genuinely.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Write a detailed "About Me" section.</strong> Be honest about your values, personality, and life goals. Vague profiles attract vague responses.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Specify what you are looking for.</strong> The "Spouse Preferences" section is where you define compatibility criteria — use it thoughtfully.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Include your city and background.</strong> Location is one of the most common search filters — ensure yours is accurate.</span></li>
        </ul>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Step 2 — Understanding the Search Filters</h2>
        <p class="text-gray-700 mb-4">D'amour Muslim's filter system lets you narrow down thousands of verified profiles to only the most relevant matches. Here is what each filter does:</p>
        <div class="grid md:grid-cols-2 gap-4 mb-8">
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="font-semibold text-gray-800 mb-2">Gender Filter</h3>
            <p class="text-gray-600 text-sm">Browse specifically male or female profiles. The default view shows all approved profiles; apply this filter to focus your search.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="font-semibold text-gray-800 mb-2">Age Range</h3>
            <p class="text-gray-600 text-sm">Set a minimum and maximum age. Be realistic — profiles that set very narrow age ranges often miss compatible matches slightly outside those bounds.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="font-semibold text-gray-800 mb-2">City / Location</h3>
            <p class="text-gray-600 text-sm">Filter by city name: London, Birmingham, Manchester, Bradford, Leicester, Leeds, or any other UK city. You can also search by country for overseas profiles.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="font-semibold text-gray-800 mb-2">Height Range</h3>
            <p class="text-gray-600 text-sm">If height compatibility matters to you, use the height filter to set your preferred range in centimetres.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="font-semibold text-gray-800 mb-2">Nationality</h3>
            <p class="text-gray-600 text-sm">Filter by nationality — useful if you are specifically seeking a match from a particular background or wish to cross-filter with city.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="font-semibold text-gray-800 mb-2">Sort Order</h3>
            <p class="text-gray-600 text-sm">Sort by "Newly Added" to see the most recently verified profiles, or browse randomly for a wider discovery experience.</p>
          </div>
        </div>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Step 3 — Evaluating a Profile Before Sending Interest</h2>
        <p class="text-gray-700 mb-4">Before you send an interest request, take time to read a profile carefully. Look for:</p>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700"><strong>Alignment on religious values:</strong> Do their stated Islamic practice and values align with yours?</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700"><strong>Realistic compatibility:</strong> Age, location, education, and lifestyle — are these genuinely compatible with what you need?</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700"><strong>Specificity in writing:</strong> A well-written "About Me" signals a serious, thoughtful person. Minimal or vague writing may indicate a less engaged profile.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700"><strong>Spouse preferences:</strong> Do their stated preferences include or exclude you based on your genuine characteristics?</span></li>
        </ul>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Step 4 — Sending an Interest Request and What Happens Next</h2>
        <p class="text-gray-700 mb-4">When you send an interest request, the other person receives a notification. If they accept, you are both connected and can begin communicating through the platform's secure messaging system. If they decline, you can continue searching — each interaction brings you closer to the right match.</p>

        <blockquote class="border-l-4 border-primary pl-6 py-3 bg-primary/5 rounded-r-xl mb-6">
          <p class="text-gray-700 italic">Remember: every rejection in the marriage search is Allah's protection and redirection. Keep your intentions pure, make dua consistently, and trust the process.</p>
        </blockquote>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Search by UK City — Local Match Hubs</h2>
        <p class="text-gray-700 mb-4">If you want to find a Muslim spouse in a specific UK city, use our dedicated city matrimony pages — they show relevant profiles and community information for each location:</p>
        <div class="flex flex-wrap gap-2 mb-6">
          <a href="/muslim-matrimony-london" class="px-4 py-2 bg-primary/10 text-primary rounded-full text-sm font-semibold hover:bg-primary hover:text-white transition-all duration-300">London</a>
          <a href="/muslim-matrimony-birmingham" class="px-4 py-2 bg-primary/10 text-primary rounded-full text-sm font-semibold hover:bg-primary hover:text-white transition-all duration-300">Birmingham</a>
          <a href="/muslim-matrimony-manchester" class="px-4 py-2 bg-primary/10 text-primary rounded-full text-sm font-semibold hover:bg-primary hover:text-white transition-all duration-300">Manchester</a>
          <a href="/muslim-matrimony-bradford" class="px-4 py-2 bg-primary/10 text-primary rounded-full text-sm font-semibold hover:bg-primary hover:text-white transition-all duration-300">Bradford</a>
          <a href="/muslim-matrimony-leicester" class="px-4 py-2 bg-primary/10 text-primary rounded-full text-sm font-semibold hover:bg-primary hover:text-white transition-all duration-300">Leicester</a>
          <a href="/muslim-matrimony-leeds" class="px-4 py-2 bg-primary/10 text-primary rounded-full text-sm font-semibold hover:bg-primary hover:text-white transition-all duration-300">Leeds</a>
        </div>

        <div class="bg-primary/5 rounded-2xl p-6 border border-primary/10 mt-8">
          <p class="text-gray-700 font-medium">New to the platform? Start with the <a href="/muslim-matrimonial" class="text-primary hover:underline">Platform Features Guide</a> to understand how everything works. Want to understand the Islamic framework first? Read our <a href="/muslim-marriage" class="text-primary hover:underline">Muslim Marriage in Islam</a> page.</p>
        </div>
      </div>
    `
  },
  {
    path: "/best-muslim-marriage-website",
    pageTitle: "Best Muslim Marriage Website UK — A Buyer's Guide | D'amour Muslim",
    h1: "Best Muslim Marriage Website — How to Choose & Why D'amour Muslim Qualifies",
    heroSubtitle: "Not all Muslim marriage websites are equal. Here is what separates the best from the rest — and how D'amour Muslim scores on every criterion.",
    metaDescription: "What makes the best Muslim marriage website? Verification, halal design, privacy, moderation, and free access — we score D'amour Muslim on all five. Join free.",
    keywords: "best muslim marriage website, best muslim matrimonial site, best halal marriage app, top muslim marriage platform uk, muslim marriage website review",
    canonicalPath: "/best-muslim-marriage-website",
    ctaHeading: "Make the Right Choice Today",
    ctaSubtext: "Join D'amour Muslim free — a platform that scores highly on every criterion that matters.",
    relatedLinks: [
      { url: "/verified-muslim-profiles", label: "Verified Muslim Profiles" },
      { url: "/trusted-muslim-matchmaking", label: "Trusted Muslim Matchmaking" },
      { url: "/halal-marriage", label: "Halal Marriage Platform" },
      { url: "/free-muslim-marriage-site", label: "Free Muslim Marriage Site" },
      { url: "/muslim-matchmaking", label: "Muslim Matchmaking" }
    ],
    pageFaqSchema: [
      { q: "What separates a good Muslim marriage website from a bad one?", a: "Five things: (1) profile verification — does the platform manually check profiles before they go live? (2) Halal design — is the interaction structure designed to prevent free mixing? (3) Privacy — is your data GDPR compliant and never sold? (4) Moderation quality — can fake or inappropriate profiles be reported and removed quickly? (5) Free access — can you use the core features without a paywall? D'amour Muslim performs well on all five." },
      { q: "Is D'amour Muslim better than Muzmatch or IslamicMarriage.com?", a: "D'amour Muslim is specifically built for the UK Muslim community with a focus on manual verification and halal interaction design. Unlike apps that prioritise engagement over Islamic etiquette, D'amour Muslim does not allow unsolicited messaging, requires marriage intent, and supports family involvement. We recommend trying D'amour Muslim and comparing your experience directly — registration is free with no obligation." },
      { q: "Are paid Muslim marriage sites better than free ones?", a: "Not necessarily. A paywall does not equal quality — it equals a business model. Some paid platforms use subscription fees to justify light moderation. D'amour Muslim offers free access because we believe financial barriers should not stand between Muslims and marriage. The platform's quality comes from its moderation standards and halal design, not its pricing." },
      { q: "How do I know if a Muslim marriage website is safe to use?", a: "Look for: (1) GDPR compliance — is the site registered and compliant with UK data protection law? (2) Manual profile review — are profiles approved by a human before going live? (3) A clear reporting mechanism — can you report suspicious profiles easily? (4) No unsolicited contact — does the site prevent anyone from messaging you without your consent? D'amour Muslim meets all of these standards." },
      { q: "What is the best free Muslim marriage website in the UK?", a: "D'amour Muslim is one of the few UK-focused halal matrimonial platforms that offers genuinely free access — not a freemium model where core features are locked behind a subscription. You can register, build a profile, browse verified matches, and send expressions of interest all for free. We believe this aligns with Islamic values around facilitating marriage." }
    ],
    pageFaqs: [
      { q: "What separates a good Muslim marriage website from a bad one?", a: "Five things: (1) profile verification — does the platform manually check profiles before they go live? (2) Halal design — is the interaction structure designed to prevent free mixing? (3) Privacy — is your data GDPR compliant and never sold? (4) Moderation quality — can fake or inappropriate profiles be reported and removed quickly? (5) Free access — can you use the core features without a paywall? D'amour Muslim performs well on all five." },
      { q: "Is D'amour Muslim better than Muzmatch or IslamicMarriage.com?", a: "D'amour Muslim is specifically built for the UK Muslim community with a focus on manual verification and halal interaction design. Unlike apps that prioritise engagement over Islamic etiquette, D'amour Muslim does not allow unsolicited messaging, requires marriage intent, and supports family involvement. We recommend trying D'amour Muslim and comparing your experience directly — registration is free with no obligation." },
      { q: "Are paid Muslim marriage sites better than free ones?", a: "Not necessarily. A paywall does not equal quality — it equals a business model. Some paid platforms use subscription fees to justify light moderation. D'amour Muslim offers free access because we believe financial barriers should not stand between Muslims and marriage. The platform's quality comes from its moderation standards and halal design, not its pricing." },
      { q: "How do I know if a Muslim marriage website is safe to use?", a: "Look for: (1) GDPR compliance — is the site registered and compliant with UK data protection law? (2) Manual profile review — are profiles approved by a human before going live? (3) A clear reporting mechanism — can you report suspicious profiles easily? (4) No unsolicited contact — does the site prevent anyone from messaging you without your consent? D'amour Muslim meets all of these standards." },
      { q: "What is the best free Muslim marriage website in the UK?", a: "D'amour Muslim is one of the few UK-focused halal matrimonial platforms that offers genuinely free access — not a freemium model where core features are locked behind a subscription. You can register, build a profile, browse verified matches, and send expressions of interest all for free. We believe this aligns with Islamic values around facilitating marriage." }
    ],
    bodyContent: `
      <div class="prose max-w-none">
        <p class="text-lg text-gray-700 mb-6 leading-relaxed">Choosing where to search for a Muslim spouse is one of the most consequential platform decisions you will make. The wrong choice wastes months on fake profiles, inappropriate interactions, and frustrating dead ends. The right choice connects you with serious, verified, compatible Muslims in a halal environment. This page is not just a platform promotion — it is a practical buyer's guide to help you evaluate any Muslim marriage website, including D'amour Muslim, against the criteria that actually matter.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">What to Look for in a Muslim Marriage Website</h2>
        <p class="text-gray-700 mb-4 leading-relaxed">Before you commit time and personal information to any platform, assess it against these five criteria:</p>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">1.</span><span class="text-gray-700"><strong>Profile verification:</strong> Are profiles manually reviewed before going live, or does the platform rely entirely on automated checks? Fake profiles are the number one problem on matrimonial sites — only manual moderation addresses it properly.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">2.</span><span class="text-gray-700"><strong>Halal interaction design:</strong> Is the communication structure designed to prevent free mixing — or does the platform allow anyone to message anyone freely? A truly halal platform gates communication behind mutual acceptance.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">3.</span><span class="text-gray-700"><strong>Data privacy &amp; GDPR compliance:</strong> Is the platform registered and compliant with UK GDPR? Is your personal information sold to third parties? Privacy is not optional — it is a right, especially for Muslims sharing sensitive personal details.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">4.</span><span class="text-gray-700"><strong>Moderation quality:</strong> Can you report a suspicious or inappropriate profile easily? How quickly is it acted upon? The best platforms take reports seriously and remove bad actors quickly.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">5.</span><span class="text-gray-700"><strong>Free access:</strong> Can you use the core features — browsing, searching, and sending interest — without a subscription? Paywalls discriminate against Muslims who cannot afford them, which contradicts Islamic values around facilitating marriage.</span></li>
        </ul>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">How D'amour Muslim Scores on Every Criterion</h2>
        <div class="grid md:grid-cols-2 gap-4 mb-8">
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Profile Verification ✓</h3>
            <p class="text-gray-700 text-sm leading-relaxed">Every profile on D'amour Muslim is manually reviewed by the moderation team before it goes live. No automated approval — a human checks each submission for plausibility, appropriate content, and completeness. Profiles that fail the check are rejected or returned for amendment.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Halal Interaction Design ✓</h3>
            <p class="text-gray-700 text-sm leading-relaxed">Communication is gated: you cannot message anyone who has not accepted your expression of interest. There are no open inboxes, no group features, no social feed. The design enforces Islamic etiquette rather than just recommending it.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Data Privacy &amp; GDPR ✓</h3>
            <p class="text-gray-700 text-sm leading-relaxed">D'amour Muslim is UK GDPR compliant. Your personal data is never sold to advertisers or third parties. Profile information is only visible to approved, logged-in members — not to the public or search engines.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Moderation Quality ✓</h3>
            <p class="text-gray-700 text-sm leading-relaxed">Any profile or message can be reported instantly. The moderation team reviews and acts on reports. Repeat offenders are permanently banned. The platform's Islamic values are enforced through action, not just policy.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100 md:col-span-2">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Free Access ✓</h3>
            <p class="text-gray-700 text-sm leading-relaxed">Registration, profile creation, profile browsing, and sending expressions of interest are all completely free on D'amour Muslim. No paywall, no subscription required for core features. This is a deliberate choice grounded in Islamic values — facilitation of marriage should not be monetised against those who need it most.</p>
          </div>
        </div>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">What Users Say About D'amour Muslim</h2>
        <div class="grid md:grid-cols-2 gap-4 mb-8">
          <blockquote class="border-l-4 border-primary pl-4 italic text-gray-600">"I tried two other platforms before this one. The difference is the quality of profiles — they are real people with real intentions. I felt safe from the first week." <br/><cite class="text-sm not-italic text-gray-500 mt-2 block">— Sister from Birmingham, 27</cite></blockquote>
          <blockquote class="border-l-4 border-primary pl-4 italic text-gray-600">"My parents were reluctant at first, but once they saw how the platform worked — the family involvement, no random messaging — they were fully on board. We found a proposal within a month." <br/><cite class="text-sm not-italic text-gray-500 mt-2 block">— Brother from Manchester, 31</cite></blockquote>
        </div>

        <blockquote class="border-l-4 border-primary pl-4 italic text-gray-600 my-6">"Whoever among you can afford to marry, let him do so, for it is more effective in lowering the gaze and guarding chastity. And whoever cannot, let him fast." — Prophet Muhammad ﷺ (Bukhari &amp; Muslim)</blockquote>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Common Red Flags to Avoid</h2>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✗</span><span class="text-gray-700"><strong>No profile verification:</strong> If any email address can create a live profile instantly, expect a flood of fake accounts</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✗</span><span class="text-gray-700"><strong>Free mixing encouraged:</strong> Open messaging inboxes, likes, and social feeds normalise casual interaction — not appropriate for a halal matrimonial search</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✗</span><span class="text-gray-700"><strong>Pay to message:</strong> Platforms that require a subscription to send messages prioritise revenue over Muslim welfare</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✗</span><span class="text-gray-700"><strong>No GDPR compliance:</strong> Non-compliant platforms may sell or misuse your personal data — a serious risk when sharing sensitive family and personal information</span></li>
        </ul>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Make the Right Choice Today</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">Your marriage search deserves a platform that takes Islamic values as seriously as you do. D'amour Muslim was built by Muslims, for Muslims, with every design decision filtered through the lens of halal compliance, community trust, and user safety. Register free today — no obligation, no subscription, no compromises.</p>

        <div class="bg-primary/5 rounded-2xl p-6 border border-primary/10 mt-8">
          <p class="text-gray-700 font-medium">Also see: <a href="/verified-muslim-profiles" class="text-primary hover:underline">Verified Muslim Profiles</a> &bull; <a href="/trusted-muslim-matchmaking" class="text-primary hover:underline">Trusted Muslim Matchmaking</a> &bull; <a href="/halal-marriage" class="text-primary hover:underline">Halal Marriage Platform</a></p>
        </div>
      </div>
    `
  },
  {
    path: "/free-muslim-marriage-site",
    pageTitle: "Free Muslim Marriage Site — No Paywall, No Compromise | D'amour Muslim",
    h1: "Free Muslim Marriage Site — Why We Believe Access Should Be Free",
    heroSubtitle: "Facilitating marriage is an act of faith. D'amour Muslim is free because putting a paywall between Muslims and their marriage search contradicts Islamic values.",
    metaDescription: "D'amour Muslim is a genuinely free Muslim marriage site — register, browse verified profiles, and send interest with no subscription required. Free because Islam says so.",
    keywords: "free muslim marriage site, free muslim marriage website, free halal marriage site, free muslim matrimonial, free muslim matchmaking uk",
    canonicalPath: "/free-muslim-marriage-site",
    ctaHeading: "Join Free — No Hidden Costs",
    ctaSubtext: "Register on D'amour Muslim today — no subscription, no paywall, no surprises.",
    relatedLinks: [
      { url: "/muslim-marriage", label: "Muslim Marriage in Islam" },
      { url: "/best-muslim-marriage-website", label: "Best Muslim Marriage Website" },
      { url: "/verified-muslim-profiles", label: "Verified Muslim Profiles" },
      { url: "/halal-marriage", label: "Halal Marriage Platform" },
      { url: "/muslim-matchmaking", label: "Muslim Matchmaking" }
    ],
    pageFaqSchema: [
      { q: "Is D'amour Muslim really free — what's the catch?", a: "There is no catch. D'amour Muslim is free to register, free to browse all verified profiles, and free to send expressions of interest. There is no subscription required to use core features. This is a deliberate choice by the platform — we believe financial barriers should not stand between Muslims and their marriage search. The platform is sustained through voluntary support and operational efficiency, not subscription fees." },
      { q: "Do I need to pay to send messages or contact matches on D'amour Muslim?", a: "No. Sending an expression of interest — the first step in initiating contact — is completely free. Once both parties have accepted mutual interest, you can communicate through the platform's secure messaging system. There is no pay-to-message wall. You will not be asked for a credit card to contact someone." },
      { q: "What features are available for free on D'amour Muslim?", a: "All core features are free: account registration, profile creation and editing, profile photo upload, browsing all verified profiles, using search filters (age, city, gender, nationality), sending expressions of interest, and messaging accepted connections. D'amour Muslim does not lock essential functionality behind a subscription tier." },
      { q: "Why is a free Muslim marriage site better than a paid one?", a: "Not all free platforms are good, and not all paid platforms are bad — but free access means no Muslim is excluded from the search based on financial circumstances. Islam encourages facilitating marriage, not monetising it. A platform that charges for basic features effectively tells less affluent Muslims their marriage search matters less. D'amour Muslim rejects that premise." },
      { q: "How does D'amour Muslim stay free — how is it funded?", a: "D'amour Muslim is operated with a lean, community-first approach. The platform is sustained without relying on subscription revenue from users. We do not sell your data to advertisers. The founding principle is that every Muslim deserves access to a quality halal matrimonial platform regardless of their financial situation." }
    ],
    pageFaqs: [
      { q: "Is D'amour Muslim really free — what's the catch?", a: "There is no catch. D'amour Muslim is free to register, free to browse all verified profiles, and free to send expressions of interest. There is no subscription required to use core features. This is a deliberate choice by the platform — we believe financial barriers should not stand between Muslims and their marriage search. The platform is sustained through voluntary support and operational efficiency, not subscription fees." },
      { q: "Do I need to pay to send messages or contact matches on D'amour Muslim?", a: "No. Sending an expression of interest — the first step in initiating contact — is completely free. Once both parties have accepted mutual interest, you can communicate through the platform's secure messaging system. There is no pay-to-message wall. You will not be asked for a credit card to contact someone." },
      { q: "What features are available for free on D'amour Muslim?", a: "All core features are free: account registration, profile creation and editing, profile photo upload, browsing all verified profiles, using search filters (age, city, gender, nationality), sending expressions of interest, and messaging accepted connections. D'amour Muslim does not lock essential functionality behind a subscription tier." },
      { q: "Why is a free Muslim marriage site better than a paid one?", a: "Not all free platforms are good, and not all paid platforms are bad — but free access means no Muslim is excluded from the search based on financial circumstances. Islam encourages facilitating marriage, not monetising it. A platform that charges for basic features effectively tells less affluent Muslims their marriage search matters less. D'amour Muslim rejects that premise." },
      { q: "How does D'amour Muslim stay free — how is it funded?", a: "D'amour Muslim is operated with a lean, community-first approach. The platform is sustained without relying on subscription revenue from users. We do not sell your data to advertisers. The founding principle is that every Muslim deserves access to a quality halal matrimonial platform regardless of their financial situation." }
    ],
    bodyContent: `
      <div class="prose max-w-none">
        <p class="text-lg text-gray-700 mb-6 leading-relaxed">There is a growing trend in the Muslim matrimonial market: charge a monthly subscription, lock core features behind a paywall, and monetise the desperation of Muslims struggling to find a halal spouse. D'amour Muslim was built in deliberate opposition to that trend. If you are looking for a free Muslim marriage site, this page explains not just what is free — but <em>why</em> it is free, and why that matters.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">What's Completely Free on D'amour Muslim</h2>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Account registration:</strong> Create your account in minutes — no payment details required</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Full profile creation:</strong> Build a complete profile including photos, bio, and spouse preferences</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Browse all verified profiles:</strong> View every approved profile on the platform — no preview-only teaser wall</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Search and filter:</strong> Use all search filters (city, age, gender, nationality, height) without restriction</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Send expressions of interest:</strong> Initiate contact with any profile without a subscription</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Secure messaging:</strong> Communicate with accepted connections through the platform's messaging system — free</span></li>
        </ul>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Why We Believe Halal Marriage Should Be Accessible</h2>
        <p class="text-gray-700 mb-4 leading-relaxed">The Messenger of Allah ﷺ said: <em>"Help the unmarried among you get married."</em> (Tabarani) This hadith is not directed at wealthy Muslims only. Islam's encouragement of marriage — and its command to facilitate it — is universal. Putting a £19.99/month subscription between a young Muslim and their search for a halal spouse directly contradicts this spirit.</p>
        <p class="text-gray-700 mb-6 leading-relaxed">D'amour Muslim was founded on the belief that financial circumstances should never be the reason a Muslim cannot access a quality halal matrimonial platform. A student, a young professional saving for a deposit, a single parent on a tight budget — all deserve the same access as someone who can easily afford a subscription. That is a values statement, not a marketing line.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">How Free Access Benefits the Whole Community</h2>
        <div class="grid md:grid-cols-2 gap-4 mb-8">
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">More Genuine Profiles</h3>
            <p class="text-gray-700 text-sm leading-relaxed">When there is no financial barrier to entry, more serious Muslims register. Paid platforms attract only those willing to pay — D'amour Muslim attracts everyone who is serious about marriage, creating a more representative, diverse pool of verified profiles.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">No Subscription Pressure</h3>
            <p class="text-gray-700 text-sm leading-relaxed">Paid platforms have an incentive to keep you subscribed — which means keeping you searching, not finding. D'amour Muslim's interest is aligned with yours: the sooner you find a match, the better. Free access removes the perverse incentive to delay your success.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100 md:col-span-2">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Equal Access Across the Ummah</h3>
            <p class="text-gray-700 text-sm leading-relaxed">Whether you are a professional in London or a family in Lahore, a student in Birmingham or a widow in Bradford — D'amour Muslim provides the same full access to every user. Islamic equality in practice.</p>
          </div>
        </div>

        <blockquote class="border-l-4 border-primary pl-4 italic text-gray-600 my-6">"Help the unmarried among you get married, for marriage is what protects them and preserves their faith." — Prophet Muhammad ﷺ (Tabarani)</blockquote>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">What You Get When You Register Free</h2>
        <div class="grid md:grid-cols-5 gap-3 mb-8">
          <div class="bg-gray-50 rounded-xl p-4 text-center border border-gray-100">
            <span class="text-primary font-bold text-xl block mb-2">1</span>
            <p class="text-gray-700 text-xs leading-relaxed">Register with name &amp; email — no card required</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-4 text-center border border-gray-100">
            <span class="text-primary font-bold text-xl block mb-2">2</span>
            <p class="text-gray-700 text-xs leading-relaxed">Build your full profile with photos and preferences</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-4 text-center border border-gray-100">
            <span class="text-primary font-bold text-xl block mb-2">3</span>
            <p class="text-gray-700 text-xs leading-relaxed">Browse all verified profiles — filter by city, age, background</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-4 text-center border border-gray-100">
            <span class="text-primary font-bold text-xl block mb-2">4</span>
            <p class="text-gray-700 text-xs leading-relaxed">Send expressions of interest — free, unlimited</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-4 text-center border border-gray-100">
            <span class="text-primary font-bold text-xl block mb-2">5</span>
            <p class="text-gray-700 text-xs leading-relaxed">Communicate with accepted connections through secure messaging</p>
          </div>
        </div>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">No Hidden Costs. No Surprises.</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">You will not be asked for payment details on registration. You will not hit a paywall when you try to send your first message. You will not be prompted to upgrade when you reach some arbitrary free-tier limit. D'amour Muslim is a free Muslim marriage site in the full sense of the word — not a freemium trap with a free trial attached.</p>

        <div class="bg-primary/5 rounded-2xl p-6 border border-primary/10 mt-8">
          <p class="text-gray-700 font-medium">Also see: <a href="/muslim-marriage" class="text-primary hover:underline">Muslim Marriage in Islam</a> &bull; <a href="/best-muslim-marriage-website" class="text-primary hover:underline">Best Muslim Marriage Website</a> &bull; <a href="/verified-muslim-profiles" class="text-primary hover:underline">Verified Muslim Profiles</a></p>
        </div>
      </div>
    `
  },
  {
    path: "/trusted-muslim-matchmaking",
    pageTitle: "Trusted Muslim Matchmaking — Safety Architecture Explained | D'amour Muslim",
    h1: "Trusted Muslim Matchmaking — How We Keep the Platform Safe",
    heroSubtitle: "Trust is not claimed — it is built. Here is exactly how D'amour Muslim's safety architecture works, from moderation to GDPR compliance.",
    metaDescription: "What makes D'amour Muslim a trusted Muslim matchmaking service? Moderation process, fake-profile prevention, GDPR compliance, and Islamic ethics — all explained.",
    keywords: "trusted muslim matchmaking, safe muslim marriage site, reliable muslim matchmaking, trustworthy muslim matrimonial, secure muslim marriage platform",
    canonicalPath: "/trusted-muslim-matchmaking",
    ctaHeading: "Join with Confidence",
    ctaSubtext: "Register on D'amour Muslim — a platform built on trust, safety, and Islamic principles.",
    relatedLinks: [
      { url: "/verified-muslim-profiles", label: "Verified Muslim Profiles" },
      { url: "/halal-marriage", label: "Halal Marriage Platform" },
      { url: "/best-muslim-marriage-website", label: "Best Muslim Marriage Website" },
      { url: "/muslim-matchmaking", label: "Muslim Matchmaking" }
    ],
    pageFaqSchema: [
      { q: "How does D'amour Muslim prevent fake profiles?", a: "Every profile is manually reviewed by the D'amour Muslim moderation team before it goes live. Automated signup does not equal a live profile — a human reviews every submission for identity plausibility, photo appropriateness, bio content quality, and completeness. Profiles that fail review are rejected or sent back for revision. This manual-first approach is the single most effective method of preventing fake accounts." },
      { q: "Is my personal information safe on D'amour Muslim?", a: "Yes. D'amour Muslim is fully compliant with UK GDPR (General Data Protection Regulation). Your personal data is never sold to advertisers, third-party services, or data brokers. Profile information is only visible to approved, logged-in members — not to the public, search engines, or guests. You can also request deletion of your account and all associated data at any time." },
      { q: "What should I do if I encounter a suspicious profile on D'amour Muslim?", a: "Use the Report button on the profile page immediately. Every report goes directly to the moderation team and is reviewed as a priority. Provide as much context as possible — what you found suspicious and any relevant messages. The moderation team will investigate and take action, which may include suspension or permanent removal of the profile. You can also block the user to prevent any further contact." },
      { q: "Is D'amour Muslim regulated or registered as a company?", a: "D'amour Muslim operates as a registered UK business and complies with all applicable UK laws including the UK GDPR and the Data Protection Act 2018. The platform follows the ICO's guidance on data handling for online services. Company details are available on the platform's Company Details page." },
      { q: "How quickly are new profiles reviewed before going live on D'amour Muslim?", a: "The moderation team aims to review all new profile submissions promptly. During peak periods, review may take up to 24-48 hours. You will receive an email notification once your profile is approved and live. Until approval, your profile is not visible to other users — protecting both your privacy and the platform's integrity." }
    ],
    pageFaqs: [
      { q: "How does D'amour Muslim prevent fake profiles?", a: "Every profile is manually reviewed by the D'amour Muslim moderation team before it goes live. Automated signup does not equal a live profile — a human reviews every submission for identity plausibility, photo appropriateness, bio content quality, and completeness. Profiles that fail review are rejected or sent back for revision. This manual-first approach is the single most effective method of preventing fake accounts." },
      { q: "Is my personal information safe on D'amour Muslim?", a: "Yes. D'amour Muslim is fully compliant with UK GDPR (General Data Protection Regulation). Your personal data is never sold to advertisers, third-party services, or data brokers. Profile information is only visible to approved, logged-in members — not to the public, search engines, or guests. You can also request deletion of your account and all associated data at any time." },
      { q: "What should I do if I encounter a suspicious profile on D'amour Muslim?", a: "Use the Report button on the profile page immediately. Every report goes directly to the moderation team and is reviewed as a priority. Provide as much context as possible — what you found suspicious and any relevant messages. The moderation team will investigate and take action, which may include suspension or permanent removal of the profile. You can also block the user to prevent any further contact." },
      { q: "Is D'amour Muslim regulated or registered as a company?", a: "D'amour Muslim operates as a registered UK business and complies with all applicable UK laws including the UK GDPR and the Data Protection Act 2018. The platform follows the ICO's guidance on data handling for online services. Company details are available on the platform's Company Details page." },
      { q: "How quickly are new profiles reviewed before going live on D'amour Muslim?", a: "The moderation team aims to review all new profile submissions promptly. During peak periods, review may take up to 24-48 hours. You will receive an email notification once your profile is approved and live. Until approval, your profile is not visible to other users — protecting both your privacy and the platform's integrity." }
    ],
    bodyContent: `
      <div class="prose max-w-none">
        <p class="text-lg text-gray-700 mb-6 leading-relaxed">Trust in an online matrimonial platform is not something that can be promised — it must be demonstrated through systems, processes, and consistent action. For a Muslim marriage search, trust is not just about safety from scammers; it is about the confidence that every profile you are viewing is a real person with genuine intentions, that your personal data is protected with the same seriousness you give to your privacy, and that the platform's Islamic values are enforced through its architecture, not just advertised on its homepage.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">How We Keep D'amour Muslim Safe</h2>
        <div class="grid md:grid-cols-2 gap-4 mb-8">
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Profile Moderation</h3>
            <p class="text-gray-700 text-sm leading-relaxed">Every single profile is reviewed by a human moderator before it goes live. No automated approval system — a trained team member checks each submission for authenticity, appropriate content, photo quality, and bio completeness. Profiles that fail are rejected or returned for amendment. This is the most resource-intensive part of running the platform, and the most important.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Fake Profile Prevention</h3>
            <p class="text-gray-700 text-sm leading-relaxed">Fake profiles fail the manual review process. Moderators look for: stock or downloaded photos, inconsistent personal information, bios that do not match the stated background, and profiles that appear duplicated or automated. Any profile showing these signs is rejected before it ever appears in search results.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">GDPR Compliance</h3>
            <p class="text-gray-700 text-sm leading-relaxed">D'amour Muslim is fully compliant with UK GDPR. Your personal data — name, contact details, profile information — is never sold to third parties or advertisers. You can request full data deletion at any time. Profile photos and information are only accessible to approved, logged-in members, not to the general public or search engines.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Reporting &amp; Blocking</h3>
            <p class="text-gray-700 text-sm leading-relaxed">Every profile and every message has an instant report function. Reports go directly to the moderation team and are treated as a priority. Users who are reported and found in violation of the platform's code of conduct are suspended or permanently banned. You can also block any user immediately to prevent further contact.</p>
          </div>
        </div>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Our Moderation Process — Step by Step</h2>
        <div class="grid md:grid-cols-5 gap-3 mb-8">
          <div class="bg-gray-50 rounded-xl p-4 text-center border border-gray-100">
            <span class="text-primary font-bold text-xl block mb-2">1</span>
            <p class="text-gray-700 text-xs leading-relaxed">User registers with email and basic details</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-4 text-center border border-gray-100">
            <span class="text-primary font-bold text-xl block mb-2">2</span>
            <p class="text-gray-700 text-xs leading-relaxed">Email address verified — account activated</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-4 text-center border border-gray-100">
            <span class="text-primary font-bold text-xl block mb-2">3</span>
            <p class="text-gray-700 text-xs leading-relaxed">Profile completed — photo, bio, preferences submitted</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-4 text-center border border-gray-100">
            <span class="text-primary font-bold text-xl block mb-2">4</span>
            <p class="text-gray-700 text-xs leading-relaxed">Moderator manually reviews the full profile submission</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-4 text-center border border-gray-100">
            <span class="text-primary font-bold text-xl block mb-2">5</span>
            <p class="text-gray-700 text-xs leading-relaxed">Profile approved and goes live — or rejected with feedback</p>
          </div>
        </div>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">UK GDPR &amp; Data Privacy</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">D'amour Muslim takes data privacy seriously. We collect only the information necessary to run the platform — your name, email, profile details, and usage data. This information is never sold, never shared with advertisers, and never used for purposes beyond operating the platform. All data is stored securely, and you have the right to request full deletion of your account and all associated data at any time, in accordance with UK GDPR. The platform's complete privacy policy is available on the <a href="/privacy" class="text-primary hover:underline">Privacy Policy</a> page.</p>

        <blockquote class="border-l-4 border-primary pl-4 italic text-gray-600 my-6">"Truthfulness leads to righteousness, and righteousness leads to Paradise. A man keeps on telling the truth until he becomes a truthful person. Falsehood leads to sin, and sin leads to the Hellfire." — Prophet Muhammad ﷺ (Bukhari)</blockquote>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">How to Report a Concern</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">If you encounter a profile or message that appears suspicious, inappropriate, or in violation of D'amour Muslim's values, use the Report button on the profile or within the conversation. Your report is sent directly to the moderation team and reviewed as a priority. You do not need to provide extensive evidence — if something feels wrong, report it. The team would rather investigate and find nothing than have a genuine case go unreported. You will not be penalised for reporting in good faith.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Trust Signals at a Glance</h2>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">100% manual profile review — every profile checked by a human before going live</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">UK GDPR compliant — data never sold or shared with third parties</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">No unsolicited messages — communication requires mutual acceptance</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Instant report and block functionality on every profile and message</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Profile photos and details hidden from non-logged-in visitors and search engines</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Registered UK business — transparent company details available</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Islamic conduct standards enforced through platform design, not just policy</span></li>
        </ul>

        <div class="bg-primary/5 rounded-2xl p-6 border border-primary/10 mt-8">
          <p class="text-gray-700 font-medium">Also see: <a href="/verified-muslim-profiles" class="text-primary hover:underline">Verified Muslim Profiles</a> &bull; <a href="/halal-marriage" class="text-primary hover:underline">Halal Marriage Platform</a> &bull; <a href="/best-muslim-marriage-website" class="text-primary hover:underline">Best Muslim Marriage Website</a></p>
        </div>
      </div>
    `
  },
  {
    path: "/verified-muslim-profiles",
    pageTitle: "Verified Muslim Profiles — What Verification Actually Means | D'amour Muslim",
    h1: "Verified Muslim Profiles — What Gets Checked, How It Works, and Why It Matters",
    heroSubtitle: "Not all 'verified' labels are equal. Here is exactly what D'amour Muslim's verification process checks — and why it makes the difference between a real matrimonial platform and a fake-profile wasteland.",
    metaDescription: "What does 'verified' mean on D'amour Muslim? The full profile approval workflow — from registration to live profile — explained step by step. Free to join.",
    keywords: "verified muslim profiles, verified muslim marriage profiles, authentic muslim profiles, real muslim matrimonial profiles, screened muslim profiles",
    canonicalPath: "/verified-muslim-profiles",
    ctaHeading: "Join a Platform Where Every Profile Is Real",
    ctaSubtext: "Register free on D'amour Muslim — and browse only verified, approved profiles.",
    relatedLinks: [
      { url: "/trusted-muslim-matchmaking", label: "Trusted Muslim Matchmaking" },
      { url: "/muslim-matchmaking", label: "Muslim Matchmaking" },
      { url: "/best-muslim-marriage-website", label: "Best Muslim Marriage Website" },
      { url: "/halal-marriage", label: "Halal Marriage Platform" }
    ],
    pageFaqSchema: [
      { q: "What does 'verified' mean on D'amour Muslim — do you check ID?", a: "On D'amour Muslim, 'verified' means a human moderator has manually reviewed your profile submission before it was approved and made live. We do not conduct automated ID verification, but our manual review checks for identity plausibility, photo authenticity, bio content quality, Islamic conduct compliance, and profile completeness. Profiles that cannot reasonably be verified as genuine are rejected before going live." },
      { q: "How long does profile verification take on D'amour Muslim?", a: "The moderation team aims to review all submitted profiles promptly. In normal circumstances, review is completed within 24 hours. During high-traffic periods it may take up to 48 hours. You will receive an email notification when your profile is approved. Until then, your profile is not visible to other members." },
      { q: "Can a verified profile on D'amour Muslim still be fake or misleading?", a: "Manual review significantly reduces the risk of fake profiles, but no system is 100% foolproof. A determined bad actor could potentially pass initial review. This is why D'amour Muslim also has an ongoing reporting system — any member can report a profile at any time, and moderators act on reports promptly. The combination of upfront review and ongoing community reporting provides a much stronger safety layer than either method alone." },
      { q: "What should I do if I suspect a verified profile is fake or misleading?", a: "Use the Report button on the profile immediately. Your report goes directly to the moderation team and is investigated as a priority. You do not need conclusive proof — if something feels wrong or inconsistent, reporting it is the right action. The moderation team will review the profile again, compare it against the original submission, and take action if warranted. You can also block the user immediately." },
      { q: "Are all profiles on D'amour Muslim verified before I can see them?", a: "Yes — every profile must pass manual moderator review before it is visible to other members. There is no option to publish a profile instantly without review. This is a non-negotiable part of the platform's design: no unreviewed profile is ever visible in search results or to other users." }
    ],
    pageFaqs: [
      { q: "What does 'verified' mean on D'amour Muslim — do you check ID?", a: "On D'amour Muslim, 'verified' means a human moderator has manually reviewed your profile submission before it was approved and made live. We do not conduct automated ID verification, but our manual review checks for identity plausibility, photo authenticity, bio content quality, Islamic conduct compliance, and profile completeness. Profiles that cannot reasonably be verified as genuine are rejected before going live." },
      { q: "How long does profile verification take on D'amour Muslim?", a: "The moderation team aims to review all submitted profiles promptly. In normal circumstances, review is completed within 24 hours. During high-traffic periods it may take up to 48 hours. You will receive an email notification when your profile is approved. Until then, your profile is not visible to other members." },
      { q: "Can a verified profile on D'amour Muslim still be fake or misleading?", a: "Manual review significantly reduces the risk of fake profiles, but no system is 100% foolproof. A determined bad actor could potentially pass initial review. This is why D'amour Muslim also has an ongoing reporting system — any member can report a profile at any time, and moderators act on reports promptly. The combination of upfront review and ongoing community reporting provides a much stronger safety layer than either method alone." },
      { q: "What should I do if I suspect a verified profile is fake or misleading?", a: "Use the Report button on the profile immediately. Your report goes directly to the moderation team and is investigated as a priority. You do not need conclusive proof — if something feels wrong or inconsistent, reporting it is the right action. The moderation team will review the profile again, compare it against the original submission, and take action if warranted. You can also block the user immediately." },
      { q: "Are all profiles on D'amour Muslim verified before I can see them?", a: "Yes — every profile must pass manual moderator review before it is visible to other members. There is no option to publish a profile instantly without review. This is a non-negotiable part of the platform's design: no unreviewed profile is ever visible in search results or to other users." }
    ],
    bodyContent: `
      <div class="prose max-w-none">
        <p class="text-lg text-gray-700 mb-6 leading-relaxed">The word "verified" is used liberally across the online matrimonial industry. On some platforms it means little more than a confirmed email address. On others it is a badge earned by uploading a selfie that no human ever reviews. On D'amour Muslim, "verified" means something specific and substantive: every single profile is manually reviewed by a human moderator before it is ever visible to another member. This page explains exactly what that process entails — and why it is the most important feature of any serious Muslim matrimonial platform.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">What "Verified" Means on D'amour Muslim</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">A verified profile on D'amour Muslim is one that has been reviewed and approved by a trained moderator. This means a real person — not an algorithm — has looked at your profile photo, read your bio, checked your stated background, and judged that your profile meets the platform's standards for authenticity, appropriate content, and Islamic conduct. Only after this review is your profile published and visible to other members. Without approval, your profile simply does not appear in search results.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">The Verification Journey — From Registration to Live Profile</h2>
        <div class="grid md:grid-cols-5 gap-3 mb-8">
          <div class="bg-gray-50 rounded-xl p-4 text-center border border-gray-100">
            <span class="text-primary font-bold text-xl block mb-2">1</span>
            <p class="text-gray-700 text-xs leading-relaxed font-semibold mb-1">Register</p>
            <p class="text-gray-600 text-xs leading-relaxed">Create an account with your name and email address — no payment required</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-4 text-center border border-gray-100">
            <span class="text-primary font-bold text-xl block mb-2">2</span>
            <p class="text-gray-700 text-xs leading-relaxed font-semibold mb-1">Confirm Email</p>
            <p class="text-gray-600 text-xs leading-relaxed">Verify your email address to activate the account — a basic identity anchor</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-4 text-center border border-gray-100">
            <span class="text-primary font-bold text-xl block mb-2">3</span>
            <p class="text-gray-700 text-xs leading-relaxed font-semibold mb-1">Complete Profile</p>
            <p class="text-gray-600 text-xs leading-relaxed">Fill in your bio, add a photo, set your preferences and spouse criteria</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-4 text-center border border-gray-100">
            <span class="text-primary font-bold text-xl block mb-2">4</span>
            <p class="text-gray-700 text-xs leading-relaxed font-semibold mb-1">Submit for Review</p>
            <p class="text-gray-600 text-xs leading-relaxed">Your completed profile is submitted to the moderation queue for manual review</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-4 text-center border border-gray-100">
            <span class="text-primary font-bold text-xl block mb-2">5</span>
            <p class="text-gray-700 text-xs leading-relaxed font-semibold mb-1">Approved &amp; Live</p>
            <p class="text-gray-600 text-xs leading-relaxed">Moderator approves the profile — you receive an email and go live. Or rejected with feedback.</p>
          </div>
        </div>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">What Our Moderators Check</h2>
        <p class="text-gray-700 mb-4 leading-relaxed">During manual review, moderators assess each profile submission against these criteria:</p>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Identity plausibility:</strong> Does the profile appear to represent a real, individual person? Are the stated name, age, and background internally consistent? Does anything suggest an automated or fabricated submission?</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Profile photo quality:</strong> Is the photo clearly of a real person? Does it appear to be a genuine personal photograph, not a stock image, celebrity photo, or downloaded image? Is it appropriate and modest?</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Bio content:</strong> Is the written bio coherent, genuine, and appropriately detailed? Does it match the background stated in the profile fields? Does it read like a real person wrote it?</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Islamic conduct compliance:</strong> Does the profile's content — language, photo, stated preferences — comply with the platform's Islamic values and code of conduct? Anything inappropriate is rejected.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Profile completeness:</strong> Is the profile complete enough to be genuinely useful to potential matches? Skeletal profiles with minimal information are returned for completion before approval.</span></li>
        </ul>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">What Happens if a Profile Fails Verification</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">A profile that fails the review process is either rejected outright or returned to the user with specific feedback about what needs to be corrected. Common reasons for rejection include: an inappropriate or non-genuine profile photo, a bio that is too vague or inconsistent with other profile information, content that violates Islamic conduct standards, or a profile that appears duplicated or automated. Users whose profiles are rejected are notified and given the opportunity to resubmit with corrections. Profiles that are clearly fraudulent or seriously inappropriate are permanently rejected and the account may be suspended.</p>

        <blockquote class="border-l-4 border-primary pl-4 italic text-gray-600 my-6">"Truthfulness leads to righteousness and righteousness leads to Paradise. And a man keeps on telling the truth until he becomes a truthful person. Falsehood leads to wickedness and wickedness leads to Hellfire." — Prophet Muhammad ﷺ (Bukhari)</blockquote>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Why Verified Profiles Lead to Better Matches</h2>
        <div class="grid md:grid-cols-2 gap-4 mb-8">
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Real People, Real Information</h3>
            <p class="text-gray-700 text-sm leading-relaxed">When you know that every profile has been reviewed by a human, you can invest genuine time and energy in reading them. There is no need to waste mental effort second-guessing whether a profile is real — that work has already been done. This changes the quality of attention you give to the search.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Only Serious People Apply</h3>
            <p class="text-gray-700 text-sm leading-relaxed">The verification process itself acts as a filter. Someone who goes to the effort of completing a genuine, detailed profile and submitting it for review is demonstrably more serious than someone who created a profile in thirty seconds with a stock photo. The friction of review selects for genuine marriage intent.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100 md:col-span-2">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Family Confidence in the Platform</h3>
            <p class="text-gray-700 text-sm leading-relaxed">For Muslim families — particularly those new to online rishta searching — knowing that every profile has been manually reviewed before publication provides crucial reassurance. It means parents can browse with confidence, not with the nagging anxiety that any given profile might be entirely fabricated. Verification is what makes family participation feel safe.</p>
          </div>
        </div>

        <div class="bg-primary/5 rounded-2xl p-6 border border-primary/10 mt-8">
          <p class="text-gray-700 font-medium">Also see: <a href="/trusted-muslim-matchmaking" class="text-primary hover:underline">Trusted Muslim Matchmaking</a> &bull; <a href="/muslim-matchmaking" class="text-primary hover:underline">Muslim Matchmaking</a> &bull; <a href="/best-muslim-marriage-website" class="text-primary hover:underline">Best Muslim Marriage Website</a></p>
        </div>
      </div>
    `
  },
  {
    path: "/online-rishta-pakistan",
    pageTitle: "Online Rishta Pakistan — National Hub for Pakistani Muslim Marriage | D'amour Muslim",
    h1: "Online Rishta Pakistan — The National Hub for Pakistani Muslim Marriage Proposals",
    heroSubtitle: "From Lahore to Karachi, from Islamabad to the UK diaspora — D'amour Muslim connects Pakistani Muslim families and individuals with serious, verified rishta proposals.",
    metaDescription: "Online rishta Pakistan — D'amour Muslim serves Lahore, Karachi, Islamabad, Rawalpindi, Faisalabad and the global Pakistani diaspora. Free to join.",
    keywords: "online rishta pakistan, rishta pakistan online, pakistan matrimonial online, online rishta service pakistan, pakistan marriage website",
    canonicalPath: "/online-rishta-pakistan",
    ctaHeading: "Start Your Rishta Search in Pakistan",
    ctaSubtext: "Register free — browse verified rishta proposals from across Pakistan and the global Pakistani community.",
    relatedLinks: [
      { url: "/rishta-lahore", label: "Rishta Lahore" },
      { url: "/rishta-karachi", label: "Rishta Karachi" },
      { url: "/british-pakistani-marriage", label: "British Pakistani Marriage" },
      { url: "/muslim-rishta", label: "Muslim Rishta" }
    ],
    pageFaqSchema: [
      { q: "Can I find rishta profiles from specific Pakistani cities on D'amour Muslim?", a: "Yes. D'amour Muslim has dedicated pages and profiles for Pakistan's major cities including Lahore, Karachi, Islamabad, Rawalpindi, and Faisalabad. Members can specify their city in their profile, allowing you to search for rishta proposals from the specific city you are looking for. City-specific pages help connect serious seekers from each region." },
      { q: "Is D'amour Muslim available in Pakistan as well as the UK?", a: "Yes. D'amour Muslim is accessible from both Pakistan and the UK. The platform is available via any web browser with no country restriction. This makes it particularly valuable for connecting families in Pakistan with Pakistani diaspora members in the UK and other countries. You can register and use all features from Pakistan at no cost." },
      { q: "Can a family in Pakistan find a match for their son or daughter with an overseas Pakistani?", a: "Absolutely — this is one of D'amour Muslim's most common use cases. A parent in Lahore or Karachi can create a profile on behalf of their son or daughter, specify that they are seeking an overseas (UK-based) Pakistani match, and browse or receive proposals accordingly. Similarly, overseas Pakistanis often specify that they are open to matches from within Pakistan." },
      { q: "How does D'amour Muslim handle the cultural expectations of Pakistani rishta searching?", a: "D'amour Muslim is designed with Pakistani rishta culture in mind. Profiles include fields for biradari background, language spoken, family values, and level of family involvement. The platform respects the formal, family-centred nature of the Pakistani rishta process — it is structured around serious marriage intent, not casual browsing. Families are welcome to manage profiles on behalf of their children." },
      { q: "Is D'amour Muslim free to use for families in Pakistan?", a: "Yes, registration and core usage are completely free for families in Pakistan. You can create a profile, browse verified rishta proposals, and send interest requests without any payment. D'amour Muslim believes financial barriers should not prevent any Muslim family from accessing a serious matrimonial service." }
    ],
    pageFaqs: [
      { q: "Can I find rishta profiles from specific Pakistani cities on D'amour Muslim?", a: "Yes. D'amour Muslim has dedicated pages and profiles for Pakistan's major cities including Lahore, Karachi, Islamabad, Rawalpindi, and Faisalabad. Members can specify their city in their profile, allowing you to search for rishta proposals from the specific city you are looking for. City-specific pages help connect serious seekers from each region." },
      { q: "Is D'amour Muslim available in Pakistan as well as the UK?", a: "Yes. D'amour Muslim is accessible from both Pakistan and the UK. The platform is available via any web browser with no country restriction. This makes it particularly valuable for connecting families in Pakistan with Pakistani diaspora members in the UK and other countries. You can register and use all features from Pakistan at no cost." },
      { q: "Can a family in Pakistan find a match for their son or daughter with an overseas Pakistani?", a: "Absolutely — this is one of D'amour Muslim's most common use cases. A parent in Lahore or Karachi can create a profile on behalf of their son or daughter, specify that they are seeking an overseas (UK-based) Pakistani match, and browse or receive proposals accordingly. Similarly, overseas Pakistanis often specify that they are open to matches from within Pakistan." },
      { q: "How does D'amour Muslim handle the cultural expectations of Pakistani rishta searching?", a: "D'amour Muslim is designed with Pakistani rishta culture in mind. Profiles include fields for biradari background, language spoken, family values, and level of family involvement. The platform respects the formal, family-centred nature of the Pakistani rishta process — it is structured around serious marriage intent, not casual browsing. Families are welcome to manage profiles on behalf of their children." },
      { q: "Is D'amour Muslim free to use for families in Pakistan?", a: "Yes, registration and core usage are completely free for families in Pakistan. You can create a profile, browse verified rishta proposals, and send interest requests without any payment. D'amour Muslim believes financial barriers should not prevent any Muslim family from accessing a serious matrimonial service." }
    ],
    bodyContent: `
      <div class="prose max-w-none">
        <p class="text-lg text-gray-700 mb-6 leading-relaxed">In Pakistan, a rishta is rarely a private matter between two individuals. It is a family process — aunties consult aunties, biradari networks are activated, mothers compare notes after mosque, and fathers ask discreet questions about a potential son-in-law's earning capacity before a first introduction is even arranged. The Pakistani rishta tradition is deeply communal, deeply considered, and deeply tied to the Islamic view of marriage as a union of families, not just individuals. D'amour Muslim honours that tradition while extending its reach far beyond any single biradari or postcode.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">D'amour Muslim's Pakistan Coverage</h2>
        <p class="text-gray-700 mb-4 leading-relaxed">D'amour Muslim has members from across Pakistan's major cities. Browse rishta profiles from your city, or open your search nationally:</p>
        <div class="flex flex-wrap gap-2 mb-6">
          <a href="/rishta-lahore" class="px-4 py-2 bg-primary/10 text-primary rounded-full text-sm font-medium hover:bg-primary/20 transition-colors">Lahore</a>
          <a href="/rishta-karachi" class="px-4 py-2 bg-primary/10 text-primary rounded-full text-sm font-medium hover:bg-primary/20 transition-colors">Karachi</a>
          <a href="/rishta-islamabad" class="px-4 py-2 bg-primary/10 text-primary rounded-full text-sm font-medium hover:bg-primary/20 transition-colors">Islamabad</a>
          <a href="/rishta-rawalpindi" class="px-4 py-2 bg-primary/10 text-primary rounded-full text-sm font-medium hover:bg-primary/20 transition-colors">Rawalpindi</a>
          <a href="/rishta-faisalabad" class="px-4 py-2 bg-primary/10 text-primary rounded-full text-sm font-medium hover:bg-primary/20 transition-colors">Faisalabad</a>
        </div>
        <p class="text-gray-700 mb-6 leading-relaxed">Whether you are seeking a rishta within your own city or you are open to proposals from anywhere across Pakistan, the platform allows you to set your location preferences accordingly. Members from smaller cities and towns are also welcome — Pakistan's Muslim community extends far beyond the big five cities.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Connecting Overseas Pakistanis with Families Back Home</h2>
        <p class="text-gray-700 mb-4 leading-relaxed">One of the most common — and most delicate — rishta scenarios in the Pakistani community is the overseas match: a British Pakistani seeking a spouse in Pakistan, or a Pakistani family seeking an overseas partner for their child. D'amour Muslim is built to serve precisely this dynamic.</p>
        <div class="grid md:grid-cols-2 gap-4 mb-6">
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">British Pakistanis Seeking a Pakistani Spouse</h3>
            <p class="text-gray-700 text-sm leading-relaxed">Many British Pakistanis — particularly those raised with strong ties to Pakistani culture and family values — prefer a spouse from Pakistan. D'amour Muslim allows UK-based members to search specifically for Pakistan-based profiles, making this traditionally difficult search far more accessible than relying on family contacts alone.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Pakistani Families Seeking an Overseas Match</h3>
            <p class="text-gray-700 text-sm leading-relaxed">Families in Lahore, Karachi, and other Pakistani cities frequently seek an overseas Pakistani match for their son or daughter — particularly from the UK, which has the largest Pakistani diaspora outside Pakistan itself. D'amour Muslim's platform makes this search systematic rather than dependent on the right uncle knowing the right family.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100 md:col-span-2">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Diaspora Pakistanis Reconnecting with Their Roots</h3>
            <p class="text-gray-700 text-sm leading-relaxed">Second and third-generation Pakistanis in the UK, USA, Canada, and Gulf countries often feel a deep pull towards a spouse who shares their cultural heritage. D'amour Muslim provides a space where diaspora Pakistanis can maintain their cultural identity in their most important life decision — without the pressure or gossip of traditional family networks.</p>
          </div>
        </div>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">How Families in Pakistan Use D'amour Muslim</h2>
        <p class="text-gray-700 mb-4 leading-relaxed">Unlike Western dating apps where individuals search for themselves, Pakistani rishta culture frequently involves the family managing the search on behalf of a son or daughter — particularly for a first marriage where the young person may be less experienced or less comfortable with the process. D'amour Muslim fully accommodates this.</p>
        <p class="text-gray-700 mb-6 leading-relaxed">A parent can create and manage a profile on behalf of their child, clearly stating that the profile is family-managed. They can browse proposals, send expressions of interest, and have initial communications — before involving their son or daughter once a suitable match has been identified. This mirrors the traditional rishta process exactly, with the platform serving the role that the matchmaker aunty once played — but without the gossip, the embellishments, or the limited social network.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Why Online Rishta Works for Pakistan</h2>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Wider reach than any biradari network:</strong> Even the most well-connected family only knows so many families. An online platform opens the entire national — and international — pool of serious Muslim marriage seekers.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Privacy and discretion:</strong> Browsing profiles online is private in a way that attending rishta introductions through family networks is not. No one needs to know you are searching until you are ready to proceed with a specific proposal.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Detailed profiles before any introduction:</strong> Traditional rishta relies on word-of-mouth information that is often incomplete or selectively presented. Online profiles give you verified, self-declared information — education, profession, religious practice, family background — before any contact is made.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Bridging the geographic gap:</strong> Pakistan is vast, and the Pakistani diaspora is global. Online rishta removes geography as a barrier — a family in Faisalabad can now realistically connect with a family in London with the same ease as connecting with a family in Lahore.</span></li>
        </ul>

        <blockquote class="border-l-4 border-primary pl-4 italic text-gray-600 my-6">"When someone with whose religion and character you are satisfied comes to you, then marry him. If you do not do so, there will be mischief in the earth and great corruption." — Prophet Muhammad ﷺ (Tirmidhi)</blockquote>

        <div class="bg-primary/5 rounded-2xl p-6 border border-primary/10 mt-8">
          <p class="text-gray-700 font-medium">Explore by city: <a href="/rishta-lahore" class="text-primary hover:underline">Rishta in Lahore</a> &bull; <a href="/rishta-karachi" class="text-primary hover:underline">Rishta in Karachi</a> &bull; <a href="/british-pakistani-marriage" class="text-primary hover:underline">British Pakistani Marriage</a> &bull; <a href="/muslim-rishta" class="text-primary hover:underline">Muslim Rishta</a></p>
        </div>
      </div>
    `
  },
  {
    path: "/rishta-lahore",
    pageTitle: "Rishta Lahore — Find Verified Marriage Proposals in Lahore | D'amour Muslim",
    h1: "Rishta Lahore — Verified Marriage Proposals in the Heart of Pakistan",
    heroSubtitle: "Lahore is the cultural heartbeat of Pakistan. D'amour Muslim connects Lahori families and individuals with verified, serious rishta proposals — honouring the city's deep tradition of family-centred Muslim marriage.",
    metaDescription: "Find rishta in Lahore — verified profiles from Gulberg, DHA, Johar Town, Model Town, Bahria Town and across Lahore. Free to join D'amour Muslim.",
    keywords: "rishta lahore, rishta in lahore, lahore matrimonial, lahore rishta service, marriage proposals lahore, lahore muslim marriage",
    canonicalPath: "/rishta-lahore",
    ctaHeading: "Find Your Lahore Rishta Today",
    ctaSubtext: "Register free and browse verified rishta proposals from Lahore and beyond.",
    relatedLinks: [
      { url: "/online-rishta-pakistan", label: "Online Rishta Pakistan" },
      { url: "/rishta-karachi", label: "Rishta Karachi" },
      { url: "/muslim-rishta", label: "Muslim Rishta" }
    ],
    pageFaqSchema: [
      { q: "Are there rishta profiles from specific Lahore areas like Gulberg, DHA, or Johar Town?", a: "Yes. D'amour Muslim has members from across Lahore's key residential areas including Gulberg, DHA (Defence Housing Authority), Johar Town, Model Town, Bahria Town, Garden Town, and Iqbal Town. Members typically include their area or neighbourhood in their profile details, allowing you to identify proposals from your preferred part of the city." },
      { q: "How can a family in Lahore find a rishta proposal through D'amour Muslim?", a: "A family in Lahore can register directly on D'amour Muslim — either the individual seeking marriage or a parent on their behalf. After completing and submitting the profile for review, you can browse verified proposals from Lahore and across Pakistan. You can filter by city, send interest requests, and communicate through the platform's secure messaging system once both parties have expressed interest." },
      { q: "Does D'amour Muslim serve overseas Pakistanis looking for a rishta in Lahore?", a: "Yes — connecting overseas Pakistanis (particularly British Pakistanis) with families and individuals in Lahore is one of D'amour Muslim's most common use cases. An overseas Pakistani can specify on their profile that they are open to matches from Lahore, and Lahori families can indicate openness to overseas matches. Both parties can search for each other directly." },
      { q: "What makes Lahore's rishta culture unique compared to Karachi or Islamabad?", a: "Lahore's rishta culture is strongly rooted in Punjabi Muslim tradition — it is typically more family-driven and community-oriented than Karachi's more cosmopolitan approach. Biradari networks play a significant role, family elders are heavily involved, and there is strong cultural emphasis on the prospective spouse's family background, education, and profession. The Lahori rishta process tends to be formal and thorough, with multiple family meetings expected before a final decision." },
      { q: "Is D'amour Muslim free for families in Lahore?", a: "Yes, registration and core use of D'amour Muslim is completely free for families and individuals in Lahore. You can create a profile, browse verified rishta proposals, and send interest requests at no cost. D'amour Muslim believes no Muslim family should face a financial barrier to accessing a serious, trustworthy matrimonial service." }
    ],
    pageFaqs: [
      { q: "Are there rishta profiles from specific Lahore areas like Gulberg, DHA, or Johar Town?", a: "Yes. D'amour Muslim has members from across Lahore's key residential areas including Gulberg, DHA (Defence Housing Authority), Johar Town, Model Town, Bahria Town, Garden Town, and Iqbal Town. Members typically include their area or neighbourhood in their profile details, allowing you to identify proposals from your preferred part of the city." },
      { q: "How can a family in Lahore find a rishta proposal through D'amour Muslim?", a: "A family in Lahore can register directly on D'amour Muslim — either the individual seeking marriage or a parent on their behalf. After completing and submitting the profile for review, you can browse verified proposals from Lahore and across Pakistan. You can filter by city, send interest requests, and communicate through the platform's secure messaging system once both parties have expressed interest." },
      { q: "Does D'amour Muslim serve overseas Pakistanis looking for a rishta in Lahore?", a: "Yes — connecting overseas Pakistanis (particularly British Pakistanis) with families and individuals in Lahore is one of D'amour Muslim's most common use cases. An overseas Pakistani can specify on their profile that they are open to matches from Lahore, and Lahori families can indicate openness to overseas matches. Both parties can search for each other directly." },
      { q: "What makes Lahore's rishta culture unique compared to Karachi or Islamabad?", a: "Lahore's rishta culture is strongly rooted in Punjabi Muslim tradition — it is typically more family-driven and community-oriented than Karachi's more cosmopolitan approach. Biradari networks play a significant role, family elders are heavily involved, and there is strong cultural emphasis on the prospective spouse's family background, education, and profession. The Lahori rishta process tends to be formal and thorough, with multiple family meetings expected before a final decision." },
      { q: "Is D'amour Muslim free for families in Lahore?", a: "Yes, registration and core use of D'amour Muslim is completely free for families and individuals in Lahore. You can create a profile, browse verified rishta proposals, and send interest requests at no cost. D'amour Muslim believes no Muslim family should face a financial barrier to accessing a serious, trustworthy matrimonial service." }
    ],
    bodyContent: `
      <div class="prose max-w-none">
        <p class="text-lg text-gray-700 mb-6 leading-relaxed">Lahore — the "Heart of Pakistan" — is the cultural, intellectual, and spiritual capital of Punjabi Muslim civilisation. With a population of approximately 14 million people, it is Pakistan's second largest city and the capital of Punjab province, the country's most populous region. Its skyline is defined by the Mughal architecture of the Badshahi Mosque, the spiritual weight of the Data Darbar shrine, and the timeless symmetry of the Wazir Khan Mosque. It is a city that takes pride in its history, its cuisine, its poetry — and above all, its deep-rooted sense of family. Nowhere is that more evident than in the way Lahore approaches marriage.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Muslim Rishta Culture in Lahore</h2>
        <p class="text-gray-700 mb-4 leading-relaxed">In Lahore, a rishta is a serious matter that involves the entire family from the very beginning. The Lahori rishta tradition is rooted in Punjabi Muslim values: respect for elders, the importance of family name and reputation, the formal involvement of mothers and aunties as the initial scouts, and the expectation that a son or daughter's marriage will reflect well on the entire family network.</p>
        <p class="text-gray-700 mb-6 leading-relaxed">Biradari — the extended kinship network — plays a significant role in traditional Lahori rishta searching. Families often prefer to marry within their own biradari, though this is gradually becoming less rigid among the educated and professional middle class of Gulberg, DHA, and Johar Town. Education and profession have become increasingly important criteria alongside family background, and many Lahori families now actively seek university-educated, professionally established spouses for their children.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Key Areas of Lahore on D'amour Muslim</h2>
        <p class="text-gray-700 mb-4 leading-relaxed">D'amour Muslim has members from across Lahore's residential neighbourhoods. The following areas are among the most represented:</p>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Gulberg:</strong> Lahore's most prestigious commercial and residential district — home to professionals, business families, and educated urban Muslims. A high-demand area for rishta proposals.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>DHA (Defence Housing Authority):</strong> A planned military-linked housing scheme that has become one of Lahore's most sought-after residential areas — known for educated, professional families.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Johar Town:</strong> A large, diverse residential area with a strong middle-class Muslim community. One of the most populous areas of modern Lahore.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Model Town:</strong> One of Lahore's oldest planned residential areas — historically home to established, respected Lahori families with strong educational and professional backgrounds.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Bahria Town:</strong> A rapidly growing modern township on the outskirts of Lahore — popular with young professional families seeking a structured, safe residential environment.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Garden Town &amp; Iqbal Town:</strong> Well-established middle-class areas with large Muslim populations — traditional Lahori neighbourhoods with strong community ties and active mosque networks.</span></li>
        </ul>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Lahore's Muslim Heritage</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">Lahore's Islamic heritage is among the richest of any city in the world. The <strong>Badshahi Mosque</strong>, commissioned by Emperor Aurangzeb in 1673, stands as one of the largest mosques ever built — its red sandstone courtyard capable of holding over 100,000 worshippers. The <strong>Data Darbar shrine</strong> — the resting place of Hazrat Ali Hujwiri (Data Ganj Bakhsh), the great Sufi scholar who brought Islam to the Punjab in the 11th century — draws hundreds of thousands of devotees and remains the spiritual heart of Lahore. The <strong>Wazir Khan Mosque</strong>, built in 1634, is considered the finest example of Mughal-era decorative tile-work in the world. This heritage is not merely architectural — it is the cultural and spiritual foundation upon which Lahore's Muslim community understands marriage, family, and the obligations of a pious life.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">How D'amour Muslim Serves the Lahore Rishta Market</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">D'amour Muslim provides Lahori families with a structured, moderated platform that reflects the seriousness with which Lahore approaches marriage. Profiles include detailed fields for family background, education, profession, religious practice, biradari, and location — giving Lahori families the information they expect before making an approach. The platform is family-friendly: parents can manage profiles on behalf of their son or daughter, and communication only begins after both parties have expressed interest. There is no casual browsing or unsolicited contact — the process mirrors the formal courtesy of the traditional Lahori rishta approach.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">3-Step Guide to Finding a Rishta in Lahore</h2>
        <div class="grid md:grid-cols-3 gap-4 mb-8">
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <span class="text-primary font-bold text-2xl block mb-2">1</span>
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Create Your Profile</h3>
            <p class="text-gray-700 text-sm leading-relaxed">Register free and complete your profile with your background, family details, religious practice, and your criteria for a spouse. Submit for moderation review — typically approved within 24 hours.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <span class="text-primary font-bold text-2xl block mb-2">2</span>
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Browse Lahore Profiles</h3>
            <p class="text-gray-700 text-sm leading-relaxed">Search for verified rishta proposals from Lahore — filter by area, age, education, and religious practice. Browse at your own pace, privately, and share profiles with family members involved in the search.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <span class="text-primary font-bold text-2xl block mb-2">3</span>
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Express Interest &amp; Connect</h3>
            <p class="text-gray-700 text-sm leading-relaxed">Send an interest request to profiles you wish to connect with. When both parties have expressed interest, secure communication opens — allowing families to introduce themselves and explore the rishta further in the proper way.</p>
          </div>
        </div>

        <blockquote class="border-l-4 border-primary pl-4 italic text-gray-600 my-6">"O mankind, We have created you from a male and a female and made you peoples and tribes that you may know one another. Indeed, the most noble of you in the sight of Allah is the most righteous of you." — Quran 49:13</blockquote>

        <div class="bg-primary/5 rounded-2xl p-6 border border-primary/10 mt-8">
          <p class="text-gray-700 font-medium">Also explore: <a href="/online-rishta-pakistan" class="text-primary hover:underline">Online Rishta Pakistan</a> &bull; <a href="/rishta-karachi" class="text-primary hover:underline">Rishta in Karachi</a> &bull; <a href="/muslim-rishta" class="text-primary hover:underline">Muslim Rishta</a></p>
        </div>
      </div>
    `
  },
  {
    path: "/rishta-karachi",
    pageTitle: "Rishta Karachi — Verified Marriage Proposals in Pakistan's Most Diverse City | D'amour Muslim",
    h1: "Rishta Karachi — Verified Marriage Proposals in Pakistan's Most Cosmopolitan City",
    heroSubtitle: "Karachi is home to 22 million people and every Muslim ethnicity in Pakistan. D'amour Muslim connects Karachi's diverse Muslim community with serious, verified rishta proposals — free to join.",
    metaDescription: "Find rishta in Karachi — verified profiles from DHA, Clifton, Gulshan-e-Iqbal, North Nazimabad, PECHS and across Karachi. Free to join D'amour Muslim.",
    keywords: "rishta karachi, rishta in karachi, karachi matrimonial, karachi rishta service, marriage proposals karachi, karachi muslim marriage",
    canonicalPath: "/rishta-karachi",
    ctaHeading: "Find Your Karachi Rishta Today",
    ctaSubtext: "Register free — browse verified rishta proposals from Karachi and the global Pakistani community.",
    relatedLinks: [
      { url: "/online-rishta-pakistan", label: "Online Rishta Pakistan" },
      { url: "/rishta-lahore", label: "Rishta Lahore" },
      { url: "/muslim-rishta", label: "Muslim Rishta" }
    ],
    pageFaqSchema: [
      { q: "Are there profiles from specific Karachi areas like DHA, Clifton, or Gulshan-e-Iqbal?", a: "Yes. D'amour Muslim has members from across Karachi's key residential areas including DHA (Defence), Clifton, Gulshan-e-Iqbal, North Nazimabad, PECHS (Pakistan Employees Co-operative Housing Society), Korangi, and Saddar. Members typically include their area or neighbourhood in their profiles, allowing you to search for rishta proposals from specific parts of the city." },
      { q: "Does D'amour Muslim have profiles from Urdu-speaking (Muhajir) families in Karachi?", a: "Yes. As Pakistan's most ethnically diverse city, Karachi's Muslim community on D'amour Muslim includes families from all of the city's major ethnic communities — including the Urdu-speaking Muhajir community (the largest single ethnic group in Karachi), as well as Punjabi, Sindhi, Pashtun, Balochi, and Bengali Muslim families. Members can specify their ethnic and linguistic background in their profiles." },
      { q: "Can a family in Karachi find an overseas Pakistani match through D'amour Muslim?", a: "Yes — this is one of the most common use cases on D'amour Muslim. A family in Karachi can register and create a profile for their son or daughter, specify that they are open to overseas Pakistani matches, and browse or receive proposals from British Pakistanis and Pakistanis in other diaspora countries. Similarly, overseas Pakistanis can specify Karachi as a preferred location for their spouse." },
      { q: "How does rishta culture in Karachi differ from Lahore?", a: "Karachi's rishta culture is notably more cosmopolitan and urban than Lahore's. As Pakistan's economic capital and most diverse city, Karachi has a stronger tradition of inter-ethnic marriages — Punjabi-Muhajir, Sindhi-Pashtun, and other combinations are common and generally accepted. Education and professional career are weighted particularly highly in Karachi. Biradari considerations are present but typically less rigid than in Lahore. Karachi families tend to be more pragmatic and less bound by geographic proximity in their marriage searches." },
      { q: "Is D'amour Muslim free to join for Karachi families?", a: "Yes, registration and core use of D'amour Muslim is completely free for families and individuals in Karachi. You can create a profile, browse verified rishta proposals, and send interest requests at no cost. D'amour Muslim believes that no Muslim family in Karachi — or anywhere in Pakistan — should face a financial barrier to accessing a serious matrimonial service." }
    ],
    pageFaqs: [
      { q: "Are there profiles from specific Karachi areas like DHA, Clifton, or Gulshan-e-Iqbal?", a: "Yes. D'amour Muslim has members from across Karachi's key residential areas including DHA (Defence), Clifton, Gulshan-e-Iqbal, North Nazimabad, PECHS (Pakistan Employees Co-operative Housing Society), Korangi, and Saddar. Members typically include their area or neighbourhood in their profiles, allowing you to search for rishta proposals from specific parts of the city." },
      { q: "Does D'amour Muslim have profiles from Urdu-speaking (Muhajir) families in Karachi?", a: "Yes. As Pakistan's most ethnically diverse city, Karachi's Muslim community on D'amour Muslim includes families from all of the city's major ethnic communities — including the Urdu-speaking Muhajir community (the largest single ethnic group in Karachi), as well as Punjabi, Sindhi, Pashtun, Balochi, and Bengali Muslim families. Members can specify their ethnic and linguistic background in their profiles." },
      { q: "Can a family in Karachi find an overseas Pakistani match through D'amour Muslim?", a: "Yes — this is one of the most common use cases on D'amour Muslim. A family in Karachi can register and create a profile for their son or daughter, specify that they are open to overseas Pakistani matches, and browse or receive proposals from British Pakistanis and Pakistanis in other diaspora countries. Similarly, overseas Pakistanis can specify Karachi as a preferred location for their spouse." },
      { q: "How does rishta culture in Karachi differ from Lahore?", a: "Karachi's rishta culture is notably more cosmopolitan and urban than Lahore's. As Pakistan's economic capital and most diverse city, Karachi has a stronger tradition of inter-ethnic marriages — Punjabi-Muhajir, Sindhi-Pashtun, and other combinations are common and generally accepted. Education and professional career are weighted particularly highly in Karachi. Biradari considerations are present but typically less rigid than in Lahore. Karachi families tend to be more pragmatic and less bound by geographic proximity in their marriage searches." },
      { q: "Is D'amour Muslim free to join for Karachi families?", a: "Yes, registration and core use of D'amour Muslim is completely free for families and individuals in Karachi. You can create a profile, browse verified rishta proposals, and send interest requests at no cost. D'amour Muslim believes that no Muslim family in Karachi — or anywhere in Pakistan — should face a financial barrier to accessing a serious matrimonial service." }
    ],
    bodyContent: `
      <div class="prose max-w-none">
        <p class="text-lg text-gray-700 mb-6 leading-relaxed">Karachi is like no other city in Pakistan — and perhaps no other city in the Muslim world. With a population of approximately 22 million, it is Pakistan's largest city and its economic capital. But what defines Karachi above all else is its extraordinary diversity. Every Muslim ethnicity in Pakistan is represented here in significant numbers: the Urdu-speaking Muhajir community (the largest single group), Punjabis, Sindhis, Pashtuns, Balochis, Bengalis, and dozens of smaller communities all call Karachi home. This diversity shapes Karachi's culture, its energy — and its approach to marriage. Finding a rishta in Karachi means navigating a city where identity is layered, where modernity and tradition coexist, and where the right match requires more than just a shared surname.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Muslim Marriage Culture in Karachi</h2>
        <p class="text-gray-700 mb-4 leading-relaxed">Karachi's Muslim marriage culture has been shaped by its unique position as a city of immigrants — a metropolis built largely by the Muhajir community who came from across India at Partition in 1947, and continually added to by internal migration from every province of Pakistan. This history has made Karachi notably more open to inter-ethnic marriages than other Pakistani cities. A Punjabi family in Gulshan-e-Iqbal may quite comfortably consider a Muhajir proposal from PECHS, or a Sindhi family in North Nazimabad may be open to a Pashtun proposal from Korangi. Education and professional standing tend to be the primary criteria in Karachi's marriage market — family name and biradari matter, but they compete with the practical realities of urban, professional Muslim life.</p>
        <p class="text-gray-700 mb-6 leading-relaxed">The role of the traditional rishta aunty is still present in Karachi, but the city's professional culture has accelerated the shift to more independent and online approaches. Well-educated Karachiites — the doctors, engineers, IT professionals, and business families of DHA and Clifton — are increasingly comfortable with structured online rishta searching, provided it is conducted with the same seriousness as any traditional approach.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Key Areas of Karachi on D'amour Muslim</h2>
        <p class="text-gray-700 mb-4 leading-relaxed">D'amour Muslim has members from across Karachi's major residential areas:</p>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>DHA (Defence Housing Authority):</strong> Karachi's most prestigious residential and commercial district — home to upper-middle-class and affluent professional families from all ethnic backgrounds. DHA proposals are among the most sought-after in the city.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Clifton:</strong> Adjacent to DHA, Clifton is one of Karachi's oldest and most established upmarket neighbourhoods — characterised by educated, cosmopolitan Muslim families with strong professional and business backgrounds.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Gulshan-e-Iqbal:</strong> One of Karachi's largest and most diverse middle-class residential areas — home to a large and active Muslim community spanning multiple ethnicities. A major source of rishta proposals on D'amour Muslim.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>North Nazimabad:</strong> A well-established, predominantly Urdu-speaking Muhajir area — one of the most historically significant Muslim residential areas in Karachi, with deep roots in Pakistan's intellectual and professional Muslim community.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>PECHS (Pakistan Employees Co-operative Housing Society):</strong> A central Karachi residential area with a strong, mixed ethnic Muslim professional community — long associated with established Karachi families.</span></li>
        </ul>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Karachi's Multi-Ethnic Muslim Diversity</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">One of D'amour Muslim's genuine strengths in the Karachi context is its openness to Pakistan's full ethnic diversity. The Muhajir community — whose ancestors came from UP, Bihar, Hyderabad Deccan, and other parts of India — brought with them a rich tradition of Urdu literature, Islamic scholarship, and a particular emphasis on education and professional achievement. The Punjabi community in Karachi is large and often comprises families who migrated for business or government careers. The Sindhi Muslim community has deep roots in the region going back centuries before Partition. Pashtun communities, concentrated in areas like Korangi and Sohrab Goth, bring the strong family values and tribal honour of the Pashtun tradition. D'amour Muslim reflects this diversity: profiles span all these communities, and the platform's search tools allow users to specify — or leave open — the ethnic and linguistic background they are seeking.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">How D'amour Muslim Serves Karachi</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">D'amour Muslim understands that Karachi's rishta market is different from any other Pakistani city. The platform's profile design allows members to specify their ethnic community, mother tongue, residential area, education and profession — all the information that Karachi families use to assess a proposal before making contact. The moderation process ensures every profile is genuine and human-reviewed before going live. Families can manage profiles on behalf of their son or daughter — or individuals can manage their own profiles directly. Communication only opens when mutual interest is established, maintaining the propriety that Karachi's Muslim families expect regardless of how modern their approach to the search has become. The <strong>Masjid-e-Tooba</strong> — the largest single-dome mosque in the world, located in Karachi's Defence area — stands as a reminder that for all its cosmopolitan energy, Karachi is at its core a city defined by its Islamic faith.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">3-Step Guide to Finding a Rishta in Karachi</h2>
        <div class="grid md:grid-cols-3 gap-4 mb-8">
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <span class="text-primary font-bold text-2xl block mb-2">1</span>
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Register &amp; Build Your Profile</h3>
            <p class="text-gray-700 text-sm leading-relaxed">Register free and create a detailed profile — including your ethnic background, residential area, education, profession, religious practice, and your criteria for a spouse. Submit for manual moderation review — typically completed within 24 hours.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <span class="text-primary font-bold text-2xl block mb-2">2</span>
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Browse Karachi Proposals</h3>
            <p class="text-gray-700 text-sm leading-relaxed">Search for verified rishta proposals from across Karachi — filter by area, ethnicity, education, age, and religious practice. Browse privately and at your own pace. Share profiles with family members involved in the search.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <span class="text-primary font-bold text-2xl block mb-2">3</span>
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Connect When Both Are Ready</h3>
            <p class="text-gray-700 text-sm leading-relaxed">Send an interest request to profiles you wish to pursue. Secure communication opens only when both parties have expressed mutual interest — ensuring every conversation begins with equal seriousness and intention on both sides.</p>
          </div>
        </div>

        <blockquote class="border-l-4 border-primary pl-4 italic text-gray-600 my-6">"Marry the one who is religious, for if you do not, there will be hardship and corruption in the land." — Prophet Muhammad ﷺ (Bukhari)</blockquote>

        <div class="bg-primary/5 rounded-2xl p-6 border border-primary/10 mt-8">
          <p class="text-gray-700 font-medium">Also explore: <a href="/online-rishta-pakistan" class="text-primary hover:underline">Online Rishta Pakistan</a> &bull; <a href="/rishta-lahore" class="text-primary hover:underline">Rishta in Lahore</a> &bull; <a href="/muslim-rishta" class="text-primary hover:underline">Muslim Rishta</a></p>
        </div>
      </div>
    `
  },
  {
    path: "/muslim-marriage-uk",
    pageTitle: "Muslim Marriage in the UK — The Definitive Guide for British Muslims | D'amour Muslim",
    h1: "Muslim Marriage in the UK — Everything British Muslims Need to Know",
    heroSubtitle: "The UK is home to 3.9 million Muslims — the most ethnically diverse Muslim community in Europe. D'amour Muslim is built for every one of them.",
    metaDescription: "Muslim marriage in the UK — a complete guide for British Muslims. City-by-city coverage, what UK Muslims look for in a spouse, and how D'amour Muslim serves the British Muslim community. Free to join.",
    keywords: "muslim marriage uk, muslim marriage in the uk, british muslim marriage, uk muslim matrimony, halal marriage uk",
    canonicalPath: "/muslim-marriage-uk",
    ctaHeading: "Join Thousands of UK Muslims on D'amour Muslim",
    ctaSubtext: "Register free and find your match — wherever you are in the UK.",
    relatedLinks: [
      { url: "/muslim-matrimony-london", label: "Muslim Matrimony London" },
      { url: "/muslim-matrimony-birmingham", label: "Muslim Matrimony Birmingham" },
      { url: "/british-pakistani-marriage", label: "British Pakistani Marriage" },
      { url: "/muslim-matchmaking", label: "Muslim Matchmaking" }
    ],
    pageFaqSchema: [
      { q: "How many Muslims are there in the UK?", a: "According to the 2021 Census for England and Wales, there are approximately 3.9 million Muslims in England and Wales alone, representing around 6.5% of the population. This makes Muslims the second largest religious group in the country after Christians. The UK's Muslim community is one of the most ethnically diverse in the world, encompassing South Asian, Arab, African, Turkish, and many other communities." },
      { q: "What are the most popular cities for Muslim marriage in the UK?", a: "The cities with the largest Muslim populations — and therefore the most active matrimonial communities — are London (over 1.1 million Muslims), Birmingham (approx. 340,000), Manchester (approx. 130,000), Bradford (approx. 130,000), Leicester (approx. 115,000), and Leeds (approx. 80,000). D'amour Muslim has dedicated pages for each of these cities to help members find local Muslim singles." },
      { q: "Is D'amour Muslim specifically for UK Muslims or is it global?", a: "D'amour Muslim serves both UK Muslims and the global Pakistani diaspora. The platform has strong UK-based membership — particularly in London, Birmingham, Manchester, Bradford, Leicester, and Leeds — as well as members based in Pakistan and other countries. UK Muslims seeking a UK-based spouse can filter by location. Those open to overseas matches can search more broadly." },
      { q: "What makes British Muslim marriage different from Muslim marriage in Pakistan?", a: "British Muslims navigate a unique set of pressures: balancing a British upbringing and lifestyle with Islamic values and family expectations often rooted in South Asian or other cultures. First and second generation dynamics, the question of overseas vs UK-born partners, navigating biradari expectations within a British context, and the challenges of meeting suitable Muslims in a predominantly non-Muslim social environment all shape the British Muslim marriage experience in ways that differ significantly from Pakistan or other majority-Muslim countries." },
      { q: "Are there Muslim marriage events or services specifically for UK Muslims?", a: "Yes — D'amour Muslim is specifically designed for UK Muslims and the wider British Muslim diaspora. Beyond the platform itself, there are various Muslim marriage events, speed-networking evenings, and wali-facilitated introductions operating in major UK cities. D'amour Muslim provides the online infrastructure that complements any of these approaches — allowing serious marriage seekers to browse and connect between events, or as their primary search method." }
    ],
    pageFaqs: [
      { q: "How many Muslims are there in the UK?", a: "According to the 2021 Census for England and Wales, there are approximately 3.9 million Muslims in England and Wales alone, representing around 6.5% of the population. This makes Muslims the second largest religious group in the country after Christians. The UK's Muslim community is one of the most ethnically diverse in the world, encompassing South Asian, Arab, African, Turkish, and many other communities." },
      { q: "What are the most popular cities for Muslim marriage in the UK?", a: "The cities with the largest Muslim populations — and therefore the most active matrimonial communities — are London (over 1.1 million Muslims), Birmingham (approx. 340,000), Manchester (approx. 130,000), Bradford (approx. 130,000), Leicester (approx. 115,000), and Leeds (approx. 80,000). D'amour Muslim has dedicated pages for each of these cities to help members find local Muslim singles." },
      { q: "Is D'amour Muslim specifically for UK Muslims or is it global?", a: "D'amour Muslim serves both UK Muslims and the global Pakistani diaspora. The platform has strong UK-based membership — particularly in London, Birmingham, Manchester, Bradford, Leicester, and Leeds — as well as members based in Pakistan and other countries. UK Muslims seeking a UK-based spouse can filter by location. Those open to overseas matches can search more broadly." },
      { q: "What makes British Muslim marriage different from Muslim marriage in Pakistan?", a: "British Muslims navigate a unique set of pressures: balancing a British upbringing and lifestyle with Islamic values and family expectations often rooted in South Asian or other cultures. First and second generation dynamics, the question of overseas vs UK-born partners, navigating biradari expectations within a British context, and the challenges of meeting suitable Muslims in a predominantly non-Muslim social environment all shape the British Muslim marriage experience in ways that differ significantly from Pakistan or other majority-Muslim countries." },
      { q: "Are there Muslim marriage events or services specifically for UK Muslims?", a: "Yes — D'amour Muslim is specifically designed for UK Muslims and the wider British Muslim diaspora. Beyond the platform itself, there are various Muslim marriage events, speed-networking evenings, and wali-facilitated introductions operating in major UK cities. D'amour Muslim provides the online infrastructure that complements any of these approaches — allowing serious marriage seekers to browse and connect between events, or as their primary search method." }
    ],
    bodyContent: `
      <div class="prose max-w-none">
        <p class="text-lg text-gray-700 mb-6 leading-relaxed">The United Kingdom is home to approximately 3.9 million Muslims — the most ethnically diverse Muslim community in any country in Europe. Pakistani, Bangladeshi, Arab, Somali, Turkish, West African, and dozens of other Muslim communities exist side by side across England, Scotland, Wales, and Northern Ireland, shaped equally by their Islamic faith and their British upbringing. For most of these 3.9 million Muslims, marriage is not simply a personal milestone — it is a religious obligation, a family event, and a cultural statement. And yet finding the right Muslim spouse in the UK has never been straightforward. D'amour Muslim is built to change that.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">British Muslim Identity and Marriage</h2>
        <p class="text-gray-700 mb-4 leading-relaxed">The British Muslim experience is defined by a productive tension between two identities. On one side: a British upbringing, British education, British friendships, British professional life. On the other: Islamic values, family expectations rooted in South Asian, Arab, or African cultural traditions, and the deep conviction that marriage is a sacred covenant — not a casual experiment.</p>
        <p class="text-gray-700 mb-6 leading-relaxed">This dual identity creates a marriage landscape that is genuinely unique. A second-generation British Pakistani woman in Birmingham may want a husband who is both practising and professionally ambitious, who understands the pressures of British Muslim life, and who can navigate both her family's cultural expectations and her own sense of British identity. A British Bangladeshi man in East London may be seeking someone who shares his deen, his values, and his comfort with a Western lifestyle — while also being acceptable to parents who have very specific ideas about background and family. D'amour Muslim is designed for the full complexity of this experience.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Muslim Marriage Across the UK — Find by City</h2>
        <p class="text-gray-700 mb-4 leading-relaxed">D'amour Muslim has members across every major UK city. Browse by your location:</p>
        <div class="flex flex-wrap gap-2 mb-6">
          <a href="/muslim-matrimony-london" class="px-4 py-2 bg-primary/10 text-primary rounded-full text-sm font-medium hover:bg-primary/20 transition-colors">London</a>
          <a href="/muslim-matrimony-birmingham" class="px-4 py-2 bg-primary/10 text-primary rounded-full text-sm font-medium hover:bg-primary/20 transition-colors">Birmingham</a>
          <a href="/muslim-matrimony-manchester" class="px-4 py-2 bg-primary/10 text-primary rounded-full text-sm font-medium hover:bg-primary/20 transition-colors">Manchester</a>
          <a href="/muslim-matrimony-bradford" class="px-4 py-2 bg-primary/10 text-primary rounded-full text-sm font-medium hover:bg-primary/20 transition-colors">Bradford</a>
          <a href="/muslim-matrimony-leicester" class="px-4 py-2 bg-primary/10 text-primary rounded-full text-sm font-medium hover:bg-primary/20 transition-colors">Leicester</a>
          <a href="/muslim-matrimony-leeds" class="px-4 py-2 bg-primary/10 text-primary rounded-full text-sm font-medium hover:bg-primary/20 transition-colors">Leeds</a>
        </div>
        <p class="text-gray-700 mb-6 leading-relaxed">Each city page provides locally relevant content — the size and character of the Muslim community in that city, key areas with high Muslim populations, and how D'amour Muslim serves that specific local community. Whether you are looking for a match within your own city or you are open to finding someone from anywhere in the UK, the platform's location filter makes your search precise.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">What UK Muslims Look for in a Spouse</h2>
        <p class="text-gray-700 mb-4 leading-relaxed">Through the search preferences set by D'amour Muslim's UK membership, a clear picture emerges of what British Muslims prioritise when seeking a spouse:</p>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Deen and religious practice:</strong> Consistently the top priority — level of Islamic practice, prayer, Quran recitation, halal lifestyle. Most UK Muslim marriage seekers want a spouse who takes their deen seriously, even if they are not at the most conservative end of the spectrum.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>British upbringing and understanding:</strong> Many UK Muslims — particularly second and third generation — specifically want a spouse who understands what it means to grow up in Britain. Shared cultural reference points, an understanding of the British-Muslim experience, and comfort with British professional life matter enormously.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Education and career:</strong> A consistently important factor, especially among the British Muslim professional class. The majority of D'amour Muslim's UK members are graduates or postgraduates, and many specify education level as an important criterion.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Family background and values:</strong> The family you come from matters to most UK Muslims — not as a matter of class prejudice, but as an indication of the values, habits, and expectations that will shape a marriage. Family background, respectfulness of elders, and the stability of the family of origin are widely considered.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Cultural and linguistic compatibility:</strong> Whether within the same ethnic community or open to other Muslim ethnicities, UK Muslims typically consider cultural background — language, food, family customs, and community ties — as part of their compatibility assessment.</span></li>
        </ul>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">How D'amour Muslim Serves British Muslims</h2>
        <div class="grid md:grid-cols-2 gap-4 mb-6">
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">UK GDPR Compliant</h3>
            <p class="text-gray-700 text-sm leading-relaxed">D'amour Muslim is fully compliant with UK GDPR data protection requirements. Your personal data is handled lawfully, stored securely, and never sold to third parties. UK users have the full suite of data rights including access, correction, and deletion.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">City-Based Search</h3>
            <p class="text-gray-700 text-sm leading-relaxed">UK Muslims can search by city — London, Birmingham, Manchester, Bradford, Leicester, Leeds, and more. Find verified Muslim singles in your city, or open the search nationally. The location filter is precise enough to be useful without being so narrow it limits your options.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Free for Every UK Muslim</h3>
            <p class="text-gray-700 text-sm leading-relaxed">D'amour Muslim is free to join and free to use for core features. No subscription is required to browse verified profiles, send interest requests, or communicate with matches. No UK Muslim should be priced out of a serious halal marriage service.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Family-Friendly Design</h3>
            <p class="text-gray-700 text-sm leading-relaxed">The platform is designed for families as much as individuals. Parents can manage profiles for their son or daughter. Communication only opens when both parties have expressed interest — maintaining the seriousness and propriety that UK Muslim families expect from a matrimonial service.</p>
          </div>
        </div>

        <blockquote class="border-l-4 border-primary pl-4 italic text-gray-600 my-6">"And among His signs is that He created for you from yourselves mates that you may find tranquillity in them; and He placed between you affection and mercy. Indeed in that are signs for a people who give thought." — Quran 30:21</blockquote>

        <div class="bg-primary/5 rounded-2xl p-6 border border-primary/10 mt-8">
          <p class="text-gray-700 font-medium">Find your city: <a href="/muslim-matrimony-london" class="text-primary hover:underline">London</a> &bull; <a href="/muslim-matrimony-birmingham" class="text-primary hover:underline">Birmingham</a> &bull; <a href="/british-pakistani-marriage" class="text-primary hover:underline">British Pakistani Marriage</a> &bull; <a href="/muslim-matchmaking" class="text-primary hover:underline">Muslim Matchmaking</a></p>
        </div>
      </div>
    `
  },
  {
    path: "/british-pakistani-marriage",
    pageTitle: "British Pakistani Marriage — Navigating the Search with Confidence | D'amour Muslim",
    h1: "British Pakistani Marriage — Between Two Worlds, and Finding the Right One",
    heroSubtitle: "British Pakistanis carry a dual identity into every life decision — including marriage. D'amour Muslim is built to serve the full complexity of that journey, without judgment.",
    metaDescription: "British Pakistani marriage — navigating biradari expectations, UK vs Pakistan dynamics, and dual identity. D'amour Muslim serves British Pakistanis with empathy and understanding. Free to join.",
    keywords: "british pakistani marriage, british pakistani rishta, british pakistani matrimonial, uk pakistani marriage, british pakistani marriage site",
    canonicalPath: "/british-pakistani-marriage",
    ctaHeading: "Find Your British Pakistani Match",
    ctaSubtext: "Register free on D'amour Muslim — a platform that understands the British Pakistani experience.",
    relatedLinks: [
      { url: "/muslim-rishta", label: "Muslim Rishta" },
      { url: "/online-rishta-pakistan", label: "Online Rishta Pakistan" },
      { url: "/muslim-marriage-uk", label: "Muslim Marriage UK" },
      { url: "/muslim-matchmaking", label: "Muslim Matchmaking" }
    ],
    pageFaqSchema: [
      { q: "Can I find a British-born Pakistani partner specifically on D'amour Muslim?", a: "Yes. D'amour Muslim has a significant proportion of British-born Pakistani members, particularly from Birmingham, Bradford, Manchester, London, and Leeds — the cities with the largest British Pakistani communities. You can search by UK city and browse profiles, and many members specify in their bio whether they are UK-born or UK-raised. If finding a British-born partner is important to you, you can make this clear in your own profile's spouse criteria." },
      { q: "Is D'amour Muslim suitable for Pakistani families looking for UK-based matches for their children?", a: "Yes — this is a very common use case on D'amour Muslim. Families in Pakistan can register a profile for their son or daughter, clearly indicate they are seeking a UK-based Pakistani partner, and browse profiles from British Pakistanis who are open to an overseas match. Many British Pakistani members are explicitly open to, or specifically seeking, a partner from Pakistan." },
      { q: "How do I navigate family expectations around biradari or cultural background when using a modern matrimonial site?", a: "D'amour Muslim's profile fields include space to specify biradari background, cultural community, family values, and the level of family involvement expected in the rishta process. This means you can be transparent about your background and preferences from the outset, reducing the risk of mismatched expectations later. You can also be clear in your spouse criteria about what is a dealbreaker vs what is a preference — helping filter more effectively." },
      { q: "Are there profiles of British Pakistanis from specific cities like Bradford, Birmingham, or Manchester?", a: "Yes. D'amour Muslim has members from all major British Pakistani population centres — Birmingham (Sparkhill, Alum Rock, Handsworth), Bradford (Manningham, Toller, Heaton), Manchester (Rusholme, Longsight, Levenshulme), London (Tower Hamlets, Newham, Waltham Forest), Leeds (Harehills, Chapeltown, Beeston), and Leicester. You can filter by city and browse profiles from each of these communities." },
      { q: "Does D'amour Muslim support families in Pakistan looking for overseas UK-based Pakistanis?", a: "Yes. Families in Pakistan can register and create profiles for their son or daughter on D'amour Muslim, specify that they are seeking an overseas UK-based match, and browse or receive interest requests from British Pakistanis. This is one of the most common use cases on the platform — connecting Pakistan-based families with the British Pakistani diaspora is central to what D'amour Muslim does." }
    ],
    pageFaqs: [
      { q: "Can I find a British-born Pakistani partner specifically on D'amour Muslim?", a: "Yes. D'amour Muslim has a significant proportion of British-born Pakistani members, particularly from Birmingham, Bradford, Manchester, London, and Leeds — the cities with the largest British Pakistani communities. You can search by UK city and browse profiles, and many members specify in their bio whether they are UK-born or UK-raised. If finding a British-born partner is important to you, you can make this clear in your own profile's spouse criteria." },
      { q: "Is D'amour Muslim suitable for Pakistani families looking for UK-based matches for their children?", a: "Yes — this is a very common use case on D'amour Muslim. Families in Pakistan can register a profile for their son or daughter, clearly indicate they are seeking a UK-based Pakistani partner, and browse profiles from British Pakistanis who are open to an overseas match. Many British Pakistani members are explicitly open to, or specifically seeking, a partner from Pakistan." },
      { q: "How do I navigate family expectations around biradari or cultural background when using a modern matrimonial site?", a: "D'amour Muslim's profile fields include space to specify biradari background, cultural community, family values, and the level of family involvement expected in the rishta process. This means you can be transparent about your background and preferences from the outset, reducing the risk of mismatched expectations later. You can also be clear in your spouse criteria about what is a dealbreaker vs what is a preference — helping filter more effectively." },
      { q: "Are there profiles of British Pakistanis from specific cities like Bradford, Birmingham, or Manchester?", a: "Yes. D'amour Muslim has members from all major British Pakistani population centres — Birmingham (Sparkhill, Alum Rock, Handsworth), Bradford (Manningham, Toller, Heaton), Manchester (Rusholme, Longsight, Levenshulme), London (Tower Hamlets, Newham, Waltham Forest), Leeds (Harehills, Chapeltown, Beeston), and Leicester. You can filter by city and browse profiles from each of these communities." },
      { q: "Does D'amour Muslim support families in Pakistan looking for overseas UK-based Pakistanis?", a: "Yes. Families in Pakistan can register and create profiles for their son or daughter on D'amour Muslim, specify that they are seeking an overseas UK-based match, and browse or receive interest requests from British Pakistanis. This is one of the most common use cases on the platform — connecting Pakistan-based families with the British Pakistani diaspora is central to what D'amour Muslim does." }
    ],
    bodyContent: `
      <div class="prose max-w-none">
        <p class="text-lg text-gray-700 mb-6 leading-relaxed">To be British and Pakistani is to live comfortably in two worlds — and yet to sometimes feel caught between them in no world more acutely than when it comes to marriage. You carry an Islamic faith you take seriously and a Pakistani cultural heritage you value. You also carry a British education, a British career, British friendships, and a British sense of who you are. When the time comes to find a spouse, the weight of all of this lands on a single search that has to satisfy your own heart, your family's expectations, and your community's standards — simultaneously. D'amour Muslim exists for exactly this moment.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">The British Pakistani Marriage Experience</h2>
        <p class="text-gray-700 mb-4 leading-relaxed">The British Pakistani community is the UK's second largest Muslim ethnic group, with over 1.6 million people. Concentrated in Birmingham, Bradford, Manchester, London, Leeds, and Leicester, British Pakistanis have built one of the most vibrant and established Muslim communities in Europe over three generations. Marriage remains central to that community — not just as a personal event, but as a communal one. Weddings are large, family involvement is expected, and the choice of a spouse carries a weight that goes beyond the two individuals involved.</p>
        <p class="text-gray-700 mb-6 leading-relaxed">For the second and third generation, this weight has become more complicated. The halal route — finding a spouse through family networks, mosque connections, or rishta introductions — is increasingly difficult to navigate in cities where the Muslim community is large but dispersed, where work and study schedules leave little time for the traditional rishta process, and where the pool of suitable candidates known personally to your family may be frustratingly narrow.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Navigating Family Expectations and Personal Preferences</h2>
        <p class="text-gray-700 mb-4 leading-relaxed">British Pakistani marriage searching often involves a negotiation between two sets of legitimate concerns. Parents may have strong preferences about biradari background, regional origin (Mirpuri, Punjabi, Pathan, Urdu-speaking), or whether they prefer a UK-based or Pakistan-based spouse for their child. The individual seeking marriage may have their own equally legitimate priorities: shared values, compatible personality, similar levels of Islamic practice, and a mutual understanding of British Muslim life.</p>
        <p class="text-gray-700 mb-6 leading-relaxed">Both sets of concerns are understandable. Biradari preferences often reflect a genuine desire for cultural compatibility and ease of family integration. Individual preferences reflect the reality that it is the couple — not the parents — who will live together. D'amour Muslim's profile system allows both dimensions to be captured and communicated transparently: users can specify their biradari, their cultural background, the level of family involvement they expect, and their personal criteria for a spouse — giving everyone enough information to assess compatibility before any introduction is made.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">UK-Born vs Pakistan-Based Partners — Finding the Right Fit</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">One of the most significant decisions a British Pakistani faces in the marriage search is whether they are open to a partner from Pakistan, or whether they specifically want someone with a British upbringing. Both are entirely valid choices with different implications. A UK-born partner brings shared cultural context — you will both understand the same pressures, the same social dynamics, the same references. A partner from Pakistan may bring stronger ties to Islamic tradition, deeper family values, and a perspective less shaped by Western culture — qualities that many British Pakistanis deeply value. D'amour Muslim has substantial membership on both sides of this equation. British Pakistanis who are open to overseas matches can connect with Pakistan-based profiles directly. Those specifically seeking UK-born or UK-raised partners can indicate this in their search preferences.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">How D'amour Muslim Helps British Pakistanis</h2>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>City-specific search:</strong> Search by Birmingham, Bradford, Manchester, London, Leeds, or any UK city — find British Pakistani singles in your own community.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Pakistan connection:</strong> Search or receive proposals from Pakistan-based families — the platform serves both the UK and Pakistan, making the overseas match search accessible and systematic.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Family-managed profiles:</strong> Parents can create and manage a profile on behalf of their son or daughter — reflecting the reality that for many British Pakistani families, this is a family process, not just an individual one.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Transparent background fields:</strong> Profiles include fields for biradari, mother tongue, cultural background, religious practice, and family values — the information Pakistani families actually use to assess compatibility.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>No judgment, no gossip:</strong> Unlike traditional rishta networks, D'amour Muslim is completely private. Browsing is discreet. No aunty knows you registered. No community gossip follows you.</span></li>
        </ul>

        <blockquote class="border-l-4 border-primary pl-4 italic text-gray-600 my-6">"A woman is married for four reasons: her wealth, her family status, her beauty and her religion. Seek the one with religion, may your hands be rubbed with dust." — Prophet Muhammad ﷺ (Bukhari)</blockquote>

        <p class="text-gray-700 mb-6 leading-relaxed">The British Pakistani marriage search is one of the most specific and complex in the Muslim world. D'amour Muslim is not a generic dating app repurposed for Muslims — it is a platform built to understand and serve the real dynamics of British Pakistani marriage culture, with the sensitivity and seriousness that culture deserves.</p>

        <div class="bg-primary/5 rounded-2xl p-6 border border-primary/10 mt-8">
          <p class="text-gray-700 font-medium">Also explore: <a href="/muslim-rishta" class="text-primary hover:underline">Muslim Rishta</a> &bull; <a href="/online-rishta-pakistan" class="text-primary hover:underline">Online Rishta Pakistan</a> &bull; <a href="/muslim-marriage-uk" class="text-primary hover:underline">Muslim Marriage UK</a> &bull; <a href="/muslim-matchmaking" class="text-primary hover:underline">Muslim Matchmaking</a></p>
        </div>
      </div>
    `
  },
  {
    path: "/muslim-singles-uk",
    pageTitle: "Muslim Singles UK — The Halal Path Forward | D'amour Muslim",
    h1: "Muslim Singles UK — You Are Not Stuck. The Halal Path Forward Exists.",
    heroSubtitle: "Being a single Muslim in the UK comes with unique pressures. D'amour Muslim gives you a structured, serious, halal environment to begin your journey towards nikah — at your own pace.",
    metaDescription: "Muslim singles UK — find verified Muslim singles serious about marriage. D'amour Muslim is free, halal, and built for UK Muslims ready to take the next step. Join free.",
    keywords: "muslim singles uk, single muslims uk, muslim single women uk, muslim single men uk, uk muslim singles marriage",
    canonicalPath: "/muslim-singles-uk",
    ctaHeading: "Take the First Step Today",
    ctaSubtext: "Join D'amour Muslim free — thousands of UK Muslim singles are already on their journey.",
    relatedLinks: [
      { url: "/muslim-marriage-uk", label: "Muslim Marriage UK" },
      { url: "/find-muslim-spouse", label: "Find Muslim Spouse" },
      { url: "/muslim-matchmaking", label: "Muslim Matchmaking" },
      { url: "/halal-marriage", label: "Halal Marriage Platform" }
    ],
    pageFaqSchema: [
      { q: "Is D'amour Muslim specifically for single Muslims looking for marriage (nikah)?", a: "Yes, completely. D'amour Muslim is a matrimonial platform — its entire purpose is to help single Muslims find a spouse for nikah. It is not a dating app, not a social network, and not a platform for casual connections. Every member registers with the intention of marriage, every profile is reviewed for authenticity, and the platform's design reflects Islamic values throughout. If you are a single Muslim serious about marriage, this is the platform built for you." },
      { q: "Are there many Muslim singles in the UK looking for serious marriage?", a: "Yes — the UK's 3.9 million Muslims include hundreds of thousands of marriage-age singles who are actively or passively seeking a spouse. D'amour Muslim's UK membership spans all major cities — London, Birmingham, Manchester, Bradford, Leicester, Leeds, and beyond. The challenge is not a shortage of suitable people — it is finding the right structured, halal environment in which to meet them. That is exactly what D'amour Muslim provides." },
      { q: "How do I get started as a Muslim single on D'amour Muslim?", a: "Getting started is straightforward: register free with your name and email address, verify your email, then complete your profile — including your background, religious practice, and what you are looking for in a spouse. Submit your profile for moderation review (typically completed within 24 hours). Once approved, your profile goes live and you can browse verified Muslim singles across the UK. You can send interest requests to profiles you find compatible, and communication opens when both parties have expressed interest." },
      { q: "Is it Islamically acceptable to use an online matrimonial site as a single Muslim?", a: "Yes, the scholarly consensus is that using a purpose-built Islamic matrimonial platform is permissible. The key conditions are: that the intention is marriage (nikah), that communication remains within Islamic etiquette (no free mixing, no khalwat), and that family involvement is included in the process when appropriate. D'amour Muslim is designed to satisfy all of these conditions — messaging is gated behind mutual interest, family involvement is facilitated, and the platform enforces Islamic conduct standards throughout." },
      { q: "What is the difference between D'amour Muslim and apps aimed at Muslim singles?", a: "D'amour Muslim is a matrimonial platform, not a Muslim singles app. The distinction matters enormously. Dating apps — including some marketed as Muslim-friendly — are designed for casual browsing, swipe-based interaction, and the full spectrum of relationship types from casual to serious. D'amour Muslim is designed exclusively for marriage. Every feature — profile review, mutual-interest-gated messaging, family profile management, Islamic conduct moderation — is built around the single goal of helping serious Muslims find a spouse for nikah." }
    ],
    pageFaqs: [
      { q: "Is D'amour Muslim specifically for single Muslims looking for marriage (nikah)?", a: "Yes, completely. D'amour Muslim is a matrimonial platform — its entire purpose is to help single Muslims find a spouse for nikah. It is not a dating app, not a social network, and not a platform for casual connections. Every member registers with the intention of marriage, every profile is reviewed for authenticity, and the platform's design reflects Islamic values throughout. If you are a single Muslim serious about marriage, this is the platform built for you." },
      { q: "Are there many Muslim singles in the UK looking for serious marriage?", a: "Yes — the UK's 3.9 million Muslims include hundreds of thousands of marriage-age singles who are actively or passively seeking a spouse. D'amour Muslim's UK membership spans all major cities — London, Birmingham, Manchester, Bradford, Leicester, Leeds, and beyond. The challenge is not a shortage of suitable people — it is finding the right structured, halal environment in which to meet them. That is exactly what D'amour Muslim provides." },
      { q: "How do I get started as a Muslim single on D'amour Muslim?", a: "Getting started is straightforward: register free with your name and email address, verify your email, then complete your profile — including your background, religious practice, and what you are looking for in a spouse. Submit your profile for moderation review (typically completed within 24 hours). Once approved, your profile goes live and you can browse verified Muslim singles across the UK. You can send interest requests to profiles you find compatible, and communication opens when both parties have expressed interest." },
      { q: "Is it Islamically acceptable to use an online matrimonial site as a single Muslim?", a: "Yes, the scholarly consensus is that using a purpose-built Islamic matrimonial platform is permissible. The key conditions are: that the intention is marriage (nikah), that communication remains within Islamic etiquette (no free mixing, no khalwat), and that family involvement is included in the process when appropriate. D'amour Muslim is designed to satisfy all of these conditions — messaging is gated behind mutual interest, family involvement is facilitated, and the platform enforces Islamic conduct standards throughout." },
      { q: "What is the difference between D'amour Muslim and apps aimed at Muslim singles?", a: "D'amour Muslim is a matrimonial platform, not a Muslim singles app. The distinction matters enormously. Dating apps — including some marketed as Muslim-friendly — are designed for casual browsing, swipe-based interaction, and the full spectrum of relationship types from casual to serious. D'amour Muslim is designed exclusively for marriage. Every feature — profile review, mutual-interest-gated messaging, family profile management, Islamic conduct moderation — is built around the single goal of helping serious Muslims find a spouse for nikah." }
    ],
    bodyContent: `
      <div class="prose max-w-none">
        <p class="text-lg text-gray-700 mb-6 leading-relaxed">If you are a single Muslim in the UK, you already know the weight of it. The questions from family that start innocent and become pointed. The weddings you attend where you smile through the inevitable introductions that go nowhere. The internal conflict between wanting to find someone the halal way and not quite knowing what that looks like in a city where the Muslim community is large but scattered. The quiet loneliness of being serious about your deen, serious about marriage, and yet genuinely not knowing where to begin. D'amour Muslim was built in direct response to this experience — and you are far from alone in it.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Why Finding a Spouse as a UK Muslim Is Challenging</h2>
        <div class="grid md:grid-cols-2 gap-4 mb-6">
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Limited Halal Social Circles</h3>
            <p class="text-gray-700 text-sm leading-relaxed">University, work, and social life in the UK are predominantly mixed environments where casual relationships are the norm and halal social interaction between unmarried Muslim men and women is difficult to maintain. Most practising Muslims find their natural social environments are either exclusively same-gender (mosque, Muslim student societies) or mixed in ways that make purposeful marriage seeking awkward.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Family and Community Pressure</h3>
            <p class="text-gray-700 text-sm leading-relaxed">The pressure to marry — from parents, aunties, community events — is real and often intensifies in your mid-to-late twenties. But pressure without a structured path forward creates anxiety, not results. Being told to marry and being given the means to do it properly are two different things.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100 md:col-span-2">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Balancing Deen, Culture, and British Identity</h3>
            <p class="text-gray-700 text-sm leading-relaxed">For many UK Muslim singles, the challenge is not just finding someone — it is finding someone who fits the whole picture: religiously compatible, culturally compatible, British enough to understand your life, and serious enough to be a real partner. This combination is specific and real, and it requires a matrimonial environment built for exactly this community.</p>
          </div>
        </div>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">The Halal Route to Leaving Singlehood</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">Islam does not leave its adherents without guidance on this question. The Islamic approach to marriage — making the intention, seeking through legitimate means, involving family appropriately, assessing compatibility, and moving forward when a suitable match is found — is a clear and dignified path. The Prophet ﷺ encouraged facilitating marriage and removing obstacles to it. A purpose-built, moderated Islamic matrimonial platform is precisely the kind of structured, legitimate means that Islamic principles support. The halal route exists. It does not require you to compromise your values or your dignity. It requires you to take the first step.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">What D'amour Muslim Offers UK Muslim Singles</h2>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Completely free to join and use:</strong> No subscription, no paywall, no credit system. Every serious UK Muslim single should have equal access to a trustworthy matrimonial platform regardless of financial situation.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Verified profiles only:</strong> Every profile is manually reviewed before going live. You will not waste time on fake profiles, scammers, or people who are not serious about marriage.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>UK city filter:</strong> Search by London, Birmingham, Manchester, Bradford, Leicester, Leeds, or any UK city. Find Muslim singles in your community — or open the search nationally if you are flexible on location.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Halal by design:</strong> No unsolicited messages, no free mixing. Communication only opens when both parties have expressed mutual interest. The platform enforces Islamic etiquette by design — not just by requesting it.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Family-friendly:</strong> You can involve your wali or family members in your search from the beginning. The platform is built for families as much as for individuals.</span></li>
        </ul>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Muslim Singles UK — Where to Start</h2>
        <div class="grid md:grid-cols-2 gap-4 mb-8">
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <span class="text-primary font-bold text-xl block mb-2">Step 1</span>
            <p class="text-gray-700 text-sm leading-relaxed"><strong>Register free</strong> — create your account with your name and email. Verify your email address to activate it.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <span class="text-primary font-bold text-xl block mb-2">Step 2</span>
            <p class="text-gray-700 text-sm leading-relaxed"><strong>Complete your profile honestly</strong> — your background, religious practice, what you are looking for. Submit for moderation review.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <span class="text-primary font-bold text-xl block mb-2">Step 3</span>
            <p class="text-gray-700 text-sm leading-relaxed"><strong>Browse verified profiles</strong> — search by city, age, background, and religious practice. Take your time. Share profiles with family if helpful.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <span class="text-primary font-bold text-xl block mb-2">Step 4</span>
            <p class="text-gray-700 text-sm leading-relaxed"><strong>Send interest, connect, and communicate</strong> — when both parties express interest, secure messaging opens. Begin the conversation with intention and sincerity.</p>
          </div>
        </div>

        <blockquote class="border-l-4 border-primary pl-4 italic text-gray-600 my-6">"When a man marries, he has fulfilled half of his religion, so let him fear Allah regarding the remaining half." — Prophet Muhammad ﷺ (Al-Bayhaqi)</blockquote>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">You Are Not Alone — Thousands of UK Muslims Are on the Same Journey</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">The experience of being a single Muslim in the UK who is serious about marriage — and unsure of the path — is one of the most common shared experiences in the British Muslim community. It is not a personal failing. It is not a sign that you are asking for too much. It is a structural challenge that affects hundreds of thousands of people across the UK, and it has a structured solution. D'amour Muslim exists because this community deserves a platform built specifically for them — not a repurposed dating app, not a generic matrimonial site, but something designed with a genuine understanding of what it means to be a practising Muslim in Britain today, trying to do this the right way.</p>

        <div class="bg-primary/5 rounded-2xl p-6 border border-primary/10 mt-8">
          <p class="text-gray-700 font-medium">Also explore: <a href="/muslim-marriage-uk" class="text-primary hover:underline">Muslim Marriage UK</a> &bull; <a href="/find-muslim-spouse" class="text-primary hover:underline">Find Muslim Spouse</a> &bull; <a href="/muslim-matchmaking" class="text-primary hover:underline">Muslim Matchmaking</a> &bull; <a href="/halal-marriage" class="text-primary hover:underline">Halal Marriage Platform</a></p>
        </div>
      </div>
    `
  },
  {
    path: "/muslim-second-marriage",
    pageTitle: "Muslim Second Marriage — Valid, Honourable, and Fully Supported | D'amour Muslim",
    h1: "Muslim Second Marriage — A New Chapter That Islam Fully Supports",
    heroSubtitle: "Whether you are widowed, divorced, or considering a second marriage, Islam honours your journey. D'amour Muslim provides a non-judgmental space to find your next chapter.",
    metaDescription: "Muslim second marriage — Islamic view on remarriage after widowhood or divorce, polygyny under Quran 4:3, and how D'amour Muslim supports second marriage seekers without judgment. Free to join.",
    keywords: "muslim second marriage, muslim second wife, second marriage in islam, muslim remarriage, second nikah islam, muslim widow marriage",
    canonicalPath: "/muslim-second-marriage",
    ctaHeading: "Begin Your Second Chapter",
    ctaSubtext: "Register free on D'amour Muslim — a platform with no judgment and full support for second marriage seekers.",
    relatedLinks: [
      { url: "/divorced-muslim-marriage", label: "Divorced Muslim Marriage" },
      { url: "/muslim-marriage", label: "Muslim Marriage in Islam" },
      { url: "/muslim-matchmaking", label: "Muslim Matchmaking" },
      { url: "/halal-marriage", label: "Halal Marriage Platform" }
    ],
    pageFaqSchema: [
      { q: "Is it permissible in Islam to get married for a second time?", a: "Yes, absolutely. Remarriage after the death of a spouse or after divorce is not only permitted in Islam but actively encouraged. The Prophet Muhammad ﷺ himself remarried after the death of Khadijah (ra), as did many of his companions. Islam views marriage as a sunnah — a prophetic practice to be encouraged — and there is no concept of a 'one marriage limit' in Islamic theology. Widows, widowers, and divorced Muslims are all fully encouraged to seek a new spouse." },
      { q: "Can widows and widowers find a second spouse on D'amour Muslim?", a: "Yes. D'amour Muslim's profile system includes a marital status field where members can indicate they are widowed. Many of D'amour Muslim's members are widowed Muslims seeking a second marriage, and the platform treats this with the same seriousness and respect as any first marriage search. Widowed members should feel completely comfortable registering and searching — their situation is honoured and understood on this platform." },
      { q: "Is polygyny (seeking a second wife) something D'amour Muslim supports?", a: "D'amour Muslim is a matrimonial platform that serves all forms of Islamic marriage that are permitted under Shariah. Polygyny — a man marrying up to four wives under the conditions set out in Quran 4:3 (which requires just treatment of all wives) — is a permitted form of marriage in Islam. A man who is already married and seeking a second wife, or a woman who is willing to become a second wife, are welcome to use D'amour Muslim's platform. The platform does not make moral judgements about permissible Islamic arrangements." },
      { q: "Will people judge me for seeking a second marriage on the platform?", a: "D'amour Muslim is designed to be entirely free of judgment about any legitimate Islamic marriage path. The platform has no mechanism for other members to comment on, rate, or judge your marital history. Your profile details are shared only with members you mutually match with. The moderation team is trained to treat all users — first-time seekers, widowed Muslims, divorced Muslims, and those seeking a second wife — with identical respect and professionalism." },
      { q: "Do I need to disclose my previously married status on D'amour Muslim?", a: "Yes — honesty is an Islamic obligation and a platform requirement. D'amour Muslim's profile includes a marital status field and you are required to complete it accurately. Misrepresenting your marital history is a form of deception that is both Islamically impermissible and a violation of D'amour Muslim's terms. Being transparent about being previously married, widowed, or currently married (if seeking a second wife) ensures that potential matches can make a fully informed decision — which is the only foundation for a sound Islamic marriage." }
    ],
    pageFaqs: [
      { q: "Is it permissible in Islam to get married for a second time?", a: "Yes, absolutely. Remarriage after the death of a spouse or after divorce is not only permitted in Islam but actively encouraged. The Prophet Muhammad ﷺ himself remarried after the death of Khadijah (ra), as did many of his companions. Islam views marriage as a sunnah — a prophetic practice to be encouraged — and there is no concept of a 'one marriage limit' in Islamic theology. Widows, widowers, and divorced Muslims are all fully encouraged to seek a new spouse." },
      { q: "Can widows and widowers find a second spouse on D'amour Muslim?", a: "Yes. D'amour Muslim's profile system includes a marital status field where members can indicate they are widowed. Many of D'amour Muslim's members are widowed Muslims seeking a second marriage, and the platform treats this with the same seriousness and respect as any first marriage search. Widowed members should feel completely comfortable registering and searching — their situation is honoured and understood on this platform." },
      { q: "Is polygyny (seeking a second wife) something D'amour Muslim supports?", a: "D'amour Muslim is a matrimonial platform that serves all forms of Islamic marriage that are permitted under Shariah. Polygyny — a man marrying up to four wives under the conditions set out in Quran 4:3 (which requires just treatment of all wives) — is a permitted form of marriage in Islam. A man who is already married and seeking a second wife, or a woman who is willing to become a second wife, are welcome to use D'amour Muslim's platform. The platform does not make moral judgements about permissible Islamic arrangements." },
      { q: "Will people judge me for seeking a second marriage on the platform?", a: "D'amour Muslim is designed to be entirely free of judgment about any legitimate Islamic marriage path. The platform has no mechanism for other members to comment on, rate, or judge your marital history. Your profile details are shared only with members you mutually match with. The moderation team is trained to treat all users — first-time seekers, widowed Muslims, divorced Muslims, and those seeking a second wife — with identical respect and professionalism." },
      { q: "Do I need to disclose my previously married status on D'amour Muslim?", a: "Yes — honesty is an Islamic obligation and a platform requirement. D'amour Muslim's profile includes a marital status field and you are required to complete it accurately. Misrepresenting your marital history is a form of deception that is both Islamically impermissible and a violation of D'amour Muslim's terms. Being transparent about being previously married, widowed, or currently married (if seeking a second wife) ensures that potential matches can make a fully informed decision — which is the only foundation for a sound Islamic marriage." }
    ],
    bodyContent: `
      <div class="prose max-w-none">
        <p class="text-lg text-gray-700 mb-6 leading-relaxed">A second marriage in Islam is not a lesser thing. It is not a compromise, a consolation, or a second-best outcome. It is a fresh beginning — fully sanctioned by Allah, honoured by the Prophet's own example, and deeply needed by hundreds of thousands of Muslims who have lost a spouse to death or to divorce. The fear of judgment, the weight of previous experience, and the uncertainty about how to begin again are real. But the path forward is clear, and D'amour Muslim is here to walk it with you.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Islamic Perspective on Second Marriage</h2>
        <p class="text-gray-700 mb-4 leading-relaxed">Islam's position on second marriages — whether after widowhood, divorce, or as a subsequent wife in a polygynous marriage — is unambiguous and compassionate. The Prophet Muhammad ﷺ himself lost his beloved first wife Khadijah (ra) after 25 years of marriage and subsequently remarried. Several of his closest companions were widowers or divorced men who remarried. The Islamic tradition does not stigmatise second marriages — it normalises and honours them.</p>
        <p class="text-gray-700 mb-6 leading-relaxed">On the specific question of polygyny — a man seeking to marry a second, third, or fourth wife — the Quran addresses this directly: <em>"...then marry those that please you of women, two or three or four. But if you fear that you will not be just, then marry only one."</em> (Quran 4:3). This verse simultaneously permits polygyny and places a significant condition upon it — the obligation of just treatment. D'amour Muslim does not adjudicate the fiqh of individual situations but does provide a platform for all forms of Islamic marriage that are Shariah-compliant.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Who Seeks a Second Marriage?</h2>
        <div class="grid md:grid-cols-2 gap-4 mb-6">
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Widows and Widowers</h3>
            <p class="text-gray-700 text-sm leading-relaxed">Losing a spouse is among the most devastating experiences a person can face. After the period of mourning and recovery, many widowed Muslims — of all ages — reach a point where they wish to remarry. This desire is natural, honourable, and Islamically encouraged. The Prophet ﷺ encouraged facilitating the remarriage of widows and widowers. D'amour Muslim treats widowed members with the same respect and seriousness as any other member — there is no lesser category here.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Divorced Muslims</h3>
            <p class="text-gray-700 text-sm leading-relaxed">Divorce is permitted in Islam precisely because marriage to the wrong person can cause harm, and Islam prioritises the wellbeing of both parties over the appearance of social conformity. A divorced Muslim who seeks to remarry is not carrying a stain — they are demonstrating exactly the kind of resilience and renewed intention that a mature, serious marriage requires. D'amour Muslim has a significant number of divorced members of all ages seeking a fresh, properly grounded marriage.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100 md:col-span-2">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Those Considering a Second Wife (Polygyny)</h3>
            <p class="text-gray-700 text-sm leading-relaxed">A Muslim man who is already married and wishes to marry a second wife — under the Quranic conditions of just treatment — is engaging in a Shariah-permitted arrangement. Similarly, a Muslim woman who, with full knowledge and informed consent, is willing to enter a polygynous marriage as a second wife is exercising a personal religious choice that is her right. D'amour Muslim provides a space for both parties to find each other — without judgment and with full transparency about the arrangement.</p>
          </div>
        </div>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Challenges of Finding a Second Marriage</h2>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Social stigma:</strong> Despite Islam's clear position, cultural stigma around second marriages — particularly for divorced women and for polygynous arrangements — remains real in many South Asian and Arab Muslim communities in the UK. Finding a platform that treats these situations without judgment matters enormously.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Children from a previous marriage:</strong> Many second-marriage seekers have children from a previous relationship. Finding a spouse who is willing, capable, and genuinely enthusiastic about taking on a step-parent role requires honesty and the right platform — one where this can be stated clearly upfront.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Family opposition:</strong> Parents and extended family members sometimes oppose a second marriage — particularly for women — out of protectiveness, cultural pride, or concern about social reputation. Navigating this while maintaining Islamic principles and personal dignity requires the kind of structured, private process that D'amour Muslim provides.</span></li>
        </ul>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">How D'amour Muslim Supports Second Marriage Seekers</h2>
        <p class="text-gray-700 mb-4 leading-relaxed">D'amour Muslim's profile system includes a marital status field with options for single, divorced, and widowed — as well as space to indicate that you are seeking a polygynous arrangement. This transparency is by design: potential matches deserve accurate information, and providing it from the outset is both an Islamic obligation and the most practical approach to finding a genuinely compatible match.</p>
        <p class="text-gray-700 mb-6 leading-relaxed">The platform's moderation team treats all members with equal respect regardless of their marital history or the nature of the marriage they are seeking. There are no different tiers of membership, no visible labels that mark you as "previously married", and no community rating system that allows other members to judge your history. What you share about your background, and when you share it, is within your control — after mutual interest is established and a genuine conversation has begun.</p>

        <blockquote class="border-l-4 border-primary pl-4 italic text-gray-600 my-6">"Marry the one who is religious, for if you do not, there will be hardship and corruption in the land." — Prophet Muhammad ﷺ (Bukhari). This applies to every marriage — first, second, or more.</blockquote>

        <div class="bg-primary/5 rounded-2xl p-6 border border-primary/10 mt-8">
          <p class="text-gray-700 font-medium">Also explore: <a href="/divorced-muslim-marriage" class="text-primary hover:underline">Divorced Muslim Marriage</a> &bull; <a href="/muslim-marriage" class="text-primary hover:underline">Muslim Marriage in Islam</a> &bull; <a href="/muslim-matchmaking" class="text-primary hover:underline">Muslim Matchmaking</a></p>
        </div>
      </div>
    `
  },
  {
    path: "/divorced-muslim-marriage",
    pageTitle: "Divorced Muslim Marriage — Moving Forward With Dignity | D'amour Muslim",
    h1: "Divorced Muslim Marriage — Islam Provides a Path Forward, and So Do We",
    heroSubtitle: "Divorce is not a failure in Islam — it is an acknowledgement that some marriages do not work, and a door to a better one. D'amour Muslim supports divorced Muslims with empathy, privacy, and zero judgment.",
    metaDescription: "Divorced Muslim marriage — the Islamic view on divorce and remarriage, practical considerations before remarrying, and how D'amour Muslim supports divorced Muslims. Free to join.",
    keywords: "divorced muslim marriage, muslim divorce remarriage, divorced muslim singles, divorced muslim uk, muslim marriage after divorce, muslim divorcee",
    canonicalPath: "/divorced-muslim-marriage",
    ctaHeading: "Your Second Chance Starts Here",
    ctaSubtext: "Register free on D'amour Muslim — no judgment, no stigma, just a serious path to a better marriage.",
    relatedLinks: [
      { url: "/muslim-second-marriage", label: "Muslim Second Marriage" },
      { url: "/trusted-muslim-matchmaking", label: "Trusted Muslim Matchmaking" },
      { url: "/halal-marriage", label: "Halal Marriage Platform" },
      { url: "/muslim-matchmaking", label: "Muslim Matchmaking" }
    ],
    pageFaqSchema: [
      { q: "Is it permissible to remarry after divorce in Islam?", a: "Yes — remarriage after divorce is fully permitted and encouraged in Islam. Talaq (divorce) is a legitimate exit from a marriage that is not working, and the Islamic system explicitly provides a pathway back to marriage afterwards. The Prophet Muhammad ﷺ said: 'Of all the lawful acts the most detestable to Allah is divorce' (Abu Dawud) — meaning divorce is a last resort, but a permitted one, and remarriage is entirely honourable. Islam does not punish the divorced Muslim — it provides them a route forward." },
      { q: "Does D'amour Muslim accept profiles from divorced Muslims?", a: "Absolutely — and without any lesser treatment. Divorced Muslims are a significant part of D'amour Muslim's membership and are treated with the same seriousness, respect, and professionalism as any other member. The profile includes a marital status field where you indicate your divorced status — this is required for transparency and honesty, which are Islamic obligations as well as platform requirements. Being divorced is not a barrier to finding a wonderful second marriage on D'amour Muslim." },
      { q: "Do I have to disclose that I am divorced on my profile?", a: "Yes — full honesty about marital history is both an Islamic obligation and a D'amour Muslim platform requirement. A potential spouse has the right to know your marital status before deciding whether to pursue a connection. Concealing a divorce is a form of deception (ghish) that is Islamically impermissible and would be grounds for profile removal if discovered. Transparency from the outset protects both you and your potential match." },
      { q: "Are there many divorced Muslims on D'amour Muslim looking for remarriage?", a: "Yes — divorced Muslims seeking remarriage represent a meaningful and growing segment of D'amour Muslim's membership. This reflects a broader reality: divorce rates among UK Muslims, while lower than the national average, have increased, and many divorced Muslims are actively and seriously looking for a better, more compatible marriage. You will find many genuine, sincere, and carefully considered profiles from divorced Muslims on the platform." },
      { q: "What is iddah and how does it affect my ability to start a new marriage search?", a: "Iddah is the waiting period that a Muslim woman must observe after divorce or the death of a husband before she may remarry. For a divorced woman, iddah is typically three menstrual cycles (approximately three months). For a widow, iddah is four months and ten days. During iddah, a woman may not remarry or accept a new marriage proposal. However, there is scholarly opinion that permitting a divorced or widowed woman to register on a matrimonial platform and browse profiles during iddah — without entering into active engagement or communication — may be permissible, as a form of preparation rather than formal proposal acceptance. We recommend consulting your scholar for guidance specific to your situation." }
    ],
    pageFaqs: [
      { q: "Is it permissible to remarry after divorce in Islam?", a: "Yes — remarriage after divorce is fully permitted and encouraged in Islam. Talaq (divorce) is a legitimate exit from a marriage that is not working, and the Islamic system explicitly provides a pathway back to marriage afterwards. The Prophet Muhammad ﷺ said: 'Of all the lawful acts the most detestable to Allah is divorce' (Abu Dawud) — meaning divorce is a last resort, but a permitted one, and remarriage is entirely honourable. Islam does not punish the divorced Muslim — it provides them a route forward." },
      { q: "Does D'amour Muslim accept profiles from divorced Muslims?", a: "Absolutely — and without any lesser treatment. Divorced Muslims are a significant part of D'amour Muslim's membership and are treated with the same seriousness, respect, and professionalism as any other member. The profile includes a marital status field where you indicate your divorced status — this is required for transparency and honesty, which are Islamic obligations as well as platform requirements. Being divorced is not a barrier to finding a wonderful second marriage on D'amour Muslim." },
      { q: "Do I have to disclose that I am divorced on my profile?", a: "Yes — full honesty about marital history is both an Islamic obligation and a D'amour Muslim platform requirement. A potential spouse has the right to know your marital status before deciding whether to pursue a connection. Concealing a divorce is a form of deception (ghish) that is Islamically impermissible and would be grounds for profile removal if discovered. Transparency from the outset protects both you and your potential match." },
      { q: "Are there many divorced Muslims on D'amour Muslim looking for remarriage?", a: "Yes — divorced Muslims seeking remarriage represent a meaningful and growing segment of D'amour Muslim's membership. This reflects a broader reality: divorce rates among UK Muslims, while lower than the national average, have increased, and many divorced Muslims are actively and seriously looking for a better, more compatible marriage. You will find many genuine, sincere, and carefully considered profiles from divorced Muslims on the platform." },
      { q: "What is iddah and how does it affect my ability to start a new marriage search?", a: "Iddah is the waiting period that a Muslim woman must observe after divorce or the death of a husband before she may remarry. For a divorced woman, iddah is typically three menstrual cycles (approximately three months). For a widow, iddah is four months and ten days. During iddah, a woman may not remarry or accept a new marriage proposal. However, there is scholarly opinion that permitting a divorced or widowed woman to register on a matrimonial platform and browse profiles during iddah — without entering into active engagement or communication — may be permissible, as a form of preparation rather than formal proposal acceptance. We recommend consulting your scholar for guidance specific to your situation." }
    ],
    bodyContent: `
      <div class="prose max-w-none">
        <p class="text-lg text-gray-700 mb-6 leading-relaxed">Divorce happens. In Islam, it is not a catastrophe — it is a provision. Allah, in His wisdom, created a mechanism for a marriage that is causing harm to be ended with dignity, and for both parties to move forward. The stigma that some Muslim communities attach to divorce is a cultural import, not an Islamic teaching. The Prophet Muhammad ﷺ himself was widowed and remarried. His companions divorced and remarried. Divorce is not shameful — it is an acknowledgement that you are a human being who tried, and who now deserves the chance to do better. If you are a divorced Muslim who is ready to seek a new marriage, D'amour Muslim is here for exactly that journey.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Islam's View on Divorce and Remarriage</h2>
        <p class="text-gray-700 mb-4 leading-relaxed">The Islamic system of divorce — talaq — is a structured, graduated process designed to give both parties time to reconsider, to allow for reconciliation, and ultimately to provide a dignified exit when reconciliation is not possible. The Quran addresses divorce extensively and with compassion: <em>"And if they separate, Allah will enrich each of them from His abundance. And ever is Allah Encompassing and Wise."</em> (Quran 4:130)</p>
        <p class="text-gray-700 mb-6 leading-relaxed">After the completion of iddah (the prescribed waiting period), a divorced Muslim woman is free to remarry. A divorced Muslim man may remarry immediately. Islam places no stigma, no waiting period beyond iddah, and no limit on remarriage — a divorced Muslim who finds the right person and marries them in the correct Islamic manner has done something honourable. The faith provides the path forward; D'amour Muslim provides the means.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">The Emotional Reality of Seeking Marriage After Divorce</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">Starting a new marriage search after divorce is emotionally different from a first marriage search in important ways. You come with experience — which is both a gift and a complication. You have a clearer sense of what you need in a partner, because you have learned, sometimes painfully, what you cannot live with. You may also carry the weight of a previous failure — even when that failure was not primarily your responsibility — and the fear of repeating it. You may be dealing with co-parenting, family opinions, financial realities, or simply the exhaustion of having already been through a difficult process. D'amour Muslim does not pretend these challenges do not exist. The platform provides a structured, private, serious environment where you can search at your own pace, with full control over your information, without community gossip or social exposure.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Practical Considerations Before Remarrying</h2>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Iddah completion:</strong> For women, confirming that your iddah period has been fully completed before entering into any new marriage engagement is an Islamic obligation. Do not begin active communication towards a new nikah before this is complete.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Children and custody:</strong> If you have children from a previous marriage, being clear on your profile about your situation is both honest and practical. A potential spouse who is fully informed about your family situation from the outset is one who has genuinely chosen to proceed with their eyes open — which is the only solid foundation for a second marriage.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Honesty with potential spouses:</strong> Beyond the profile, active conversations with a potential match should include honest disclosure of the circumstances of your previous marriage — not in exhaustive detail, but in enough honesty that your potential spouse can assess compatibility with a clear picture. Islam places great weight on transparency in the marriage process.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Emotional readiness:</strong> The best time to begin a new marriage search is when you have genuinely processed the previous experience — not necessarily when family pressure suggests you should. Rushing into a second marriage without real emotional readiness is a path to repeating the same problems.</span></li>
        </ul>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">How D'amour Muslim Supports Divorced Muslims</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">D'amour Muslim's profile design reflects the reality that many users are not seeking a first marriage. The marital status field allows divorced members to represent themselves honestly. There is no visible badge or label that flags divorced members as somehow lesser — your marital history appears only in your profile details, which are shared only with members you mutually match with. The platform's privacy settings give you control over your information. The moderation team treats divorced members with complete professional equality. And D'amour Muslim's free access policy means that financial difficulty — which sometimes follows the practical reality of divorce — is never a barrier to using the platform fully.</p>

        <blockquote class="border-l-4 border-primary pl-4 italic text-gray-600 my-6">"Say: O My servants who have transgressed against themselves, do not despair of the mercy of Allah. Indeed, Allah forgives all sins. Indeed, it is He who is the Forgiving, the Merciful." — Quran 39:53. Every door that closes opens a new one.</blockquote>

        <div class="bg-primary/5 rounded-2xl p-6 border border-primary/10 mt-8">
          <p class="text-gray-700 font-medium">Also explore: <a href="/muslim-second-marriage" class="text-primary hover:underline">Muslim Second Marriage</a> &bull; <a href="/trusted-muslim-matchmaking" class="text-primary hover:underline">Trusted Muslim Matchmaking</a> &bull; <a href="/halal-marriage" class="text-primary hover:underline">Halal Marriage Platform</a></p>
        </div>
      </div>
    `
  },
  {
    path: "/muslim-marriage-over-30",
    pageTitle: "Muslim Marriage Over 30 — Later Is Not Too Late | D'amour Muslim",
    h1: "Muslim Marriage Over 30 — Islam Has No Age Limit, and Neither Do We",
    heroSubtitle: "Marrying in your 30s is more common than ever among British Muslims — and often leads to more grounded, compatible, and successful marriages. D'amour Muslim serves Muslims at every stage of life.",
    metaDescription: "Muslim marriage over 30 — why more Muslims marry in their 30s, the advantages of later marriage, Islam's view, and how D'amour Muslim serves over-30 Muslims. Free to join.",
    keywords: "muslim marriage over 30, muslim marriage 30s, muslim marriage older, marrying late islam, muslim marriage 35, late muslim marriage",
    canonicalPath: "/muslim-marriage-over-30",
    ctaHeading: "Your Perfect Match Is Still Out There",
    ctaSubtext: "Register free on D'amour Muslim — thousands of Muslims in their 30s and 40s are already searching.",
    relatedLinks: [
      { url: "/muslim-singles-uk", label: "Muslim Singles UK" },
      { url: "/muslim-matchmaking", label: "Muslim Matchmaking" },
      { url: "/find-muslim-spouse", label: "Find Muslim Spouse" },
      { url: "/verified-muslim-profiles", label: "Verified Muslim Profiles" }
    ],
    pageFaqSchema: [
      { q: "Is there an upper age limit for using D'amour Muslim?", a: "No — D'amour Muslim has no upper age limit. The platform serves Muslim marriage seekers of all ages, from young adults to those in their 40s, 50s, and beyond. Every age group represents a legitimate and important segment of the Muslim community seeking marriage, and D'amour Muslim's profile and search system accommodates the full age range with equal respect and functionality." },
      { q: "Are there many Muslim singles in their 30s and 40s on D'amour Muslim?", a: "Yes — Muslims in their 30s and 40s make up a significant and growing portion of D'amour Muslim's membership. This reflects broader social trends: later completion of higher education and postgraduate study, career establishment before marriage, the aftermath of delayed first marriage searches, and the presence of divorced or widowed Muslims seeking a second marriage. The over-30 Muslim marriage market is substantial, and D'amour Muslim actively serves it." },
      { q: "Is it shameful in Islam to marry late?", a: "No — there is no Islamic basis for shame around marrying later in life. The Prophet Muhammad ﷺ married Khadijah (ra) when she was approximately 40 and he was 25. Many companions of the Prophet married at various ages throughout their lives. Islam encourages marriage and discourages remaining single without reason — but it sets no cultural deadline. The shame associated with late marriage is a cultural construct, not an Islamic teaching, and it causes real harm to Muslims who deserve encouragement rather than judgment." },
      { q: "How do I filter profiles by age on D'amour Muslim?", a: "D'amour Muslim's search system includes age as a filter parameter. You can set a minimum and maximum age for your search to narrow results to your preferred age range. This allows over-30 members to search specifically within their own age group, or to set an age range that reflects their genuine compatibility preferences without being constrained to see only profiles far outside their target range." },
      { q: "What are the biggest challenges of finding a Muslim spouse in your 30s?", a: "The most common challenges for over-30 Muslim marriage seekers are: a narrower pool of never-married candidates (as many are already married by their early 30s), the pressure of cultural expectations that treat late marriage as abnormal, the need for a more compatible match given clearer personal priorities developed with life experience, and — for some — managing family anxiety about the delay. D'amour Muslim addresses these challenges by providing access to a large, national pool of similarly-aged Muslim marriage seekers, including both never-married and previously-married (divorced/widowed) members." }
    ],
    pageFaqs: [
      { q: "Is there an upper age limit for using D'amour Muslim?", a: "No — D'amour Muslim has no upper age limit. The platform serves Muslim marriage seekers of all ages, from young adults to those in their 40s, 50s, and beyond. Every age group represents a legitimate and important segment of the Muslim community seeking marriage, and D'amour Muslim's profile and search system accommodates the full age range with equal respect and functionality." },
      { q: "Are there many Muslim singles in their 30s and 40s on D'amour Muslim?", a: "Yes — Muslims in their 30s and 40s make up a significant and growing portion of D'amour Muslim's membership. This reflects broader social trends: later completion of higher education and postgraduate study, career establishment before marriage, the aftermath of delayed first marriage searches, and the presence of divorced or widowed Muslims seeking a second marriage. The over-30 Muslim marriage market is substantial, and D'amour Muslim actively serves it." },
      { q: "Is it shameful in Islam to marry late?", a: "No — there is no Islamic basis for shame around marrying later in life. The Prophet Muhammad ﷺ married Khadijah (ra) when she was approximately 40 and he was 25. Many companions of the Prophet married at various ages throughout their lives. Islam encourages marriage and discourages remaining single without reason — but it sets no cultural deadline. The shame associated with late marriage is a cultural construct, not an Islamic teaching, and it causes real harm to Muslims who deserve encouragement rather than judgment." },
      { q: "How do I filter profiles by age on D'amour Muslim?", a: "D'amour Muslim's search system includes age as a filter parameter. You can set a minimum and maximum age for your search to narrow results to your preferred age range. This allows over-30 members to search specifically within their own age group, or to set an age range that reflects their genuine compatibility preferences without being constrained to see only profiles far outside their target range." },
      { q: "What are the biggest challenges of finding a Muslim spouse in your 30s?", a: "The most common challenges for over-30 Muslim marriage seekers are: a narrower pool of never-married candidates (as many are already married by their early 30s), the pressure of cultural expectations that treat late marriage as abnormal, the need for a more compatible match given clearer personal priorities developed with life experience, and — for some — managing family anxiety about the delay. D'amour Muslim addresses these challenges by providing access to a large, national pool of similarly-aged Muslim marriage seekers, including both never-married and previously-married (divorced/widowed) members." }
    ],
    bodyContent: `
      <div class="prose max-w-none">
        <p class="text-lg text-gray-700 mb-6 leading-relaxed">Let us name it plainly: there is a cultural narrative in many Muslim communities that a person who has not married by their late twenties has missed the window, is somehow too difficult, or has something wrong with them. This narrative is false, harmful, and has no foundation in Islamic teaching. The Prophet Muhammad ﷺ himself married Khadijah (ra) — who was approximately 40 years old — as his first marriage, and it was by all accounts the most devoted and joyful marriage of his life. If you are a Muslim in your 30s seeking marriage, you are not late. You are right on time.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Why More Muslims Are Marrying in Their 30s</h2>
        <p class="text-gray-700 mb-4 leading-relaxed">The age of first marriage among British Muslims has been rising steadily for decades, for reasons that are entirely understandable and largely positive:</p>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Extended education:</strong> Undergraduate degrees, postgraduate qualifications, and professional training programmes routinely take British Muslims into their mid-to-late twenties before they feel financially and professionally settled enough to commit to marriage.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Career establishment:</strong> The expectation — both personal and familial — that a person should have a stable career foundation before marriage is widely held in British Muslim communities, particularly among professionals. Reaching that point in medicine, law, engineering, or business often takes until the early 30s.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Cost of living:</strong> The practical financial requirements of establishing a home — particularly in London, Birmingham, and other major UK cities — mean that many British Muslims are simply not in a position to marry in their early 20s even if they want to. This is a structural reality, not a personal failing.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>The difficulty of meeting the right person:</strong> Many Muslims who wanted to marry earlier simply did not find the right person — not for lack of trying, but because the right match is genuinely rare and finding them takes time. This is, in many ways, a sign of healthy standards rather than a problem to be fixed.</span></li>
        </ul>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">The Advantages of Marrying in Your 30s</h2>
        <div class="grid md:grid-cols-2 gap-4 mb-6">
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Clarity of Purpose</h3>
            <p class="text-gray-700 text-sm leading-relaxed">By your 30s, you know yourself. You know what you need in a spouse, what you cannot compromise on, and what you can be flexible about. This clarity leads to better decisions and more honest profiles — the kind that actually lead to compatible matches, rather than the kind written by a 22-year-old who has not yet discovered what they truly need.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Emotional Maturity</h3>
            <p class="text-gray-700 text-sm leading-relaxed">Marriage requires patience, emotional regulation, the ability to have difficult conversations, and the capacity to prioritise another person's needs alongside your own. These are skills developed by life experience — and by your 30s, most people have substantially more of them than they did at 22. Marriages entered into with greater emotional maturity have measurably better outcomes.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Financial Stability</h3>
            <p class="text-gray-700 text-sm leading-relaxed">Many Muslims in their 30s are established in their careers, have savings, and are in a far stronger position to provide the financial foundation that marriage requires than they were ten years earlier. This reduces one of the most common practical stressors of early marriage and allows the relationship itself to be the focus.</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <h3 class="text-xl font-semibold text-gray-800 mb-3 mt-0">Seriousness of Intent</h3>
            <p class="text-gray-700 text-sm leading-relaxed">A Muslim in their 30s who is actively seeking a spouse is — almost by definition — serious. They are not registering out of curiosity or family pressure. They want to get married, they are ready, and they are engaging with the process with the full intentionality it deserves. This makes the over-30 pool on D'amour Muslim particularly high-quality.</p>
          </div>
        </div>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Islam Has No Age Limit for Marriage</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">It bears repeating: there is no concept in Islamic fiqh of a person being "too old" to marry. The sunnah encourages marriage for those who are able, and it celebrates it as a mercy and a blessing at any age. The cultural anxiety around late marriage is a modern invention — a mixture of demographic concern and social pressure that has no Quranic or prophetic basis. What Islam asks is that you seek a spouse who is good for your deen, your worldly life, and your akhirah — and that this search be conducted with sincerity, propriety, and patience. The age at which you do this is between you and Allah.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">What Over-30s Look for in a Spouse</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">Muslims in their 30s typically approach the spouse search with a different lens than those in their early 20s. Compatibility — genuine, practical, day-to-day compatibility — often matters more than the surface-level attraction that drives younger searches. A shared vision of how to practise Islam in a British context, aligned financial values, compatible approaches to family and parenting, and mutual respect for each other's professional lives are frequently cited as more important than cultural background alone. D'amour Muslim's detailed profile fields — covering religious practice, lifestyle, career, family plans, and values — are designed to surface exactly this kind of compatibility information, making the over-30 search both more focused and more effective.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">How D'amour Muslim Serves Over-30 Muslims</h2>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Age filter in search:</strong> Set your preferred age range to find profiles from your own demographic. Filter from 30 upwards, or set any range that reflects your genuine preferences.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Profiles from all life stages:</strong> D'amour Muslim includes never-married, divorced, and widowed members across all age groups — giving over-30s access to the full range of people in their demographic who are genuinely seeking marriage.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Detailed compatibility information:</strong> The profile system surfaces career, religious practice, family plans, and values — the dimensions that matter most to mature marriage seekers, not just age and photo.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700"><strong>Free, private, and at your pace:</strong> No subscription pressure, no countdown, no sense of urgency imposed by the platform. You search when you want, engage when you are ready, and take the time you need — which is exactly the approach that tends to produce the best outcomes.</span></li>
        </ul>

        <blockquote class="border-l-4 border-primary pl-4 italic text-gray-600 my-6">"And He found you lost and guided you." — Quran 93:7. The right time is when Allah wills it — and your task is simply to remain sincere, keep searching, and trust the process.</blockquote>

        <div class="bg-primary/5 rounded-2xl p-6 border border-primary/10 mt-8">
          <p class="text-gray-700 font-medium">Also explore: <a href="/muslim-singles-uk" class="text-primary hover:underline">Muslim Singles UK</a> &bull; <a href="/muslim-matchmaking" class="text-primary hover:underline">Muslim Matchmaking</a> &bull; <a href="/find-muslim-spouse" class="text-primary hover:underline">Find Muslim Spouse</a> &bull; <a href="/verified-muslim-profiles" class="text-primary hover:underline">Verified Muslim Profiles</a></p>
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
// PROGRAMMATIC CITY HUB PAGES — unique content per city
// ============================================
const cityHubPages = [
  {
    city: "London",
    slug: "muslim-matrimony-london",
    region: "Greater London",
    nearbyAreas: "Tower Hamlets, Newham, Redbridge, Waltham Forest, Hackney, and Barking",
    muslimPopulation: "over 1.1 million, approximately 12% of Greater London's population — the largest Muslim community in any UK city",
    keyAreas: "Tower Hamlets (approx. 38% Muslim), Newham (33%), Redbridge (23%), Waltham Forest (22%), and Hackney (18%)",
    communityContext: "London's Muslim community is the UK's most diverse, spanning Bangladeshi, Pakistani, Somali, Arab, Turkish, and West African communities across all 33 boroughs. From established East London families to young professionals in the City, London Muslims represent every walk of life.",
    demographicHighlight: "According to the 2021 Census, Tower Hamlets has the highest proportion of Muslim residents of any local authority in England, at approximately 38%. The East London Mosque in Whitechapel is one of the largest mosques in Europe and a central hub for the city's Muslim community.",
    halalHighlights: [
      { name: "Brick Lane & Whitechapel, East London", desc: "A historic heart of Bangladeshi Muslim culture — halal restaurants, sweet shops, sari stores, and the iconic East London Mosque all within walking distance." },
      { name: "Green Street, Upton Park (E13)", desc: "A bustling South Asian high street with halal butchers, Asian sweets, bridal wear, and gold jewellers — a popular destination for Muslim families in East London." },
      { name: "Edgware Road, Westminster", desc: "London's 'Arab Street' — a stretch of Lebanese, Syrian, and Egyptian halal restaurants and shisha cafés. Popular among Muslim professionals and families for special occasions." },
      { name: "Southall Broadway, West London", desc: "A predominantly South Asian area with extensive halal food options, Islamic bookshops, and a strong Pakistani and Indian Muslim community." },
    ],
    localFaqs: [
      { q: "Which London boroughs have the largest Muslim populations?", a: "Tower Hamlets has the highest proportion at approximately 38% Muslim, followed by Newham (33%), Redbridge (23%), Waltham Forest (22%), and Hackney (18%). These East and North-East London boroughs have strong mosque networks, Islamic schools, and established halal business communities." },
      { q: "How does D'amour Muslim help London Muslims find a spouse?", a: "D'amour Muslim lets you filter profiles specifically by London as a city. You can browse verified Muslim singles across all 33 London boroughs, send interest requests, and communicate through our secure platform — all without leaving a halal, marriage-focused environment." },
      { q: "Is the service free for Muslims in London?", a: "Yes. Registering and browsing verified Muslim profiles in London is completely free. You can create your profile, view other London profiles, and send interest requests without any payment required." },
      { q: "Are there profiles from specific London areas like Tower Hamlets or Newham?", a: "Yes. Many of our London members include their specific borough in their profile. You can also search by city (London) and then browse profile descriptions to find members from specific areas. Our search includes Muslims from all London boroughs." },
    ]
  },
  {
    city: "Birmingham",
    slug: "muslim-matrimony-birmingham",
    region: "West Midlands",
    nearbyAreas: "Small Heath, Sparkbrook, Alum Rock, Saltley, Handsworth, and Aston",
    muslimPopulation: "approximately 234,000, making up roughly 22% of Birmingham's population — one of the highest proportions of any major UK city",
    keyAreas: "Small Heath, Sparkbrook, Alum Rock, Saltley, Handsworth, Aston, and Ladypool Road (the Balti Triangle)",
    communityContext: "Birmingham has one of the UK's oldest and most established Muslim communities. The city's Pakistani, Bangladeshi, and Somali communities have been settled here since the 1960s and 1970s, creating a rich network of mosques, Islamic schools, and halal businesses that spans the entire city.",
    demographicHighlight: "The 2021 Census showed Birmingham has a Muslim population of over 234,000 — approximately 22% of the city. Sparkbrook and Small Heath have particularly concentrated Muslim communities. Birmingham Central Mosque, founded in 1975, is one of the oldest purpose-built mosques in the UK.",
    halalHighlights: [
      { name: "Ladypool Road — The Balti Triangle", desc: "Birmingham's famous 'Balti Triangle' in Sparkbrook and Balsall Heath is internationally renowned for its Pakistani and Kashmiri halal restaurants. A cultural landmark for Birmingham's Muslim community." },
      { name: "Stratford Road, Sparkhill", desc: "A vibrant South Asian corridor stretching from Hall Green to Sparkbrook, lined with halal grocers, sweet shops, Asian clothing stores, and Pakistani restaurants." },
      { name: "Birchfield Road, Perry Barr", desc: "An established Muslim residential and commercial area in North Birmingham with mosques, halal food shops, and community centres." },
      { name: "Birmingham Central Mosque", desc: "One of the UK's oldest purpose-built mosques, serving as a major community hub for education, events, and marriage-related services." },
    ],
    localFaqs: [
      { q: "Which areas of Birmingham have the largest Muslim communities?", a: "Small Heath, Sparkbrook, Alum Rock, Saltley, and Handsworth have the highest concentrations of Muslim residents. The area around Ladypool Road (the Balti Triangle) is particularly well-known as a heart of Birmingham's Pakistani Muslim community." },
      { q: "How do I find a Muslim marriage partner in Birmingham on D'amour Muslim?", a: "Filter profiles by 'Birmingham' in the city search on our profiles page. You will see verified Muslim singles from across the West Midlands. You can combine this with age and gender filters to narrow your results further." },
      { q: "Does D'amour Muslim have many Muslim profiles from Birmingham?", a: "Yes. Birmingham is one of our most active cities outside London, reflecting its large and established Muslim community. You will find profiles from across the city and surrounding West Midlands areas." },
      { q: "Can families in Birmingham use D'amour Muslim to find a rishta?", a: "Absolutely. D'amour Muslim is family-friendly and supports parents or guardians registering on behalf of their son or daughter. Many Birmingham families use our platform to find suitable marriage proposals both locally and nationally." },
    ]
  },
  {
    city: "Manchester",
    slug: "muslim-matrimony-manchester",
    region: "Greater Manchester",
    nearbyAreas: "Rusholme, Longsight, Cheetham Hill, Oldham, Rochdale, and Bolton",
    muslimPopulation: "approximately 80,000 within the city of Manchester, representing around 15% of the city's population. Greater Manchester as a whole has over 200,000 Muslims",
    keyAreas: "Rusholme (the Curry Mile), Longsight, Cheetham Hill, Whalley Range, and Levenshulme",
    communityContext: "Manchester has a vibrant and growing Muslim community that spans Pakistani, Bangladeshi, Somali, and Arab backgrounds. The city's student population — including many Muslim students at the University of Manchester and Manchester Metropolitan — adds a younger dimension to an already diverse community.",
    demographicHighlight: "Rusholme's 'Curry Mile' on Wilmslow Road is one of the UK's most famous South Asian Muslim cultural destinations — a kilometre of Pakistani, Indian, and Middle Eastern halal restaurants, sweet shops, and businesses. Cheetham Hill has a significant Bangladeshi and East African Muslim community.",
    halalHighlights: [
      { name: "The Curry Mile, Rusholme", desc: "A world-famous stretch of halal restaurants on Wilmslow Road — Pakistani, Kashmiri, Indian, and Middle Eastern cuisine in one of the UK's most iconic Muslim cultural corridors." },
      { name: "Longsight Market", desc: "A busy community market in South Manchester popular with Pakistani and Bangladeshi Muslim families — halal butchers, spice stores, and fabric shops." },
      { name: "Cheetham Hill Road", desc: "A diverse North Manchester corridor with a strong Bangladeshi and East African Muslim community, home to numerous mosques and Islamic schools." },
      { name: "Manchester Central Mosque", desc: "The principal mosque for Manchester's Muslim community, hosting community events, Islamic education, and serving as a focal point for Muslim families across Greater Manchester." },
    ],
    localFaqs: [
      { q: "Where do most Muslims live in Manchester?", a: "The largest concentrations of Muslims in Manchester are in Rusholme, Longsight, Whalley Range, Moss Side, Levenshulme, and Cheetham Hill. Surrounding boroughs including Oldham, Rochdale, and Bolton also have very large Muslim populations within Greater Manchester." },
      { q: "How can I find a Muslim spouse in Manchester through D'amour Muslim?", a: "Search for Manchester in the city filter on our profiles page to browse verified Muslim singles in the city. You can also filter by Greater Manchester to include profiles from Oldham, Rochdale, Bolton, and other surrounding areas." },
      { q: "Are there Muslim profiles from Rusholme, Longsight, or Cheetham Hill on D'amour Muslim?", a: "Yes. Many of our Manchester members include their neighbourhood or area in their profile. You can search by Manchester and then read individual profiles to find members from specific parts of the city." },
      { q: "Is D'amour Muslim popular with Muslim students in Manchester?", a: "Yes, D'amour Muslim is used by Muslims of all ages including university students who are looking for serious marriage connections. All users, regardless of age (18+), are looking for Nikah — not casual relationships." },
    ]
  },
  {
    city: "Bradford",
    slug: "muslim-matrimony-bradford",
    region: "West Yorkshire",
    nearbyAreas: "Manningham, Keighley, Dewsbury, Batley, Halifax, and Huddersfield",
    muslimPopulation: "approximately 153,000, representing nearly 25% of Bradford's population — the highest Muslim percentage of any major UK city",
    keyAreas: "Manningham, Little Horton, Toller, Great Horton, and Bradford City Centre",
    communityContext: "Bradford has the most proportionally Muslim population of any major UK city — roughly one in four residents is Muslim. The city has deep roots in Pakistani and Kashmiri migration going back to the 1950s, creating one of the UK's most culturally rooted and tightly knit Muslim communities. Bradford's Muslim community is primarily Pakistani-heritage and predominantly Mirpuri-Kashmiri, with strong family and biradari networks.",
    demographicHighlight: "According to the 2021 Census, Bradford's Muslim population stands at approximately 24.7% — making it the UK city with the highest proportion of Muslim residents. Manningham and Little Horton have the most concentrated Muslim residential areas, with dozens of mosques and Islamic education centres.",
    halalHighlights: [
      { name: "Great Horton Road", desc: "The backbone of Bradford's Pakistani Muslim commercial district — halal butchers, South Asian grocery stores, shalwar kameez shops, jewellers, and wedding suppliers all concentrated in one area." },
      { name: "Morrisons Bradford (Thornbury)", desc: "One of the UK's largest halal supermarkets serving Bradford's Muslim community, with a dedicated halal meat counter and extensive South Asian grocery range." },
      { name: "Bradford Jamia Masjid (Westgate)", desc: "One of Bradford's largest and oldest mosques, serving as a central hub for the Pakistani Muslim community in West Yorkshire." },
      { name: "Keighley Road Corridor, Manningham", desc: "The heart of Manningham — Bradford's oldest established Muslim neighbourhood — with mosques, Asian sweet shops, fabric stores, and a strong community feel." },
    ],
    localFaqs: [
      { q: "Does Bradford have the largest Muslim community in the UK?", a: "Bradford has the highest proportion of Muslims of any major UK city — approximately 24.7% according to the 2021 Census. While London has the largest absolute number, Bradford's Muslim community forms the largest percentage share of a major city's population. The community is predominantly Pakistani and Kashmiri-heritage." },
      { q: "How does biradari (clan) culture affect marriage searches in Bradford?", a: "In Bradford's Pakistani community, biradari (extended family/clan) networks traditionally play a large role in arranging marriages. D'amour Muslim complements these networks by expanding your search to Muslims you may not meet through family contacts alone, while still supporting family involvement throughout the process." },
      { q: "Can I find a rishta in Bradford through D'amour Muslim?", a: "Yes. Bradford is one of our most active cities. Filter profiles by Bradford to see verified Muslim singles from across the city and wider West Yorkshire area. Many profiles include details about their background and biradari, which can be helpful for families." },
      { q: "Does D'amour Muslim work for Muslims in nearby areas like Dewsbury, Batley, or Keighley?", a: "Yes. D'amour Muslim is used by Muslims across West Yorkshire. You can search by Bradford to find local profiles, or search more broadly by West Yorkshire. Many members from Keighley, Dewsbury, Batley, and Halifax are active on the platform." },
    ]
  },
  {
    city: "Leicester",
    slug: "muslim-matrimony-leicester",
    region: "East Midlands",
    nearbyAreas: "Highfields, Evington, Belgrave, Spinney Hills, and Beaumont Leys",
    muslimPopulation: "approximately 106,000, representing around 22% of Leicester's population",
    keyAreas: "Highfields, Evington, Spinney Hills, Belgrave, and the Golden Mile (Belgrave Road)",
    communityContext: "Leicester is one of the UK's most religiously and ethnically diverse cities — it was one of the first UK cities where no single ethnic group forms a majority. Its Muslim community is predominantly Pakistani and Bangladeshi, with a growing Somali and East African presence. Leicester's Muslims have a well-established network of mosques, Islamic schools, and halal businesses spanning the city.",
    demographicHighlight: "The 2021 Census confirmed Leicester as one of the most diverse cities in the UK. The Highfields and Evington areas are particularly associated with Leicester's Muslim community, and Belgrave Road — known as the 'Golden Mile' — is a famous South Asian retail and cultural corridor. Leicester's Central Mosque is one of the largest in the East Midlands.",
    halalHighlights: [
      { name: "Belgrave Road — The Golden Mile", desc: "Leicester's famous 'Golden Mile' is a South Asian cultural corridor known for Diwali celebrations, but also home to halal restaurants, Asian sweet shops, sari stores, and jewellers used by the Muslim community year-round." },
      { name: "Highfields / St Peter's Road", desc: "The heart of Leicester's Muslim residential community — home to mosques, halal butchers, South Asian grocery stores, and a strong Pakistani community feel." },
      { name: "Evington Road", desc: "A vibrant Muslim community corridor in East Leicester with halal restaurants, Islamic bookshops, and mosques serving the Evington and Spinney Hills areas." },
      { name: "Leicester Central Mosque (Conduit Street)", desc: "One of the largest mosques in the East Midlands and a central institution for Leicester's Muslim community, offering education, community events, and guidance." },
    ],
    localFaqs: [
      { q: "Is Leicester a good city for Muslim marriage seekers?", a: "Yes. Leicester has a large, established, and diverse Muslim community of over 100,000 people. The city has a strong network of mosques, Islamic schools, halal businesses, and community events that make it an excellent environment for Muslims seeking to build a family." },
      { q: "Which areas of Leicester have the most Muslims?", a: "Highfields, Evington, Spinney Hills, and Belgrave have the highest concentrations of Muslim residents. These areas are well-served by mosques, halal restaurants, and South Asian cultural amenities." },
      { q: "How do I find a Muslim partner in Leicester on D'amour Muslim?", a: "Use the city filter on our profiles page and search for Leicester. You will see all verified Muslim profiles from the Leicester area. Combine with gender and age filters to narrow your results. Many Leicester profiles include their specific area within the city." },
      { q: "Does D'amour Muslim have profiles from Nottingham or Derby as well?", a: "Yes. While we have a dedicated Leicester hub page, D'amour Muslim is used by Muslims across the East Midlands including Nottingham and Derby. You can search by city name to find profiles in those areas too." },
    ]
  },
  {
    city: "Leeds",
    slug: "muslim-matrimony-leeds",
    region: "West Yorkshire",
    nearbyAreas: "Harehills, Chapeltown, Beeston, Hyde Park, and Headingley",
    muslimPopulation: "approximately 70,000, representing around 7% of Leeds' population",
    keyAreas: "Harehills, Chapeltown, Beeston, Hyde Park, Burley, and Armley",
    communityContext: "Leeds has a growing and increasingly prominent Muslim community with roots in Pakistani, Bangladeshi, Somali, and Arab migration. The University of Leeds and Leeds Beckett University add a significant student Muslim population to the city, while established families in Harehills and Beeston form the community's backbone.",
    demographicHighlight: "Harehills is Leeds' most densely Muslim neighbourhood, with a large Pakistani and Bangladeshi community. Beeston, which gained international attention in 2005, has since rebuilt and strengthened its Muslim community infrastructure significantly. Leeds' Muslim community is younger on average than many other UK cities, reflecting significant second and third-generation British Muslim growth.",
    halalHighlights: [
      { name: "Harehills Lane & Roundhay Road", desc: "The centre of Muslim community life in Leeds — halal butchers, Pakistani grocery stores, Bengali sweet shops, mosques, and Islamic clothing all within easy reach. A vibrant South Asian corridor." },
      { name: "Brudenell Social Club area, Hyde Park", desc: "A diverse student area near the University of Leeds with halal takeaways and cafés popular with Muslim students from across the UK." },
      { name: "Beeston Hill", desc: "An established Pakistani Muslim residential area in South Leeds with mosques, halal businesses, and strong community networks that have grown significantly in recent years." },
      { name: "Makkah Masjid, Harehills", desc: "One of Leeds' largest mosques and a focal point for the Pakistani and Bangladeshi Muslim communities in East Leeds." },
    ],
    localFaqs: [
      { q: "Where do Muslims in Leeds mainly live?", a: "Harehills is the most concentrated Muslim area in Leeds, followed by Beeston, Chapeltown, Hyde Park, Burley, and Armley. These inner-city areas have established mosque networks, halal food businesses, and strong Muslim community infrastructure." },
      { q: "How can I find a Muslim marriage partner in Leeds on D'amour Muslim?", a: "Search for Leeds in the city filter on our profiles page. You will see all verified Muslim profiles from the Leeds area. You can refine results further by gender, age, and other filters. Leeds is an active city on our platform with many serious marriage-seekers." },
      { q: "Are there profiles from other West Yorkshire cities like Dewsbury or Halifax?", a: "Yes. D'amour Muslim is used across West Yorkshire. Search by Leeds for local profiles, or search for Bradford, Dewsbury, Halifax, or Huddersfield to see profiles from those specific cities. Many West Yorkshire Muslims are open to matches from across the region." },
      { q: "Is D'amour Muslim used by Muslim students in Leeds?", a: "Yes. Many Muslim students at the University of Leeds and Leeds Beckett University use D'amour Muslim to find serious marriage connections. All users must be 18+ and are required to register with genuine Nikah intention — no casual relationships." },
    ]
  },
  {
    city: "Sheffield",
    slug: "muslim-matrimony-sheffield",
    region: "South Yorkshire",
    nearbyAreas: "Burngreave, Pitsmoor, Sharrow, Page Hall, Firth Park, and Rotherham",
    muslimPopulation: "approximately 80,000, representing around 10% of Sheffield's population",
    keyAreas: "Burngreave, Pitsmoor, Sharrow, Page Hall, Firth Park, and Attercliffe",
    communityContext: "Sheffield's Muslim community has deep roots in Pakistani and Kashmiri migration to the city's steel industry from the 1950s onwards, creating one of South Yorkshire's most established South Asian communities. The city also has a significant Yemeni Muslim community — one of the oldest Arab Muslim communities in England — alongside growing Somali and Bangladeshi populations.",
    demographicHighlight: "Burngreave and Pitsmoor are Sheffield's most concentrated Muslim areas, with a strong Pakistani and Kashmiri heritage community. Page Hall gained national attention for its large Romani and Eastern European population but Firth Park and Burngreave remain predominantly South Asian Muslim. Sheffield Central Mosque on Wolseley Road is a major community institution. The Yemeni Muslim community in Sheffield dates back to the 1920s — one of the earliest Arab Muslim settlements in the UK.",
    halalHighlights: [
      { name: "Spital Hill & Burngreave Road", desc: "The main South Asian Muslim commercial corridor in Sheffield — halal butchers, Pakistani grocery stores, Asian sweet shops, and Islamic clothing outlets all along this stretch." },
      { name: "Attercliffe Road", desc: "An historic industrial area of Sheffield now home to a significant Muslim community, with mosques and halal food businesses serving the surrounding Pakistani and Bangladeshi populations." },
      { name: "Sheffield Central Mosque (Wolseley Road)", desc: "One of Sheffield's largest and most prominent mosques, serving as a central hub for the Pakistani and Kashmiri Muslim communities across South Yorkshire." },
      { name: "Sharrow & Ecclesall Road South", desc: "A diverse inner-city area with a mixed Muslim student and family population, close to the University of Sheffield and Sheffield Hallam, with halal food options." },
    ],
    localFaqs: [
      { q: "Where do most Muslims in Sheffield live?", a: "The largest concentrations of Muslims in Sheffield are in Burngreave, Pitsmoor, Firth Park, Page Hall, and Sharrow. These inner north and east Sheffield areas have well-established mosque networks, halal food businesses, and strong Pakistani and Kashmiri community infrastructure." },
      { q: "How do I find a Muslim marriage partner in Sheffield on D'amour Muslim?", a: "Use the city filter on our profiles page and search for Sheffield. You will see verified Muslim profiles from across South Yorkshire. Combine with gender, age, and other filters to narrow your results further." },
      { q: "Does D'amour Muslim have profiles from Rotherham, Barnsley, or Doncaster?", a: "Yes. D'amour Muslim is used by Muslims across South Yorkshire. Search by Sheffield for local profiles, or search the specific town name for profiles from Rotherham, Barnsley, or Doncaster." },
      { q: "Is Sheffield's Muslim community predominantly Pakistani?", a: "Sheffield's Muslim community is predominantly Pakistani and Kashmiri-heritage, but the city also has one of England's oldest Yemeni Muslim communities (dating to the 1920s), alongside growing Somali and Bangladeshi populations." },
    ]
  },
  {
    city: "Coventry",
    slug: "muslim-matrimony-coventry",
    region: "West Midlands",
    nearbyAreas: "Foleshill, Hillfields, Radford, Stoke, and Bedworth",
    muslimPopulation: "approximately 50,000, representing around 13% of Coventry's population",
    keyAreas: "Foleshill, Hillfields, Radford, Stoke, and the Foleshill Road corridor",
    communityContext: "Coventry's Muslim community is predominantly Pakistani and Bangladeshi, with a significant Somali and East African Muslim presence. The Foleshill area of the city has been a South Asian hub since the 1960s and is home to one of the most vibrant halal high streets outside London and Birmingham. Coventry's Muslim population is young on average with a strong student presence at Coventry University.",
    demographicHighlight: "Foleshill Road is Coventry's equivalent of Birmingham's Ladypool Road — a kilometre-long stretch of Pakistani restaurants, halal butchers, sari shops, jewellers, and sweet shops that serves the entire Muslim community of the city. The 2021 Census confirmed approximately 13% of Coventry's population identifies as Muslim. Hillfields and Radford are adjacent Muslim-majority residential areas with mosques and Islamic schools.",
    halalHighlights: [
      { name: "Foleshill Road — Coventry's Halal High Street", desc: "The heart of Coventry's South Asian Muslim community — a long stretch of halal restaurants, Pakistani sweet shops, sari and fabric stores, gold jewellers, and Islamic clothing boutiques." },
      { name: "Stoney Stanton Road, Hillfields", desc: "An established Muslim residential and commercial street adjacent to Foleshill, with mosques, halal grocers, and community centres serving the Bangladeshi and Pakistani populations." },
      { name: "Coventry Central Mosque (Eagle Street)", desc: "One of Coventry's largest mosques and a key community institution for the city's Pakistani Muslim community, hosting education, events, and marriage-related activities." },
      { name: "Coventry University Area, City Centre", desc: "A cosmopolitan student zone with halal food options popular with Muslim students, many of whom join D'amour Muslim while studying in the city." },
    ],
    localFaqs: [
      { q: "Which parts of Coventry have the largest Muslim communities?", a: "Foleshill, Hillfields, Radford, and Stoke are Coventry's most Muslim-concentrated areas. Foleshill Road in particular is one of the UK's most vibrant South Asian halal commercial corridors outside London and Birmingham." },
      { q: "How do I find a Muslim spouse in Coventry on D'amour Muslim?", a: "Search for Coventry in the city filter on our profiles page. You will see verified Muslim profiles from the Coventry area and wider West Midlands. Many Coventry members also match with profiles from nearby Birmingham and Wolverhampton." },
      { q: "Are there Muslim profiles from Wolverhampton or Walsall nearby?", a: "Yes. D'amour Muslim is used across the West Midlands. Search by Coventry for local profiles, or search by Wolverhampton, Walsall, or West Bromwich for profiles from those specific areas." },
      { q: "Is D'amour Muslim popular with Muslim students at Coventry University?", a: "Yes. Many Muslim students at Coventry University use D'amour Muslim. All users must be 18+ and are seeking serious marriage (Nikah) — not casual relationships." },
    ]
  },
  {
    city: "Luton",
    slug: "muslim-matrimony-luton",
    region: "Bedfordshire",
    nearbyAreas: "Bury Park, High Town, Farley Hill, Stopsley, and Dunstable",
    muslimPopulation: "approximately 90,000, representing around 24% of Luton's population — one of the highest Muslim proportions outside London and Bradford",
    keyAreas: "Bury Park, High Town, Farley Hill, Round Green, and the Bury Park Road corridor",
    communityContext: "Luton has one of the most proportionally large Muslim communities of any English town outside London and Bradford. The community is predominantly Pakistani and Mirpuri-Kashmiri heritage, with a significant Bangladeshi presence and growing Somali and Arab populations. Bury Park is one of the most established South Asian Muslim neighbourhoods in England, with roots going back to the 1960s.",
    demographicHighlight: "The 2021 Census confirmed approximately 24% of Luton's population is Muslim — among the highest in any English town. Bury Park Road is one of the most densely Muslim commercial streets in England outside East London and the West Midlands. Luton Central Mosque and the numerous mosques in the Bury Park area serve as community anchors for a deeply-rooted Muslim community.",
    halalHighlights: [
      { name: "Bury Park Road — Luton's Halal Heart", desc: "One of the most famous South Asian Muslim commercial streets in England — packed with Pakistani restaurants, Mirpuri sweet shops, halal butchers, Asian fabric stores, and gold jewellers." },
      { name: "Dunstable Road Corridor", desc: "A major arterial road through Luton's Muslim residential areas, with mosques, halal food shops, Islamic schools, and community centres serving the Pakistani and Bangladeshi communities." },
      { name: "Luton Central Mosque", desc: "One of Luton's largest mosques and a central community institution, hosting education, community events, and serving as a gathering point for Luton's Muslim community." },
      { name: "Bute Street & Hightown Area", desc: "An established Muslim residential neighbourhood adjacent to Bury Park with strong community networks, mosques, and halal businesses." },
    ],
    localFaqs: [
      { q: "Is Luton one of the most Muslim towns in England?", a: "Yes. With approximately 24% of its population identifying as Muslim according to the 2021 Census, Luton has one of the highest proportions of Muslim residents of any English town outside London and Bradford. The community is predominantly Pakistani and Mirpuri-Kashmiri, with Bury Park as its cultural heart." },
      { q: "How do I find a Muslim marriage partner in Luton on D'amour Muslim?", a: "Search for Luton in the city filter on our profiles page. You will see verified Muslim profiles from across Luton and the surrounding Bedfordshire area. Combine filters by age and gender to narrow results." },
      { q: "Are there profiles from Milton Keynes, Bedford, or Dunstable nearby?", a: "Yes. D'amour Muslim is used by Muslims across Bedfordshire and Buckinghamshire. Search by Luton for local profiles, or by Milton Keynes, Bedford, or Dunstable for profiles in those areas." },
      { q: "Is D'amour Muslim popular with Mirpuri-Kashmiri families in Luton?", a: "Yes. D'amour Muslim is widely used by the South Asian Muslim community in Luton, including Pakistani and Mirpuri-Kashmiri families. Many profiles include details about family background and biradari. Parents and family members can also register on behalf of a son or daughter." },
    ]
  },
  {
    city: "Glasgow",
    slug: "muslim-matrimony-glasgow",
    region: "Scotland",
    nearbyAreas: "Pollokshields, Govanhill, Battlefield, Strathbungo, and Edinburgh",
    muslimPopulation: "approximately 35,000, representing around 7% of Glasgow's population — the largest Muslim community in Scotland",
    keyAreas: "Pollokshields, Govanhill, Battlefield, Strathbungo, and Shawlands",
    communityContext: "Glasgow has the largest Muslim community in Scotland — a vibrant, predominantly Pakistani community with roots going back to the 1960s. The Pollokshields area of the south side is one of the most concentrated South Asian Muslim neighbourhoods in Scotland, home to dozens of mosques, halal restaurants, and Asian businesses. Glasgow's Muslim community is well-integrated yet culturally distinct, maintaining strong Pakistani and Islamic identity.",
    demographicHighlight: "According to the 2022 Scottish Census, approximately 7% of Glasgow's population identifies as Muslim — the highest of any Scottish city. Pollokshields is the heart of Glasgow's South Asian Muslim community, with Victoria Road and Albert Drive forming a significant halal commercial corridor. Glasgow Central Mosque on the River Clyde is one of the most architecturally prominent purpose-built mosques in the UK.",
    halalHighlights: [
      { name: "Victoria Road & Albert Drive, Pollokshields", desc: "The heart of Glasgow's South Asian Muslim commercial district — Pakistani restaurants, halal butchers, sari stores, sweet shops, and Islamic businesses lining the streets of Pollokshields." },
      { name: "Glasgow Central Mosque (Adelphi Street)", desc: "One of the UK's most architecturally significant purpose-built mosques, located on the south bank of the River Clyde. A landmark for Glasgow's Muslim community and Scotland's largest mosque." },
      { name: "Battlefield Road & Strathbungo", desc: "Diverse mixed residential areas adjacent to Pollokshields with a significant Muslim population, halal food options, and a growing community of Muslim professionals and students." },
      { name: "Govanhill Area", desc: "One of Glasgow's most ethnically diverse neighbourhoods — home to Pakistani, South Asian, Roma, and international communities with halal food shops and community centres." },
    ],
    localFaqs: [
      { q: "Where do most Muslims in Glasgow live?", a: "Pollokshields is Glasgow's most concentrated Muslim neighbourhood, with Govanhill, Battlefield, and Strathbungo also having significant Muslim populations. The south side of Glasgow is the main hub for the city's Pakistani and South Asian Muslim community." },
      { q: "How do I find a Muslim marriage partner in Glasgow on D'amour Muslim?", a: "Search for Glasgow in the city filter on our profiles page. You will see verified Muslim profiles from across Glasgow and Scotland. D'amour Muslim serves Muslims across all of Scotland — you can also search for Edinburgh or other Scottish cities." },
      { q: "Are there Muslim profiles from Edinburgh or other Scottish cities on D'amour Muslim?", a: "Yes. D'amour Muslim is used by Muslims across Scotland. Search by Glasgow for local profiles, or by Edinburgh, Dundee, Aberdeen, or Paisley for profiles in those areas." },
      { q: "Is Glasgow's Muslim community predominantly Pakistani?", a: "Yes. Glasgow's Muslim community is predominantly of Pakistani heritage — the largest Muslim ethnic group in Scotland. The community has been in Glasgow since the 1960s and is well-established in Pollokshields and the south side of the city." },
    ]
  },
  {
    city: "Nottingham",
    slug: "muslim-matrimony-nottingham",
    region: "East Midlands",
    nearbyAreas: "Hyson Green, Radford, Forest Fields, St Ann's, Sherwood, and Derby",
    muslimPopulation: "approximately 40,000, representing around 9% of Nottingham's population",
    keyAreas: "Hyson Green, Radford, Forest Fields, St Ann's, and Sherwood",
    communityContext: "Nottingham's Muslim community is predominantly Pakistani and Bangladeshi, with a significant Somali presence and an East African Asian community. Hyson Green is the main Muslim commercial and cultural hub, centred on the Alfreton Road and Radford Road corridors. The city has a strong student Muslim population thanks to the University of Nottingham and Nottingham Trent University.",
    demographicHighlight: "Hyson Green, along Alfreton Road and Radford Road, is Nottingham's main South Asian Muslim commercial corridor — home to halal butchers, Pakistani restaurants, Islamic clothing stores, and mosques. The 2021 Census confirmed approximately 9% of Nottingham's population identifies as Muslim. Nottingham Central Mosque on Woodborough Road is one of the East Midlands' most prominent mosques.",
    halalHighlights: [
      { name: "Alfreton Road & Hyson Green", desc: "Nottingham's primary South Asian Muslim corridor — halal butchers, Pakistani grocers, Bangladeshi sweet shops, Islamic clothing stores, and mosques all concentrated along this vibrant stretch." },
      { name: "Radford Road", desc: "Adjacent to Hyson Green, Radford Road extends the Muslim commercial zone northward with more halal food businesses, mosques, and community institutions serving the Pakistani and Bangladeshi communities." },
      { name: "Nottingham Central Mosque (Woodborough Road)", desc: "One of Nottingham's most prominent mosques and a central institution for the city's Muslim community, serving Pakistani, Bangladeshi, and Somali Muslims across Greater Nottingham." },
      { name: "Forest Road East, Sherwood", desc: "A diverse residential area north of the city centre with a growing Muslim student and young professional population, close to Nottingham Trent University's city campus." },
    ],
    localFaqs: [
      { q: "Which areas of Nottingham have the largest Muslim communities?", a: "Hyson Green, Radford, Forest Fields, and St Ann's have the highest concentrations of Muslim residents in Nottingham. Alfreton Road and Radford Road form the main Muslim commercial corridor, with mosques, halal food shops, and Islamic institutions serving the community." },
      { q: "How do I find a Muslim marriage partner in Nottingham on D'amour Muslim?", a: "Search for Nottingham in the city filter on our profiles page. You will see verified Muslim profiles from across Nottingham and the wider East Midlands. Combine with age and gender filters to refine your results." },
      { q: "Are there Muslim profiles from Leicester, Derby, or Loughborough nearby?", a: "Yes. D'amour Muslim is widely used across the East Midlands. Search by Nottingham for local profiles, or by Leicester, Derby, or Loughborough for profiles from those nearby cities." },
      { q: "Is D'amour Muslim used by Muslim students at the University of Nottingham?", a: "Yes. Muslim students at the University of Nottingham and Nottingham Trent University use D'amour Muslim to find serious marriage connections. All users must be 18+ and are seeking genuine Nikah — no casual relationships." },
    ]
  },
];

cityHubPages.forEach(function(hub) {
  const halalList = hub.halalHighlights.map(h =>
    `<li class="flex items-start gap-3 mb-4">
      <span class="text-primary mt-1 text-lg">✓</span>
      <span class="text-gray-700"><strong>${h.name}:</strong> ${h.desc}</span>
    </li>`
  ).join('');

  const bodyContent = `
    <div class="prose max-w-none">
      <p class="text-lg text-gray-700 mb-6 leading-relaxed">Looking for a Muslim life partner in ${hub.city}? D'amour Muslim is the UK's trusted halal matrimony platform, connecting serious marriage seekers across ${hub.region}. Whether you live in ${hub.nearbyAreas} — our verified, moderated profiles make the search easier, safer, and more dignified.</p>

      <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Muslim Demographics in ${hub.city}</h2>
      <p class="text-gray-700 mb-4 leading-relaxed">${hub.city} is home to ${hub.muslimPopulation}. The Muslim community is most concentrated in ${hub.keyAreas}.</p>
      <p class="text-gray-700 mb-6 leading-relaxed">${hub.demographicHighlight}</p>
      <p class="text-gray-700 mb-6 leading-relaxed">${hub.communityContext}</p>

      <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Why Muslims in ${hub.city} Choose D'amour Muslim</h2>
      <ul class="list-none space-y-3 mb-6">
        <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Profiles manually verified by our moderation team before going live — no fake accounts</span></li>
        <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Halal-first environment — Nikah intention required, no casual dating</span></li>
        <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Free to join, create a profile, and browse Muslim singles in ${hub.city}</span></li>
        <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Filter by age, gender, height, nationality, and more</span></li>
        <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Family-friendly — parents and walis are welcome to manage or assist with a profile</span></li>
        <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">UK GDPR compliant — your data is private and never sold to third parties</span></li>
      </ul>

      <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Popular Halal Venues &amp; Muslim Community Spots in ${hub.city}</h2>
      <p class="text-gray-700 mb-4">For Muslims in ${hub.city}, these areas and venues are well-known community hubs — places where the local Muslim community gathers, eats, shops, and worships:</p>
      <ul class="list-none mb-6">
        ${halalList}
      </ul>

      <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">How the D'amour Muslim Search Works for ${hub.city}</h2>
      <p class="text-gray-700 mb-4">Finding a Muslim spouse in ${hub.city} through D'amour Muslim is straightforward:</p>
      <div class="grid md:grid-cols-3 gap-4 mb-8">
        <div class="bg-gray-50 rounded-xl p-4 text-center border border-gray-100">
          <span class="text-primary font-bold text-2xl block mb-2">1</span>
          <p class="font-semibold text-gray-800 text-sm mb-1">Create a Free Profile</p>
          <p class="text-gray-600 text-xs">Register and complete your verified profile in minutes</p>
        </div>
        <div class="bg-gray-50 rounded-xl p-4 text-center border border-gray-100">
          <span class="text-primary font-bold text-2xl block mb-2">2</span>
          <p class="font-semibold text-gray-800 text-sm mb-1">Search by ${hub.city}</p>
          <p class="text-gray-600 text-xs">Use the city filter to find Muslims specifically in ${hub.city} and ${hub.region}</p>
        </div>
        <div class="bg-gray-50 rounded-xl p-4 text-center border border-gray-100">
          <span class="text-primary font-bold text-2xl block mb-2">3</span>
          <p class="font-semibold text-gray-800 text-sm mb-1">Connect &amp; Proceed</p>
          <p class="text-gray-600 text-xs">Send interest, receive mutual acceptance, then communicate — the halal way</p>
        </div>
      </div>

      <div class="bg-primary/5 rounded-2xl p-6 border border-primary/10 mt-8">
        <p class="text-gray-700 font-medium">
          Understand the Islamic approach to marriage: <a href="/muslim-marriage" class="text-primary hover:underline">Muslim Marriage in Islam</a>.
          Learn how our platform works: <a href="/muslim-matrimonial" class="text-primary hover:underline">Platform Features Guide</a>.
          Also explore other UK city hubs:
          ${cityHubPages.filter(c => c.city !== hub.city).map(c => `<a href="/${c.slug}" class="text-primary hover:underline">Muslim Matrimony ${c.city}</a>`).join(' &bull; ')}.
        </p>
      </div>
    </div>
  `;

  const page = {
    path: "/" + hub.slug,
    pageTitle: `Muslim Matrimony in ${hub.city} | Verified Muslim Singles | D'amour Muslim`,
    h1: `Muslim Matrimony in ${hub.city} — Find Your Halal Spouse`,
    heroSubtitle: `Connect with verified Muslim singles across ${hub.city} and ${hub.region}. Locally focused, halal-first, and free to join.`,
    metaDescription: `Find a Muslim marriage partner in ${hub.city}. Browse verified profiles from ${hub.nearbyAreas}. Learn about the local Muslim community and start your halal marriage search. Free to join.`,
    keywords: `muslim matrimony ${hub.city.toLowerCase()}, muslim marriage ${hub.city.toLowerCase()}, rishta ${hub.city.toLowerCase()}, halal marriage ${hub.city.toLowerCase()}, muslim singles ${hub.city.toLowerCase()}, nikah ${hub.city.toLowerCase()}, muslim matchmaking ${hub.region.toLowerCase()}, muslim community ${hub.city.toLowerCase()}`,
    canonicalPath: "/" + hub.slug,
    ctaHeading: `Find Your Spouse in ${hub.city} — Free to Join`,
    ctaSubtext: `Join verified Muslim singles in ${hub.city} already on their path to Nikah. Create your profile today.`,
    relatedLinks: [
      { url: "/muslim-marriage", label: "About Muslim Marriage in Islam" },
      { url: "/muslim-matrimonial", label: "How the Platform Works" },
      { url: "/find-muslim-spouse", label: "Search & Filter Guide" },
      ...cityHubPages.filter(c => c.city !== hub.city).map(c => ({ url: "/" + c.slug, label: `Muslim Matrimony ${c.city}` })),
      { url: "/profiles", label: "Browse All Profiles" }
    ],
    pageFaqSchema: hub.localFaqs,
    pageFaqs: hub.localFaqs,
    bodyContent
  };

  app.get(page.path, (req, res) => {
    res.render("seo-page", page);
  });
});

// ============================================
// PROGRAMMATIC PAKISTAN CITY PAGES
// ============================================
const pakistanCityPages = [
  {
    city: "Islamabad",
    slug: "rishta-islamabad",
    province: "Federal Capital Territory",
    nearbyAreas: "G-6, G-7, F-10, I-8, Aabpara, Blue Area, and Rawalpindi",
    muslimPopulation: "over 2.2 million — Islamabad is Pakistan's capital and a predominantly Muslim cosmopolitan city",
    keyAreas: "G-6, G-7 Markaz, F-10, F-11, I-8, DHA Islamabad, and Bahria Town",
    communityContext: "Islamabad is Pakistan's purpose-built capital — a cosmopolitan city of government officials, diplomats, professionals, and an educated middle class. The rishta culture in Islamabad is distinctly different from Lahore or Karachi: profession, education, and social standing matter greatly, while biradari networks play a less dominant role than in other Pakistani cities. Many overseas Pakistanis (particularly from the UK, US, and Canada) seek Islamabad-based partners for their combination of modern values and Islamic principles.",
    demographicHighlight: "Islamabad's population is among the most educated and professionally qualified in Pakistan. The DHA (Defence Housing Authority) and Bahria Town sectors represent the city's aspirational middle and upper-middle class — the same demographic most active on online matrimonial platforms. Many residents are government employees, corporate professionals, military officers, and university graduates. The city's relative safety, cleanliness, and infrastructure make it one of Pakistan's most desirable places for families.",
    communityHighlights: [
      { name: "Blue Area — Islamabad's Commercial Heart", desc: "The main commercial district of Islamabad, home to corporate offices, upscale restaurants, and professional services. Many D'amour Muslim members work or live near this central zone." },
      { name: "F-7 Markaz & Jinnah Super Market", desc: "Islamabad's premium shopping and dining district — home to halal restaurants, coffee shops, and a meeting ground for educated professionals and families." },
      { name: "DHA & Bahria Town", desc: "Islamabad's most sought-after residential areas for middle and upper-middle class Muslim families. A high proportion of D'amour Muslim's Islamabad profiles are from these sectors." },
      { name: "Faisal Mosque & Islamic University", desc: "Two of Islamabad's most prominent Islamic landmarks — Faisal Mosque (one of the world's largest) and the International Islamic University, symbols of the city's Islamic character and educational focus." },
    ],
    localFaqs: [
      { q: "Are there rishta profiles from Islamabad's DHA, Bahria Town, or F-sectors on D'amour Muslim?", a: "Yes. Many of our Islamabad members are from the city's residential sectors including DHA, Bahria Town, F-6, F-7, F-10, F-11, and I-8. The platform attracts professionals and educated families from across the capital." },
      { q: "How is the rishta culture in Islamabad different from Lahore or Karachi?", a: "Islamabad's rishta culture tends to be more profession and education-focused than Lahore's biradari-driven or Karachi's cosmopolitan approach. Families in Islamabad often prioritise a partner's career, qualifications, and character — and are generally more open to matches outside their immediate biradari network." },
      { q: "Can overseas Pakistanis from the UK find rishta with Islamabad families on D'amour Muslim?", a: "Yes. Many families in Islamabad actively seek overseas Pakistani matches for their sons and daughters. D'amour Muslim is used by both UK-based Pakistanis and Islamabad families looking for this exact type of connection." },
      { q: "Is D'amour Muslim free to join for families in Islamabad?", a: "Yes. Registering, creating a profile, and browsing rishta profiles in Islamabad is completely free on D'amour Muslim. There is no cost to send an initial expression of interest." },
    ]
  },
  {
    city: "Rawalpindi",
    slug: "rishta-rawalpindi",
    province: "Punjab",
    nearbyAreas: "Raja Bazaar, Saddar, Satellite Town, Chaklala, Khayaban-e-Sir Syed, and Islamabad",
    muslimPopulation: "approximately 2.5 million — predominantly Punjabi and Kashmiri Muslim",
    keyAreas: "Raja Bazaar, Saddar, Satellite Town, Chaklala, Westridge, and Khayaban-e-Sir Syed",
    communityContext: "Rawalpindi — affectionately known as 'Pindi' — is the twin city of Islamabad and one of Pakistan's most historically rooted cities. With a strong Punjabi and Kashmiri Muslim majority, Rawalpindi has some of Pakistan's deepest biradari networks and family traditions. The city is home to Pakistan's General Headquarters (GHQ), meaning many military and civil service families reside here. The rishta culture in Rawalpindi is family-driven and honour-conscious, with families taking great care in choosing partners for their children.",
    demographicHighlight: "Rawalpindi's Muslim community is predominantly Punjabi, with significant Kashmiri, Potohari, and Hindko-speaking communities. The city is one of Pakistan's oldest continuously inhabited cities. Raja Bazaar is one of the most famous traditional markets in Punjab, a centre of Potohari culture and commerce. Many Rawalpindi families have relatives abroad — particularly in the UK, Norway, and Canada — making overseas Pakistani matrimonial connections very common.",
    communityHighlights: [
      { name: "Raja Bazaar", desc: "Rawalpindi's most famous and historic marketplace — a labyrinthine traditional bazaar with cloth merchants, spice sellers, gold jewellers, and food stalls. A cultural heart of Potohari Muslim culture." },
      { name: "Saddar Bazaar & Murree Road", desc: "Rawalpindi's main commercial spine — a long corridor of shops, restaurants, and services connecting the old city with Islamabad. Home to the famous Liaquat Bagh and commercial hubs." },
      { name: "Satellite Town & Khayaban-e-Sir Syed", desc: "Rawalpindi's more modern residential and commercial areas, popular with middle-class Muslim families and military personnel's families. Cleaner, more planned than the old city." },
      { name: "Lal Haveli Area", desc: "Historic quarter of Rawalpindi near the famous Lal Haveli landmark — a densely populated Muslim residential area with mosques, community gatherings, and traditional family networks." },
    ],
    localFaqs: [
      { q: "Can I find rishta profiles from Rawalpindi's Satellite Town, Saddar, or Raja Bazaar on D'amour Muslim?", a: "Yes. D'amour Muslim has active members from all areas of Rawalpindi including Satellite Town, Saddar, Westridge, and the old city. Many profiles include their specific area or sector." },
      { q: "Does D'amour Muslim connect Rawalpindi families with overseas Pakistanis in the UK?", a: "Yes. Rawalpindi families are among the most active on D'amour Muslim when it comes to seeking overseas Pakistani connections. Many Rawalpindi families have relatives in the UK, Norway, and other Western countries and are very open to overseas matches." },
      { q: "How does the rishta process work for military families in Rawalpindi?", a: "D'amour Muslim is used by all types of families, including those connected to the military. The platform allows families to register on behalf of their son or daughter, maintaining the formal, family-driven approach to rishta that military families in Rawalpindi tend to prefer." },
      { q: "Is D'amour Muslim free for families in Rawalpindi?", a: "Yes. Registering, creating a profile, and browsing rishta profiles is completely free on D'amour Muslim. No payment is required to browse or send an initial expression of interest." },
    ]
  },
  {
    city: "Faisalabad",
    slug: "rishta-faisalabad",
    province: "Punjab",
    nearbyAreas: "D Ground, Chenab Colony, People's Colony, Samanabad, Gulberg, and Sargodha",
    muslimPopulation: "approximately 4 million — Pakistan's third largest city, predominantly Punjabi Muslim",
    keyAreas: "D Ground, People's Colony, Samanabad, Gulberg, Chenab Colony, and Susan Road",
    communityContext: "Faisalabad is Pakistan's industrial capital and third largest city — sometimes called the 'Manchester of Pakistan' for its textile manufacturing heritage. The city's Muslim community is predominantly Punjabi, hardworking, and community-oriented. Strong biradari networks and family traditions govern much of the rishta process. The growing middle class of textile business owners, factory managers, and professionals is increasingly turning to online platforms to find suitable matches beyond their immediate circle.",
    demographicHighlight: "Faisalabad is home to Pakistan's largest textile industry — the city produces a significant portion of Pakistan's total export earnings. The iconic Ghanta Ghar (Clock Tower) at the centre of the city's famous eight-bazaar design is a symbol of Faisalabad's commercial identity. The 2023 census data confirms Faisalabad as Pakistan's third largest urban area. D Ground and People's Colony are the most prominent middle-class Muslim residential areas, home to many established families seeking serious rishta proposals.",
    communityHighlights: [
      { name: "Ghanta Ghar & The Eight Bazaars", desc: "Faisalabad's iconic clock tower at the intersection of eight traditional bazaars — a unique city-planning landmark and the commercial heart of the city, representing its Muslim trading heritage." },
      { name: "D Ground & Susan Road", desc: "Two of Faisalabad's most established middle-class residential and commercial areas, popular with textile business families and professionals who form the core of D'amour Muslim's Faisalabad membership." },
      { name: "People's Colony & Samanabad", desc: "Large, established residential neighbourhoods in Faisalabad with strong community networks, mosques, and halal businesses. Home to many families who use D'amour Muslim for rishta searching." },
      { name: "Jinnah Colony Mosque & Gumti No. 1", desc: "Two prominent community landmarks in Faisalabad serving as gathering points for the city's Muslim community — indicative of the city's strong Islamic community character." },
    ],
    localFaqs: [
      { q: "Are there rishta profiles from Faisalabad's D Ground, People's Colony, or Susan Road on D'amour Muslim?", a: "Yes. D'amour Muslim has members from all major areas of Faisalabad including D Ground, People's Colony, Samanabad, Gulberg, and Susan Road. Many members are from Faisalabad's established textile and business families." },
      { q: "Does D'amour Muslim help Faisalabad families find overseas Pakistani matches in the UK?", a: "Yes. Faisalabad families frequently use D'amour Muslim to connect with overseas Pakistanis in the UK, Europe, and North America. Our platform bridges Pakistani families at home with diaspora communities abroad." },
      { q: "How does the rishta culture in Faisalabad compare to Lahore or Islamabad?", a: "Faisalabad's rishta culture is strongly family and biradari-driven — perhaps more so than Islamabad but similar to Lahore. Families typically want to know the prospective match's biradari, occupation (often textile trade), and family reputation before proceeding." },
      { q: "Is D'amour Muslim free for families in Faisalabad?", a: "Yes. Creating a profile and browsing rishta proposals from Faisalabad is entirely free on D'amour Muslim. There is no cost to register or send an initial expression of interest." },
    ]
  },
];

pakistanCityPages.forEach(function(pkCity) {
  const communityList = pkCity.communityHighlights.map(h =>
    `<li class="flex items-start gap-3 mb-4">
      <span class="text-primary mt-1 text-lg">✓</span>
      <span class="text-gray-700"><strong>${h.name}:</strong> ${h.desc}</span>
    </li>`
  ).join('');

  const bodyContent = `
    <div class="prose max-w-none">
      <p class="text-lg text-gray-700 mb-6 leading-relaxed">Looking for a rishta in ${pkCity.city}? D'amour Muslim connects serious Muslim marriage seekers across ${pkCity.province} with verified profiles from ${pkCity.city} and ${pkCity.nearbyAreas}. A halal, family-friendly platform trusted by Muslims in Pakistan and the Pakistani diaspora worldwide.</p>

      <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Muslim Community in ${pkCity.city}</h2>
      <p class="text-gray-700 mb-4 leading-relaxed">${pkCity.city} is home to ${pkCity.muslimPopulation}. The Muslim community is concentrated in ${pkCity.keyAreas}.</p>
      <p class="text-gray-700 mb-6 leading-relaxed">${pkCity.demographicHighlight}</p>
      <p class="text-gray-700 mb-6 leading-relaxed">${pkCity.communityContext}</p>

      <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Why Families in ${pkCity.city} Choose D'amour Muslim</h2>
      <ul class="list-none space-y-3 mb-6">
        <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Profiles manually verified — no fake accounts or time-wasters</span></li>
        <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Halal platform — Nikah intention required, no casual connections</span></li>
        <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Free to join — no cost to browse rishta proposals in ${pkCity.city}</span></li>
        <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Family-friendly — parents and walis can register and manage profiles</span></li>
        <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Connects ${pkCity.city} families with overseas Pakistani diaspora in the UK and beyond</span></li>
        <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">GDPR compliant — your personal data is never sold or shared</span></li>
      </ul>

      <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Key Areas &amp; Landmarks in ${pkCity.city}</h2>
      <p class="text-gray-700 mb-4">For families in ${pkCity.city}, these areas and landmarks represent the city's Muslim community life:</p>
      <ul class="list-none mb-6">
        ${communityList}
      </ul>

      <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">How to Find a Rishta in ${pkCity.city}</h2>
      <div class="grid md:grid-cols-3 gap-4 mb-8">
        <div class="bg-gray-50 rounded-xl p-4 text-center border border-gray-100">
          <span class="text-primary font-bold text-2xl block mb-2">1</span>
          <p class="font-semibold text-gray-800 text-sm mb-1">Register Free</p>
          <p class="text-gray-600 text-xs">Create your profile or register on behalf of your son/daughter</p>
        </div>
        <div class="bg-gray-50 rounded-xl p-4 text-center border border-gray-100">
          <span class="text-primary font-bold text-2xl block mb-2">2</span>
          <p class="font-semibold text-gray-800 text-sm mb-1">Search ${pkCity.city}</p>
          <p class="text-gray-600 text-xs">Use the city filter to find verified rishta profiles from ${pkCity.city}</p>
        </div>
        <div class="bg-gray-50 rounded-xl p-4 text-center border border-gray-100">
          <span class="text-primary font-bold text-2xl block mb-2">3</span>
          <p class="font-semibold text-gray-800 text-sm mb-1">Connect &amp; Proceed</p>
          <p class="text-gray-600 text-xs">Send interest, get acceptance, then communicate through the platform</p>
        </div>
      </div>

      <div class="bg-primary/5 rounded-2xl p-6 border border-primary/10 mt-8">
        <p class="text-gray-700 font-medium">
          Explore all Pakistan rishta pages: <a href="/online-rishta-pakistan" class="text-primary hover:underline">Online Rishta Pakistan</a> &bull;
          <a href="/rishta-lahore" class="text-primary hover:underline">Rishta Lahore</a> &bull;
          <a href="/rishta-karachi" class="text-primary hover:underline">Rishta Karachi</a> &bull;
          ${pakistanCityPages.filter(c => c.city !== pkCity.city).map(c => `<a href="/${c.slug}" class="text-primary hover:underline">Rishta ${c.city}</a>`).join(' &bull; ')}.
        </p>
      </div>
    </div>
  `;

  const page = {
    path: "/" + pkCity.slug,
    pageTitle: `Rishta in ${pkCity.city} | Verified Muslim Marriage Proposals | D'amour Muslim`,
    h1: `Rishta in ${pkCity.city} — Find Verified Marriage Proposals`,
    heroSubtitle: `Connect with serious Muslim marriage seekers in ${pkCity.city}, ${pkCity.province}. Halal-first, family-friendly, and free to join.`,
    metaDescription: `Find a rishta in ${pkCity.city}. Browse verified Muslim marriage proposals from ${pkCity.nearbyAreas}. Family-friendly halal platform connecting ${pkCity.city} with overseas Pakistanis. Free to join.`,
    keywords: `rishta ${pkCity.city.toLowerCase()}, ${pkCity.city.toLowerCase()} rishta, ${pkCity.city.toLowerCase()} matrimonial, ${pkCity.city.toLowerCase()} muslim marriage, muslim marriage ${pkCity.city.toLowerCase()}, rishta proposals ${pkCity.city.toLowerCase()}, halal marriage ${pkCity.city.toLowerCase()}, nikah ${pkCity.city.toLowerCase()}`,
    canonicalPath: "/" + pkCity.slug,
    ctaHeading: `Find Your Rishta in ${pkCity.city} — Free to Join`,
    ctaSubtext: `Join Muslim families in ${pkCity.city} already using D'amour Muslim. Register free today.`,
    relatedLinks: [
      { url: "/online-rishta-pakistan", label: "Online Rishta Pakistan" },
      { url: "/muslim-rishta", label: "Muslim Rishta Platform" },
      { url: "/rishta-lahore", label: "Rishta Lahore" },
      { url: "/rishta-karachi", label: "Rishta Karachi" },
      ...pakistanCityPages.filter(c => c.city !== pkCity.city).map(c => ({ url: "/" + c.slug, label: `Rishta ${c.city}` })),
      { url: "/british-pakistani-marriage", label: "British Pakistani Marriage" },
      { url: "/profiles", label: "Browse All Profiles" }
    ],
    pageFaqSchema: pkCity.localFaqs,
    pageFaqs: pkCity.localFaqs,
    bodyContent
  };

  app.get(page.path, (req, res) => {
    res.render("seo-page", page);
  });
});

// ============================================
// END SEO LANDING PAGES
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
        title: "Profile Not Found - D'amour Muslim",
        url: req.originalUrl,
      });
    }

    // **NEW**: Hide unapproved profiles from regular users
    // Only admins and moderators can view unapproved profiles
    // Also allow the user to see their own profile
    const isOwnProfile = req.session.userId && foundProfile._id.toString() === req.session.userId.toString();
    if (!foundProfile.isApproved && !req.session.isAdmin && !req.session.isModerator && !isOwnProfile) {
      return res.status(404).render("404", {
        title: "Profile Not Found - D'amour Muslim",
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
        name: "D'amour Muslim Team",
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
    title: "Terms and Conditions - D'amour Muslim",
  });
});
app.get("/privacy", (req, res) => {
  res.render("privacy", {
    title: "Privacy Policy - D'amour Muslim",
  });
});

// **NEW**: Company, Policy & Information Pages
app.get("/company-details", (req, res) => {
  res.render("company-details", {
    title: "Company Details - D'amour Muslim",
  });
});

app.get("/refund-policy", (req, res) => {
  res.render("refund-policy", {
    title: "Refund Policy - D'amour Muslim",
  });
});

app.get("/account-faqs", (req, res) => {
  res.render("account-faqs", {
    title: "Account FAQs - D'amour Muslim",
  });
});

app.get("/pricing", (req, res) => {
  res.render("pricing", {
    title: "Pricing & Membership Plans - D'amour Muslim",
  });
});

app.get("/gdpr-faqs", (req, res) => {
  res.render("gdpr-faqs", {
    title: "GDPR FAQs - D'amour Muslim",
  });
});

app.get("/code-of-conduct", (req, res) => {
  res.render("code-of-conduct", {
    title: "Code of Conduct - D'amour Muslim",
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
        author: { name: "D'amour Muslim Team" },
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
        author: { name: "D'amour Muslim Team" },
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
        excerpt: "Discover transparent pricing for D'Amour Muslim's rishta service with four flexible plans: Standard (Free), Premium (£50), Premium Plus (£100+£200), and Executive (£150+£450). 100% money-back guarantee included.",
        author: { name: "D'amour Muslim Team" },
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
      title: "Blog - D'amour Muslim",
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
      title: "Blog - D'amour Muslim",
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
    const staticBlogTemplates = [
      "muslim-wedding-planner-guide",
      "uk-rishta-whatsapp-group",
      "uk-muslim-rishta-service-charges"
    ];

    if (staticBlogTemplates.includes(slug)) {
      // Render the specific static template
      return res.render(`blog/${slug}`, {
        user: req.session.user || null,
      });
    }

    // **EXISTING**: Check database for dynamic blogs
    const blog = await Blog.findOne({
      slug: slug,
      isPublished: true
    });

    if (!blog) {
      return res.status(404).render("404", {
        title: "Blog Post Not Found - D'amour Muslim",
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
        "name": blog.author.name || "D'amour Muslim Team"
      },
      "publisher": {
        "@type": "Organization",
        "name": "D'amour Muslim",
        "logo": {
          "@type": "ImageObject",
          "url": "https://damourmuslim.com/images/logo.png"
        }
      },
      "datePublished": blog.publishedAt?.toISOString(),
      "dateModified": blog.updatedAt.toISOString(),
      "mainEntityOfPage": {
        "@type": "WebPage",
        "@id": `https://damourmuslim.com/blog/${blog.slug}`
      }
    };

    res.render("blog/post", {
      title: blog.metaTitle || `${blog.title} - D'amour Muslim`,
      metaDescription: blog.metaDescription || blog.excerpt,
      canonicalUrl: blog.canonicalUrl || `https://damourmuslim.com/blog/${blog.slug}`,
      blog,
      relatedBlogs,
      structuredData,
      user: req.session.user || null,
    });
  } catch (error) {
    console.error("Individual blog error:", error);
    res.status(404).render("404", {
      title: "Blog Post Not Found - D'amour Muslim",
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
    <loc>https://damourmuslim.com/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://damourmuslim.com/profiles</loc>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://damourmuslim.com/blog</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://damourmuslim.com/islamic-faqs</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://damourmuslim.com/podcasts</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://damourmuslim.com/pricing</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://damourmuslim.com/our-team</loc>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://damourmuslim.com/our-ads</loc>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>https://damourmuslim.com/company-details</loc>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>https://damourmuslim.com/refund-policy</loc>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>https://damourmuslim.com/account-faqs</loc>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://damourmuslim.com/gdpr-faqs</loc>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>https://damourmuslim.com/code-of-conduct</loc>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>https://damourmuslim.com/terms</loc>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
  <url>
    <loc>https://damourmuslim.com/privacy</loc>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
  <url>
    <loc>https://damourmuslim.com/muslim-marriage</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://damourmuslim.com/muslim-matrimonial</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://damourmuslim.com/muslim-matchmaking</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://damourmuslim.com/halal-marriage</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://damourmuslim.com/muslim-rishta</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://damourmuslim.com/find-muslim-spouse</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://damourmuslim.com/best-muslim-marriage-website</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://damourmuslim.com/free-muslim-marriage-site</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://damourmuslim.com/trusted-muslim-matchmaking</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://damourmuslim.com/verified-muslim-profiles</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://damourmuslim.com/online-rishta-pakistan</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://damourmuslim.com/rishta-lahore</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://damourmuslim.com/rishta-karachi</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://damourmuslim.com/muslim-marriage-uk</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://damourmuslim.com/british-pakistani-marriage</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://damourmuslim.com/muslim-singles-uk</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://damourmuslim.com/muslim-second-marriage</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://damourmuslim.com/divorced-muslim-marriage</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://damourmuslim.com/muslim-marriage-over-30</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://damourmuslim.com/profiles?gender=male</loc>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://damourmuslim.com/profiles?gender=female</loc>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://damourmuslim.com/profiles/addedBy/staff</loc>
    <changefreq>daily</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://damourmuslim.com/muslim-matrimony-london</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://damourmuslim.com/muslim-matrimony-birmingham</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://damourmuslim.com/muslim-matrimony-manchester</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://damourmuslim.com/muslim-matrimony-bradford</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://damourmuslim.com/muslim-matrimony-leicester</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://damourmuslim.com/muslim-matrimony-leeds</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`;

    // Add new UK city hub pages (Sheffield, Coventry, Luton, Glasgow, Nottingham)
    cityHubPages.filter(h => !["London","Birmingham","Manchester","Bradford","Leicester","Leeds"].includes(h.city)).forEach((hub) => {
      sitemap += `
  <url>
    <loc>https://damourmuslim.com/${hub.slug}</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`;
    });

    // Add Pakistan city pages (Islamabad, Rawalpindi, Faisalabad)
    pakistanCityPages.forEach((pkCity) => {
      sitemap += `
  <url>
    <loc>https://damourmuslim.com/${pkCity.slug}</loc>
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
    <loc>https://damourmuslim.com/blog/${blog.slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`;
    });

    // **NEW**: Add static blog posts
    staticBlogs.forEach((blog) => {
      sitemap += `
  <url>
    <loc>https://damourmuslim.com/blog/${blog.slug}</loc>
    <lastmod>${blog.lastmod}</lastmod>
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
    <loc>https://damourmuslim.com/profiles/${user.profileSlug}</loc>
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
    <loc>https://damourmuslim.com/${cp.categorySlug}/${cp.pageSlug}</loc>
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
    <loc>https://damourmuslim.com/islamic-faqs</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;

    faqs.forEach((faq) => {
      const lastmod = (faq.updatedAt || faq.createdAt)
        ? new Date(faq.updatedAt || faq.createdAt).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0];
      xml += `
  <url>
    <loc>https://damourmuslim.com/islamic-faqs/${faq.slug}</loc>
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
    <loc>https://damourmuslim.com/podcasts</loc>
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

Sitemap: https://damourmuslim.com/sitemap.xml
Sitemap: https://damourmuslim.com/video-sitemap.xml
Sitemap: https://damourmuslim.com/qa-sitemap.xml`;

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
    title: "Page Not Found - D'amour Muslim",
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
