const DEBUGGER_VERSION = "1.3";
const TARGET_HINT = "item-lists";

const DEFAULT_SETTINGS = {
  forwardEndpoint: "https://pelda.hu/api/divian-b2c-lead.php",
  apiKey: "",
  customerName: "",
  customerEmail: "",
  customerPhone: "",
  customerNote: ""
};

function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (stored) => {
      resolve({ ...DEFAULT_SETTINGS, ...stored });
    });
  });
}

function buildLead(settings) {
  return {
    nev: settings.customerName || null,
    email: settings.customerEmail || null,
    telefon: settings.customerPhone || null,
    megjegyzes: settings.customerNote || null
  };
}

const hasDebuggerApi =
  typeof chrome !== "undefined" &&
  !!chrome.debugger &&
  !!chrome.debugger.attach &&
  !!chrome.debugger.onEvent;

const attachedTabs = new Set();
const processedRequests = new Set();

function safeToString(value) {
  if (value === null || value === undefined) {
    return null;
  }
  return String(value);
}

function normalizeItems(parsedJson) {
  const sourceList = parsedJson?.commercialItems;
  if (!Array.isArray(sourceList)) {
    return [];
  }

  return sourceList.map((item) => ({
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
}

function toFormBody(payload) {
  const params = new URLSearchParams();
  params.set("source", payload.source ?? "");
  params.set("payloadMode", payload.payloadMode ?? "");
  params.set("capturedAt", payload.capturedAt ?? "");
  params.set("pageUrl", payload.pageUrl ?? "");
  params.set("requestUrl", payload.requestUrl ?? "");
  params.set("itemCount", String(payload.itemCount ?? 0));
  params.set("items", JSON.stringify(payload.items ?? []));
  params.set("vevo", JSON.stringify(payload.vevo ?? {}));
  params.set("payload", JSON.stringify(payload));
  return params.toString();
}

function buildB2cPayload(settings, base) {
  return {
    source: "divian-b2c-lead",
    payloadMode: "minimal-no-pricing",
    vevo: buildLead(settings),
    tabId: base.tabId,
    pageUrl: base.pageUrl ?? null,
    requestUrl: base.requestUrl,
    capturedAt: base.capturedAt,
    itemCount: base.items.length,
    items: base.items,
    commercialItems: [],
    catalogs: [],
    totals: []
  };
}

async function forwardB2c({ tabId, pageUrl, requestUrl, items }) {
  const settings = await getSettings();
  const endpoint = String(settings.forwardEndpoint || "").trim();
  if (!endpoint) {
    console.warn(
      "[Divian B2C] Állítsd be a továbbítási URL-t a bővítmény beállításaiban."
    );
    return;
  }

  const capturedAt = new Date().toISOString();
  const payload = buildB2cPayload(settings, {
    tabId,
    pageUrl,
    requestUrl,
    capturedAt,
    items
  });

  const headers = {
    "Content-Type": "application/json"
  };
  if (settings.apiKey) {
    headers["X-Api-Key"] = settings.apiKey;
  }

  try {
    const jsonResponse = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });
    const jsonText = await jsonResponse.text();
    console.log("[Divian B2C] JSON POST:", {
      endpoint,
      status: jsonResponse.status,
      ok: jsonResponse.ok,
      response: jsonText
    });

    if (jsonResponse.ok) {
      return;
    }

    const formHeaders = {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"
    };
    if (settings.apiKey) {
      formHeaders["X-Api-Key"] = settings.apiKey;
    }

    const formResponse = await fetch(endpoint, {
      method: "POST",
      headers: formHeaders,
      body: toFormBody(payload)
    });
    const formText = await formResponse.text();
    console.log("[Divian B2C] FORM fallback:", {
      endpoint,
      status: formResponse.status,
      ok: formResponse.ok,
      response: formText
    });
  } catch (error) {
    console.error("[Divian B2C] POST failed:", error);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "FORWARD_B2C_LEAD") {
    return;
  }

  const incomingItems = Array.isArray(message?.payload?.items)
    ? message.payload.items
    : [];
  if (!incomingItems.length) {
    sendResponse({ accepted: false, reason: "no-items" });
    return;
  }

  forwardB2c({
    tabId: sender?.tab?.id ?? null,
    pageUrl: sender?.url ?? null,
    requestUrl: message?.meta?.url ?? "",
    items: incomingItems
  }).finally(() => {
    sendResponse({ accepted: true, mode: "content-fallback" });
  });

  return true;
});

function runCommand(target, method, params = {}) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand(target, method, params, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(result);
    });
  });
}

function attachToTab(tabId) {
  if (!hasDebuggerApi) {
    return;
  }

  if (attachedTabs.has(tabId)) {
    return;
  }

  chrome.debugger.attach({ tabId }, DEBUGGER_VERSION, () => {
    if (chrome.runtime.lastError) {
      return;
    }

    attachedTabs.add(tabId);
    runCommand({ tabId }, "Network.enable").catch((error) => {
      console.error("[Divian B2C] Network.enable failed:", error);
    });
  });
}

if (hasDebuggerApi) {
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    const url = changeInfo.url ?? tab?.url ?? "";
    if (typeof url !== "string" || !url.startsWith("http")) {
      return;
    }

    if (
      changeInfo.status === "complete" ||
      typeof changeInfo.url === "string"
    ) {
      attachToTab(tabId);
    }
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    attachedTabs.delete(tabId);
  });

  if (chrome.debugger.onDetach && chrome.debugger.onDetach.addListener) {
    chrome.debugger.onDetach.addListener((source) => {
      if (typeof source?.tabId === "number") {
        attachedTabs.delete(source.tabId);
      }
    });
  }

  chrome.debugger.onEvent.addListener(async (source, method, params) => {
    if (
      method !== "Network.responseReceived" ||
      !source ||
      typeof source.tabId !== "number"
    ) {
      return;
    }

    const response = params?.response;
    const requestId = params?.requestId;
    const requestUrl = response?.url ?? "";

    if (
      typeof requestId !== "string" ||
      typeof requestUrl !== "string" ||
      !requestUrl.includes(TARGET_HINT) ||
      processedRequests.has(requestId)
    ) {
      return;
    }

    processedRequests.add(requestId);
    if (processedRequests.size > 1000) {
      processedRequests.clear();
    }

    try {
      const bodyResult = await runCommand(
        { tabId: source.tabId },
        "Network.getResponseBody",
        { requestId }
      );
      const rawBody = bodyResult?.base64Encoded
        ? atob(bodyResult.body)
        : bodyResult?.body ?? "";
      const parsed = JSON.parse(rawBody);
      const items = normalizeItems(parsed);
      if (!items.length) {
        return;
      }

      const tab = await chrome.tabs.get(source.tabId);
      await forwardB2c({
        tabId: source.tabId,
        pageUrl: tab?.url ?? null,
        requestUrl,
        items
      });
    } catch (_error) {
      // Ignore parse/network body fetch errors.
    }
  });
} else {
  console.warn(
    "[Divian B2C] chrome.debugger nem elérhető – content-script fallback (fetch/XHR) használata."
  );
}
