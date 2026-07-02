/**
 * Mentett megrendelők mappa — listázás, olvasás (asztal/Mentett megrendelők).
 * Almappa: {Vevőnév} — {sorszám} / {sorszám}_megrendelo.pdf, .json, _szallitolevel.pdf
 */
const fs = require("fs");
const fsPromises = require("fs/promises");
const path = require("path");
const os = require("os");
const {
  sanitizePathSegment,
  sanitizeFileName,
  resolveOrderSaveTarget,
  resolveOrderSaveTargetAsync
} = require("./divian-order-folder");

const DESKTOP_DIR = path.join(process.env.USERPROFILE || os.homedir(), "Desktop");
const ORDER_SAVE_DIR = process.env.DIVIAN_ORDER_SAVE_DIR
  ? path.resolve(String(process.env.DIVIAN_ORDER_SAVE_DIR))
  : path.join(DESKTOP_DIR, "Mentett megrendelők");
const QUOTE_EXCEL_DIR = process.env.DIVIAN_QUOTE_EXCEL_DIR
  ? path.resolve(String(process.env.DIVIAN_QUOTE_EXCEL_DIR))
  : path.join(DESKTOP_DIR, "Megrendelőlap Excel");

function quoteNumberLookupCandidates(quoteNumberOrText) {
  const text = String(quoteNumberOrText || "").trim();
  const out = new Set();
  if (!text) return [];
  const m = text.match(/MRDH-([A-Z]+)-(\d{2})-(\d+)/i);
  if (m) {
    const prefix = "MRDH-" + m[1].toUpperCase() + "-" + m[2];
    const seqRaw = String(m[3] || "").trim();
    const seqNum = Number(seqRaw);
    if (Number.isFinite(seqNum)) {
      out.add(prefix + "-" + String(seqNum).padStart(4, "0"));
      out.add(prefix + "-" + String(seqNum));
    }
    if (seqRaw) out.add(prefix + "-" + seqRaw);
  }
  if (/^MRDH-/i.test(text)) out.add(text);
  return Array.from(out);
}

function resolveSafeOrderRelativePath(relativePath) {
  const base = path.resolve(ORDER_SAVE_DIR);
  const segments = String(relativePath || "")
    .split(/[/\\]/)
    .filter(Boolean);
  if (!segments.length) return null;
  const safeSegments = segments.map((seg, i) => {
    if (i === segments.length - 1) return sanitizeFileName(seg, "x.json");
    return sanitizePathSegment(seg, 120);
  });
  const target = path.resolve(base, ...safeSegments);
  const rel = path.relative(base, target);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return { target, relative: rel.split(path.sep).join("/") };
}

function ingestOrderSaveFile(rowsMap, relativePath, fileName, mtimeMs) {
  const lower = String(fileName || "").toLowerCase();
  const rel = String(relativePath || fileName || "").replace(/\\/g, "/");
  const folder =
    rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : null;
  const touch = (quote, patch) => {
    const key = String(quote || "").trim();
    if (!key) return;
    const prev = rowsMap.get(key) || {
      quoteNumber: key,
      hasPdf: false,
      hasExcel: false,
      hasDeliveryNotePdf: false,
      orderJsonFile: null,
      editableJsonFile: null,
      megrendeloPdfFile: null,
      orderFolder: null,
      mtimeMs: 0
    };
    const next = { ...prev, ...patch };
    if (patch.mtimeMs != null) {
      next.mtimeMs = Math.max(prev.mtimeMs || 0, patch.mtimeMs);
    }
    if (folder && !next.orderFolder) next.orderFolder = folder;
    rowsMap.set(key, next);
  };
  if (lower.endsWith("_megrendelo.pdf")) {
    const q = fileName.replace(/_megrendelo\.pdf$/i, "");
    touch(q, { hasPdf: true, megrendeloPdfFile: rel, mtimeMs });
  } else if (lower.endsWith("_szallitolevel.pdf")) {
    const q = fileName.replace(/_szallitolevel\.pdf$/i, "");
    if (/^MRDH-/i.test(q)) touch(q, { hasDeliveryNotePdf: true, mtimeMs });
  } else if (lower.endsWith("_megrendelo.json")) {
    const q = fileName.replace(/_megrendelo\.json$/i, "");
    touch(q, { orderJsonFile: rel, mtimeMs });
  } else if (/^MRDH-/i.test(fileName) && lower.endsWith(".json")) {
    const q = fileName.replace(/\.json$/i, "");
    touch(q, { editableJsonFile: rel, mtimeMs });
  } else if (lower.endsWith("_megrendelo.xlsx")) {
    const q = fileName.replace(/_megrendelo\.xlsx$/i, "");
    touch(q, { hasExcel: true, mtimeMs });
  }
}

async function listOrderSaveFileEntries() {
  await fsPromises.mkdir(ORDER_SAVE_DIR, { recursive: true });
  const names = await fsPromises.readdir(ORDER_SAVE_DIR);
  const out = [];
  for (const name of names) {
    const full = path.join(ORDER_SAVE_DIR, name);
    let st;
    try {
      st = await fsPromises.stat(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      let inner = [];
      try {
        inner = await fsPromises.readdir(full);
      } catch {
        continue;
      }
      for (const fileName of inner) {
        const innerFull = path.join(full, fileName);
        let ist;
        try {
          ist = await fsPromises.stat(innerFull);
        } catch {
          continue;
        }
        if (!ist.isFile()) continue;
        out.push({
          relativePath: name + "/" + fileName,
          fileName,
          mtimeMs: ist.mtimeMs || 0
        });
      }
    } else if (st.isFile()) {
      out.push({ relativePath: name, fileName: name, mtimeMs: st.mtimeMs || 0 });
    }
  }
  return out;
}

function compareOrderSaveRows(a, b) {
  const byMtime = (b.mtimeMs || 0) - (a.mtimeMs || 0);
  if (byMtime !== 0) return byMtime;
  return String(b.quoteNumber || "").localeCompare(String(a.quoteNumber || ""), "hu");
}

async function scanOrderSaveDir() {
  const rowsMap = new Map();
  const entries = await listOrderSaveFileEntries();
  for (const ent of entries) {
    ingestOrderSaveFile(rowsMap, ent.relativePath, ent.fileName, ent.mtimeMs);
  }
  await fsPromises.mkdir(QUOTE_EXCEL_DIR, { recursive: true });
  let excelNames = [];
  try {
    excelNames = await fsPromises.readdir(QUOTE_EXCEL_DIR);
  } catch (_excelDirErr) {
    excelNames = [];
  }
  for (const name of excelNames) {
    const lower = name.toLowerCase();
    if (!lower.endsWith("_megrendelo.xlsx")) continue;
    const full = path.join(QUOTE_EXCEL_DIR, name);
    let st;
    try {
      st = await fsPromises.stat(full);
    } catch {
      continue;
    }
    const q = name.replace(/_megrendelo\.xlsx$/i, "");
    const key = String(q || "").trim();
    if (!key) continue;
    const prev = rowsMap.get(key) || {
      quoteNumber: key,
      hasPdf: false,
      hasExcel: false,
      hasDeliveryNotePdf: false,
      orderJsonFile: null,
      editableJsonFile: null,
      orderFolder: null,
      mtimeMs: 0
    };
    rowsMap.set(key, {
      ...prev,
      hasExcel: true,
      mtimeMs: Math.max(prev.mtimeMs || 0, st.mtimeMs || 0)
    });
  }
  return Array.from(rowsMap.values()).sort(compareOrderSaveRows);
}

function customerNameFromOrderFolder(folder) {
  const seg = String(folder || "").trim();
  const m = seg.match(/^(.+?)\s*[—–-]\s*MRDH-/i);
  return m && m[1] ? m[1].trim() : "";
}

function pickCustomerFromPayload(parsed) {
  if (!parsed || typeof parsed !== "object") return "";
  const c = parsed.customer || parsed.vevo || {};
  return String(c.name || c.nev || parsed.customerName || "").trim();
}

function pickQuoteDateFromPayload(parsed) {
  if (!parsed || typeof parsed !== "object") return "";
  return String(
    parsed.quoteDate || parsed.megrendeles?.datum || parsed.meta?.quoteDate || ""
  ).trim();
}

async function enrichOrderRow(row) {
  const base = row && typeof row === "object" ? { ...row } : {};
  let customerName = customerNameFromOrderFolder(base.orderFolder);
  let quoteDate = "";
  const jsonFile = base.editableJsonFile || base.orderJsonFile;
  if (jsonFile) {
    const hit = resolveSafeOrderRelativePath(jsonFile);
    if (hit) {
      try {
        const jsonText = await fsPromises.readFile(hit.target, "utf8");
        const parsed = JSON.parse(jsonText);
        if (!customerName) customerName = pickCustomerFromPayload(parsed);
        quoteDate = pickQuoteDateFromPayload(parsed);
      } catch (_e) {}
    }
  }
  return Object.assign(base, {
    customerName,
    quoteDate,
    savedAt: base.mtimeMs ? new Date(base.mtimeMs).toISOString() : ""
  });
}

async function scanOrderSaveDirEnriched() {
  const rows = await scanOrderSaveDir();
  const out = [];
  for (const row of rows) {
    out.push(await enrichOrderRow(row));
  }
  return out.sort((a, b) => {
    const byDate = String(b.quoteDate || "").localeCompare(String(a.quoteDate || ""));
    if (byDate !== 0) return byDate;
    return compareOrderSaveRows(a, b);
  });
}

async function readOrderSaveFile(fileName) {
  const rawName = String(fileName || "").trim();
  if (!rawName) return { ok: false, error: "missing fileName" };
  const resolved = resolveSafeOrderRelativePath(rawName);
  if (!resolved) return { ok: false, error: "invalid path" };
  try {
    const jsonText = await fsPromises.readFile(resolved.target, "utf8");
    return { ok: true, jsonText, fileName: resolved.relative };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

async function findQuoteJsonRelativePath(candidates) {
  const entries = await listOrderSaveFileEntries();
  const byName = new Map(entries.map((e) => [e.fileName, e.relativePath]));
  for (const cand of candidates) {
    const jsonName = cand + ".json";
    if (byName.has(jsonName)) return byName.get(jsonName);
  }
  const rows = await scanOrderSaveDir();
  for (const cand of candidates) {
    const row = (rows || []).find((r) => String(r?.quoteNumber || "").trim() === cand);
    if (!row) continue;
    for (const jf of [row.editableJsonFile, row.orderJsonFile].filter(Boolean)) {
      const hit = resolveSafeOrderRelativePath(jf);
      if (!hit) continue;
      try {
        await fsPromises.access(hit.target);
        return hit.relative;
      } catch (_e) {}
    }
  }
  return null;
}

async function resolveQuoteJsonFromDisk(quoteNumberOrText) {
  const candidates = quoteNumberLookupCandidates(quoteNumberOrText);
  if (!candidates.length) return null;
  const rel = await findQuoteJsonRelativePath(candidates);
  if (!rel) return null;
  const hit = resolveSafeOrderRelativePath(rel);
  if (!hit) return null;
  try {
    const jsonText = await fsPromises.readFile(hit.target, "utf8");
    const cand =
      candidates.find((c) => rel.endsWith(c + ".json")) ||
      candidates[0];
    return { quoteNumber: cand, fileName: hit.relative, jsonText };
  } catch (_e) {
    return null;
  }
}

async function findQuotePdfRelativePath(candidates) {
  const entries = await listOrderSaveFileEntries();
  const byName = new Map(entries.map((e) => [String(e.fileName || "").toLowerCase(), e.relativePath]));
  for (const cand of candidates) {
    const pdfName = cand + "_megrendelo.pdf";
    const rel = byName.get(pdfName.toLowerCase());
    if (rel) {
      const orderFolder = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : null;
      return { relative: rel, quoteNumber: cand, orderFolder };
    }
  }
  const rows = await scanOrderSaveDir();
  for (const cand of candidates) {
    const row = (rows || []).find((r) => String(r?.quoteNumber || "").trim() === cand);
    if (!row || !row.megrendeloPdfFile) continue;
    return { relative: row.megrendeloPdfFile, quoteNumber: cand, orderFolder: row.orderFolder || null };
  }
  return null;
}

async function resolveQuotePdfFromDisk(quoteNumberOrText) {
  const candidates = quoteNumberLookupCandidates(quoteNumberOrText);
  if (!candidates.length) return null;
  const hit = await findQuotePdfRelativePath(candidates);
  if (!hit) return null;
  const safe = resolveSafeOrderRelativePath(hit.relative);
  if (!safe) return null;
  try {
    const data = await fsPromises.readFile(safe.target);
    const cand = candidates.find((c) => safe.relative.endsWith(c + "_megrendelo.pdf")) || candidates[0];
    return {
      quoteNumber: cand,
      fileName: safe.relative,
      orderFolder: hit.orderFolder || null,
      byteLength: data.length
    };
  } catch (_e) {
    return null;
  }
}

async function readOrderSavePdfBuffer(quoteNumberOrText) {
  const hit = await resolveQuotePdfFromDisk(quoteNumberOrText);
  if (!hit) return { ok: false, error: "pdf-not-found" };
  const safe = resolveSafeOrderRelativePath(hit.fileName);
  if (!safe) return { ok: false, error: "invalid path" };
  try {
    const data = await fsPromises.readFile(safe.target);
    return {
      ok: true,
      quoteNumber: hit.quoteNumber,
      fileName: hit.fileName,
      orderFolder: hit.orderFolder || null,
      buffer: data,
      byteLength: data.length
    };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

function normalizeSaveOrderArgs(arg1, arg2) {
  if (arg1 && typeof arg1 === "object" && (arg1.fileName != null || arg1.jsonText != null)) {
    return arg1;
  }
  return { fileName: arg1, jsonText: arg2 };
}

async function saveOrderJsonToDesktop(arg1, arg2) {
  const opts = normalizeSaveOrderArgs(arg1, arg2);
  const safeFileName = sanitizeFileName(String(opts.fileName || "megrendeles.json"), "megrendeles.json");
  const finalName = safeFileName.toLowerCase().endsWith(".json") ? safeFileName : safeFileName + ".json";
  let jsonText = String(opts.jsonText || "");
  try {
    const parsed = JSON.parse(jsonText);
    if (parsed && typeof parsed === "object") {
      const today = new Date();
      const month = String(today.getMonth() + 1).padStart(2, "0");
      const day = String(today.getDate()).padStart(2, "0");
      parsed.quoteDate = today.getFullYear() + "-" + month + "-" + day;
      if (parsed.megrendeles && typeof parsed.megrendeles === "object") {
        parsed.megrendeles.datum = parsed.quoteDate;
      }
      jsonText = JSON.stringify(parsed, null, 2);
    }
  } catch (_dateErr) {
    /* eredeti szöveg marad */
  }
  const target = await resolveOrderSaveTargetAsync(ORDER_SAVE_DIR, {
    fileName: finalName,
    customerName: opts.customerName,
    quoteNumber: opts.quoteNumber
  });
  await fsPromises.mkdir(target.dir, { recursive: true });
  const fullPath = path.join(target.dir, finalName);
  await fsPromises.writeFile(fullPath, jsonText, "utf8");
  return fullPath;
}

module.exports = {
  ORDER_SAVE_DIR,
  QUOTE_EXCEL_DIR,
  sanitizeFileName,
  scanOrderSaveDir,
  scanOrderSaveDirEnriched,
  enrichOrderRow,
  readOrderSaveFile,
  resolveQuoteJsonFromDisk,
  findQuotePdfRelativePath,
  resolveQuotePdfFromDisk,
  readOrderSavePdfBuffer,
  saveOrderJsonToDesktop,
  resolveOrderSaveTarget,
  resolveOrderSaveTargetAsync
};
