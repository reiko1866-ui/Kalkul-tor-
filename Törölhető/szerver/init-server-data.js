"use strict";

const fs = require("fs");
const path = require("path");

require("./load-server-env")();

const ROOT = path.join(__dirname, "..");

const dataRoot = process.env.DIVIAN_DATA_ROOT
  ? path.resolve(String(process.env.DIVIAN_DATA_ROOT))
  : process.env.DIVIAN_ORDER_SAVE_DIR
    ? path.dirname(path.resolve(String(process.env.DIVIAN_ORDER_SAVE_DIR)))
    : path.join(__dirname, "..", "data");

const dirs = [
  dataRoot,
  process.env.DIVIAN_ORDER_SAVE_DIR || path.join(dataRoot, "orders"),
  process.env.DIVIAN_DATA_DIR || path.join(dataRoot, "orders"),
  process.env.DIVIAN_USER_DATA_DIR || path.join(dataRoot, "profile"),
  process.env.DIVIAN_QUOTE_EXCEL_DIR || path.join(dataRoot, "excel", "megrendelolap"),
  process.env.DIVIAN_DELIVERY_NOTE_EXCEL_DIR || path.join(dataRoot, "excel", "szallitolevel"),
  process.env.DIVIAN_DELIVERY_NOTE_PDF_DIR || path.join(dataRoot, "pdf", "szallitolevel"),
  process.env.DIVIAN_NAGYKER_EXCEL_DIR || path.join(dataRoot, "excel", "nagyker")
];

const unique = [...new Set(dirs.map((d) => path.resolve(String(d))))];

unique.forEach((dir) => {
  try {
    fs.mkdirSync(dir, { recursive: true });
    console.log("[init] mappa:", dir);
  } catch (err) {
    console.error("[init] HIBA mappa létrehozás:", dir, "—", err?.message || err);
    process.exitCode = 1;
  }
});

const authFile = path.join(
  process.env.DIVIAN_USER_DATA_DIR || path.join(dataRoot, "profile"),
  "divian-auth-accounts.json"
);
if (!fs.existsSync(authFile)) {
  console.log("[init] auth fájl (üres lista jön létre első belépésnél):", authFile);
}

  console.log("[init] Kesz. Helyi inditas: INDITAS.bat  |  Szerver: inditas-szerver.bat");
