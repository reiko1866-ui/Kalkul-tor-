/**
 * Teljes Budaörs telepítő ZIP (programfájlok + node_modules).
 * Futtatás: node tools/prepare-budaors-telepites-zip.js
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const root = path.join(__dirname, "..");
const date = new Date().toISOString().slice(0, 10);
const zipName = "DivianKalkulator-Budaors-telepites-" + date + ".zip";
const zipPath = path.join(root, zipName);
const stageRoot = path.join(root, "_budaors-zip-stage", "DivianKalkulator");

const EXCLUDE_DIRS = new Set([
  "_archiv",
  "_budaors-zip-stage",
  ".git",
  ".cursor",
  "agent-tools",
  "pendrive-megrendelo",
  "node_modules/.cache"
]);

const EXCLUDE_FILES = new Set([
  "szamlazz-agent-key.txt",
  zipName,
  "DivianKalkulator-Budaors-frissites-2026-06-09.zip"
]);

const EXCLUDE_PREFIXES = ["DivianKalkulator-Budaors-"];

function shouldSkip(rel) {
  const norm = rel.split(path.sep).join("/");
  const base = path.basename(rel);
  if (EXCLUDE_FILES.has(base)) return true;
  if (EXCLUDE_PREFIXES.some((p) => base.startsWith(p) && base.endsWith(".zip"))) return true;
  const parts = norm.split("/");
  for (const part of parts) {
    if (EXCLUDE_DIRS.has(part)) return true;
  }
  return false;
}

function copyRecursive(src, dest, relBase) {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    if (shouldSkip(relBase)) return;
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) {
      copyRecursive(path.join(src, name), path.join(dest, name), path.join(relBase, name));
    }
    return;
  }
  if (shouldSkip(relBase)) return;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function rmrf(dir) {
  if (!fs.existsSync(dir)) return;
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log("[zip] Staging:", stageRoot);
rmrf(path.join(root, "_budaors-zip-stage"));
fs.mkdirSync(stageRoot, { recursive: true });

if (!fs.existsSync(path.join(root, "node_modules"))) {
  console.error("[zip] HIBA: node_modules nincs — futtasd elobb: install-fuggosegek.bat");
  process.exit(1);
}

const top = fs.readdirSync(root);
for (const name of top) {
  if (name === "_budaors-zip-stage") continue;
  const src = path.join(root, name);
  const rel = name;
  if (shouldSkip(rel)) {
    console.log("[zip] Kihagyva:", name);
    continue;
  }
  console.log("[zip] Masol:", name);
  copyRecursive(src, path.join(stageRoot, name), rel);
}

const readme = path.join(stageRoot, "BUDAORS-TELEPITES.txt");
fs.writeFileSync(
  readme,
  [
    "Divian Kalkulator — Budaors teljes csomag (" + date + ")",
    "=====================================================",
    "",
    "Tartalom: programfajlok + node_modules (npm fuggosegek).",
    "",
    "TELEPITES:",
    "  1. Csomagold ki ide: Asztal\\Budaors\\DivianKalkulator\\",
    "  2. Node.js LTS telepitve legyen: https://nodejs.org/",
    "  3. Egyszer: install-playwright-browsers.bat (Chromium, internet kell)",
    "  4. Inditas:",
    "     - INDITAS.bat vagy start-playwright-forwarder.bat (tervezo + ajanlat)",
    "     - inditas-teszt.bat (csak ajanlat, helyi bizonylat)",
    "",
    "npm install NEM kell — a node_modules benne van a zipben.",
    "",
    "Reszletek: OLVASD_EL.txt, frissites\\OLVASD_EL.txt"
  ].join("\r\n"),
  "utf8"
);

if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

const stageParent = path.join(root, "_budaors-zip-stage");
const ps =
  "$ProgressPreference = 'SilentlyContinue'; " +
  "Compress-Archive -LiteralPath '" +
  stageRoot.replace(/'/g, "''") +
  "' -DestinationPath '" +
  zipPath.replace(/'/g, "''") +
  "' -CompressionLevel Optimal";
execSync('powershell -NoProfile -Command "' + ps + '"', { stdio: "inherit", maxBuffer: 1024 * 1024 * 64 });

const zipSize = fs.statSync(zipPath).size;
console.log("[zip] Kesz:", zipPath);
console.log("[zip] Meret:", Math.round(zipSize / 1024 / 1024 * 10) / 10, "MB");

rmrf(stageParent);
