// this is user.js model
const mongoose = require("mongoose");
const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: false,
    unique: true,
    sparse: true,
    lowercase: true,
    validate: {
      validator: function (email) {
        // return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
        if (!email) return true;
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      },
      message: "Please provide a valid email address",
    },
  },
  isEmailVerified: {
    type: Boolean,
    default: false,
  },
  emailVerificationCode: {
    type: String,
    default: null,
  },
  emailCodeExpiry: {
    type: Date,
    default: null,
  },
  passwordResetToken: {
    type: String,
    default: null,
  },
  passwordResetExpiry: {
    type: Date,
    default: null,
  },
  passcodeUsed: {
    type: String,
    default: null,
  },
  employeeRef: {
    type: String,
    default: null,
  },
  name: {
    type: String,
  },
  age: {
    type: Number,
  },
  password: {
    type: String,
    required: true,
  },
  adress: {
    type: String,
  },
  city: {
    type: String,
  },
  contact: {
    type: Number,
  },
  gender: {
    type: String,
  },
  religion: {
    type: String,
  },
  caste: {
    type: String,
  },
  peopleInterested: [
    {
      type: mongoose.Types.ObjectId,
      ref: "User",
    },
  ],
  likeRequests: [
    {
      type: mongoose.Types.ObjectId,
      ref: "Request",
    },
  ],
  canAccessFullProfileOf: [
    {
      type: mongoose.Types.ObjectId,
      ref: "User",
    },
  ],

  profilePic: {
    url: String,
    filename: String,
  },
  coverPhoto: {
    url: String,
    filename: String,
  },
  country: {
    type: String,
  },
  state: {
    type: String,
  },
  eyeColor: {
    type: String,
  },
  wearHijab: {
    type: String,
  },
  beard: {
    type: String,
  },
  hairColor: {
    type: String,
  },
  complexion: {
    type: String,
  },
  build: {
    type: String,
  },
  height: {
    type: Number,
  },
  languagesSpoken: [
    {
      type: String,
    },
  ],
  education: [
    {
      title: { type: String },
      institute: { type: String },
      year: { type: String },
    },
  ],
  highestEducation: {
    type: String,
  },
  work: {
    type: String,
  },
  nationality: {
    type: String,
  },
  ethnicity: {
    type: String,
  },
  maritalStatus: {
    type: String,
  },
  disability: {
    type: String,
    default: "no",
  },
  smoker: {
    type: Boolean,
  },
  bornMuslim: {
    type: Boolean,
  },
  islamicSect: {
    type: String,
  },
  preferredIslamicSect: {
    type: String,
  },
  prays: {
    type: Boolean,
  },
  celebratesMilaad: {
    type: Boolean,
  },
  celebrateKhatams: {
    type: Boolean,
  },
  islamIsImportantToMeInfo: {
    type: String,
  },
  acceptSomeoneWithChildren: {
    type: Boolean,
  },
  acceptADivorcedPerson: {
    type: Boolean,
  },
  agreesWithPolygamy: {
    type: Boolean,
  },
  acceptAWidow: {
    type: Boolean,
  },
  AcceptSomeoneWithBeard: {
    type: Boolean,
  },
  AcceptSomeoneWithHijab: {
    type: Boolean,
  },
  ConsiderARevert: {
    type: Boolean,
  },
  livingArrangementsAfterMarriage: {
    type: String,
  },
  futurePlans: {
    type: String,
  },
  describeNature: {
    type: String,
  },
  QualitiesThatYouCanBringToYourMarriage: [
    {
      type: String,
    },
  ],
  fatherName: {
    type: String,
  },
  motherName: {
    type: String,
  },
  fatherProfession: {
    type: String,
  },
  aboutMe: {
    type: String,
  },
  hobbies: [
    {
      type: String,
    },
  ],
  willingToRelocate: {
    type: String,
  },

  //what are you looking for.
  preferredAgeRange: {
    type: String, // e.g., "25-30"
  },
  preferredHeightRange: {
    type: String, // e.g., "150-180 cm"
  },
  preferredCaste: {
    type: String, //
  },
  preferredEthnicity: {
    type: String, //
  },
  allowParnterToWork: {
    type: Boolean, //
  },
  allowPartnerToStudy: {
    type: Boolean, //
  },
  acceptSomeoneInOtherCountry: {
    type: String, //
  },
  qualitiesYouNeedInYourPartner: [{ type: String }],
  lookingForASpouseThatIs: {
    type: String,
  },
  willingToSharePhotosUponRequest: {
    type: String,
  },
  willingToMeetUpOutside: {
    type: String,
  },
  waliMyContactDetails: {
    type: String,
  },
  whoCompletedProfile: {
    type: String,
  },
  siblings: {
    type: Number,
    default: 0,
  },
  birthPlace: {
    type: String,
  },
  children: [
    {
      name: { type: String },
      age: { type: Number },
      livingLocation: { type: String },
    },
  ],
  anySpecialInformationPeopleShouldKnow: {
    type: String, // e.g., "any special information"
  },
  willingToConsiderANonUkCitizen: {
    type: String, // true = yes, false = no
  },
  profileSlug: {
    type: String,
    unique: true,
    sparse: true, // Allows multiple documents without this field
    index: true, // For faster lookups
  },
  profileSlugHistory: {
    type: [String],
    default: [],
  },
  registrationSource: {
    type: String,
    enum: ["register", "admin", "google"],
    default: "register",
  },
  registeredAt: {
    type: Date,
    default: Date.now,
  },
  isFeatured: {
    type: Boolean,
    default: false,
  },
  featuredDate: {
    type: Date,
    default: null,
  },
  profileFor: {
    type: String,
  },
  googleId: {
    type: String,
    sparse: true, // Allows multiple documents without this field
  },
  googleProfilePic: {
    type: String,
  },
  randomNameForSeo: {
    type: String,
    default: null,
  },
  seoKeywords: {
    type: [String],
    default: [],
  },
  seoField1: {
    type: String,
  },
  seoField2: {
    type: String,
  },
  // Nested SEO settings for SEO admin panel
  seoSettings: {
    customMetaTitle: {
      type: String,
      maxlength: 60,
    },
    customMetaDescription: {
      type: String,
      maxlength: 160,
    },
    customKeywords: [{
      type: String,
    }],
    focusKeyword: {
      type: String,
    },
    noIndex: {
      type: Boolean,
      default: false,
    },
    ogImageOverride: {
      type: String,
    },
    canonicalUrlOverride: {
      type: String,
    },
    internalNotes: {
      type: String,
    },
    lastSeoEditedAt: {
      type: Date,
    },
    lastSeoEditedBy: {
      type: String,
    },
  },
  // Profile approval system
  isApproved: {
    type: Boolean,
    default: false,
  },
  approvalStatus: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "pending",
  },
  approvedAt: {
    type: Date,
    default: null,
  },
  approvedBy: {
    type: String,
    default: null,
  },
  rejectedAt: {
    type: Date,
    default: null,
  },
  rejectionReason: {
    type: String,
    default: null,
  },
  rejectionReason: {
    type: String,
    default: null,
  },
  // Identity verification (KYC)
  idVerified: {
    type: Boolean,
    default: false,
  },
  faceVerified: {
    type: Boolean,
    default: false,
  },
  idFrontUrl: {
    type: String,
    default: '',
  },
  idBackUrl: {
    type: String,
    default: '',
  },
  selfieUrl: {
    type: String,
    default: '',
  },
  // Account deactivation system
  isDeactivated: {
    type: Boolean,
    default: false,
  },
  deactivatedAt: {
    type: Date,
    default: null,
  },
  deactivatedBy: {
    type: String,
    default: null,
  },
  deactivationReason: {
    type: String,
    default: null,
  },
  // LLM-generated match narratives cache (keyed by other user's ID)
  matchNarrativeCache: {
    type: Map,
    of: String,
    default: {},
  },

  // Profile completeness tier for matching system
  // Tier A: all new-onboarding fields populated
  // Tier B: missing some or all new fields (legacy users)
  profileCompletenessTier: {
    type: String,
    enum: ["A", "B"],
    default: null,
  },

  // When the tier was last calculated
  profileTierCalculatedAt: {
    type: Date,
    default: null,
  },

  // When set, this user's match scores are stale and need recomputation
  matchScoresStaleSince: {
    type: Date,
    default: null,
  },

  // Whether onboarding was completed (for legacy vs new user detection)
  onboardingCompletedAt: {
    type: Date,
    default: null,
  },
});

// Pre-delete middleware to clean up associated data
userSchema.pre('findOneAndDelete', async function(next) {
  try {
    const userId = this.getFilter()._id;
    
    if (userId) {
      // Import models here to avoid circular dependency
      const Request = require('./Request');
      const Notification = require('./Notification');
      
      // Delete all requests where user is sender or receiver
      const requestsDeleted = await Request.deleteMany({
        $or: [
          { from: userId },
          { to: userId }
        ]
      });
      console.log(`Deleted ${requestsDeleted.deletedCount} requests for user ${userId}`);
      
      // Delete all notifications for this user
      const notificationsDeleted = await Notification.deleteMany({ userId: userId });
      console.log(`Deleted ${notificationsDeleted.deletedCount} notifications for user ${userId}`);
    }
    
    next();
  } catch (error) {
    console.error('Error in pre-delete middleware:', error);
    next(error);
  }
});

module.exports = mongoose.model("User", userSchema);
