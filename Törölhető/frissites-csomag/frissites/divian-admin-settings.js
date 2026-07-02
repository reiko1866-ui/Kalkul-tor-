/**
 * Központi admin beállítások — divian_admin_settings.json
 */
const fs = require("fs");
const fsPromises = require("fs/promises");
const path = require("path");
const os = require("os");

const DATA_DIR = process.env.DIVIAN_DATA_DIR
  ? path.resolve(String(process.env.DIVIAN_DATA_DIR))
  : path.join(process.env.USERPROFILE || os.homedir(), "Desktop", "Mentett megrendelők");

const SETTINGS_FILE = path.join(DATA_DIR, "divian_admin_settings.json");

const DEFAULT_SETTINGS = {
  cutFeeUnit: 4390,
  siliconeUnitPrice: 2390,
  worktopTurnerUnit: 2890,
  legPricePerDb: {
    "10": { I: 340, II: 340 },
    "15": { I: 360, II: 360 }
  },
  toeKickPricePerFm: {
    "10": { I: 1690, II: 2890 },
    "15": { I: 1990, II: 3090 }
  },
  pdfTexts: {
    quoteFooter:
      "Az árajánlat 7 napig érvényes. Az árak bruttó árak, az ÁFA-t tartalmazzák.",
    deliveryNoteNote: "A szállítólevél a ténylegesen átadott tételeket tartalmazza.",
    proformaNote: "Előlegbekérő — kérjük az előleg utalását a megadott számlaszámra."
  },
  updatedAt: null
};

function deepMerge(base, patch) {
  const out = Object.assign({}, base);
  if (!patch || typeof patch !== "object") return out;
  Object.keys(patch).forEach((key) => {
    const pv = patch[key];
    if (pv && typeof pv === "object" && !Array.isArray(pv) && base[key] && typeof base[key] === "object") {
      out[key] = deepMerge(base[key], pv);
    } else if (pv !== undefined) {
      out[key] = pv;
    }
  });
  return out;
}

async function ensureDataDir() {
  await fsPromises.mkdir(DATA_DIR, { recursive: true });
}

async function readAdminSettings() {
  await ensureDataDir();
  try {
    const raw = await fsPromises.readFile(SETTINGS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return deepMerge(DEFAULT_SETTINGS, parsed && typeof parsed === "object" ? parsed : {});
  } catch (err) {
    if (err && err.code === "ENOENT") return Object.assign({}, DEFAULT_SETTINGS);
    throw err;
  }
}

async function writeAdminSettings(patch) {
  await ensureDataDir();
  const current = await readAdminSettings();
  const next = deepMerge(current, patch && typeof patch === "object" ? patch : {});
  next.updatedAt = new Date().toISOString();
  await fsPromises.writeFile(SETTINGS_FILE, JSON.stringify(next, null, 2), "utf8");
  return { ok: true, settings: next, file: SETTINGS_FILE };
}

module.exports = {
  DATA_DIR,
  SETTINGS_FILE,
  DEFAULT_SETTINGS,
  readAdminSettings,
  writeAdminSettings
};
