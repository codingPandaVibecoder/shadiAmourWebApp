const mongoose = require("mongoose");

const islamicFAQSchema = new mongoose.Schema(
  {
    question: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    answer: {
      type: String,
      required: true,
    },
    excerpt: {
      type: String,
      trim: true,
      maxlength: 300,
    },
    category: {
      type: String,
<<<<<<< HEAD
      enum: [
        "Destiny",
        "Birth",
        "Divorce",
        "Engagement",
        "Family",
        "Getting Married",
        "Intimacy",
        "Prayer & Purification",
        "Rights & Responsibilities",
        "Spouse Search",
      ],
=======
>>>>>>> fetchjun-temp
      default: "Spouse Search",
      index: true,
    },
    scholar: {
      type: String,
      trim: true,
    },
    featuredImage: {
      url: { type: String, trim: true },
      alt: { type: String, trim: true, maxlength: 100 },
      caption: { type: String, trim: true },
    },
    metaTitle: {
      type: String,
      trim: true,
      maxlength: 60,
    },
    metaDescription: {
      type: String,
      trim: true,
      maxlength: 160,
    },
    keywords: {
      type: [String],
      index: true,
    },
    isPublished: {
      type: Boolean,
      default: false,
      index: true,
    },
    publishedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

// Auto-generate slug from question before validation so required check passes
islamicFAQSchema.pre("validate", function (next) {
  if (this.isNew && !this.slug) {
    this.slug = this.question
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "")
      .substring(0, 100);
  }
  next();
});

const IslamicFAQ = mongoose.model("IslamicFAQ", islamicFAQSchema);
module.exports = IslamicFAQ;
