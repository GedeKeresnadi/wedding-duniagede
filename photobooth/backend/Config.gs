/**
 * #duNiaGede Photobooth — backend configuration
 * Fill in DRIVE_FOLDER_ID after creating the root Drive folder.
 * See README.md for step-by-step instructions.
 */

const BACKEND_CONFIG = {
  // The ID of the "DU-NIA-GEDE PHOTOBOOTH" folder in the wedding owner's
  // Google Drive. Find it in the folder's URL:
  // https://drive.google.com/drive/folders/<THIS_PART_IS_THE_ID>
  driveFolderId: "1CSLHQQdYnE8y_r_aiu5ngl3Pbu9ySv2T",

  // Sub-spreadsheet name created (once) inside the root folder to log sessions.
  sheetName: "Photobooth Sessions",
  sheetTabName: "Sessions",

  // Used to build the dated event subfolder, e.g. "2026-08-19".
  eventDateFolder: "2026-08-19",

  filenamePrefix: "DU-NIA-GEDE",
};
