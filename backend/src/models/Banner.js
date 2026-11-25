import mongoose from 'mongoose';

// Promotional banners on the customer Home screen (Admin → Banners).
//   top    = carousel under the greeting
//   middle = carousel under "Looking for something?"
export const BANNER_PLACEMENTS = Object.freeze(['top', 'middle']);
export const MAX_BANNERS_PER_PLACEMENT = 10;
export const MAX_BANNER_TITLE = 80;
export const MAX_BANNER_LINK = 500;

const bannerSchema = new mongoose.Schema(
  {
    placement: { type: String, enum: BANNER_PLACEMENTS, required: true, index: true },
    // For the admin list and screen readers ("Free 6D glass")
    title: { type: String, trim: true, maxlength: MAX_BANNER_TITLE, default: null },
    // Where a tap goes: an app screen ("/coupons") or a website ("https://..."); null = not tappable
    link: { type: String, trim: true, maxlength: MAX_BANNER_LINK, default: null },
    active: { type: Boolean, default: true },
    // Lower first
    sortOrder: { type: Number, default: 0 },
    // Optional schedule (e.g. a Diwali offer): shown only between these times
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    // GridFS "banners"; served publicly under a random key that changes with every new image
    image: {
      key: { type: String, required: true },
      fileId: { type: mongoose.Schema.Types.ObjectId, required: true },
      contentType: { type: String, required: true },
      size: { type: Number },
      width: { type: Number, min: 1 },
      height: { type: Number, min: 1 },
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  },
  { timestamps: true }
);

bannerSchema.index({ 'image.key': 1 }, { unique: true });

export const Banner = mongoose.model('Banner', bannerSchema);
