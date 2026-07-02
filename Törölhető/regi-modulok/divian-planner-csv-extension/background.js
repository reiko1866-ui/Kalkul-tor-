/* global importScripts, chrome, btoa */

importScripts("vendor/xlsx.full.min.js");

const STORAGE_KEY = "divian_agg_items_v1";

function nowIso() {
  return new Date().toISOString();
}

function formatHuDateTime(iso) {
  const raw = String(iso || "").trim();
  if (!raw) return "";
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return raw;
  try {
    return new Intl.DateTimeFormat("hu-HU", {
      timeZone: "Europe/Budapest",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }).format(d);
  } catch (_e) {
    return d.toLocaleString("hu-HU");
  }
}

function summarizeUrl(fullUrl) {
  const raw = String(fullUrl || "").trim();
  if (!raw) return "";
  try {
    const u = new URL(raw);
    const base = u.origin + u.pathname;
    const q = u.search ? u.search : "";
    if (!q) return base;
    if (q.length <= 120) return base + q;
    return base + q.slice(0, 120) + "…";
  } catch (_e) {
    if (raw.length <= 140) return raw;
    return raw.slice(0, 140) + "…";
  }
}

async function loadAggMap() {
  const raw = await chrome.storage.local.get(STORAGE_KEY);
  const obj = raw && raw[STORAGE_KEY] && typeof raw[STORAGE_KEY] === "object" ? raw[STORAGE_KEY] : {};
  return obj;
}

async function saveAggMap(map) {
  await chrome.storage.local.set({ [STORAGE_KEY]: map });
}

function scoreSnapshot(rows) {
  if (!Array.isArray(rows) || !rows.length) return 0;
  const unique = new Set(rows.map((r) => String(r.code || "").toLowerCase()).filter(Boolean)).size;
  return rows.length * 1000 + unique;
}

async function appendRows({ rows, meta }) {
  if (!Array.isArray(rows) || !rows.length) {
    return { ok: false, reason: "no-rows" };
  }

  const incomingScore = scoreSnapshot(rows);
  const map = await loadAggMap();

  const prevSnapshot = Array.isArray(map.__lastSnapshotRows) ? map.__lastSnapshotRows : [];
  const prevScore = Number(map.__lastSnapshotScore || 0);

  const shouldReplaceSnapshot = incomingScore >= prevScore || !prevSnapshot.length;

  if (shouldReplaceSnapshot) {
    map.__lastSnapshotRows = rows.map((r) => ({
      code: String(r.code || "").trim(),
      qty: Math.max(0, Math.floor(Number(r.qty) || 0))
    }));
    map.__lastSnapshotScore = incomingScore;
    map.__lastSnapshotAt = nowIso();
    map.__lastSnapshotUrl = meta && meta.url ? String(meta.url) : "";
  }

  rows.forEach((r) => {
    const code = String(r.code || "").trim();
    if (!code) return;
    const qty = Math.max(0, Math.floor(Number(r.qty) || 0));
    if (!qty) return;
    const key = code.toLowerCase();
    const existing = map[key];
    if (!existing) {
      map[key] = {
        code,
        qty,
        firstSeenAt: nowIso(),
        lastSeenAt: nowIso(),
        lastUrl: meta && meta.url ? String(meta.url) : ""
      };
      return;
    }
    existing.qty += qty;
    existing.lastSeenAt = nowIso();
    if (meta && meta.url) existing.lastUrl = String(meta.url);
  });

  map.__updatedAt = nowIso();
  await saveAggMap(map);

  const uniqueCount = Object.keys(map).filter((k) => !k.startsWith("__")).length;
  return { ok: true, uniqueCount, snapshotRows: map.__lastSnapshotRows?.length || 0 };
}

async function resetAgg() {
  await chrome.storage.local.remove(STORAGE_KEY);
  return { ok: true };
}

async function getStatus() {
  const map = await loadAggMap();
  const keys = Object.keys(map).filter((k) => !k.startsWith("__"));
  let totalQty = 0;
  keys.forEach((k) => {
    totalQty += Math.max(0, Math.floor(Number(map[k]?.qty) || 0));
  });
  return {
    ok: true,
    uniqueCount: keys.length,
    totalQty,
    updatedAt: map.__updatedAt || "",
    lastSnapshotAt: map.__lastSnapshotAt || "",
    lastSnapshotRows: map.__lastSnapshotRows?.length || 0
  };
}

function rowsFromAggMap(map) {
  return Object.keys(map)
    .filter((k) => !k.startsWith("__"))
    .map((k) => map[k])
    .filter((r) => r && r.code)
    .map((r) => ({
      Cikkszám: r.code,
      Mennyiség: Math.max(0, Math.floor(Number(r.qty) || 0)),
      Utolsó: formatHuDateTime(r.lastSeenAt),
      Forrás: summarizeUrl(r.lastUrl),
      Forrás_URL: r.lastUrl || ""
    }))
    .sort((a, b) => String(a.Cikkszám).localeCompare(String(b.Cikkszám), "hu"));
}

function rowsFromLastSnapshot(map) {
  const snap = Array.isArray(map.__lastSnapshotRows) ? map.__lastSnapshotRows : [];
  if (!snap.length) return rowsFromAggMap(map);
  return snap
    .filter((r) => r && r.code)
    .map((r) => ({
      Cikkszám: r.code,
      Mennyiség: Math.max(0, Math.floor(Number(r.qty) || 0)),
      Pillanatkép: formatHuDateTime(map.__lastSnapshotAt),
      Forrás: summarizeUrl(map.__lastSnapshotUrl),
      Forrás_URL: map.__lastSnapshotUrl || ""
    }))
    .sort((a, b) => String(a.Cikkszám).localeCompare(String(b.Cikkszám), "hu"));
}

async function downloadXlsx(mode) {
  const map = await loadAggMap();
  const rows = mode === "snapshot" ? rowsFromLastSnapshot(map) : rowsFromAggMap(map);
  if (!rows.length) {
    return { ok: false, reason: "empty" };
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  const keys = Object.keys(rows[0] || {});
  ws["!cols"] = keys.map((k) => {
    const key = String(k);
    if (key === "Mennyiség") return { wch: 12 };
    if (key === "Utolsó" || key === "Pillanatkép") return { wch: 22 };
    if (key === "Forrás") return { wch: 90 };
    if (key.includes("URL")) return { wch: 36 };
    return { wch: 18 };
  });
  XLSX.utils.book_append_sheet(wb, ws, "Osszesitett");

  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const bytes = new Uint8Array(out);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  const base64 = btoa(binary);
  const dataUrl = "data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64," + base64;

  const filename =
    mode === "snapshot"
      ? "divian_itemlists_pillanatkep.xlsx"
      : "divian_osszesitett_termekek.xlsx";

  await chrome.downloads.download({ url: dataUrl, filename, saveAs: true });
  return { ok: true, rows: rows.length, mode };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message.type !== "string") return;

  if (message.type === "AGG_APPEND_ROWS") {
    appendRows(message.payload || {})
      .then((r) => sendResponse(r))
      .catch((e) => sendResponse({ ok: false, error: String(e && e.message ? e.message : e) }));
    return true;
  }

  if (message.type === "AGG_STATUS") {
    getStatus()
      .then((r) => sendResponse(r))
      .catch((e) => sendResponse({ ok: false, error: String(e && e.message ? e.message : e) }));
    return true;
  }

  if (message.type === "AGG_RESET") {
    resetAgg()
      .then((r) => sendResponse(r))
      .catch((e) => sendResponse({ ok: false, error: String(e && e.message ? e.message : e) }));
    return true;
  }

  if (message.type === "AGG_DOWNLOAD_XLSX") {
    downloadXlsx(message.mode === "snapshot" ? "snapshot" : "total")
      .then((r) => sendResponse(r))
      .catch((e) => sendResponse({ ok: false, error: String(e && e.message ? e.message : e) }));
    return true;
  }

  return false;
});
