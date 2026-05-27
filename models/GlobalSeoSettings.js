// Global SEO Settings Model - Singleton document for site-wide SEO configuration
const mongoose = require("mongoose");

const globalSeoSettingsSchema = new mongoose.Schema({
  // Site Identity
  siteName: {
    type: String,
    default: "shadiamour",
  },
  defaultMetaTitleSuffix: {
    type: String,
    default: "| shadiamour",
  },
  defaultMetaDescription: {
    type: String,
    maxlength: 160,
    default: "Find your Muslim life partner on shadiamour - the trusted Islamic matrimony and matchmaking site for UK Muslims seeking Halal marriage.",
  },
  defaultOgImage: {
    type: String,
    default: "https://shadiamour.com/images/default-profile-og.jpg",
  },
  
  // Social Media
  twitterHandle: {
    type: String,
    default: "@shadiamour",
  },
  facebookPageUrl: {
    type: String,
  },
  instagramHandle: {
    type: String,
  },
  
  // Verification & Analytics
  googleAnalyticsId: {
    type: String,
  },
  googleSearchConsoleVerification: {
    type: String,
  },
  bingVerification: {
    type: String,
  },
  
  // Robots & Indexing
  robotsTxtAdditions: {
    type: String,
    default: "",
  },
  globalNoIndex: {
    type: Boolean,
    default: false,
  },
  
  // Keywords
  globalKeywords: [{
    type: String,
  }],
  
  // Schema.org Organization Data
  organizationName: {
    type: String,
    default: "shadiamour",
  },
  organizationLogo: {
    type: String,
  },
  organizationUrl: {
    type: String,
    default: "https://shadiamour.com",
  },
  organizationEmail: {
    type: String,
  },
  organizationPhone: {
    type: String,
  },
  organizationAddress: {
    street: String,
    city: String,
    region: String,
    postalCode: String,
    country: { type: String, default: "United Kingdom" },
  },
  
  // Custom Head Scripts (be careful with XSS)
  customHeadScripts: {
    type: String,
    default: "",
  },
  
  // Footer SEO Text
  footerSeoText: {
    type: String,
  },
  
  // Homepage SEO
  homepageMetaTitle: {
    type: String,
    maxlength: 60,
  },
  homepageMetaDescription: {
    type: String,
    maxlength: 160,
  },
  
  // Profiles Page SEO
  profilesPageMetaTitle: {
    type: String,
    maxlength: 60,
  },
  profilesPageMetaDescription: {
    type: String,
    maxlength: 160,
  },
  
  // Feature Flags
  kycVerificationEnabled: {
    type: Boolean,
    default: true,
  },

  // Audit Trail
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  updatedBy: {
    type: String,
  },
}, {
  timestamps: true,
});

// Ensure only one document exists (singleton pattern)
globalSeoSettingsSchema.statics.getSettings = async function() {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({});
  }
  return settings;
};

globalSeoSettingsSchema.statics.updateSettings = async function(updates, updatedBy) {
  const settings = await this.getSettings();
  Object.assign(settings, updates, {
    updatedAt: new Date(),
    updatedBy: updatedBy,
  });
  await settings.save();
  return settings;
};

module.exports = mongoose.model("GlobalSeoSettings", globalSeoSettingsSchema);
