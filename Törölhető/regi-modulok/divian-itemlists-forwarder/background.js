const DEBUGGER_VERSION = "1.3";

const TARGET_HINT = "item-lists";

const FORWARD_ENDPOINT = "http://localhost/sajat_program/api_fogado.php";

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



function normalizeItems(parsedJson) {

  const sourceList = parsedJson?.commercialItems;

  if (!Array.isArray(sourceList)) {

    return [];

  }



  return sourceList.map((item) => ({

    cikkszam: pickPrimaryCode(item),

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

  params.set("capturedAt", payload.capturedAt ?? "");

  params.set("pageUrl", payload.pageUrl ?? "");

  params.set("requestUrl", payload.requestUrl ?? "");

  params.set("itemCount", String(payload.itemCount ?? 0));

  params.set("items", JSON.stringify(payload.items ?? []));

  params.set("payload", JSON.stringify(payload));

  return params.toString();

}



async function forwardToLocalApi({

  tabId,

  pageUrl,

  requestUrl,

  items,

  commercialItems,
  catalogs,
  totals

}) {

  const payload = {

    source: "divian-debugger-forwarder",

    tabId,

    pageUrl: pageUrl ?? null,

    requestUrl,

    capturedAt: new Date().toISOString(),

    itemCount: items.length,

    // Csak cikkszam + mennyiseg mehet tovabb.
    items: (Array.isArray(items) ? items : [])
      .map((item) => ({
        cikkszam: safeToString(item?.cikkszam),
        mennyiseg: Number(item?.mennyiseg ?? item?.qty ?? item?.quantity ?? 0)
      }))
      .filter((item) => item.cikkszam && Number(item.mennyiseg) > 0)

  };



  try {

    const jsonResponse = await fetch(FORWARD_ENDPOINT, {

      method: "POST",

      headers: {

        "Content-Type": "application/json"

      },

      body: JSON.stringify(payload)

    });

    const jsonText = await jsonResponse.text();

    console.log("[Divian Forwarder] JSON POST sent:", {

      endpoint: FORWARD_ENDPOINT,

      status: jsonResponse.status,

      ok: jsonResponse.ok,

      response: jsonText

    });



    if (jsonResponse.ok) {

      return;

    }



    const formResponse = await fetch(FORWARD_ENDPOINT, {

      method: "POST",

      headers: {

        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"

      },

      body: toFormBody(payload)

    });

    const formText = await formResponse.text();

    console.log("[Divian Forwarder] FORM POST fallback sent:", {

      endpoint: FORWARD_ENDPOINT,

      status: formResponse.status,

      ok: formResponse.ok,

      response: formText

    });

  } catch (error) {

    console.error("[Divian Forwarder] POST failed:", error);

  }

}



chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  if (!message || message.type !== "FORWARD_COMMERCIAL_ITEMS") {

    return;

  }



  const incomingItems = Array.isArray(message?.payload?.items)

    ? message.payload.items

    : [];

  if (!incomingItems.length) {

    sendResponse({ accepted: false, reason: "no-items" });

    return;

  }



  console.log("[Divian Forwarder] Received fallback message:", {

    itemCount: incomingItems.length,

    pageUrl: sender?.url ?? null,

    requestUrl: message?.meta?.url ?? ""

  });



  forwardToLocalApi({

    tabId: sender?.tab?.id ?? null,

    pageUrl: sender?.url ?? null,

    requestUrl: message?.meta?.url ?? "",

    items: incomingItems,

    commercialItems: [],
    catalogs: [],
    totals: []

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

      console.error("[Divian Forwarder] Network.enable failed:", error);

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

      await forwardToLocalApi({

        tabId: source.tabId,

        pageUrl: tab?.url ?? null,

        requestUrl,

        items,

        commercialItems: [],
        catalogs: [],
        totals: []

      });

    } catch (_error) {

      // Ignore parse/network body fetch errors.

    }

  });

} else {

  console.warn(

    "[Divian Forwarder] chrome.debugger API not available, using content-script fallback mode."

  );

}


