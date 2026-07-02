window.addEventListener("message", (event) => {
  if (event.source !== window) {
    return;
  }

  const data = event.data;
  if (!data || data.type !== "DIVIAN_COMMERCIAL_ITEMS_CAPTURED") {
    return;
  }

  chrome.runtime.sendMessage({
    type: "FORWARD_COMMERCIAL_ITEMS",
    payload: data.payload,
    meta: data.meta
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.error("[Divian Forwarder] runtime.sendMessage failed:", chrome.runtime.lastError.message);
      return;
    }
    console.log("[Divian Forwarder] Background response:", response);
  });
});
