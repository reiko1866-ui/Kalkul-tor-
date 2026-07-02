/**
 * Konyhaarlista PDF képei — csak AI azonosításhoz (ár/szöveg nélkül).
 * Forrás: https://divian.hu/data/konyhaarlista.pdf
 */
(function (global) {
  const CODE_RE = /\b([A-Z]{2,}[A-Z0-9]{0,12})\b/g;

  function getManifest() {
    return global.DIVIAN_KONYHAARLISTA_IMAGES && typeof global.DIVIAN_KONYHAARLISTA_IMAGES === "object"
      ? global.DIVIAN_KONYHAARLISTA_IMAGES
      : null;
  }

  function normalizeCode(code) {
    return String(code || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
  }

  function hasCatalogImage(code) {
    const m = getManifest();
    const c = normalizeCode(code);
    return !!(m && c && Array.isArray(m.codes) && m.codes.includes(c));
  }

  function getCatalogImageUrl(code) {
    if (!hasCatalogImage(code)) return null;
    const m = getManifest();
    const base = String(m.imageBasePath || "konyhaarlista-img").replace(/\/+$/, "");
    return base + "/" + normalizeCode(code) + ".jpg";
  }

  function extractCodesFromText(text) {
    const m = getManifest();
    if (!m || !Array.isArray(m.codes)) return [];
    const known = new Set(m.codes);
    const out = [];
    const hay = String(text || "").toUpperCase();
    let match;
    CODE_RE.lastIndex = 0;
    while ((match = CODE_RE.exec(hay))) {
      const c = match[1];
      if (known.has(c)) out.push(c);
    }
    return out;
  }

  function collectCodesForVision(quoteContext, messages) {
    const ctx = quoteContext && typeof quoteContext === "object" ? quoteContext : {};
    const codes = [];
    const wall = Array.isArray(ctx.plannerItems?.codes) ? ctx.plannerItems.codes : [];
    wall.forEach((row) => {
      if (row?.code) codes.push(row.code);
    });
    const msgs = Array.isArray(messages) ? messages : [];
    for (let i = msgs.length - 1; i >= 0; i -= 1) {
      const role = String(msgs[i]?.role || "").toLowerCase();
      if (role !== "user") continue;
      codes.push(...extractCodesFromText(msgs[i]?.content));
      break;
    }
    const seen = new Set();
    return codes
      .map(normalizeCode)
      .filter((c) => {
        if (!c || !hasCatalogImage(c) || seen.has(c)) return false;
        seen.add(c);
        return true;
      });
  }

  function resizeImageToJpegBase64(img, maxWidth) {
    const w = Math.max(1, img.naturalWidth || img.width || 1);
    const h = Math.max(1, img.naturalHeight || img.height || 1);
    const scale = Math.min(1, maxWidth / w);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.86);
    const base64 = dataUrl.split(",")[1] || "";
    if (!base64) return null;
    return base64;
  }

  function loadCatalogImagePart(code, maxWidth) {
    const url = getCatalogImageUrl(code);
    if (!url) return Promise.resolve(null);
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const data = resizeImageToJpegBase64(img, maxWidth);
          if (!data) {
            resolve(null);
            return;
          }
          resolve({ code: normalizeCode(code), mimeType: "image/jpeg", data });
        } catch (_e) {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  async function loadCatalogImagesForCodes(codes, options) {
    const maxCount = Math.max(1, Math.min(20, Number(options?.maxCount) || 16));
    const maxWidth = Math.max(120, Math.min(512, Number(options?.maxWidth) || 320));
    const list = (Array.isArray(codes) ? codes : [])
      .map(normalizeCode)
      .filter((c) => c && hasCatalogImage(c));
    const unique = [];
    const seen = new Set();
    list.forEach((c) => {
      if (seen.has(c)) return;
      seen.add(c);
      unique.push(c);
    });
    const picked = unique.slice(0, maxCount);
    const parts = await Promise.all(picked.map((c) => loadCatalogImagePart(c, maxWidth)));
    return parts.filter(Boolean);
  }

  const api = {
    getManifest,
    hasCatalogImage,
    getCatalogImageUrl,
    extractCodesFromText,
    collectCodesForVision,
    loadCatalogImagesForCodes
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.DivianKonyhaarlistaImages = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
