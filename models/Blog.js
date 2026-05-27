const mongoose = require("mongoose");

const blogSchema = new mongoose.Schema(
    {
        // ===== BASIC CONTENT =====
        title: {
            type: String,
            required: true,
            trim: true,
            maxlength: 120, // Ideal for SEO titles
        },
        slug: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
            index: true, // SEO-friendly slugs for clean URLs
        },
        content: {
            type: String,
            required: true,
            // TinyMCE will store HTML content safely here
        },
        excerpt: {
            type: String,
            trim: true,
            maxlength: 300, // Used for meta description / Open Graph description
        },

        // ===== SEO FIELDS =====
        metaTitle: {
            type: String,
            trim: true,
            maxlength: 60, // Ideal length for Google title
        },
        metaDescription: {
            type: String,
            trim: true,
            maxlength: 160, // Ideal meta description limit
        },
        keywords: {
            type: [String], // Helps in internal SEO or for generating schema.org JSON
            index: true,
        },
        canonicalUrl: {
            type: String,
            trim: true,
            default: function () {
                return `https://damourmuslim.com/blog/${this.slug}`;
            },
        },

        // ===== BLOG METADATA =====
        featuredImage: {
            url: { type: String, trim: true },
            alt: { type: String, trim: true, maxlength: 100 },
            caption: { type: String, trim: true }, // NEW: Optional caption for the image
        },
        category: {
            type: String,
            enum: [
                "Islamic Guidance",
                "Matrimony Tips",
                "Success Stories",
                "Relationship Advice",
                "Wedding Etiquette",
                "Halal Lifestyle",
                "general",
            ],
            default: "Matrimony Tips",
            index: true,
        },
        tags: {
            type: [String], // e.g. ['nikah', 'islamic-marriage', 'halal-dating']
            index: true,
        },

        // ===== AUTHOR & PUBLISH INFO =====
        author: {
            name: { type: String, trim: true },
            profileUrl: { type: String, trim: true },
        },
        isPublished: {
            type: Boolean,
            default: false,
        },
        publishedAt: {
            type: Date,
            default: null,
        },

        // ===== OPTIONAL SEO ENHANCEMENTS =====
        faqSchema: [
            {
                question: { type: String, trim: true },
                answer: { type: String, trim: true },
            },
        ],
        structuredData: {
            type: Object, // You can store custom JSON-LD (schema.org) data
            default: {},
        },
        ogTags: {
            // For Facebook / LinkedIn SEO
            ogTitle: { type: String, trim: true },
            ogDescription: { type: String, trim: true },
            ogImage: { type: String, trim: true },
        },
        twitterTags: {
            // For Twitter SEO
            twitterTitle: { type: String, trim: true },
            twitterDescription: { type: String, trim: true },
            twitterImage: { type: String, trim: true },
        },

        // **NEW**: Optional fields for better content management
        contentImages: [
            {
                url: { type: String, trim: true },
                filename: { type: String, trim: true },
                alt: { type: String, trim: true },
                uploadedAt: { type: Date, default: Date.now },
            },
        ],

        // Track content statistics
        wordCount: { type: Number, default: 0 },
        estimatedReadTime: { type: Number, default: 0 }, // in minutes
    },
    {
        timestamps: true,
    }
);

// ====== VIRTUALS ======
blogSchema.virtual("url").get(function () {
    return `/blog/${this.slug}`;
});

// ====== PRE-SAVE SLUG GENERATION ======
blogSchema.pre("validate", function (next) {
    if (!this.slug && this.title) {
        this.slug = this.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");
    }
    next();
});

// Add pre-save middleware to calculate stats
blogSchema.pre("save", function (next) {
    if (this.isModified("content")) {
        // Calculate word count (strip HTML tags first)
        const plainText = this.content.replace(/<[^>]*>/g, "");
        this.wordCount = plainText
            .split(/\s+/)
            .filter((word) => word.length > 0).length;

        // Estimate read time (average 200 words per minute)
        this.estimatedReadTime = Math.ceil(this.wordCount / 200);
    }
    next();
});

module.exports = mongoose.model("Blog", blogSchema);