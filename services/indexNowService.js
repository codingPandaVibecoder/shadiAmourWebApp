/**
 * IndexNow Service — Submits URLs to Bing/Yandex for instant indexing
 * API docs: https://www.indexnow.org/documentation
 */

const https = require("https");

// =========== CONFIGURATION ===========
const INDEXNOW_ENDPOINT = "api.indexnow.org";
const API_KEY = "e32877601cd8479c8d31b02259302796";
const KEY_LOCATION = "https://damourmuslim.com/e32877601cd8479c8d31b02259302796.txt";
const SITE_HOST = "damourmuslim.com";
const BASE_URL = "https://damourmuslim.com";
const BATCH_SIZE = 100;

// =========== IN-MEMORY DEDUP (avoids spamming same URL in short window) ===========
const recentlySubmitted = new Set();
const DEDUP_TTL_MS = 60_000; // 1 minute

function _isDuplicate(url) {
  if (recentlySubmitted.has(url)) return true;
  recentlySubmitted.add(url);
  // Auto-clear after TTL
  setTimeout(() => recentlySubmitted.delete(url), DEDUP_TTL_MS);
  return false;
}

// =========== CORE: POST to IndexNow ===========
function _postIndexNow(batch) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      host: SITE_HOST,
      key: API_KEY,
      keyLocation: KEY_LOCATION,
      urlList: batch,
    });

    const options = {
      hostname: INDEXNOW_ENDPOINT,
      path: "/IndexNow",
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": Buffer.byteLength(payload),
      },
      timeout: 15000,
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode === 200 || res.statusCode === 202) {
          console.log(`[IndexNow] ✅ Batch submitted (${batch.length} URLs) — HTTP ${res.statusCode}`);
          resolve(true);
        } else {
          console.warn(`[IndexNow] ⚠️ HTTP ${res.statusCode}: ${data}`);
          resolve(false);
        }
      });
    });

    req.on("error", (err) => {
      console.error(`[IndexNow] ❌ Request failed: ${err.message}`);
      reject(err);
    });

    req.on("timeout", () => {
      req.destroy();
      console.error("[IndexNow] ❌ Request timed out");
      reject(new Error("Request timed out"));
    });

    req.write(payload);
    req.end();
  });
}

// =========== PUBLIC API ===========

/**
 * Submit a batch of URLs to IndexNow. URLs must be absolute (https://...).
 * Automatically splits large arrays into batches of BATCH_SIZE.
 * Fire-and-forget — returns immediately, logs results.
 */
function submitUrls(urlList) {
  if (!urlList || urlList.length === 0) return;

  // Filter duplicates and ensure absolute URLs
  const clean = [];
  for (const url of urlList) {
    const absolute = url.startsWith("http") ? url : `${BASE_URL}${url}`;
    if (!_isDuplicate(absolute)) {
      clean.push(absolute);
    }
  }
  if (clean.length === 0) return;

  console.log(`[IndexNow] 🚀 Submitting ${clean.length} URL(s)...`);

  // Split into batches
  const batches = [];
  for (let i = 0; i < clean.length; i += BATCH_SIZE) {
    batches.push(clean.slice(i, i + BATCH_SIZE));
  }

  // Fire all batches (non-blocking)
  batches.forEach((batch, idx) => {
    _postIndexNow(batch).catch((err) =>
      console.error(`[IndexNow] Batch ${idx + 1}/${batches.length} failed: ${err.message}`)
    );
  });
}

/**
 * Notify IndexNow of a single new URL.
 */
function notifyUrlCreated(url) {
  submitUrls([url]);
}

/**
 * Notify IndexNow of a single updated URL.
 */
function notifyUrlUpdated(url) {
  submitUrls([url]);
}

/**
 * Notify IndexNow that a URL has been removed / should be de-indexed.
 * IndexNow doesn't have a separate delete endpoint — submitting the URL
 * tells search engines to re-crawl it, and if it returns 404/410 they'll remove it.
 */
function notifyUrlDeleted(url) {
  submitUrls([url]);
}

/**
 * Bulk submit multiple new URLs.
 */
function notifyBulkCreated(urls) {
  submitUrls(urls);
}

// =========== INITIAL BULK SUBMISSION ===========

/**
 * Gather and submit ALL public URLs from all data sources.
 * Called once on deploy, or via admin trigger route.
 */
async function bulkSubmitAllPublicUrls() {
  console.log("[IndexNow] 🔄 Starting full bulk URL submission...");

  // We require mongoose models to be passed in (avoids circular dep)
  const Blog = require("../models/Blog");
  const IslamicFAQ = require("../models/IslamicFAQ");
  const CategoryPage = require("../models/CategoryPage");
  const User = require("../models/user");

  const allUrls = [];

  // ---- Static pages ----
  const staticPages = [
    "/", "/profiles", "/blog", "/islamic-faqs", "/podcasts",
    "/our-ads", "/our-team", "/terms", "/privacy", "/company-details",
    "/refund-policy", "/account-faqs", "/pricing", "/gdpr-faqs",
    "/code-of-conduct", "/profiles/addedBy/staff",
  ];
  allUrls.push(...staticPages);

  // ---- SEO Landing Pages (mirrors App.js seoPages array paths) ----
  const seoLandingPaths = [
    "/muslim-marriage", "/muslim-matrimonial", "/muslim-matchmaking",
    "/halal-marriage", "/muslim-rishta", "/find-muslim-spouse",
    "/best-muslim-marriage-website", "/free-muslim-marriage-site",
    "/trusted-muslim-matchmaking", "/verified-muslim-profiles",
    "/online-rishta-pakistan", "/rishta-lahore", "/rishta-karachi",
    "/muslim-marriage-uk", "/british-pakistani-marriage",
    "/muslim-singles-uk", "/muslim-second-marriage",
    "/divorced-muslim-marriage", "/muslim-marriage-over-30",
  ];
  allUrls.push(...seoLandingPaths);

  // ---- City Hub Pages ----
  const cityHubPaths = [
    "/muslim-matrimony-london", "/muslim-matrimony-birmingham",
    "/muslim-matrimony-manchester", "/muslim-matrimony-bradford",
    "/muslim-matrimony-leicester", "/muslim-matrimony-leeds",
    "/muslim-matrimony-sheffield", "/muslim-matrimony-coventry",
    "/muslim-matrimony-luton", "/muslim-matrimony-glasgow",
    "/muslim-matrimony-nottingham",
  ];
  allUrls.push(...cityHubPaths);

  // ---- Pakistan City Pages ----
  const pakistanCityPaths = [
    "/rishta-islamabad", "/rishta-rawalpindi", "/rishta-faisalabad",
  ];
  allUrls.push(...pakistanCityPaths);

  // ---- Static blog posts (hardcoded in sitemap) ----
  const staticBlogs = [
    "/blog/muslim-wedding-planner-guide",
    "/blog/uk-rishta-whatsapp-group",
    "/blog/uk-muslim-rishta-service-charges",
  ];
  allUrls.push(...staticBlogs);

  // ---- Published Blog Posts from DB ----
  try {
    const blogs = await Blog.find({ isPublished: true }, "slug");
    blogs.forEach((b) => allUrls.push(`/blog/${b.slug}`));
  } catch (err) {
    console.error("[IndexNow] Failed to fetch blogs for bulk submit:", err.message);
  }

  // ---- Published Islamic FAQs from DB ----
  try {
    const faqs = await IslamicFAQ.find({ isPublished: true }, "slug");
    faqs.forEach((f) => allUrls.push(`/islamic-faqs/${f.slug}`));
  } catch (err) {
    console.error("[IndexNow] Failed to fetch FAQs for bulk submit:", err.message);
  }

  // ---- Published Category Pages from DB ----
  try {
    const pages = await CategoryPage.find({ isPublished: true }, "categorySlug pageSlug");
    pages.forEach((p) => allUrls.push(`/${p.categorySlug}/${p.pageSlug}`));
  } catch (err) {
    console.error("[IndexNow] Failed to fetch category pages for bulk submit:", err.message);
  }

  // ---- Approved User Profiles from DB ----
  try {
    const users = await User.find(
      {
        approvalStatus: "approved",
        isApproved: true,
        "seoSettings.noIndex": { $ne: true },
        profileSlug: { $exists: true, $ne: null },
      },
      "profileSlug"
    );
    users.forEach((u) => allUrls.push(`/profiles/${u.profileSlug}`));
  } catch (err) {
    console.error("[IndexNow] Failed to fetch user profiles for bulk submit:", err.message);
  }

  // Deduplicate
  const unique = [...new Set(allUrls)];
  console.log(`[IndexNow] 📋 Bulk submit: ${unique.length} unique URLs total`);

  // Submit in batches
  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const batch = unique.slice(i, i + BATCH_SIZE).map((u) =>
      u.startsWith("http") ? u : `${BASE_URL}${u}`
    );
    try {
      await _postIndexNow(batch);
      console.log(`[IndexNow] 📤 Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(unique.length / BATCH_SIZE)} done`);
    } catch (err) {
      console.error(`[IndexNow] Batch failed: ${err.message}`);
    }
  }

  console.log("[IndexNow] ✅ Full bulk submission complete.");
}

module.exports = {
  submitUrls,
  notifyUrlCreated,
  notifyUrlUpdated,
  notifyUrlDeleted,
  notifyBulkCreated,
  bulkSubmitAllPublicUrls,
};
