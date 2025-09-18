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
  registrationSource: {
    type: String,
    enum: ["register", "admin"],
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
});
module.exports = mongoose.model("User", userSchema);
