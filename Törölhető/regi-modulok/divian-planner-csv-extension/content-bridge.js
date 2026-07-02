/* global window, document */

(function installDivianExportBridge() {
  if (window.__divianExportBridgeInstalled) return;
  window.__divianExportBridgeInstalled = true;

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.type !== "DIVIAN_ITEM_LISTS_ROWS") return;

    chrome.runtime.sendMessage(
      {
        type: "AGG_APPEND_ROWS",
        payload: data.payload
      },
      () => {
        const err = chrome.runtime.lastError;
        if (err) {
          // swallow; page must never break
        }
      }
    );
  });
})();
