/**
 * Felmérés várólista — felmeresek_varolista.json olvasás/írás.
 */
const fs = require("fs");
const fsPromises = require("fs/promises");
const path = require("path");
const os = require("os");

const DATA_DIR = process.env.DIVIAN_DATA_DIR
  ? path.resolve(String(process.env.DIVIAN_DATA_DIR))
  : path.join(process.env.USERPROFILE || os.homedir(), "Desktop", "Mentett megrendelők");

const QUEUE_FILE = path.join(DATA_DIR, "felmeresek_varolista.json");

function felmeresEntryTimestamp(row) {
  const t = row?.updatedAt || row?.savedAt || row?.requestedAt || "";
  const parsed = Date.parse(String(t));
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Egy sorszámhoz egy sor — a legfrissebb marad. */
function dedupeFelmeresQueue(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const byQuote = new Map();
  const noQuote = [];
  list.forEach((row) => {
    if (!row || typeof row !== "object") return;
    const qn = String(row.quoteNumber || "").trim();
    if (qn) {
      const prev = byQuote.get(qn);
      if (!prev || felmeresEntryTimestamp(row) >= felmeresEntryTimestamp(prev)) {
        byQuote.set(qn, row);
      }
      return;
    }
    noQuote.push(row);
  });
  const seenIds = new Set();
  const out = Array.from(byQuote.values());
  out.forEach((r) => {
    if (r?.id) seenIds.add(String(r.id));
  });
  noQuote.forEach((row) => {
    const id = String(row?.id || "");
    if (id && seenIds.has(id)) return;
    if (id) seenIds.add(id);
    out.push(row);
  });
  return out;
}

async function ensureDataDir() {
  await fsPromises.mkdir(DATA_DIR, { recursive: true });
}

async function readFelmeresQueue() {
  await ensureDataDir();
  try {
    const raw = await fsPromises.readFile(QUEUE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : [];
    const deduped = dedupeFelmeresQueue(list);
    if (deduped.length !== list.length) {
      await writeFelmeresQueue(deduped);
    }
    return deduped;
  } catch (err) {
    if (err && err.code === "ENOENT") return [];
    throw err;
  }
}

async function writeFelmeresQueue(rows) {
  await ensureDataDir();
  const list = dedupeFelmeresQueue(Array.isArray(rows) ? rows : []);
  await fsPromises.writeFile(QUEUE_FILE, JSON.stringify(list, null, 2), "utf8");
  return { ok: true, file: QUEUE_FILE, count: list.length };
}

async function appendFelmeresEntry(entry) {
  const rows = dedupeFelmeresQueue(await readFelmeresQueue());
  const now = new Date().toISOString();
  const qn = String(entry?.quoteNumber || "").trim();
  const patch = entry && typeof entry === "object" ? entry : {};
  let item;
  let updated = false;
  if (qn) {
    const idx = rows.findIndex((r) => String(r?.quoteNumber || "").trim() === qn);
    if (idx >= 0) {
      item = Object.assign({}, rows[idx], patch, {
        updatedAt: now,
        requestedAt: rows[idx].requestedAt || now,
        savedAt: rows[idx].savedAt || now
      });
      rows[idx] = item;
      updated = true;
    }
  }
  if (!item) {
    item = Object.assign(
      {
        id: "fm-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8),
        status: "open",
        requestedAt: now,
        savedAt: now
      },
      patch
    );
    rows.push(item);
  }
  await writeFelmeresQueue(rows);
  return { ok: true, entry: item, file: QUEUE_FILE, updated };
}

async function updateFelmeresEntry(id, patch) {
  const key = String(id || "").trim();
  if (!key) return { ok: false, error: "missing-id" };
  const rows = await readFelmeresQueue();
  const idx = rows.findIndex((r) => String(r?.id || "") === key);
  if (idx < 0) return { ok: false, error: "not-found" };
  rows[idx] = Object.assign({}, rows[idx], patch && typeof patch === "object" ? patch : {}, {
    updatedAt: new Date().toISOString()
  });
  await writeFelmeresQueue(rows);
  return { ok: true, entry: rows[idx], file: QUEUE_FILE };
}

async function deleteFelmeresEntry(id) {
  const key = String(id || "").trim();
  if (!key) return { ok: false, error: "missing-id" };
  const rows = await readFelmeresQueue();
  const next = rows.filter((r) => String(r?.id || "") !== key);
  if (next.length === rows.length) return { ok: false, error: "not-found" };
  await writeFelmeresQueue(next);
  return { ok: true, file: QUEUE_FILE };
}

module.exports = {
  DATA_DIR,
  QUEUE_FILE,
  readFelmeresQueue,
  writeFelmeresQueue,
  appendFelmeresEntry,
  updateFelmeresEntry,
  deleteFelmeresEntry,
  dedupeFelmeresQueue
};
