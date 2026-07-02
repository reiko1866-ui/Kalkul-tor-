/**
 * Nem kello fajlok athelyezese: Törölhető/
 * Futtatas: node tools/rendez-torolheto.js
 */
"use strict";

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const dest = path.join(root, "Törölhető");

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function moveTo(subdir, relPath) {
  const from = path.join(root, relPath);
  if (!fs.existsSync(from)) return false;
  const toDir = path.join(dest, subdir);
  ensureDir(toDir);
  const base = path.basename(relPath);
  let to = path.join(toDir, base);
  if (fs.existsSync(to)) {
    const ext = path.extname(base);
    const stem = path.basename(base, ext);
    to = path.join(toDir, stem + "-" + Date.now() + ext);
  }
  fs.renameSync(from, to);
  console.log("[torolheto]", relPath, "->", path.relative(root, to));
  return true;
}

ensureDir(dest);

const moves = [
  // Szerver / tavoli (mar _opcionalis-szerver is)
  ["szerver", "_opcionalis-szerver"],
  ["szerver", "deploy"],
  ["szerver", "config"],
  ["szerver", "docker-compose.yml"],
  ["szerver", "Dockerfile"],
  ["szerver", ".dockerignore"],
  ["szerver", "divian-auth.js"],
  ["szerver", "divian-client-auth.js"],
  ["szerver", "divian-public-url.js"],
  ["szerver", "divian-network-bind.js"],
  ["szerver", "divian-forwarder-base.js"],
  ["szerver", "divian-delivery-note-api.js"],
  ["szerver", "divian-http-guard.js"],
  ["szerver", "divian-public-link.txt"],
  ["szerver", "divian-public-link.url"],
  ["szerver", "tools/divian-remote-server.js"],
  ["szerver", "tools/load-server-env.js"],
  ["szerver", "tools/init-server-data.js"],
  ["szerver", "tools/divian-public-link.js"],
  ["szerver", "tools/open-firewall-17321.bat"],
  ["szerver", "tools/start-server-watchdog.bat"],
  ["szerver", "tools/install-chromium-bg.bat"],

  // Regi / dupla inditok
  ["regi-inditok", "inditas-teszt.bat"],
  ["regi-inditok", "divian-static-server.js"],
  ["regi-inditok", "start-lan-proba.bat"],
  ["regi-inditok", "start-playwright-forwarder.bat"],
  ["regi-inditok", "start-playwright-forwarder.ps1"],
  ["regi-inditok", "install-playwright-chrome.bat"],
  ["regi-inditok", "VISSZA-ALLITAS.bat"],
  ["regi-inditok", "tools/vissza-allitas-helyi.js"],
  ["regi-inditok", "tools/fix-bat-encoding.js"],

  // Frissites / csomag keszites
  ["frissites-csomag", "frissites"],
  ["frissites-csomag", "FRISSTITES-MANIFEST.txt"],
  ["frissites-csomag", "keszit-budaors-frissites.bat"],
  ["frissites-csomag", "keszit-budaors-telepites-zip.bat"],
  ["frissites-csomag", "KULDENDO-CSOMAG-KESZITESE.bat"],
  ["frissites-csomag", "tools/prepare-frissites.js"],
  ["frissites-csomag", "DivianKalkulator-Budaors-telepites-2026-06-13.zip"],

  // Dokumentacio / telepites
  ["dokumentacio", "TELEPITES-GEPENKENT.txt"],
  ["dokumentacio", "MITM_SETUP_HU.md"],
  ["dokumentacio", "PLAYWRIGHT_SETUP_HU.md"],
  ["dokumentacio", "Parancsikon-teszt.bat"],

  // Regi / kulon modulok
  ["regi-modulok", "konyhatervezo.html"],
  ["regi-modulok", "konyhatervezo.js"],
  ["regi-modulok", "konyhatervezo.css"],
  ["regi-modulok", "konyhatervezo-3d.mjs"],
  ["regi-modulok", "index.html"],
  ["regi-modulok", "divian-b2c-lead-extension"],
  ["regi-modulok", "divian-itemlists-forwarder"],
  ["regi-modulok", "divian-planner-csv-extension"],
  ["regi-modulok", "divian-itemlists-qty-only.user.js"],
  ["regi-modulok", "pendrive-megrendelo"],
  ["regi-modulok", "Csapat kulcs"],

  // Szerver adat (ha van)
  ["szerver", "data/szerver"],

  // Regi Cyncly CLI / bookmarklet (forwarder sajat Playwright)
  ["regi-modulok", "divian-cyncly-bridge.js"],
  ["regi-modulok", "divian-cyncly-cli.js"],
  ["regi-modulok", "divian-planner-payload.js"],
  ["regi-modulok", "divian-planner-export-bookmarklet.js"],
  ["regi-modulok", "divian-planner-data.js"],
  ["regi-modulok", "divian-planner-modules.generated.js"],
  ["regi-modulok", "divian-konyhaarlista-images.js"],
  ["regi-modulok", "divian-konyhaarlista-images.generated.js"],
  ["regi-modulok", "konyhaarlista-img"],
  ["regi-modulok", "divian-html-to-pdf.js"],

  // Dokumentacio / peldak
  ["dokumentacio", "divian-arajanlat-url.example.txt"],
  ["dokumentacio", "szamlazz-agent-key.txt.example"],

  // Regi inditok / parancsikonok
  ["regi-inditok", "Parancsikon-letrehozasa.bat"],
  ["regi-inditok", "Szamla-eloreszlet-nyitasa.bat"],
  ["regi-inditok", "Divian Arajanlat.lnk"],
  ["regi-inditok", "Divian Teszt (Szamlazz).lnk"],
  ["regi-inditok", "divian-inditas.ico"],
  ["regi-inditok", "divian-teszt.ico"],

  // Teszt / fejlesztoi scriptek (a gyoker scripts/ mappa tartalma)
  ["scripts", "scripts"],

  // Opcionalis szerver / frissites eszkozok (tools/)
  ["szerver", "tools/divian-server-watchdog.js"],
  ["frissites-csomag", "tools/prepare-budaors-telepites-zip.js"],

  // Nem hasznalt asset
  ["regi-modulok", "assets/gradio-client.browser.js"]
];

let n = 0;
for (const [subdir, rel] of moves) {
  if (moveTo(subdir, rel)) n += 1;
}

// Tavoli szerver txt (encoding eltero nev)
try {
  const files = fs.readdirSync(root);
  for (const f of files) {
    if (/tavoli.*szerver/i.test(f) && f.endsWith(".txt")) {
      if (moveTo("dokumentacio", f)) n += 1;
    }
  }
} catch (_e) {}

const readme = `Törölhető mappa
================

Ide kerultek azok a fajlok, amiket a napi INDITAS.bat / arajanlat nem hasznal.
Ha minden rendben megy, a teljes mappa torolheto.

Napi inditas: INDITAS.bat

Almappak:
  szerver/          — kozponti szerver, tunnel, auth API
  regi-inditok/     — regi batch inditok, static-server, parancsikonok
  frissites-csomag/ — Budaors mentes / zip keszites
  dokumentacio/     — regi telepitesi leirasok, peldak
  regi-modulok/     — konyhatervezo, bovitmenyek, regi Cyncly CLI
  scripts/          — fejlesztoi / teszt scriptek

Atmozgatva: ${new Date().toLocaleString("hu-HU")}
Ebben a korben: ${n} elem
Osszesen a mappaban: ${countAll(dest)} fajl
`;
function countAll(dir) {
  let c = 0;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) c += countAll(p);
    else c += 1;
  }
  return c;
}
fs.writeFileSync(path.join(dest, "OLVASD_EL.txt"), readme, "utf8");
console.log("[torolheto] Kesz.", n, "elem -> Törölhető/");
