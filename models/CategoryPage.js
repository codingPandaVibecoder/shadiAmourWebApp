const mongoose = require("mongoose");

const categoryPageSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    categorySlug: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    pageSlug: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    content: {
      type: String,
      default: "",
    },
    excerpt: {
      type: String,
      trim: true,
      maxlength: 300,
    },
    faqCategories: {
      type: [String],
      default: [],
    },
    featuredImage: {
      url: { type: String, trim: true },
      alt: { type: String, trim: true, maxlength: 100 },
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
      default: [],
    },
    canonicalUrl: {
      type: String,
      trim: true,
    },
    focusKeyword: {
      type: String,
      trim: true,
    },
    noIndex: {
      type: Boolean,
      default: false,
    },
    isPublished: {
      type: Boolean,
      default: false,
      index: true,
    },
    publishedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Enforce unique URL per {categorySlug, pageSlug} pair
categoryPageSchema.index({ categorySlug: 1, pageSlug: 1 }, { unique: true });

module.exports = mongoose.model("CategoryPage", categoryPageSchema);
