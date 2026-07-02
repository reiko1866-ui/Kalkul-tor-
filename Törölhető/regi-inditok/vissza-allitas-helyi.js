/**
 * Helyi allapot visszaallitasa a frissites/ mentesbol (szerver nelkul).
 * Futtatas: node tools/vissza-allitas-helyi.js
 */
"use strict";

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const srcDir = path.join(root, "frissites");

const PACK = [
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
  "divian-megrendelo-import.js",
  "styles.css",
  "divian-playwright-forwarder.js",
  "divian-static-server.js",
  "divian-html-to-pdf.js",
  "divian-saved-orders.js",
  "divian-order-folder.js",
  "divian-cyncly-cli.js",
  "divian-cyncly-bridge.js",
  "divian-planner-payload.js",
  "szamlazz-integration.js",
  "szamlazz-local-docs.js",
  "inditas-teszt.bat",
  "inditas-teszt-tervezo.bat",
  "install-playwright-browsers.bat",
  "leallitas-17321.bat",
  "tools/free-port-17321.js",
  "tools/apply-update.js"
];

if (!fs.existsSync(srcDir)) {
  console.error("[vissza] HIBA: nincs frissites/ mappa");
  process.exit(1);
}

let ok = 0;
let miss = 0;
for (const rel of PACK) {
  const from = path.join(srcDir, rel);
  const to = path.join(root, rel);
  if (!fs.existsSync(from)) {
    console.warn("[vissza] hianyzik mentes:", rel);
    miss += 1;
    continue;
  }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  console.log("[vissza] OK:", rel);
  ok += 1;
}

const opcDir = path.join(root, "_opcionalis-szerver");
fs.mkdirSync(opcDir, { recursive: true });
const serverFiles = [
  "inditas-szerver.bat",
  "inditas-szerver-tavoli.bat",
  "TELEPITES-SZERVER.txt",
  "TELEPITES-TAVOLI.txt",
  "inditas-link.bat",
  "inditas-tavoli.bat",
  "inditas-tavoli-tervezo.bat"
];
for (const name of serverFiles) {
  const from = path.join(root, name);
  const to = path.join(opcDir, name);
  if (fs.existsSync(from)) {
    try {
      fs.renameSync(from, to);
      console.log("[vissza] szerver -> _opcionalis-szerver/", name);
    } catch (_e) {
      console.warn("[vissza] nem mozgathato:", name);
    }
  }
}

const olvasd =
  "Divian Kalkulator\n=================\n\nINDITAS.bat  — napi hasznalat (tervezo + arajanlat)\n\nElso alkalom:\n  install-fuggosegek.bat\n  install-playwright-browsers.bat\n\nSzerver fajlok (ha kell): _opcionalis-szerver\\\n";
fs.writeFileSync(path.join(root, "OLVASD_EL.txt"), olvasd, "utf8");

console.log("[vissza] Kesz.", ok, "fajl visszaallitva.", miss ? miss + " hianyzott." : "");
