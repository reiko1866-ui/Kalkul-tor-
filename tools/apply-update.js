/**
 * frissites/ mappa tartalmát másolja a projekt gyökerébe (Budaörs / üzleti frissítés).
 * Futtatás: node tools/apply-update.js
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const srcDir = path.join(root, "frissites");

/** Engedélyezett cél útvonal (projekt gyökérhez képest, / elválasztó). */
const ALLOWED = new Set([
  "arajanlat.html",
  "dashboard.html",
  "dashboard.css",
  "admin-center.html",
  "admin-center.css",
  "divian-dashboard.js",
  "divian-cabinet-codes.js",
  "divian-admin-center.js",
  "divian-admin-settings.js",
  "divian-asztalos-munkalap.js",
  "divian-felmeres-queue.js",
  "divian-brand.css",
  "szamla-eloreszlet.html",
  "partial-invoice-view.js",
  "styles.css",
  "divian-extras-kiadvany.js",
  "divian-fixed-pricebook.js",
  "divian-playwright-forwarder.js",
  "divian-static-server.js",
  "divian-html-to-pdf.js",
  "divian-saved-orders.js",
  "divian-order-folder.js",
  "divian-planner-payload.js",
  "divian-cyncly-cli.js",
  "divian-cyncly-bridge.js",
  "szamlazz-integration.js",
  "szamlazz-local-docs.js",
  "divian-planner-url.txt",
  "install-fuggosegek.bat",
  "install-playwright-chrome.bat",
  "install-playwright-browsers.bat",
  "start-playwright-forwarder.bat",
  "start-playwright-forwarder.ps1",
  "inditas-teszt.bat",
  "inditas-teszt-tervezo.bat",
  "leallitas-17321.bat",
  "Parancsikon-teszt.bat",
  "tools/free-port-17321.js",
  "tools/apply-update.js",
  "scripts/create-divian-teszt-icon.ps1",
  "TELEPITES-GEPENKENT.txt",
  "FRISSTITES-MANIFEST.txt"
]);

function normRel(rel) {
  return String(rel || "").split(path.sep).join("/");
}

function isAllowed(rel) {
  const n = normRel(rel);
  if (ALLOWED.has(n)) return n;
  const base = path.basename(n);
  if (ALLOWED.has(base)) return base;
  return "";
}

function listFiles(dir, base) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = base ? path.join(base, name) : name;
    const st = fs.statSync(full);
    if (st.isDirectory()) out.push(...listFiles(full, rel));
    else out.push(rel);
  }
  return out;
}

if (!fs.existsSync(srcDir)) {
  console.log("[frissites] Nincs frissites mappa — kihagyva.");
  process.exit(0);
}

const files = listFiles(srcDir, "");
if (!files.length) {
  console.log("[frissites] A frissites mappa üres — kihagyva.");
  process.exit(0);
}

let copied = 0;
let skipped = 0;
for (const rel of files) {
  const allowedKey = isAllowed(rel);
  if (!allowedKey) {
    console.warn("[frissites] Kihagyva (nem engedélyezett):", normRel(rel));
    skipped += 1;
    continue;
  }
  const destRel = allowedKey.includes("/") ? allowedKey : path.basename(rel);
  const from = path.join(srcDir, rel);
  const to = path.join(root, destRel.split("/").join(path.sep));
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  console.log("[frissites] Másolva:", normRel(destRel));
  copied += 1;
}

console.log("[frissites] Kész. Másolva:", copied, skipped ? "Kihagyva: " + skipped : "");
