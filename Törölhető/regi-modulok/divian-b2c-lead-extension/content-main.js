(function () {
  if (window.__divianB2cItemListsInterceptorInstalled) {
    return;
  }
  window.__divianB2cItemListsInterceptorInstalled = true;

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

  function toForwardPayload(parsedJson) {
    if (!parsedJson || typeof parsedJson !== "object") {
      return null;
    }

    const commercialItems = parsedJson.commercialItems;
    if (!Array.isArray(commercialItems)) {
      return null;
    }

    const items = commercialItems.map((item) => ({
      cikkszam: safeToString(
        item?.primaryRefCode ??
          item?.articleNumber ??
          item?.refCodes?.manufCode ??
          item?.cikkszam ??
          item?.sku ??
          item?.itemNumber
      ),
      nev: safeToString(
        item?.name ??
          item?.nev ??
          item?.description ??
          item?.label ??
          item?.refCodes?.others?.userCode ??
          item?.refCodes?.others?.cic ??
          item?.refCodes?.manufCode
      ),
      mennyiseg: Number(item?.quantity ?? item?.mennyiseg ?? item?.qty ?? 0)
    }));

    return {
      source: "divian-b2c-item-lists",
      capturedAt: new Date().toISOString(),
      itemCount: items.length,
      items
    };
  }

  function emitForwardPayload(payload, meta) {
    window.postMessage(
      {
        type: "DIVIAN_B2C_COMMERCIAL_ITEMS_CAPTURED",
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
        console.log("[Divian B2C] Captured item-lists (minimal):", {
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
    this.__divianB2cInterceptorUrl = typeof url === "string" ? url : "";
    return originalOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener("load", function () {
      try {
        if (
          isTargetUrl(this.__divianB2cInterceptorUrl) &&
          typeof this.responseText === "string"
        ) {
          tryProcessResponseText(
            this.responseText,
            this.__divianB2cInterceptorUrl || ""
          );
        }
      } catch (_err) {
        // Ignore; do not break XHR flow.
      }
    });
    return originalSend.apply(this, args);
  };
})();
