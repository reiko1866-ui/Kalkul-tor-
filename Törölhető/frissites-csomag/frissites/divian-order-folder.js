/**
 * Megrendelés mappa: Mentett megrendelők / {Vevőnév} — {sorszám} /
 * Ugyanahhoz a sorszámhoz tartozó PDF/JSON/Excel egy mappában.
 */
const fsPromises = require("fs/promises");
const path = require("path");

function sanitizePathSegment(text, maxLen) {
  const n = maxLen == null ? 80 : maxLen;
  const s = String(text || "")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\.+$/g, "")
    .trim()
    .slice(0, n);
  return s || "Ismeretlen";
}

function sanitizeFileName(fileName, fallbackName) {
  const safeFileName = String(fileName || fallbackName)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .trim();
  return safeFileName || fallbackName;
}

function extractQuoteNumberFromFileName(fileName) {
  const base = String(fileName || "").trim();
  if (!base) return "";
  const m = base.match(/^(MRDH-[^._]+)/i);
  if (m) return m[1];
  return base.replace(/_(megrendelo|szallitolevel|dijbekero)\.(pdf|xlsx|json)$/i, "").replace(/\.json$/i, "");
}

function buildOrderFolderName(customerName, quoteNumber) {
  const name = sanitizePathSegment(customerName, 56);
  const q = sanitizePathSegment(quoteNumber, 48);
  if (q && name && name !== "Ismeretlen") return name + " — " + q;
  if (q) return q;
  return name;
}

function resolveOrderFolder(baseDir, customerName, quoteNumber) {
  const folderName = buildOrderFolderName(customerName, quoteNumber);
  return path.join(String(baseDir || ""), folderName);
}

function quoteNumberMatchesFolder(folderName, quoteNumber) {
  const folder = String(folderName || "").trim();
  const q = String(quoteNumber || "").trim();
  if (!folder || !q) return false;
  if (folder === q) return true;
  return folder.endsWith(" — " + q) || folder.endsWith(" - " + q);
}

async function findOrderFolderByQuoteNumber(baseDir, quoteNumber) {
  const q = String(quoteNumber || "").trim();
  if (!q) return null;
  const base = path.resolve(String(baseDir || ""));
  let entries;
  try {
    entries = await fsPromises.readdir(base, { withFileTypes: true });
  } catch (_e) {
    return null;
  }
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    if (quoteNumberMatchesFolder(ent.name, q)) {
      return path.join(base, ent.name);
    }
  }
  return null;
}

function resolveOrderSaveTarget(baseDir, opts) {
  const o = opts && typeof opts === "object" ? opts : {};
  const quoteNumber = String(o.quoteNumber || extractQuoteNumberFromFileName(o.fileName) || "").trim();
  const customerName = String(o.customerName || o.customer?.name || "").trim();
  const existingDir = String(o.existingDir || "").trim();
  if (existingDir) {
    return {
      dir: existingDir,
      folderLabel: path.basename(existingDir),
      quoteNumber
    };
  }
  if (quoteNumber) {
    return {
      dir: resolveOrderFolder(baseDir, customerName, quoteNumber),
      folderLabel: buildOrderFolderName(customerName, quoteNumber),
      quoteNumber
    };
  }
  return { dir: String(baseDir || ""), folderLabel: "", quoteNumber: "" };
}

async function resolveOrderSaveTargetAsync(baseDir, opts) {
  const o = opts && typeof opts === "object" ? opts : {};
  const quoteNumber = String(o.quoteNumber || extractQuoteNumberFromFileName(o.fileName) || "").trim();
  const customerName = String(o.customerName || o.customer?.name || "").trim();
  if (quoteNumber) {
    const existing = await findOrderFolderByQuoteNumber(baseDir, quoteNumber);
    if (existing) {
      return { dir: existing, folderLabel: path.basename(existing), quoteNumber };
    }
  }
  return resolveOrderSaveTarget(baseDir, { fileName: o.fileName, customerName, quoteNumber });
}

function buildQuotePdfFileName(quoteNumber) {
  const q = sanitizePathSegment(quoteNumber, 48);
  return sanitizeFileName((q || "arajanlat") + "_megrendelo.pdf", "megrendelo.pdf");
}

function buildQuoteJsonFileName(quoteNumber) {
  const q = sanitizePathSegment(quoteNumber, 48);
  return sanitizeFileName((q || "megrendeles") + ".json", "megrendeles.json");
}

function buildDeliveryNotePdfFileName(quoteNumber, deliveryNoteNumber) {
  const dn = String(deliveryNoteNumber || "").trim();
  if (dn) return sanitizeFileName(dn + "_szallitolevel.pdf", "szallitolevel.pdf");
  const q = sanitizePathSegment(quoteNumber, 48);
  return sanitizeFileName((q || "szallitolevel") + "_szallitolevel.pdf", "szallitolevel.pdf");
}

function buildDijbekeroPdfFileName(quoteNumber, documentNumber) {
  const dn = String(documentNumber || "").trim();
  if (dn) return sanitizeFileName(dn + "_dijbekero.pdf", "dijbekero.pdf");
  const q = sanitizePathSegment(quoteNumber, 48);
  return sanitizeFileName((q || "dijbekero") + "_dijbekero.pdf", "dijbekero.pdf");
}

module.exports = {
  sanitizePathSegment,
  sanitizeFileName,
  extractQuoteNumberFromFileName,
  buildOrderFolderName,
  resolveOrderFolder,
  quoteNumberMatchesFolder,
  findOrderFolderByQuoteNumber,
  resolveOrderSaveTarget,
  resolveOrderSaveTargetAsync,
  buildQuotePdfFileName,
  buildQuoteJsonFileName,
  buildDeliveryNotePdfFileName,
  buildDijbekeroPdfFileName
};
