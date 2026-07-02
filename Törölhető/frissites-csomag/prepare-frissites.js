/**
 * Budaörs / üzleti frissítés előkészítése: a gyökérből a frissites/ mappába másol.
 * Futtatás: node tools/prepare-frissites.js
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const destDir = path.join(root, "frissites");

/** forras → frissites/ cel (relativ) */
const PACK = [
  ["arajanlat.html", "arajanlat.html"],
  ["dashboard.html", "dashboard.html"],
  ["dashboard.css", "dashboard.css"],
  ["admin-center.html", "admin-center.html"],
  ["admin-center.css", "admin-center.css"],
  ["divian-dashboard.js", "divian-dashboard.js"],
  ["divian-cabinet-codes.js", "divian-cabinet-codes.js"],
  ["divian-admin-center.js", "divian-admin-center.js"],
  ["divian-admin-settings.js", "divian-admin-settings.js"],
  ["divian-asztalos-munkalap.js", "divian-asztalos-munkalap.js"],
  ["divian-felmeres-queue.js", "divian-felmeres-queue.js"],
  ["divian-brand.css", "divian-brand.css"],
  ["szamla-eloreszlet.html", "szamla-eloreszlet.html"],
  ["partial-invoice-view.js", "partial-invoice-view.js"],
  ["divian-megrendelo-import.js", "divian-megrendelo-import.js"],
  ["styles.css", "styles.css"],
  ["divian-playwright-forwarder.js", "divian-playwright-forwarder.js"],
  ["divian-static-server.js", "divian-static-server.js"],
  ["divian-html-to-pdf.js", "divian-html-to-pdf.js"],
  ["divian-saved-orders.js", "divian-saved-orders.js"],
  ["divian-order-folder.js", "divian-order-folder.js"],
  ["divian-cyncly-cli.js", "divian-cyncly-cli.js"],
  ["divian-cyncly-bridge.js", "divian-cyncly-bridge.js"],
  ["divian-planner-payload.js", "divian-planner-payload.js"],
  ["szamlazz-integration.js", "szamlazz-integration.js"],
  ["szamlazz-local-docs.js", "szamlazz-local-docs.js"],
  ["inditas-teszt.bat", "inditas-teszt.bat"],
  ["inditas-teszt-tervezo.bat", "inditas-teszt-tervezo.bat"],
  ["install-playwright-browsers.bat", "install-playwright-browsers.bat"],
  ["leallitas-17321.bat", "leallitas-17321.bat"],
  ["tools/free-port-17321.js", "tools/free-port-17321.js"],
  ["tools/apply-update.js", "tools/apply-update.js"]
];

const manifestPath = path.join(destDir, "FRISSTITES-MANIFEST.txt");

function copyOne(fromRel, toRel) {
  const from = path.join(root, fromRel);
  const to = path.join(destDir, toRel);
  if (!fs.existsSync(from)) {
    console.warn("[prepare] HIANYZIK:", fromRel);
    return false;
  }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  const st = fs.statSync(from);
  console.log("[prepare] OK:", toRel, "(" + Math.round(st.size / 1024) + " KB)");
  return { rel: toRel, size: st.size, mtime: st.mtime.toISOString() };
}

const copied = [];
let missing = 0;
for (const [fromRel, toRel] of PACK) {
  const hit = copyOne(fromRel, toRel);
  if (hit) copied.push(hit);
  else missing += 1;
}

const manifest =
  "Divian Kalkulator — Budaors frissites csomag\n" +
  "Keszitve: " +
  new Date().toISOString().slice(0, 10) +
  "\n" +
  "Fajlok (" +
  copied.length +
  " db):\n" +
  copied.map((c) => "  - " + c.rel).join("\n") +
  "\n";

fs.writeFileSync(manifestPath, manifest, "utf8");
console.log("[prepare] Manifest:", manifestPath);
console.log("[prepare] Kesz.", copied.length, "fajl", missing ? "hianyzik: " + missing : "");
