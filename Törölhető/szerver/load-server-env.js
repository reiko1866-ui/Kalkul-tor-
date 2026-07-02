/**
 * Szerver környezet betöltése — config/szerver.env (+ opcionális szerver.local.env).
 * A divian-static-server és forwarder elején: require("./tools/load-server-env")();
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, "utf8");
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = String(line || "").trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) return;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] == null || String(process.env[key]).trim() === "") {
      process.env[key] = val;
    }
  });
}

function resolveDefaultDataRoot() {
  const isWin = process.platform === "win32";
  if (!isWin) {
    return path.join("/var", "divian", "data");
  }
  return path.join("C:", "DivianSzerver", "data");
}

function applyServerModeDefaults() {
  if (String(process.env.DIVIAN_SERVER_MODE || "").trim() !== "1") return;

  let dataRoot = process.env.DIVIAN_DATA_ROOT
    ? path.resolve(String(process.env.DIVIAN_DATA_ROOT))
    : resolveDefaultDataRoot();

  const fallbackRoot = path.join(ROOT, "data", "szerver");
  let usedDataRootFallback = false;
  try {
    fs.mkdirSync(dataRoot, { recursive: true });
  } catch (_err) {
    if (path.resolve(dataRoot) !== path.resolve(fallbackRoot)) {
      console.warn("[env] Adatmappa nem hozható létre:", dataRoot);
      console.warn("[env] Tartalék:", fallbackRoot);
      dataRoot = fallbackRoot;
      usedDataRootFallback = true;
      fs.mkdirSync(dataRoot, { recursive: true });
    } else {
      throw _err;
    }
  }

  const defaults = {
    DIVIAN_DATA_ROOT: dataRoot,
    DIVIAN_ORDER_SAVE_DIR: path.join(dataRoot, "orders"),
    DIVIAN_DATA_DIR: path.join(dataRoot, "orders"),
    DIVIAN_USER_DATA_DIR: path.join(dataRoot, "profile"),
    DIVIAN_QUOTE_EXCEL_DIR: path.join(dataRoot, "excel", "megrendelolap"),
    DIVIAN_DELIVERY_NOTE_EXCEL_DIR: path.join(dataRoot, "excel", "szallitolevel"),
    DIVIAN_DELIVERY_NOTE_PDF_DIR: path.join(dataRoot, "pdf", "szallitolevel"),
    DIVIAN_NAGYKER_EXCEL_DIR: path.join(dataRoot, "excel", "nagyker"),
    DIVIAN_BIND_HOST: "0.0.0.0",
    DIVIAN_PUBLIC_ACCESS: "1",
    DIVIAN_OPEN_BROWSER: "0",
    DIVIAN_FAST_START: "1"
  };

  if (process.platform !== "win32" && process.env.DIVIAN_ORDER_MIRROR_OFF == null) {
    defaults.DIVIAN_ORDER_MIRROR_OFF = "1";
  }

  Object.entries(defaults).forEach(([key, val]) => {
    if (
      usedDataRootFallback ||
      process.env[key] == null ||
      String(process.env[key]).trim() === ""
    ) {
      process.env[key] = String(val);
    }
  });
}

function loadServerEnv() {
  // Szerver config csak akkor, ha a batch explicit beállította: set DIVIAN_SERVER_MODE=1
  if (String(process.env.DIVIAN_SERVER_MODE || "").trim() !== "1") {
    return process.env;
  }
  parseEnvFile(path.join(ROOT, "config", "szerver.env"));
  parseEnvFile(path.join(ROOT, "config", "szerver.local.env"));
  applyServerModeDefaults();
  return process.env;
}

module.exports = loadServerEnv;

if (require.main === module) {
  loadServerEnv();
  console.log("[env] DIVIAN_SERVER_MODE:", process.env.DIVIAN_SERVER_MODE || "(off)");
  console.log("[env] ORDER_SAVE_DIR:", process.env.DIVIAN_ORDER_SAVE_DIR || "(desktop default)");
  console.log("[env] BIND:", process.env.DIVIAN_BIND_HOST || "127.0.0.1");
  console.log("[env] PUBLIC_URL:", process.env.DIVIAN_PUBLIC_URL || "(auto / origin)");
}
