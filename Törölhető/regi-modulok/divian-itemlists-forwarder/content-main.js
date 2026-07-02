(function () {
  if (window.__divianItemListsInterceptorInstalled) {
    return;
  }
  window.__divianItemListsInterceptorInstalled = true;

  const TARGET_HINT = "item-lists";
  const seenPayloadHashes = new Set();

  function isTargetUrl(url) {
    return typeof url === "string" && url.includes(TARGET_HINT);
  }

  function safeToString(value) {
    if (value === null || value === undefined) {
      return null;
    }
    return String(value);
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

  function pickPrimaryCode(item) {
    const raw =
      safeToString(
        item?.primaryRefCode ??
          item?.articleNumber ??
          item?.refCodes?.manufCode ??
          item?.cikkszam ??
          item?.sku ??
          item?.itemNumber
      ) || "";
    const trimmed = raw.trim();
    if (!trimmed) return null;
    return normalizeDishwasherFrontCode(trimmed);
  }

  function isPlannerTransferExcluded(rawCode, rawName) {
    const code = String(rawCode || "")
      .trim()
      .toUpperCase();
    const base = code.split("_")[0].toUpperCase();
    const name = String(rawName || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    if (/^GEN[_-]?/i.test(code) || /^GEN[_-]?/i.test(base)) return true;
    if (/\bminta\b/.test(name) && /\b(mikro|suto|huto|gep|oven|fridge|hood)\b/.test(name)) return true;
    if (base === "MPF" || code.startsWith("MPF_")) return true;
    if (/\bfalipanel\b/.test(name)) return true;
    if (/^LE\d+/.test(base) || /^LE\d+/.test(code)) return true;
    if (/\b(labazat|labelo|toekick|plinth|kickboard)\b/.test(name)) return true;
    if (/^PFL/.test(base) || /^PFL/.test(code)) return true;
    if (/\b(muanyag\s*lab|butorlab)\b/.test(name)) return true;
    if (/^M\d{1,3}$/.test(base) && /\b(lab|labak)\b/.test(name)) return true;
    if (/^(KANFF|LIF)$/i.test(base) || /^(KANFF|LIF)$/i.test(code)) return true;
    if (/^(KANFF|LIF)_/i.test(code)) return true;
    if (/^LTF\d/i.test(base) || /^LTF\d/i.test(code)) return true;
    if (base === "MKP" || code === "MKP" || /^MKP[_-]/i.test(code)) return true;
    if (/\b(kitolto|kitöltő|takaropanel|filler|blokk|omsz)\b/.test(name)) return true;
    return false;
  }

  function toForwardPayload(parsedJson) {
    if (!parsedJson || typeof parsedJson !== "object") {
      return null;
    }

    const commercialItems = parsedJson.commercialItems;
    if (!Array.isArray(commercialItems)) {
      return null;
    }

    const items = commercialItems
      .map((item) => {
        const cikkszam = pickPrimaryCode(item);
        const nev = safeToString(item?.name ?? item?.description ?? item?.label) || "";
        if (isPlannerTransferExcluded(cikkszam, nev)) return null;
        return {
          cikkszam,
          mennyiseg: Number(item?.quantity ?? item?.mennyiseg ?? item?.qty ?? 0)
        };
      })
      .filter((item) => item && item.cikkszam && Number(item.mennyiseg) > 0);

    return {
      source: "divian-item-lists",
      capturedAt: new Date().toISOString(),
      itemCount: items.length,
      // Biztonsagi szures: csak cikkszam + mennyiseg mehet tovabb.
      items
    };
  }

  function emitForwardPayload(payload, meta) {
    window.postMessage(
      {
        type: "DIVIAN_COMMERCIAL_ITEMS_CAPTURED",
        payload,
        meta
      },
      "*"
    );
  }

  function tryProcessResponseText(text, url) {
    if (typeof text !== "string" || text.length === 0) {
      return;
    }

    if (!isTargetUrl(url)) {
      return;
    }

    try {
      const parsed = JSON.parse(text);
      const payload = toForwardPayload(parsed);
      if (payload) {
        const hash = JSON.stringify(payload.items);
        if (seenPayloadHashes.has(hash)) {
          return;
        }
        seenPayloadHashes.add(hash);
        if (seenPayloadHashes.size > 200) {
          seenPayloadHashes.clear();
        }
        console.log("[Divian Forwarder] Captured item-lists payload:", {
          itemCount: payload.itemCount,
          url
        });
        emitForwardPayload(payload, { url });
      }
    } catch (_err) {
      // Not JSON; ignore.
    }
  }

  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);

    try {
      const req = args[0];
      const url =
        typeof req === "string"
          ? req
          : req && typeof req.url === "string"
            ? req.url
            : "";
      if (isTargetUrl(url)) {
        const cloned = response.clone();
        const text = await cloned.text();
        tryProcessResponseText(text, url);
      }
    } catch (_err) {
      // Interception errors should never break page code.
    }

    return response;
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__divianInterceptorUrl = typeof url === "string" ? url : "";
    return originalOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener("load", function () {
      try {
        if (
          isTargetUrl(this.__divianInterceptorUrl) &&
          typeof this.responseText === "string"
        ) {
          tryProcessResponseText(
            this.responseText,
            this.__divianInterceptorUrl || ""
          );
        }
      } catch (_err) {
        // Ignore; do not break XHR flow.
      }
    });
    return originalSend.apply(this, args);
  };
})();
