/**
 * #duNiaGede Photobooth — app logic
 * States: WELCOME -> NAME -> (CAMERA_DENIED) -> CAMERA -> PHOTO_PREVIEW (x2)
 *         -> GENERATING -> FINAL_PREVIEW -> (retake loops back to CAMERA)
 */
(() => {
  "use strict";

  // ---------- small helpers ----------
  const $ = (sel) => document.querySelector(sel);
  const app = $("#app");
  const srStatus = $("#srStatus");

  function announce(msg) {
    srStatus.textContent = msg;
  }

  function sanitizeName(raw) {
    const trimmed = raw.trim().replace(/\s+/g, " ");
    const safe = trimmed
      .replace(/[^\p{L}\p{N} '-]/gu, "")
      .trim()
      .replace(/\s+/g, "-");
    return { display: trimmed, safe: safe || "Guest" };
  }

  function pad(n, len) {
    return String(n).padStart(len, "0");
  }

  function timeSuffix() {
    const d = new Date();
    return pad(d.getHours(), 2) + pad(d.getMinutes(), 2) + pad(d.getSeconds(), 2);
  }

  // cover-fit draw: crops `source` to fill dW x dH at dX,dY, centered
  function drawCover(ctx, source, sW, sH, dX, dY, dW, dH) {
    const sAspect = sW / sH;
    const dAspect = dW / dH;
    let cropW, cropH, cropX, cropY;
    if (sAspect > dAspect) {
      cropH = sH;
      cropW = sH * dAspect;
      cropX = (sW - cropW) / 2;
      cropY = 0;
    } else {
      cropW = sW;
      cropH = sW / dAspect;
      cropX = 0;
      cropY = (sH - cropH) / 2;
    }
    ctx.drawImage(source, cropX, cropY, cropW, cropH, dX, dY, dW, dH);
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  // ---------- state machine ----------
  const STATE = {
    guestName: "",
    sanitizedName: "",
    sessionId: null,
    sessionNumber: null,
    currentPhotoIndex: 1, // 1 or 2
    shots: [null, null], // master canvases (portrait, cropped, mirrored to match selfie view)
    stream: null,
    finalCanvas: null,
    finalBlob: null,
    uploadOk: false,
  };

  function setScreen(name) {
    document.querySelectorAll(".screen").forEach((el) => {
      el.hidden = el.dataset.screen !== name;
    });
    app.dataset.state = name;
  }

  // ---------- desktop notice ----------
  (function checkDevice() {
    const isTouch = window.matchMedia("(pointer: coarse)").matches;
    const isNarrow = window.innerWidth < 820;
    if (!isTouch && !isNarrow) {
      $("#desktopNotice").hidden = false;
    }
  })();

  // ---------- WELCOME ----------
  $("#startBtn").addEventListener("click", () => {
    setScreen("NAME");
    setTimeout(() => $("#guestName").focus(), 250);
  });

  // ---------- NAME ----------
  $("#nameForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = $("#guestName");
    const value = input.value || "";
    const error = $("#nameError");
    if (!value.trim()) {
      error.hidden = false;
      input.focus();
      return;
    }
    error.hidden = true;
    const { display, safe } = sanitizeName(value);
    STATE.guestName = display;
    STATE.sanitizedName = safe;
    await requestCameraAndProceed();
  });

  // ---------- CAMERA PERMISSION ----------
  async function requestCameraAndProceed() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 1280 } },
        audio: false,
      });
      STATE.stream = stream;
      const video = $("#cameraVideo");
      video.srcObject = stream;
      STATE.currentPhotoIndex = 1;
      updateCameraLabel();
      setScreen("CAMERA");
    } catch (err) {
      setScreen("CAMERA_DENIED");
    }
  }

  $("#retryCameraBtn").addEventListener("click", requestCameraAndProceed);

  // ---------- CAMERA / SHUTTER ----------
  function updateCameraLabel() {
    const n = STATE.currentPhotoIndex;
    $("#cameraStepLabel").textContent = `Photo ${n} of ${CONFIG.photoCount}`;
    $("#cameraInstruction").textContent = n === 1 ? "Get ready! 😊" : "One more for the memories.";
    document.querySelectorAll("#cameraDots .dot").forEach((dot) => {
      dot.classList.toggle("is-filled", Number(dot.dataset.dot) < n);
    });
  }

  let capturing = false;
  $("#shutterBtn").addEventListener("click", async () => {
    if (capturing) return;
    capturing = true;
    const btn = $("#shutterBtn");
    btn.disabled = true;
    await runCountdown();
    capturePhoto();
    btn.disabled = false;
    capturing = false;
  });

  function runCountdown() {
    return new Promise((resolve) => {
      const el = $("#countdown");
      el.hidden = false;
      let n = CONFIG.countdownSeconds;
      const tick = () => {
        el.innerHTML = `<span>${n}</span>`;
        announce(String(n));
        n -= 1;
        if (n < 0) {
          el.hidden = true;
          resolve();
        } else {
          setTimeout(tick, 700);
        }
      };
      tick();
    });
  }

  function capturePhoto() {
    const video = $("#cameraVideo");
    const flash = $("#shutterFlash");
    flash.classList.remove("is-flashing");
    void flash.offsetWidth; // restart animation
    flash.classList.add("is-flashing");

    const vw = video.videoWidth || 1280;
    const vh = video.videoHeight || 1280;

    // portrait 3:4 target, cropped from the live video
    const targetAspect = 3 / 4;
    let cropW, cropH;
    if (vw / vh > targetAspect) {
      cropH = vh;
      cropW = vh * targetAspect;
    } else {
      cropW = vw;
      cropH = vw / targetAspect;
    }
    const cropX = (vw - cropW) / 2;
    const cropY = (vh - cropH) / 2;

    const master = document.createElement("canvas");
    // cap resolution for performance while staying print-friendly
    const outW = Math.min(cropW, 1400);
    const outH = outW / targetAspect;
    master.width = outW;
    master.height = outH;
    const ctx = master.getContext("2d");

    // mirror horizontally so the saved photo matches the natural selfie preview
    ctx.translate(outW, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, outW, outH);

    const idx = STATE.currentPhotoIndex - 1;
    STATE.shots[idx] = master;

    showShotPreview(master);
  }

  // ---------- PHOTO PREVIEW ----------
  function showShotPreview(masterCanvas) {
    $("#previewStepLabel").textContent = `Photo ${STATE.currentPhotoIndex} of ${CONFIG.photoCount}`;
    const canvas = $("#previewCanvas");
    canvas.width = masterCanvas.width;
    canvas.height = masterCanvas.height;
    canvas.getContext("2d").drawImage(masterCanvas, 0, 0);
    setScreen("PHOTO_PREVIEW");
  }

  $("#retakeShotBtn").addEventListener("click", () => {
    STATE.shots[STATE.currentPhotoIndex - 1] = null;
    setScreen("CAMERA");
  });

  $("#useShotBtn").addEventListener("click", async () => {
    if (STATE.currentPhotoIndex < CONFIG.photoCount) {
      STATE.currentPhotoIndex += 1;
      updateCameraLabel();
      setScreen("CAMERA");
    } else {
      stopStream();
      setScreen("GENERATING");
      await buildFinalStrip();
      setScreen("FINAL_PREVIEW");
      uploadEverything(); // fire and forget, updates its own status UI
    }
  });

  function stopStream() {
    if (STATE.stream) {
      STATE.stream.getTracks().forEach((t) => t.stop());
      STATE.stream = null;
    }
  }

  // ---------- COMPOSITE PHOTO STRIP ----------
  // The template PNG already contains the finished design (border, hearts,
  // couple names, date, location) — we just draw it as the base layer, then
  // composite each guest photo into its window using a cover-fit crop.
  let templateImagePromise = null;
  function loadTemplateImage() {
    if (!templateImagePromise) {
      templateImagePromise = new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Could not load photo strip template."));
        img.src = PHOTO_STRIP.templateSrc;
      });
    }
    return templateImagePromise;
  }

  async function buildFinalStrip() {
    const templateImg = await loadTemplateImage();

    const W = PHOTO_STRIP.width;
    const H = PHOTO_STRIP.height;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d");

    // base layer: your finished template design
    ctx.drawImage(templateImg, 0, 0, W, H);

    // guest photo 1 into its window
    const p1 = PHOTO_STRIP.photo1;
    if (STATE.shots[0]) {
      drawCover(ctx, STATE.shots[0], STATE.shots[0].width, STATE.shots[0].height, p1.x, p1.y, p1.width, p1.height);
    }

    // guest photo 2 into its window
    const p2 = PHOTO_STRIP.photo2;
    if (STATE.shots[1]) {
      drawCover(ctx, STATE.shots[1], STATE.shots[1].width, STATE.shots[1].height, p2.x, p2.y, p2.width, p2.height);
    }

    STATE.finalCanvas = c;

    // render into the visible preview canvas
    const previewCanvas = $("#finalCanvas");
    previewCanvas.width = W;
    previewCanvas.height = H;
    previewCanvas.getContext("2d").drawImage(c, 0, 0);

    STATE.finalBlob = await canvasToBlob(c, "image/png");
  }

  // ---------- FINAL PREVIEW actions ----------
  function outputFilename() {
    return `${CONFIG.filenamePrefix}_${STATE.sessionNumber || "000"}_${STATE.sanitizedName}_${timeSuffix()}.png`;
  }

  $("#downloadBtn").addEventListener("click", async () => {
    if (!STATE.finalBlob) return;
    const url = URL.createObjectURL(STATE.finalBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = outputFilename();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  });

  (function setupShare() {
    const shareBtn = $("#shareBtn");
    if (navigator.canShare && navigator.share) {
      shareBtn.hidden = false;
      shareBtn.addEventListener("click", async () => {
        if (!STATE.finalBlob) return;
        const file = new File([STATE.finalBlob], outputFilename(), { type: "image/png" });
        if (navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              files: [file],
              title: CONFIG.hashtag,
              text: "A little moment from Gede & Nia's wedding 💙",
            });
          } catch (_) { /* user cancelled */ }
        } else {
          $("#downloadBtn").click();
        }
      });
    }
  })();

  // retake-all confirm modal
  $("#retakeAllBtn").addEventListener("click", () => {
    $("#retakeModal").hidden = false;
  });
  $("#cancelRetakeBtn").addEventListener("click", () => {
    $("#retakeModal").hidden = true;
  });
  $("#confirmRetakeBtn").addEventListener("click", async () => {
    $("#retakeModal").hidden = true;
    STATE.shots = [null, null];
    STATE.currentPhotoIndex = 1;
    STATE.sessionId = null;
    STATE.sessionNumber = null;
    STATE.finalBlob = null;
    STATE.finalCanvas = null;
    await requestCameraAndProceed();
  });

  // ---------- UPLOAD TO GOOGLE DRIVE VIA APPS SCRIPT ----------
  // Uses XMLHttpRequest rather than fetch(). Apps Script web app URLs respond
  // with a redirect (script.google.com -> script.googleusercontent.com), and
  // some WebKit/Safari versions fail to read the response after fetch()
  // follows that redirect — even though the server-side execution completed
  // successfully. XHR handles this redirect reliably across browsers.
  function postToBackend(payload) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", CONFIG.backendUrl, true);
      // text/plain avoids a CORS preflight against Apps Script
      xhr.setRequestHeader("Content-Type", "text/plain;charset=utf-8");
      xhr.onload = () => {
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new Error("Network response was not ok (" + xhr.status + ")"));
          return;
        }
        let json;
        try {
          json = JSON.parse(xhr.responseText);
        } catch (parseErr) {
          reject(new Error("Could not parse backend response."));
          return;
        }
        if (!json.success) {
          reject(new Error(json.error || "Unknown backend error"));
          return;
        }
        resolve(json.data);
      };
      xhr.onerror = () => reject(new Error("Network error contacting backend."));
      xhr.send(JSON.stringify(payload));
    });
  }

  async function uploadEverything() {
    const statusEl = $("#uploadStatus");
    if (!CONFIG.backendUrl || CONFIG.backendUrl.includes("PASTE_YOUR")) {
      statusEl.textContent = "";
      return; // not configured yet — skip silently in dev
    }
    statusEl.textContent = "Saving your memory…";
    try {
      const session = await postToBackend({
        action: "startSession",
        guestName: STATE.guestName,
        sanitizedName: STATE.sanitizedName,
        weddingDateISO: CONFIG.weddingDateISO,
      });
      STATE.sessionId = session.sessionId;
      STATE.sessionNumber = session.sessionNumber;

      const shot1Blob = await canvasToBlob(STATE.shots[0], "image/jpeg", CONFIG.jpegQuality);
      const shot2Blob = await canvasToBlob(STATE.shots[1], "image/jpeg", CONFIG.jpegQuality);

      await postToBackend({
        action: "uploadFile",
        sessionId: STATE.sessionId,
        sanitizedName: STATE.sanitizedName,
        fileType: "photo1",
        mimeType: "image/jpeg",
        base64: await blobToBase64(shot1Blob),
      });
      await postToBackend({
        action: "uploadFile",
        sessionId: STATE.sessionId,
        sanitizedName: STATE.sanitizedName,
        fileType: "photo2",
        mimeType: "image/jpeg",
        base64: await blobToBase64(shot2Blob),
      });
      await postToBackend({
        action: "uploadFile",
        sessionId: STATE.sessionId,
        sanitizedName: STATE.sanitizedName,
        fileType: "final",
        mimeType: "image/png",
        base64: await blobToBase64(STATE.finalBlob),
      });
      await postToBackend({ action: "completeSession", sessionId: STATE.sessionId });

      STATE.uploadOk = true;
      statusEl.textContent = "Saved with love 💙";
    } catch (err) {
      STATE.uploadOk = false;
      // Temporary: surface the real error on-screen so it can be read directly
      // off the phone during testing. Safe to remove once uploads are reliable.
      statusEl.textContent = "Debug: " + (err && err.message ? err.message : String(err));
      $("#uploadFailModal").hidden = false;
    }
  }

  $("#dismissUploadFailBtn").addEventListener("click", () => {
    $("#uploadFailModal").hidden = true;
    $("#downloadBtn").click();
  });
  $("#retryUploadBtn").addEventListener("click", () => {
    $("#uploadFailModal").hidden = true;
    uploadEverything();
  });

  // ---------- init ----------
  setScreen("WELCOME");
})();
