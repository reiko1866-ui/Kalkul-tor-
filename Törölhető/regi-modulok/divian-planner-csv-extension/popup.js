const statusEl = document.getElementById("status");
const btnTotal = document.getElementById("btnTotal");
const btnSnapshot = document.getElementById("btnSnapshot");
const btnReset = document.getElementById("btnReset");

function setStatus(text) {
  statusEl.textContent = text || "";
}

async function refreshStatus() {
  try {
    const res = await chrome.runtime.sendMessage({ type: "AGG_STATUS" });
    if (!res || res.ok === false) {
      setStatus("Státusz nem elérhető.");
      return;
    }
    setStatus(
      "Összesített cikkszámok: " +
        res.uniqueCount +
        " • összes mennyiség: " +
        res.totalQty +
        (res.lastSnapshotRows ? " • utolsó pillanatkép sorok: " + res.lastSnapshotRows : "")
    );
  } catch (e) {
    setStatus("Hiba: " + (e && e.message ? e.message : String(e)));
  }
}

async function download(mode) {
  try {
    const res = await chrome.runtime.sendMessage({ type: "AGG_DOWNLOAD_XLSX", mode });
    if (!res || res.ok === false) {
      window.alert(res && res.reason === "empty" ? "Még nincs gyűjtött adat. Nyisd meg a terméklistát és várj pár másodpercet." : "Letöltés sikertelen.");
      return;
    }
    await refreshStatus();
  } catch (e) {
    window.alert("Hiba: " + (e && e.message ? e.message : String(e)));
  }
}

btnTotal.addEventListener("click", async () => {
  await download("total");
});

btnSnapshot.addEventListener("click", async () => {
  await download("snapshot");
});

btnReset.addEventListener("click", async () => {
  try {
    await chrome.runtime.sendMessage({ type: "AGG_RESET" });
    await refreshStatus();
  } catch (e) {
    window.alert("Hiba: " + (e && e.message ? e.message : String(e)));
  }
});

refreshStatus();
window.setInterval(refreshStatus, 1500);
