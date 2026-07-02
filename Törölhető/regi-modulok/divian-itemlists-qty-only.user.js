// ==UserScript==
// @name         Divian item-lists qty-only sync
// @namespace    divian.local
// @version      1.1.0
// @description  Csak cikkszam + mennyiseg szinkron Cyncly -> arajanlat oldalra
// @match        *://*/*
// @match        file:///*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addValueChangeListener
// @run-at       document-start
// ==/UserScript==

(function () {
  "use strict";

  const KEY = "divian_qty_only_payload_v1";
  const TARGET_HINT = "item-lists";
  const SOURCE = "divian-tampermonkey-qty-only";

  function safeString(value) {
    if (value === null || value === undefined) return "";
    return String(value).trim();
  }

  function parseQty(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.max(1, Math.floor(n));
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

  function extractCommercialCode(item) {
    const raw =
      item?.primaryRefCode ??
      item?.articleNumber ??
      item?.refCodes?.manufCode ??
      item?.refCodes?.others?.userCode ??
      item?.refCodes?.others?.cic ??
      item?.sku ??
      item?.itemNumber ??
      item?.name ??
      item?.description ??
      item?.cikkszam;
    let code = safeString(raw);
    if (!code) return "";
    const lead = code.match(/^([A-Za-z]{1,4}[A-Za-z0-9]{1,18})(?:\s*[-·–—]\s*|\s+)/);
    if (lead) code = lead[1];
    code = code.replace(/\s+/g, "").replace(/-+/g, "");
    const m = code.match(/[A-Za-z][A-Za-z0-9_]*/);
    if (!m) return "";
    return normalizeDishwasherFrontCode(m[0]);
  }

  function buildQtyOnlyItems(commercialItems) {
    const qtyByCode = new Map();
    for (const item of commercialItems || []) {
      const code = extractCommercialCode(item);
      const qty = parseQty(item?.quantity ?? item?.mennyiseg ?? item?.qty ?? 1);
      if (!code || !qty) continue;
      const key = code.toLowerCase();
      qtyByCode.set(key, (qtyByCode.get(key) || 0) + qty);
    }
    const out = [];
    for (const [key, qty] of qtyByCode.entries()) {
      out.push({ cikkszam: key.toUpperCase(), mennyiseg: qty });
    }
    return out;
  }

  function isAjanlatPage() {
    return String(location.href || "").toLowerCase().includes("arajanlat.html");
  }

  function isLikelyCynclyPage() {
    const h = String(location.href || "").toLowerCase();
    return h.startsWith("http://") || h.startsWith("https://");
  }

  function emitToCurrentPage(payload) {
    window.postMessage(payload, "*");
  }

  function buildMessage(items, requestUrl) {
    return {
      type: "planner-items",
      source: SOURCE,
      capturedAt: new Date().toISOString(),
      requestUrl: safeString(requestUrl),
      itemCount: items.length,
      items
    };
  }

  async function persistAndBroadcast(items, requestUrl) {
    if (!items.length) return;
    const payload = buildMessage(items, requestUrl);
    try {
      await GM_setValue(KEY, payload);
    } catch (_e) {}
    emitToCurrentPage(payload);
    console.log("[Divian TM qty-only] synced items:", payload.itemCount);
  }

  function tryProcessJsonText(text, requestUrl) {
    if (!text || typeof text !== "string") return;
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (_e) {
      return;
    }
    const commercialItems = Array.isArray(parsed?.commercialItems) ? parsed.commercialItems : [];
    if (!commercialItems.length) return;
    const items = buildQtyOnlyItems(commercialItems);
    persistAndBroadcast(items, requestUrl);
  }

  function installReceiverOnAjanlatPage() {
    GM_addValueChangeListener(KEY, (_name, _oldValue, newValue) => {
      if (!newValue || !Array.isArray(newValue.items)) return;
      emitToCurrentPage(newValue);
    });
    GM_getValue(KEY, null).then((latest) => {
      if (!latest || !Array.isArray(latest.items) || !latest.items.length) return;
      emitToCurrentPage(latest);
    });
  }

  function installCaptureOnCynclyPages() {
    const originalFetch = window.fetch;
    if (typeof originalFetch === "function") {
      window.fetch = async function (...args) {
        const response = await originalFetch.apply(this, args);
        try {
          const req = args[0];
          const requestUrl =
            typeof req === "string" ? req : req && typeof req.url === "string" ? req.url : "";
          if (String(requestUrl).includes(TARGET_HINT)) {
            const cloned = response.clone();
            const text = await cloned.text();
            if (!response.ok) {
              emitToCurrentPage({
                type: "divian-planner-api-error",
                status: response.status,
                url: String(requestUrl).slice(0, 500),
                bodySnippet: text.slice(0, 500),
                capturedAt: new Date().toISOString(),
                source: SOURCE
              });
            } else {
              tryProcessJsonText(text, requestUrl);
            }
          }
        } catch (_e) {}
        return response;
      };
    }

    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      this.__divianUrl = typeof url === "string" ? url : "";
      return originalOpen.call(this, method, url, ...rest);
    };
    XMLHttpRequest.prototype.send = function (...args) {
      this.addEventListener("load", function () {
        try {
          const u = String(this.__divianUrl || "");
          if (!u.includes(TARGET_HINT) || typeof this.responseText !== "string") return;
          const st = Number(this.status) || 0;
          if (st >= 400) {
            emitToCurrentPage({
              type: "divian-planner-api-error",
              status: st,
              url: u.slice(0, 500),
              bodySnippet: String(this.responseText || "").slice(0, 500),
              capturedAt: new Date().toISOString(),
              source: SOURCE
            });
            return;
          }
          tryProcessJsonText(this.responseText, this.__divianUrl);
        } catch (_e) {}
      });
      return originalSend.apply(this, args);
    };
  }

  if (isAjanlatPage()) {
    installReceiverOnAjanlatPage();
  }

  if (isLikelyCynclyPage()) {
    installCaptureOnCynclyPages();
  }
})();
