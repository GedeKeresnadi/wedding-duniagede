/**
 * #duNiaGede Photobooth — Apps Script backend
 *
 * Deploy as a Web App:
 *   Execute as:  Me (the wedding owner)
 *   Who has access: Anyone
 *
 * See README.md for the full deployment walkthrough.
 */

// ---------------------------------------------------------------
// HTTP entry points
// ---------------------------------------------------------------

function doGet(e) {
  return jsonResponse({ status: "ok", message: "duNiaGede Photobooth backend is running." });
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error("Missing request body.");
    }
    const data = JSON.parse(e.postData.contents);
    const action = data.action;

    let result;
    switch (action) {
      case "startSession":
        result = startSession(data);
        break;
      case "uploadFile":
        result = uploadFile(data);
        break;
      case "completeSession":
        result = completeSession(data);
        break;
      default:
        throw new Error("Unknown action: " + action);
    }
    return jsonResponse({ success: true, data: result });
  } catch (err) {
    return jsonResponse({ success: false, error: String(err && err.message ? err.message : err) });
  }
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------------------------------------------------------------
// Session lifecycle
// ---------------------------------------------------------------

/**
 * Assigns a sequential, zero-padded session number for today's event,
 * logs a new row in the sessions sheet, and returns the session ID.
 */
function startSession(data) {
  const guestName = sanitizeText_(data.guestName, 80) || "Guest";
  const sanitizedName = sanitizeFilenamePart_(data.sanitizedName || guestName);

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const props = PropertiesService.getScriptProperties();
    const counterKey = "sessionCounter_" + BACKEND_CONFIG.eventDateFolder;
    const current = Number(props.getProperty(counterKey) || "0") + 1;
    props.setProperty(counterKey, String(current));

    const sessionNumber = padNumber_(current, 3);
    const sessionId = BACKEND_CONFIG.eventDateFolder.replace(/-/g, "") + "-" + sessionNumber;

    const sheet = getSessionsSheet_();
    sheet.appendRow([
      sessionId,
      guestName,
      new Date(),
      "", // Photo 1
      "", // Photo 2
      "", // Final Photo
      "started",
    ]);
    const rowIndex = sheet.getLastRow();
    props.setProperty("row_" + sessionId, String(rowIndex));

    return { sessionId: sessionId, sessionNumber: sessionNumber };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Decodes a base64 image, writes it to the correct Drive subfolder with the
 * documented naming convention, and records the link in the sessions sheet.
 */
function uploadFile(data) {
  const sessionId = sanitizeText_(data.sessionId, 40);
  if (!sessionId) throw new Error("Missing sessionId.");

  const fileType = data.fileType; // 'photo1' | 'photo2' | 'final'
  const mimeType = data.mimeType || "image/jpeg";
  const base64 = data.base64;
  if (!base64) throw new Error("Missing file data.");
  if (base64.length > 15 * 1024 * 1024) throw new Error("File too large.");

  const allowedMime = ["image/jpeg", "image/png"];
  if (allowedMime.indexOf(mimeType) === -1) throw new Error("Unsupported file type.");

  const sanitizedName = sanitizeFilenamePart_(data.sanitizedName || "Guest");
  const bytes = Utilities.base64Decode(base64);

  let filename, folder;
  const ext = mimeType === "image/png" ? "png" : "jpg";

  if (fileType === "final") {
    filename = `${BACKEND_CONFIG.filenamePrefix}_${sessionId}_${sanitizedName}.${ext}`;
    folder = getFinalFolder_();
  } else if (fileType === "photo1" || fileType === "photo2") {
    const shotNum = fileType === "photo1" ? "01" : "02";
    filename = `${sessionId}_${sanitizedName}_PHOTO-${shotNum}.${ext}`;
    folder = getRawFolder_();
  } else {
    throw new Error("Unknown fileType: " + fileType);
  }

  const blob = Utilities.newBlob(bytes, mimeType, filename);
  const file = folder.createFile(blob);

  updateSessionRow_(sessionId, fileType, file.getUrl());

  return { fileId: file.getId(), fileUrl: file.getUrl(), filename: filename };
}

function completeSession(data) {
  const sessionId = sanitizeText_(data.sessionId, 40);
  if (!sessionId) throw new Error("Missing sessionId.");
  updateSessionRow_(sessionId, "status", "completed");
  return { sessionId: sessionId };
}

// ---------------------------------------------------------------
// Drive folder helpers
// ---------------------------------------------------------------

function getRootFolder_() {
  return DriveApp.getFolderById(BACKEND_CONFIG.driveFolderId);
}

function getOrCreateSubfolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return parent.createFolder(name);
}

function getEventFolder_() {
  return getOrCreateSubfolder_(getRootFolder_(), BACKEND_CONFIG.eventDateFolder);
}

function getRawFolder_() {
  return getOrCreateSubfolder_(getEventFolder_(), "RAW");
}

function getFinalFolder_() {
  return getOrCreateSubfolder_(getEventFolder_(), "FINAL");
}

// ---------------------------------------------------------------
// Sessions sheet helpers
// ---------------------------------------------------------------

function getSessionsSheet_() {
  const root = getRootFolder_();
  let ssFile = null;
  const it = root.getFilesByName(BACKEND_CONFIG.sheetName);
  if (it.hasNext()) {
    ssFile = it.next();
  }

  let ss;
  if (ssFile) {
    ss = SpreadsheetApp.open(ssFile);
  } else {
    ss = SpreadsheetApp.create(BACKEND_CONFIG.sheetName);
    const file = DriveApp.getFileById(ss.getId());
    root.addFile(file);
    DriveApp.getRootFolder().removeFile(file); // keep it only inside the wedding folder
  }

  let sheet = ss.getSheetByName(BACKEND_CONFIG.sheetTabName);
  if (!sheet) {
    sheet = ss.getSheets()[0];
    sheet.setName(BACKEND_CONFIG.sheetTabName);
    sheet.appendRow(["Session ID", "Guest Name", "Timestamp", "Photo 1", "Photo 2", "Final Photo", "Status"]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function updateSessionRow_(sessionId, field, value) {
  const props = PropertiesService.getScriptProperties();
  const sheet = getSessionsSheet_();
  let rowIndex = Number(props.getProperty("row_" + sessionId) || 0);

  if (!rowIndex) {
    // fallback: search column A if the row pointer wasn't found (e.g. script restarted)
    const ids = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 0), 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      if (ids[i][0] === sessionId) {
        rowIndex = i + 2;
        break;
      }
    }
  }
  if (!rowIndex) return; // nothing to update

  const columnMap = { photo1: 4, photo2: 5, final: 6, status: 7 };
  const col = columnMap[field];
  if (!col) return;
  sheet.getRange(rowIndex, col).setValue(value);
}

// ---------------------------------------------------------------
// Sanitization
// ---------------------------------------------------------------

function sanitizeText_(value, maxLen) {
  if (!value) return "";
  return String(value).slice(0, maxLen);
}

function sanitizeFilenamePart_(value) {
  return String(value)
    .replace(/[^\p{L}\p{N}\-]/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "Guest";
}

function padNumber_(n, len) {
  return String(n).padStart(len, "0");
}
