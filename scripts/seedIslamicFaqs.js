/**
 * ONE-TIME SEED SCRIPT — Islamic FAQs (10 new Q&As)
 *
 * Inserts/updates the 10 Islamic FAQs from the content refresh
 * (content-change/new-content-islamic-faqs.html) into the IslamicFAQ collection.
 *
 * Idempotent: upserts by slug — safe to run more than once.
 *
 * Usage:
 *   node scripts/seedIslamicFaqs.js
 *
 * After successful completion, this file can be safely deleted.
 */

require("dotenv").config();
const mongoose = require("mongoose");
const IslamicFAQ = require("../models/IslamicFAQ");

const faqs = [
  {
    question: "Is it permissible to use a matchmaking website to find a spouse?",
    category: "Halal Matchmaking",
    excerpt:
      "Yes — using a platform to introduce potential spouses is a modern extension of the traditional practice of seeking a spouse through trusted introductions, provided interaction stays within Islamic boundaries.",
    answer:
      "Yes. Using a platform to introduce potential spouses is a modern extension of the traditional practice of seeking a spouse through trusted introductions, family, or community — provided the interaction between the two parties remains within Islamic boundaries (no khalwa/seclusion, no flirtatious or inappropriate conversation, and clear marital intent).",
    metaTitle: "Is It Permissible to Use a Matchmaking Website?",
    metaDescription:
      "Yes — using a matchmaking website is a modern extension of seeking a spouse through trusted introductions, provided interaction stays within Islamic boundaries.",
    keywords: ["matchmaking website", "halal matchmaking", "finding a spouse", "Islamic marriage"],
  },
  {
    question: "Do I need a wali (guardian) involved in the process?",
    category: "Wali & Family",
    excerpt:
      "For many schools of thought, a wali's involvement is required for a woman's marriage contract (nikah) to be valid. shadiAmour encourages family involvement from the start.",
    answer:
      "For many schools of thought, a wali's involvement is required for a woman's marriage contract (nikah) to be valid. shadiAmour encourages family involvement from the start, and we recommend involving your wali once a connection with genuine marital intent develops.",
    metaTitle: "Do I Need a Wali (Guardian) Involved?",
    metaDescription:
      "For many schools of thought a wali is required for a valid nikah. shadiAmour encourages involving your wali once a connection with genuine marital intent develops.",
    keywords: ["wali", "guardian", "nikah", "family involvement", "marriage contract"],
  },
  {
    question: "Is it okay to talk to a potential spouse before marriage?",
    category: "Courtship & Communication",
    excerpt:
      "Yes, within limits — communication should be purposeful, respectful, and ideally known to family, avoiding private unsupervised meetings (khalwa).",
    answer:
      "Yes, within limits — communication should be purposeful (getting to know character, values, and compatibility for marriage), respectful, and ideally supervised or known to family, avoiding private, unsupervised meetings (khalwa).",
    metaTitle: "Is It Okay to Talk to a Potential Spouse Before Marriage?",
    metaDescription:
      "Yes, within limits — communication should be purposeful and respectful, and ideally known to family, avoiding private unsupervised meetings (khalwa).",
    keywords: ["talking before marriage", "courtship", "khalwa", "getting to know a spouse", "halal communication"],
  },
  {
    question: "What should I look for in a spouse according to Islam?",
    category: "Choosing a Spouse",
    excerpt:
      "The Prophet (peace be upon him) guided Muslims to prioritise deen (religious commitment) and character above wealth, beauty, or lineage alone.",
    answer:
      "The Prophet (peace be upon him) guided Muslims to prioritise deen (religious commitment) and character above wealth, beauty, or lineage alone, while still considering compatibility in lifestyle, expectations, and practical matters.",
    metaTitle: "What Should I Look for in a Spouse According to Islam?",
    metaDescription:
      "Islam guides Muslims to prioritise deen and character above wealth, beauty, or lineage, while considering compatibility in lifestyle and expectations.",
    keywords: ["choosing a spouse", "what to look for in a spouse", "deen and character", "Islamic marriage advice"],
  },
  {
    question: "Can divorced or widowed Muslims remarry?",
    category: "Remarriage",
    excerpt:
      "Yes. Remarriage after divorce or widowhood is fully permissible and encouraged in Islam, subject to any required waiting period (iddah).",
    answer:
      "Yes. Remarriage after divorce or widowhood is fully permissible and encouraged in Islam, subject to the completion of any required waiting period (iddah).",
    metaTitle: "Can Divorced or Widowed Muslims Remarry?",
    metaDescription:
      "Yes — remarriage after divorce or widowhood is fully permissible and encouraged in Islam, subject to the completion of any required waiting period (iddah).",
    keywords: ["remarriage", "divorce and remarriage", "widow remarriage", "iddah", "second marriage"],
  },
  {
    question: "What is the role of family in choosing a spouse?",
    category: "Wali & Family",
    excerpt:
      "Family involvement is encouraged and, for many, expected — parents and guardians often help vet compatibility, meet the other family, and support the process.",
    answer:
      "Family involvement is encouraged and, for many, expected — parents and guardians often play a key role in vetting compatibility, meeting the other family, and supporting the marriage process.",
    metaTitle: "What Is the Role of Family in Choosing a Spouse?",
    metaDescription:
      "Family involvement is encouraged and often expected — parents and guardians help vet compatibility, meet the other family, and support the marriage process.",
    keywords: ["role of family", "parents in marriage", "arranged marriage", "family involvement", "rishta"],
  },
  {
    question: "Is there a dua for finding a righteous spouse?",
    category: "Dua & Istikhara",
    excerpt:
      "Yes — many Muslims recite duas asking Allah for a righteous spouse, drawing on verses such as the dua of the believers in Surah Al-Furqan (25:74).",
    answer:
      "Yes, many Muslims recite duas asking Allah for a righteous spouse, drawing on verses such as the dua of the believers in Surah Al-Furqan (25:74) asking for spouses who are a source of comfort. (See our full guide: \"Dua for Finding a Spouse.\")",
    metaTitle: "Is There a Dua for Finding a Righteous Spouse?",
    metaDescription:
      "Yes — many Muslims recite duas asking Allah for a righteous spouse, drawing on the dua of the believers in Surah Al-Furqan (25:74).",
    keywords: ["dua for spouse", "dua for marriage", "Surah Al-Furqan", "righteous spouse", "istikhara"],
  },
  {
    question: "How do I know if someone is my naseeb (destined match)?",
    category: "Dua & Istikhara",
    excerpt:
      "Islam teaches that our provisions, including a spouse, are written by Allah's decree. Focus on istikhara, practical compatibility, and sound character.",
    answer:
      "Islam teaches that our provisions, including a spouse, are written by Allah's decree. Rather than searching for signs, scholars generally advise focusing on istikhara (seeking Allah's guidance through prayer), practical compatibility, and sound character — trusting that the outcome is from Allah.",
    metaTitle: "How Do I Know if Someone Is My Naseeb?",
    metaDescription:
      "Islam teaches that a spouse is written by Allah's decree. Scholars advise focusing on istikhara, practical compatibility, and sound character.",
    keywords: ["naseeb", "destined match", "istikhara", "qadr", "finding your match"],
  },
  {
    question: "Is it permissible to see a photo of a potential spouse before meeting?",
    category: "Courtship & Communication",
    excerpt:
      "Yes, viewing a photo is generally permitted and can help with the initial stage of considering compatibility, though many scholars encourage a chaperoned meeting first.",
    answer:
      "Yes, viewing a photo is generally permitted and can help with the initial stage of considering compatibility, though many scholars encourage an in-person (chaperoned) meeting before any commitment.",
    metaTitle: "Is It Permissible to See a Photo Before Meeting?",
    metaDescription:
      "Yes — viewing a photo is generally permitted and can help with the initial stage of considering compatibility, though many scholars encourage a chaperoned meeting.",
    keywords: ["seeing photo", "picture before marriage", "halal meeting", "compatibility", "courtship"],
  },
  {
    question: "What happens after both parties agree to marry?",
    category: "Nikah & Marriage",
    excerpt:
      "Families formally meet, the nikah (marriage contract) is arranged with agreed mahr, and a wali conducts or authorises the contract, followed by the walima.",
    answer:
      "Typically: families formally meet, the nikah (marriage contract) is arranged with agreed mahr (dower), and a wali conducts or authorises the contract, followed by any wedding celebration (walima) as per family and cultural preference.",
    metaTitle: "What Happens After Both Parties Agree to Marry?",
    metaDescription:
      "Families formally meet, the nikah is arranged with agreed mahr, and a wali conducts or authorises the contract, followed by the walima.",
    keywords: ["nikah", "marriage contract", "mahr", "walima", "getting married"],
  },
];

async function main() {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║   ISLAMIC FAQS SEEDER (10 Q&As)          ║");
  console.log("╚══════════════════════════════════════════╝");

  const mongoUri = process.env.MONGODB_URI;
  console.log(`🔌 Connecting to MongoDB...`);
  await mongoose.connect(mongoUri);
  console.log("✅ MongoDB connected");

  let inserted = 0;
  let updated = 0;

  for (const faq of faqs) {
    const slug = faq.question
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "")
      .substring(0, 100);

    const existing = await IslamicFAQ.findOne({ slug });

    const data = {
      ...faq,
      slug,
      isPublished: true,
      publishedAt: existing ? existing.publishedAt : new Date(),
    };

    const result = await IslamicFAQ.findOneAndUpdate(
      { slug },
      { $set: data },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    if (existing) {
      updated++;
      console.log(`🔄 Updated: ${data.question}`);
    } else {
      inserted++;
      console.log(`✅ Inserted: ${data.question}`);
    }
    console.log(`   → slug: ${result.slug} | category: ${result.category}`);
  }

  const total = await IslamicFAQ.countDocuments({ isPublished: true });
  console.log("");
  console.log(`📊 Done — ${inserted} inserted, ${updated} updated.`);
  console.log(`🗂  Total published Islamic FAQs now: ${total}`);

  await mongoose.disconnect();
  console.log("🔌 Disconnected. Exiting.");
  process.exit(0);
}

main().catch(async (err) => {
  console.error("❌ Seed failed:", err);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
