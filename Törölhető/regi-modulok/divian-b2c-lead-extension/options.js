const DEFAULTS = {
  forwardEndpoint: "https://pelda.hu/api/divian-b2c-lead.php",
  apiKey: "",
  customerName: "",
  customerEmail: "",
  customerPhone: "",
  customerNote: ""
};

function $(id) {
  return document.getElementById(id);
}

function load() {
  chrome.storage.sync.get(DEFAULTS, (stored) => {
    $("forwardEndpoint").value = stored.forwardEndpoint ?? DEFAULTS.forwardEndpoint;
    $("apiKey").value = stored.apiKey ?? "";
    $("customerName").value = stored.customerName ?? "";
    $("customerEmail").value = stored.customerEmail ?? "";
    $("customerPhone").value = stored.customerPhone ?? "";
    $("customerNote").value = stored.customerNote ?? "";
  });
}

function save() {
  const payload = {
    forwardEndpoint:
      String($("forwardEndpoint").value || "").trim() || DEFAULTS.forwardEndpoint,
    apiKey: String($("apiKey").value || "").trim(),
    customerName: String($("customerName").value || "").trim(),
    customerEmail: String($("customerEmail").value || "").trim(),
    customerPhone: String($("customerPhone").value || "").trim(),
    customerNote: String($("customerNote").value || "").trim()
  };

  chrome.storage.sync.set(payload, () => {
    const err = chrome.runtime.lastError;
    const status = $("status");
    if (err) {
      status.textContent = "Hiba: " + err.message;
      return;
    }
    status.textContent = "Elmentve.";
    setTimeout(() => {
      status.textContent = "";
    }, 2500);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  load();
  $("save").addEventListener("click", save);
});
