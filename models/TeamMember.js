const mongoose = require("mongoose");

const teamMemberSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    designation: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },
    bio: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
    photo: {
      url: { type: String, trim: true, default: "" },
      publicId: { type: String, trim: true, default: "" },
    },
    order: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: true },
    addedBy: { type: String, default: "admin" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("TeamMember", teamMemberSchema);
