const mongoose = require("mongoose");

const adMediaSchema = new mongoose.Schema(
  {
    url: { type: String, required: true, trim: true },
    publicId: { type: String, required: true, trim: true },
    mediaType: {
      type: String,
      enum: ["image", "video"],
      default: "image",
    },
    caption: { type: String, trim: true, maxlength: 200, default: "" },
    order: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: true },
    addedBy: { type: String, default: "admin" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AdMedia", adMediaSchema);
