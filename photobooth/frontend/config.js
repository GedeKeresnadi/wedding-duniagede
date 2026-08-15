/**
 * #duNiaGede Photobooth — configuration
 * Everything you're likely to want to change lives in this file.
 * See README.md for the full setup walkthrough.
 */

const CONFIG = {
  // ---- Branding ----
  coupleName: "Gede & Nia",
  hashtag: "#duNiaGede",
  weddingDate: "19 August 2026",
  weddingDateISO: "20260819",
  location: "Tabanan, Bali",

  // ---- Backend ----
  // Paste the "Web app" URL you get after deploying the Apps Script (backend/Code.gs).
  // Example: https://script.google.com/macros/s/AKfycb.../exec
  backendUrl: "https://script.google.com/macros/s/AKfycbw3nbmmS5-wX5Jc1igKGhFWDyW2AFDqp6H0FUeWixrsUeZKzWaUT560gaxsvxZ4eSrS/exec",

  // ---- Flow ----
  photoCount: 2,
  countdownSeconds: 3,

  // ---- Files ----
  filenamePrefix: "DU-NIA-GEDE",
  maxImageWidth: 1600,     // raw photos are downscaled to this width before upload
  jpegQuality: 0.85,       // raw photo compression
  finalPngScale: 1,        // multiplier applied to PHOTO_STRIP.width/height for the exported PNG
};

/**
 * The photo strip template. This now points at your pre-made design
 * (assets/photo-strip-template.png) — the couple names, date, hearts,
 * and border are already baked into that image. app.js draws the PNG
 * as the base layer, then composites each guest photo into the two
 * rectangles below, so the numbers here just have to match where the
 * two "sky" placeholder windows sit inside your PNG.
 *
 * width/height must match the template PNG's actual pixel dimensions.
 * photo1 / photo2 are the exact interior bounds of each placeholder
 * window (measured directly from the PNG, in its native pixels).
 */
const PHOTO_STRIP = {
  templateSrc: "assets/photo-strip-template.png",

  width: 1080,
  height: 1920,

  photo1: {
    x: 97,
    y: 266,
    width: 885,
    height: 556,
  },

  photo2: {
    x: 97,
    y: 847,
    width: 885,
    height: 611,
  },
};
