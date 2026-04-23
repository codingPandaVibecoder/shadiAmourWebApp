require("dotenv").config(); // MUST be first!
const { muslimMaleNames, muslimFemaleNames } = require("./config/seoData");
const Blog = require("./models/Blog");
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

const {
  generateVerificationCode,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendProfileApprovalEmail,
} = require("./services/emailService");
const requireProfileComplete = require("./middlewares/requireProfileComplete");
const requireOnboardingComplete = require("./middlewares/requireOnboardingComplete");

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

// **NEW**: Global SEO Settings Middleware - Make available to all views
app.use(async (req, res, next) => {
  try {
    res.locals.globalSeoSettings = await GlobalSeoSettings.getSettings();
  } catch (error) {
    console.error("Error loading global SEO settings:", error);
    res.locals.globalSeoSettings = null;
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
    pageTitle: "Professional Muslim Matchmaking Services | D'amour Muslim",
    h1: "Professional Muslim Matchmaking Services",
    heroSubtitle: "We connect compatible Muslim singles through a halal and structured matchmaking process — values first, always.",
    metaDescription: "Professional Muslim matchmaking services connecting compatible Muslim singles through a halal and structured process. UK-focused, free to join.",
    keywords: "muslim matchmaking, halal matchmaking, muslim matchmaking UK, islamic matchmaking service",
    canonicalPath: "/muslim-matchmaking",
    ctaHeading: "Start Your Matchmaking Journey",
    ctaSubtext: "Let us help you find your perfect halal match today.",
    relatedLinks: [
      { url: "/muslim-marriage", label: "Muslim Marriage" },
      { url: "/trusted-muslim-matchmaking", label: "Trusted Matchmaking" },
      { url: "/blog/how-to-find-a-muslim-spouse-in-the-uk-simple-real-guide", label: "How to Find a Spouse" }
    ],
    bodyContent: `
      <div class="prose max-w-none">
        <p class="text-lg text-gray-700 mb-6 leading-relaxed">We connect compatible Muslim singles through a halal and structured matchmaking process.</p>
        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">How Our Matchmaking Works</h2>
        <div class="grid md:grid-cols-2 gap-6 mb-8">
          <div class="bg-gray-50 rounded-xl p-5"><h3 class="font-semibold text-gray-800 mb-2">Create a Profile</h3><p class="text-gray-600 text-sm">Share your values, background, and what you're looking for in a spouse.</p></div>
          <div class="bg-gray-50 rounded-xl p-5"><h3 class="font-semibold text-gray-800 mb-2">Browse Matches</h3><p class="text-gray-600 text-sm">Use smart filters to find compatible Muslims based on your preferences.</p></div>
          <div class="bg-gray-50 rounded-xl p-5"><h3 class="font-semibold text-gray-800 mb-2">Connect Respectfully</h3><p class="text-gray-600 text-sm">Send and receive connection requests on your terms.</p></div>
          <div class="bg-gray-50 rounded-xl p-5"><h3 class="font-semibold text-gray-800 mb-2">Proceed to Nikah</h3><p class="text-gray-600 text-sm">With family involvement and clear intentions, move towards marriage.</p></div>
        </div>
        <div class="bg-primary/5 rounded-2xl p-6 border border-primary/10 mt-8">
          <p class="text-gray-700 font-medium">Also see: <a href="/best-muslim-marriage-website" class="text-primary hover:underline">Best Muslim Marriage Website</a> and <a href="/halal-marriage" class="text-primary hover:underline">Halal Marriage Platform</a>.</p>
        </div>
      </div>
    `
  },
  {
    path: "/halal-marriage",
    pageTitle: "Halal Marriage Platform for Practicing Muslims | D'amour Muslim",
    h1: "Halal Marriage Platform for Practicing Muslims",
    heroSubtitle: "No dating, no time waste — only serious halal marriage connections built on Islamic values.",
    metaDescription: "Halal marriage platform for practicing Muslims. No casual dating — only serious, Shariah-compliant connections leading to Nikah. Join free today.",
    keywords: "halal marriage, halal marriage platform, halal matchmaking, nikah, islamic marriage",
    canonicalPath: "/halal-marriage",
    ctaHeading: "Start Your Halal Marriage Journey",
    ctaSubtext: "Join now and find your partner the halal way.",
    relatedLinks: [
      { url: "/muslim-marriage", label: "Muslim Marriage" },
      { url: "/muslim-matchmaking", label: "Muslim Matchmaking" },
      { url: "/blog/benefits-of-halal-matchmaking-services-uk-muslim-marriage-rishta-guide", label: "Benefits of Halal Matchmaking" }
    ],
    bodyContent: `
      <div class="prose max-w-none">
        <p class="text-lg text-gray-700 mb-6 leading-relaxed">Marriage in Islam is a sacred commitment built on faith, trust, and mutual respect. In a world where modern dating often contradicts Islamic values, finding a halal way to meet a life partner can be challenging. Our halal marriage platform is designed to provide a safe, respectful, and Shariah-compliant environment where Muslims can connect for the purpose of Nikah.</p>
        <p class="text-gray-700 mb-6 leading-relaxed">Unlike conventional dating apps, we strictly focus on halal interactions. This means no casual chatting, no time-wasting, and no inappropriate behavior. Every interaction on our platform is guided by the intention of marriage, making it ideal for practicing Muslims who want to protect their deen while searching for a spouse.</p>
        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">What Makes a Marriage "Halal"?</h2>
        <p class="text-gray-700 mb-4">A halal marriage process ensures:</p>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Intentions are clear and sincere</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Communication is respectful and modest</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Family involvement is encouraged</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Boundaries are maintained</span></li>
        </ul>
        <p class="text-gray-700 mb-4">Our platform supports all these principles, making it easier to find a partner without compromising Islamic teachings.</p>
        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Why Choose a Halal Marriage Platform?</h2>
        <p class="text-gray-700 mb-4">Many Muslims struggle with:</p>
        <ul class="list-none space-y-3 mb-4">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Finding like-minded partners</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Avoiding haram interactions</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Balancing modern life with Islamic values</span></li>
        </ul>
        <p class="text-gray-700 mb-6">Our platform solves these challenges by offering a structured and ethical matchmaking system.</p>
        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">How It Works</h2>
        <div class="grid md:grid-cols-5 gap-3 mb-8">
          <div class="bg-gray-50 rounded-xl p-4 text-center"><span class="text-primary font-bold text-lg">1</span><p class="text-gray-700 text-sm mt-1">Create a profile with honest details</p></div>
          <div class="bg-gray-50 rounded-xl p-4 text-center"><span class="text-primary font-bold text-lg">2</span><p class="text-gray-700 text-sm mt-1">Search for compatible matches</p></div>
          <div class="bg-gray-50 rounded-xl p-4 text-center"><span class="text-primary font-bold text-lg">3</span><p class="text-gray-700 text-sm mt-1">Connect respectfully</p></div>
          <div class="bg-gray-50 rounded-xl p-4 text-center"><span class="text-primary font-bold text-lg">4</span><p class="text-gray-700 text-sm mt-1">Involve families if needed</p></div>
          <div class="bg-gray-50 rounded-xl p-4 text-center"><span class="text-primary font-bold text-lg">5</span><p class="text-gray-700 text-sm mt-1">Proceed towards Nikah</p></div>
        </div>
        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Privacy &amp; Respect</h2>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Secure communication</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Profile moderation</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">No fake users</span></li>
        </ul>
        <div class="bg-primary/5 rounded-2xl p-6 border border-primary/10 mt-8">
          <p class="text-gray-700 font-medium">This is not a dating platform — it is a marriage-focused community for Muslims who are ready to settle down. Also see: <a href="/muslim-rishta" class="text-primary hover:underline">Muslim Rishta Platform</a> and <a href="/verified-muslim-profiles" class="text-primary hover:underline">Verified Muslim Profiles</a>.</p>
        </div>
      </div>
    `
  },
  {
    path: "/muslim-rishta",
    pageTitle: "Muslim Rishta Platform – Find Serious Marriage Proposals | D'amour Muslim",
    h1: "Muslim Rishta Platform – Find Serious Marriage Proposals",
    heroSubtitle: "Find rishta for marriage in Pakistan and overseas with verified profiles. Family-friendly, halal, and modern.",
    metaDescription: "Muslim rishta platform connecting serious marriage proposals in the UK, Pakistan, and worldwide. Verified profiles and family-friendly approach. Join free.",
    keywords: "muslim rishta, rishta online, rishta pakistan, muslim rishta uk, rishta website",
    canonicalPath: "/muslim-rishta",
    ctaHeading: "Find Your Rishta Today",
    ctaSubtext: "Create your profile and start your search today.",
    relatedLinks: [
      { url: "/muslim-rishta-pakistan", label: "Muslim Rishta Pakistan" },
      { url: "/halal-marriage", label: "Halal Marriage" },
      { url: "/blog/uk-rishta-whatsapp-group", label: "UK Rishta Guides" }
    ],
    bodyContent: `
      <div class="prose max-w-none">
        <p class="text-lg text-gray-700 mb-6 leading-relaxed">Finding a suitable rishta has always been an important part of Muslim culture, especially in South Asian communities. However, traditional methods can be limited and slow. Our online Muslim rishta platform modernises this process while preserving its cultural and religious values.</p>
        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">What is a Rishta?</h2>
        <p class="text-gray-700 mb-4">A "rishta" refers to a marriage proposal where compatibility between individuals and families is considered. It involves:</p>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Background checks</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Family involvement</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Long-term commitment</span></li>
        </ul>
        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Why Use an Online Rishta Platform?</h2>
        <p class="text-gray-700 mb-4">Traditional rishta methods often rely on relatives and community networks. Our platform expands your reach, allowing you to:</p>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Access thousands of profiles</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Filter based on preferences</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Connect quickly and securely</span></li>
        </ul>
        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Family-Friendly Approach</h2>
        <p class="text-gray-700 mb-4">We support family-managed accounts, transparent communication, and respectful interactions.</p>
        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Who Should Join?</h2>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Singles looking for marriage</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Families searching for proposals</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Overseas Muslims</span></li>
        </ul>
        <div class="bg-primary/5 rounded-2xl p-6 border border-primary/10 mt-8">
          <p class="text-gray-700 font-medium">Safety first — we ensure verified profiles and a secure platform for all users. Also explore <a href="/find-muslim-spouse" class="text-primary hover:underline">Find Muslim Spouse</a> and <a href="/muslim-marriage-uk" class="text-primary hover:underline">Muslim Marriage UK</a>.</p>
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
    pageTitle: "Best Muslim Marriage Website for Serious Relationships | D'amour Muslim",
    h1: "Best Muslim Marriage Website for Serious Relationships",
    heroSubtitle: "Why we are the most trusted platform for halal matchmaking — built for serious Muslims in the UK.",
    metaDescription: "The best Muslim marriage website for serious relationships. Verified profiles, halal environment, and global reach. Join free today.",
    keywords: "best muslim marriage website, best muslim marriage site, top muslim marriage platform, best halal marriage site",
    canonicalPath: "/best-muslim-marriage-website",
    ctaHeading: "Join the Best Platform",
    ctaSubtext: "Create your free profile now and start finding compatible matches.",
    relatedLinks: [
      { url: "/muslim-marriage", label: "Muslim Marriage" },
      { url: "/free-muslim-marriage-site", label: "Free Muslim Marriage Site" },
      { url: "/blog/benefits-of-halal-matchmaking-services-uk-muslim-marriage-rishta-guide", label: "Matchmaking Benefits Guide" }
    ],
    bodyContent: `
      <div class="prose max-w-none">
        <p class="text-lg text-gray-700 mb-6 leading-relaxed">Choosing the right platform is crucial when searching for a life partner. Our platform stands out as one of the best Muslim marriage websites due to its focus on halal matchmaking, user safety, and serious intentions.</p>
        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">What Makes Us the Best?</h2>
        <div class="grid md:grid-cols-2 gap-6 mb-8">
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100"><h3 class="font-semibold text-gray-800 mb-2">✓ Verified Profiles</h3><p class="text-gray-600 text-sm">Every profile is reviewed before approval — no fake accounts.</p></div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100"><h3 class="font-semibold text-gray-800 mb-2">✓ Halal Environment</h3><p class="text-gray-600 text-sm">Marriage-focused, no dating or casual interactions.</p></div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100"><h3 class="font-semibold text-gray-800 mb-2">✓ UK Focused</h3><p class="text-gray-600 text-sm">Built for British Muslims with global reach for overseas matches.</p></div>
          <div class="bg-gray-50 rounded-xl p-5 border border-gray-100"><h3 class="font-semibold text-gray-800 mb-2">✓ Easy to Use</h3><p class="text-gray-600 text-sm">Clean, modern design that works on mobile and desktop.</p></div>
        </div>
        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Designed for Modern Muslims</h2>
        <p class="text-gray-700 mb-6">We combine tradition with technology to offer the best experience. Trust &amp; Security — we prioritise your privacy and safety. Our goal is to help you find a life partner quickly and effectively.</p>
        <div class="bg-primary/5 rounded-2xl p-6 border border-primary/10 mt-8">
          <p class="text-gray-700 font-medium">Also explore: <a href="/trusted-muslim-matchmaking" class="text-primary hover:underline">Trusted Muslim Matchmaking</a> and <a href="/muslim-matchmaking-uk" class="text-primary hover:underline">Muslim Matchmaking UK</a>.</p>
        </div>
      </div>
    `
  },
  {
    path: "/free-muslim-marriage-site",
    pageTitle: "Free Muslim Marriage Site – Join Without Cost | D'amour Muslim",
    h1: "Free Muslim Marriage Site – Join Without Cost",
    heroSubtitle: "Finding a life partner should not be limited by financial barriers. Join free and start browsing profiles instantly.",
    metaDescription: "Free Muslim marriage site — join without any cost. Create your profile, browse verified profiles, and start connecting with serious Muslims today.",
    keywords: "free muslim marriage site, free muslim marriage, free halal marriage, free islamic marriage site",
    canonicalPath: "/free-muslim-marriage-site",
    ctaHeading: "Join for Free Today",
    ctaSubtext: "Sign up now and start finding your match — no payment required.",
    relatedLinks: [
      { url: "/muslim-marriage", label: "Muslim Marriage" },
      { url: "/best-muslim-marriage-website", label: "Best Muslim Marriage Website" },
      { url: "/blog/uk-rishta-whatsapp-group", label: "UK Rishta Groups Guide" }
    ],
    bodyContent: `
      <div class="prose max-w-none">
        <p class="text-lg text-gray-700 mb-6 leading-relaxed">Finding a life partner should not be limited by financial barriers. Our free Muslim marriage site allows you to start your journey without any cost.</p>
        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Why Free Matters</h2>
        <p class="text-gray-700 mb-4">Many platforms charge high fees, which can discourage users. We provide:</p>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Free registration</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Free profile creation</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Free browsing</span></li>
        </ul>
        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">What You Get for Free</h2>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Access to profiles</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Basic matching features</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Secure messaging options</span></li>
        </ul>
        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Safe &amp; Reliable</h2>
        <p class="text-gray-700 mb-6">Even though it's free, we maintain high standards of safety and authenticity. We ensure that users are genuinely interested in marriage.</p>
        <div class="bg-primary/5 rounded-2xl p-6 border border-primary/10 mt-8">
          <p class="text-gray-700 font-medium">Also explore: <a href="/verified-muslim-profiles" class="text-primary hover:underline">Verified Muslim Profiles</a> and <a href="/muslim-matrimonial" class="text-primary hover:underline">Muslim Matrimonial Platform</a>.</p>
        </div>
      </div>
    `
  },
  {
    path: "/trusted-muslim-matchmaking",
    pageTitle: "Trusted Muslim Matchmaking Service for Serious Marriage | D'amour Muslim",
    h1: "Trusted Muslim Matchmaking Service for Serious Marriage",
    heroSubtitle: "We prioritise safety, authenticity, and serious users. The platform built on trust and Islamic principles.",
    metaDescription: "Trusted Muslim matchmaking service for serious marriage. Profile verification, manual moderation, secure communication. UK-focused, free to join.",
    keywords: "trusted muslim matchmaking, reliable muslim matchmaking, safe muslim marriage platform, verified muslim matchmaking",
    canonicalPath: "/trusted-muslim-matchmaking",
    ctaHeading: "Start with Confidence",
    ctaSubtext: "Join our trusted Muslim matchmaking platform today.",
    relatedLinks: [
      { url: "/verified-muslim-profiles", label: "Verified Profiles" },
      { url: "/muslim-matchmaking", label: "Muslim Matchmaking" },
      { url: "/blog/how-to-find-a-muslim-spouse-in-the-uk-simple-real-guide", label: "Finding a Spouse Guide" }
    ],
    bodyContent: `
      <div class="prose max-w-none">
        <p class="text-lg text-gray-700 mb-6 leading-relaxed">Finding a life partner is one of the most important decisions you will ever make. For Muslims, this decision is not just about compatibility — it's about faith, values, family, and long-term commitment. That's why choosing a trusted Muslim matchmaking service is essential.</p>
        <p class="text-gray-700 mb-6 leading-relaxed">Our platform is built on trust, transparency, and Islamic principles. We aim to provide a safe and reliable space where Muslims can connect with the intention of marriage, not casual relationships.</p>
        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Why Trust Matters in Matchmaking</h2>
        <p class="text-gray-700 mb-4">In the online world, trust is often the biggest concern. Many users worry about fake profiles, time-wasters, and misleading information. We address these concerns by implementing strict verification processes and maintaining a high standard of user authenticity.</p>
        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Our Trust &amp; Safety Features</h2>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Profile verification system</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Manual moderation</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Reporting &amp; blocking features</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Secure communication channels</span></li>
        </ul>
        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Halal &amp; Ethical Approach</h2>
        <p class="text-gray-700 mb-4">Unlike mainstream dating apps, we follow a halal approach: no casual dating, respectful communication only, and focus on marriage. This makes our platform ideal for practicing Muslims.</p>
        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Global Matchmaking Network</h2>
        <p class="text-gray-700 mb-4">We connect users from Pakistan, United Kingdom, USA &amp; Canada, and the Middle East — giving you access to a wide pool of serious candidates.</p>
        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Who Should Use This Service?</h2>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Individuals ready for marriage</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Families looking for proposals</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Professionals seeking compatible partners</span></li>
        </ul>
        <div class="bg-primary/5 rounded-2xl p-6 border border-primary/10 mt-8">
          <p class="text-gray-700 font-medium">Real connections, real results. Also see: <a href="/best-muslim-marriage-website" class="text-primary hover:underline">Best Muslim Marriage Website</a> and <a href="/muslim-marriage-uk" class="text-primary hover:underline">Muslim Marriage UK</a>.</p>
        </div>
      </div>
    `
  },
  {
    path: "/verified-muslim-profiles",
    pageTitle: "Verified Muslim Marriage Profiles – Safe & Authentic | D'amour Muslim",
    h1: "Verified Muslim Marriage Profiles – Safe & Authentic Matches",
    heroSubtitle: "Every profile is reviewed to ensure authenticity and trust. Real people with real intentions.",
    metaDescription: "Verified Muslim marriage profiles — every profile is reviewed for authenticity. Safe, real, and serious matches for halal matrimony. Free to join.",
    keywords: "verified muslim profiles, authentic muslim profiles, real muslim marriage profiles, safe muslim matchmaking",
    canonicalPath: "/verified-muslim-profiles",
    ctaHeading: "Join a Safe Platform",
    ctaSubtext: "Browse verified profiles and find your match today.",
    relatedLinks: [
      { url: "/trusted-muslim-matchmaking", label: "Trusted Matchmaking" },
      { url: "/muslim-matrimonial", label: "Muslim Matrimonial" },
      { url: "/blog/benefits-of-halal-matchmaking-services-uk-muslim-marriage-rishta-guide", label: "Benefits of Halal Matchmaking" }
    ],
    bodyContent: `
      <div class="prose max-w-none">
        <p class="text-lg text-gray-700 mb-6 leading-relaxed">One of the biggest challenges in online matchmaking is authenticity. Many users hesitate to join platforms due to concerns about fake profiles and scams. Our platform solves this problem by offering verified Muslim profiles, ensuring that every connection you make is genuine and trustworthy.</p>
        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">What Are Verified Profiles?</h2>
        <p class="text-gray-700 mb-4">Verified profiles go through a screening process that may include:</p>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Identity checks</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Profile review</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Activity monitoring</span></li>
        </ul>
        <p class="text-gray-700 mb-6">This helps maintain a high-quality user base.</p>
        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Why Verification Matters</h2>
        <p class="text-gray-700 mb-4">Verification ensures real people only, serious intentions, and safer communication.</p>
        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Our Verification Process</h2>
        <p class="text-gray-700 mb-6">We combine automated checks with manual moderation — ensuring accuracy and reliability.</p>
        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Benefits of Verified Profiles</h2>
        <div class="grid md:grid-cols-3 gap-4 mb-8">
          <div class="bg-gray-50 rounded-xl p-4 text-center"><span class="text-primary font-semibold block mb-1">Higher Trust</span><p class="text-gray-600 text-sm">Confidence in who you are connecting with</p></div>
          <div class="bg-gray-50 rounded-xl p-4 text-center"><span class="text-primary font-semibold block mb-1">Better Matches</span><p class="text-gray-600 text-sm">Quality filters out time-wasters</p></div>
          <div class="bg-gray-50 rounded-xl p-4 text-center"><span class="text-primary font-semibold block mb-1">Faster Decisions</span><p class="text-gray-600 text-sm">Real information speeds up the process</p></div>
        </div>
        <div class="bg-primary/5 rounded-2xl p-6 border border-primary/10 mt-8">
          <p class="text-gray-700 font-medium">We filter out users who are not serious about marriage, saving your time and effort. Also see: <a href="/find-muslim-spouse" class="text-primary hover:underline">Find Muslim Spouse</a> and <a href="/trusted-muslim-matchmaking" class="text-primary hover:underline">Trusted Matchmaking</a>.</p>
        </div>
      </div>
    `
  },
  {
    path: "/online-rishta-pakistan",
    pageTitle: "Online Rishta Pakistan – Modern Matchmaking for Marriage | D'amour Muslim",
    h1: "Online Rishta Pakistan – Modern Matchmaking for Marriage",
    heroSubtitle: "Modern rishta system with traditional values. Serving all major cities across Pakistan.",
    metaDescription: "Online rishta Pakistan — modern matchmaking combining traditional values with digital reach. Covering Lahore, Karachi, Islamabad and all major cities.",
    keywords: "online rishta pakistan, rishta pakistan, rishta online pakistan, pakistani marriage proposals online",
    canonicalPath: "/online-rishta-pakistan",
    ctaHeading: "Start Your Rishta Search",
    ctaSubtext: "Join now and find your ideal match in Pakistan.",
    relatedLinks: [
      { url: "/rishta-lahore", label: "Rishta Lahore" },
      { url: "/rishta-karachi", label: "Rishta Karachi" },
      { url: "/blog/uk-rishta-whatsapp-group", label: "UK Rishta Guide" }
    ],
    bodyContent: `
      <div class="prose max-w-none">
        <p class="text-lg text-gray-700 mb-6 leading-relaxed">The traditional rishta process in Pakistan has evolved significantly with the rise of digital platforms. Today, online rishta services provide a faster, more efficient, and broader way to find suitable marriage proposals. Our platform combines traditional values with modern technology to offer the best online rishta experience in Pakistan.</p>
        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Why Online Rishta is Growing in Pakistan</h2>
        <p class="text-gray-700 mb-4">People are moving towards online platforms because of wider reach, faster process, and more options.</p>
        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Nationwide Coverage</h2>
        <p class="text-gray-700 mb-4">We serve all major cities:</p>
        <div class="flex flex-wrap gap-2 mb-6">
          <span class="px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-medium">Lahore</span>
          <span class="px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-medium">Karachi</span>
          <span class="px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-medium">Islamabad</span>
          <span class="px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-medium">Faisalabad</span>
          <span class="px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-medium">Multan</span>
        </div>
        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Family Involvement</h2>
        <p class="text-gray-700 mb-6">We respect cultural values by allowing family-managed profiles and transparent communication.</p>
        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Advanced Search Filters</h2>
        <p class="text-gray-700 mb-4">Find matches based on education, profession, location, and religious values.</p>
        <div class="bg-primary/5 rounded-2xl p-6 border border-primary/10 mt-8">
          <p class="text-gray-700 font-medium">Safe &amp; Secure — we ensure privacy and authenticity for all users. Also see: <a href="/muslim-rishta", class="text-primary hover:underline">Muslim Rishta Platform</a> and <a href="/rishta-lahore" class="text-primary hover:underline">Rishta in Lahore</a>.</p>
        </div>
      </div>
    `
  },
  {
    path: "/rishta-lahore",
    pageTitle: "Rishta in Lahore – Find the Perfect Match | D'amour Muslim",
    h1: "Rishta in Lahore – Find the Perfect Match",
    heroSubtitle: "Connect with compatible matches in Lahore. Verified profiles, smart matching, and serious marriage intent.",
    metaDescription: "Find rishta in Lahore with verified profiles. Smart matching for Lahore Muslims seeking serious marriage proposals. Join free today.",
    keywords: "rishta lahore, lahore rishta, lahore marriage proposals, rishta in lahore pakistan",
    canonicalPath: "/rishta-lahore",
    ctaHeading: "Find Your Match in Lahore",
    ctaSubtext: "Register today and start your search.",
    relatedLinks: [
      { url: "/online-rishta-pakistan", label: "Online Rishta Pakistan" },
      { url: "/rishta-karachi", label: "Rishta Karachi" },
      { url: "/blog/uk-rishta-whatsapp-group", label: "Rishta Groups Guide" }
    ],
    bodyContent: `
      <div class="prose max-w-none">
        <p class="text-lg text-gray-700 mb-6 leading-relaxed">Lahore is one of the largest and most vibrant cities in Pakistan, with a diverse and educated population. Finding the right rishta in Lahore can be challenging due to busy lifestyles and limited social circles. Our platform makes it easier to connect with compatible matches in Lahore.</p>
        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Why Choose Online Rishta in Lahore?</h2>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Save time</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Access more profiles</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Better compatibility matching</span></li>
        </ul>
        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Who Can Join?</h2>
        <p class="text-gray-700 mb-6">Professionals, students, and families are all welcome. We match users based on compatibility, values, and preferences.</p>
        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Safe Environment</h2>
        <p class="text-gray-700 mb-6">Your privacy is protected at all times. We focus on serious marriage only — meaningful relationships, not casual connections.</p>
        <div class="bg-primary/5 rounded-2xl p-6 border border-primary/10 mt-8">
          <p class="text-gray-700 font-medium">Also explore: <a href="/online-rishta-pakistan" class="text-primary hover:underline">Online Rishta Pakistan</a> and <a href="/muslim-rishta" class="text-primary hover:underline">Muslim Rishta Platform</a>.</p>
        </div>
      </div>
    `
  },
  {
    path: "/rishta-karachi",
    pageTitle: "Rishta in Karachi – Trusted Marriage Platform | D'amour Muslim",
    h1: "Rishta in Karachi – Trusted Marriage Platform",
    heroSubtitle: "Find compatible matches in Karachi safely and efficiently. Verified profiles and family-friendly matchmaking.",
    metaDescription: "Find rishta in Karachi with verified profiles. Trusted marriage platform for Karachi Muslims. Large user base and safe communication. Join free.",
    keywords: "rishta karachi, karachi rishta, karachi marriage proposals, rishta in karachi pakistan",
    canonicalPath: "/rishta-karachi",
    ctaHeading: "Start Your Journey",
    ctaSubtext: "Create your profile and find your match in Karachi.",
    relatedLinks: [
      { url: "/online-rishta-pakistan", label: "Online Rishta Pakistan" },
      { url: "/rishta-lahore", label: "Rishta Lahore" },
      { url: "/blog/uk-rishta-whatsapp-group", label: "Rishta Groups Guide" }
    ],
    bodyContent: `
      <div class="prose max-w-none">
        <p class="text-lg text-gray-700 mb-6 leading-relaxed">Karachi, being Pakistan's largest city, offers a wide range of opportunities and lifestyles. However, finding the right life partner in such a fast-paced environment can be difficult. Our rishta platform helps you connect with compatible matches in Karachi in a safe and efficient way.</p>
        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Why Karachi Users Choose Us</h2>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Large user base</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Verified profiles</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">✓</span><span class="text-gray-700">Easy communication</span></li>
        </ul>
        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Find Compatible Matches</h2>
        <p class="text-gray-700 mb-4">Search based on education, career, and religious values.</p>
        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Family-Friendly Platform</h2>
        <p class="text-gray-700 mb-6">We support family involvement in the matchmaking process. Secure &amp; Private — your data and conversations are protected. We focus on long-term compatibility and build meaningful connections.</p>
        <div class="bg-primary/5 rounded-2xl p-6 border border-primary/10 mt-8">
          <p class="text-gray-700 font-medium">Also explore: <a href="/rishta-lahore" class="text-primary hover:underline">Rishta in Lahore</a> and <a href="/online-rishta-pakistan" class="text-primary hover:underline">Online Rishta Pakistan</a>.</p>
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

    // No server-side phone validation - handled on client side
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
    const bySelf = await User.countDocuments({ registrationSource: "register" });
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
      query.registrationSource = "register";
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
        name: "D'amour Muslim Team",
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
    } = req.body;

    const blog = await Blog.findById(req.params.id);
    if (!blog) {
      return res.json({ success: false, error: "Blog not found" });
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
// Add this route after your existing routes (around line 4500)

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
    <loc>https://damourmuslim.com/pricing</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
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

Sitemap: https://damourmuslim.com/sitemap.xml`;

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
      "faqQuestion[]": faqQuestions,
      "faqAnswer[]": faqAnswers
    } = req.body;
    
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
