/* global window, XMLHttpRequest */

(function installDivianPlannerItemListsCapture() {
  if (window.__divianPlannerItemListsCaptureInstalled) return;
  window.__divianPlannerItemListsCaptureInstalled = true;

  const TARGET_HINT = "item-lists";
  const seenPayloadHashes = new Set();

  function normalizeApiCode(code) {
    return String(code || "")
      .trim()
      .replace(/\uFEFF/g, "");
  }

  function safeToString(value) {
    if (value === null || value === undefined) return null;
    return String(value);
  }

  function isLikelyItemListsUrl(url) {
    return typeof url === "string" && url.includes(TARGET_HINT);
  }

  function shouldAttemptJsonParse(url) {
    if (typeof url !== "string" || !url) return false;
    const u = url.toLowerCase();
    if (!u.startsWith("http://") && !u.startsWith("https://")) return false;
    if (
      u.endsWith(".js") ||
      u.endsWith(".css") ||
      u.endsWith(".map") ||
      u.includes(".js?") ||
      u.includes(".css?")
    ) {
      return false;
    }
    if (u.includes(".png") || u.includes(".jpg") || u.includes(".jpeg") || u.includes(".webp") || u.includes(".gif")) {
      return false;
    }
    if (u.includes(".woff") || u.includes(".woff2") || u.includes(".ttf") || u.includes(".map")) return false;
    return true;
  }

  function looksJsonText(text) {
    const t = String(text || "").trim();
    if (!t) return false;
    const c = t[0];
    return c === "{" || c === "[";
  }

  function normalizeDishwasherFrontCode(code) {
    const up = String(code || "")
      .trim()
      .toUpperCase();
    const legacy = up.match(/^LMO(\d+_\d+)$/);
    if (legacy) return "MO" + legacy[1];
    const direct = up.match(/^(MO\d+_\d+)$/);
    if (direct) return direct[1];
    return up;
  }

  function pickItemCode(item) {
    const raw = normalizeApiCode(
      safeToString(
        item?.primaryRefCode ??
          item?.articleNumber ??
          item?.refCodes?.manufCode ??
          item?.cikkszam ??
          item?.sku ??
          item?.itemNumber
      ) || ""
    );
    return normalizeDishwasherFrontCode(raw);
  }

  function isCommercialItemLike(value) {
    if (!value || typeof value !== "object") return false;
    const q = Number(value.quantity ?? value.mennyiseg ?? value.qty ?? 0);
    if (!Number.isFinite(q) || q <= 0) return false;
    const code = pickItemCode(value);
    return !!code;
  }

  function findCommercialItemsArray(root, maxNodes) {
    const queue = [root];
    const seen = new Set();
    let visited = 0;

    while (queue.length && visited < maxNodes) {
      const cur = queue.shift();
      visited += 1;
      if (!cur || (typeof cur !== "object" && typeof cur !== "function")) continue;
      if (typeof cur === "object" && seen.has(cur)) continue;
      if (typeof cur === "object") seen.add(cur);

      if (Array.isArray(cur)) {
        if (cur.length && cur.every((x) => isCommercialItemLike(x))) return cur;
        for (let i = 0; i < cur.length; i += 1) queue.push(cur[i]);
        continue;
      }

      const keys = Object.keys(cur);
      for (let i = 0; i < keys.length; i += 1) {
        const k = keys[i];
        if (k === "commercialItems" && Array.isArray(cur[k])) {
          const arr = cur[k];
          if (arr.length && arr.every((x) => isCommercialItemLike(x))) return arr;
        }
      }

      for (let i = 0; i < keys.length; i += 1) {
        const v = cur[keys[i]];
        if (v && (typeof v === "object" || Array.isArray(v))) queue.push(v);
      }
    }

    return null;
  }

  function normalizeCommercialItems(parsedJson) {
    const direct = parsedJson?.commercialItems;
    const commercialItems = Array.isArray(direct) && direct.length ? direct : findCommercialItemsArray(parsedJson, 8000);
    if (!Array.isArray(commercialItems)) return [];

    return commercialItems.map((item) => {
      const code = pickItemCode(item);
      const qty = Number(item?.quantity ?? item?.mennyiseg ?? item?.qty ?? 0);
      return { code, qty };
    });
  }

  function mergeCapturedRows(rows) {
    const qtyByCode = new Map();
    rows.forEach((row) => {
      if (!row || !row.code) return;
      const q = Math.max(0, Math.floor(Number(row.qty) || 0));
      if (!q) return;
      const key = row.code.toLowerCase();
      qtyByCode.set(key, (qtyByCode.get(key) || 0) + q);
    });
    return Array.from(qtyByCode.entries()).map(([key, qty]) => {
      const original =
        rows.find((r) => r && r.code && r.code.toLowerCase() === key)?.code || key;
      return { code: original, qty };
    });
  }

  function storeCapturedRows(rows) {
    const merged = mergeCapturedRows(rows);
    if (!merged.length) return;

    const prev = Array.isArray(window.__divianPlannerCapturedItems)
      ? window.__divianPlannerCapturedItems
      : [];
    const prevRaw = Number(window.__divianPlannerCapturedRawCount || 0);
    const nextRaw = rows.length;
    const prevUnique = prev.length;
    const nextUnique = merged.length;

    const prevScore = prevRaw * 1000 + prevUnique;
    const nextScore = nextRaw * 1000 + nextUnique;

    if (!prev.length || nextScore >= prevScore) {
      window.__divianPlannerCapturedItems = merged;
      window.__divianPlannerCapturedRawCount = nextRaw;
      window.__divianPlannerCapturedAt = new Date().toISOString();
    }
  }

  function tryProcessResponseText(text, url) {
    if (typeof text !== "string" || text.length === 0) return;
    if (!shouldAttemptJsonParse(url)) return;
    if (text.length > 6_000_000) return;
    if (!looksJsonText(text)) return;

    try {
      const parsed = JSON.parse(text);
      const rows = normalizeCommercialItems(parsed);
      if (!rows.length) return;

      const hash = JSON.stringify(rows.map((r) => [r.code, r.qty]));
      if (seenPayloadHashes.has(hash)) return;
      seenPayloadHashes.add(hash);
      if (seenPayloadHashes.size > 200) seenPayloadHashes.clear();

      storeCapturedRows(rows);

      try {
        window.postMessage(
          {
            type: "DIVIAN_ITEM_LISTS_ROWS",
            payload: {
              rows,
              meta: {
                url: String(url || ""),
                capturedAt: new Date().toISOString(),
                match: isLikelyItemListsUrl(url) ? "item-lists-url" : "commercialItems-json"
              }
            }
          },
          "*"
        );
      } catch (_postErr) {
        // ignore
      }
    } catch (_err) {
      // ignore
    }
  }

  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    try {
      const req = args[0];
      const url =
        typeof req === "string" ? req : req && typeof req.url === "string" ? req.url : "";
      if (shouldAttemptJsonParse(url)) {
        const ct = String(response.headers && response.headers.get ? response.headers.get("content-type") || "" : "").toLowerCase();
        if (ct && !(ct.includes("json") || ct.includes("text/plain") || ct.includes("javascript"))) {
          return response;
        }
        const cloned = response.clone();
        const text = await cloned.text();
        tryProcessResponseText(text, url);
      }
    } catch (_err) {
      // never break page fetch
    }
    return response;
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__divianPlannerInterceptorUrl = typeof url === "string" ? url : "";
    return originalOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener("load", function () {
      try {
        if (shouldAttemptJsonParse(this.__divianPlannerInterceptorUrl) && typeof this.responseText === "string") {
          tryProcessResponseText(this.responseText, this.__divianPlannerInterceptorUrl || "");
        }
      } catch (_err) {
        // ignore
      }
    });
    return originalSend.apply(this, args);
  };
})();
