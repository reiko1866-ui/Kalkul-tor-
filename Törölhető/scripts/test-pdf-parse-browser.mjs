/**
 * Megrendelő PDF tartalom kinyerés — böngészős teszt (Playwright + PDF.js).
 * Futtatás: node scripts/test-pdf-parse-browser.mjs
 */
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright";

const require = createRequire(import.meta.url);
const { readOrderSavePdfBuffer } = require("../divian-saved-orders.js");

const QUOTE = "MRDH-VACI-26-0530";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const pdf = await readOrderSavePdfBuffer(QUOTE);
if (!pdf.ok) {
  console.error("FAIL: no pdf", pdf);
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("about:blank");
await page.addScriptTag({ path: path.join(root, "partial-invoice-view.js") });
await page.addScriptTag({ path: path.join(root, "divian-megrendelo-import.js") });

const payload = await page.evaluate(async ({ buffer, fileName }) => {
  const parsed = await MegrendeloImport.parseMegrendeloPdfBuffer(buffer, fileName);
  return parsed;
}, {
  buffer: Array.from(pdf.buffer),
  fileName: pdf.fileName
});

await browser.close();

console.log("parsed customer:", payload?.customer);
console.log("parsed quote:", payload?.quoteNumber, payload?.quoteDate);
console.log("parsed kitchen:", payload?.kitchen);
console.log("snapshot lines:", (payload?.snapshot?.lines || []).length);

if (!payload?.customer?.name) {
  console.error("FAIL: no customer name extracted");
  process.exit(1);
}
if (!payload?.quoteNumber) {
  console.error("FAIL: no quote number");
  process.exit(1);
}
console.log("OK: PDF parse extracted data for", QUOTE);
