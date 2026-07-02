window.addEventListener("message", (event) => {
  if (event.source !== window) {
    return;
  }

  const data = event.data;
  if (!data || data.type !== "DIVIAN_B2C_COMMERCIAL_ITEMS_CAPTURED") {
    return;
  }

  chrome.runtime.sendMessage(
    {
      type: "FORWARD_B2C_LEAD",
      payload: data.payload,
      meta: data.meta
    },
    (response) => {
      if (chrome.runtime.lastError) {
        console.error(
          "[Divian B2C] runtime.sendMessage failed:",
          chrome.runtime.lastError.message
        );
        return;
      }
      console.log("[Divian B2C] Background response:", response);
    }
  );
});
