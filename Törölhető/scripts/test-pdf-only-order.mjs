/**
 * PDF-only mentett megrendelő — szerver oldali feloldás teszt.
 * Futtatás: node scripts/test-pdf-only-order.mjs
 */
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const {
  scanOrderSaveDir,
  resolveQuotePdfFromDisk,
  readOrderSavePdfBuffer
} = require("../divian-saved-orders.js");

const QUOTE = "MRDH-VACI-26-0530";

function customerNameFromFolder(folder) {
  const seg = String(folder || "").trim();
  const m = seg.match(/^(.+?)\s*[—–-]\s*MRDH-/i);
  return m && m[1] ? m[1].trim() : "";
}

const rows = await scanOrderSaveDir();
const row = rows.find((r) => String(r.quoteNumber || "").trim() === QUOTE);
if (!row) {
  console.error("FAIL: nincs scan sor:", QUOTE);
  process.exit(1);
}
console.log("scan row:", {
  quoteNumber: row.quoteNumber,
  hasPdf: row.hasPdf,
  megrendeloPdfFile: row.megrendeloPdfFile,
  orderFolder: row.orderFolder
});

const folderName = customerNameFromFolder(row.orderFolder);
console.log("folder customer:", folderName);
if (folderName !== "R. Nagy Gabriella") {
  console.error("FAIL: várt név R. Nagy Gabriella, kapott:", folderName);
  process.exit(1);
}

const pdfHit = await resolveQuotePdfFromDisk(QUOTE);
if (!pdfHit?.fileName) {
  console.error("FAIL: resolveQuotePdfFromDisk null");
  process.exit(1);
}
console.log("pdf resolve:", pdfHit);

const buf = await readOrderSavePdfBuffer(QUOTE);
if (!buf.ok || !buf.byteLength) {
  console.error("FAIL: readOrderSavePdfBuffer", buf);
  process.exit(1);
}
console.log("pdf bytes:", buf.byteLength, "file:", buf.fileName);

console.log("OK: PDF-only order path resolution works for", QUOTE);
