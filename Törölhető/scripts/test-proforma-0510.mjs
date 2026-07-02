/**
 * Díjbekérő összeg — MRDH-VACI-26-0510 regressziós teszt.
 * Futtatás: node scripts/test-proforma-0510.mjs
 */
import { createRequire } from "module";
import vm from "vm";
import fs from "fs";
import path from "path";

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");

const sandbox = { globalThis: {} };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, "partial-invoice-view.js"), "utf8"), sandbox);
vm.runInContext(fs.readFileSync(path.join(root, "divian-megrendelo-import.js"), "utf8"), sandbox);

const PIV = sandbox.PartialInvoiceView;
const MI = sandbox.MegrendeloImport;

const loadPath = "C:/Users/Divian-Dell231W/Desktop/Mentett megrendelők/Új mappa/MRDH-VACI-26-0510.json";
if (!fs.existsSync(loadPath)) {
  console.error("FAIL: JSON not found:", loadPath);
  process.exit(1);
}

const payload = JSON.parse(fs.readFileSync(loadPath, "utf8"));
const snap = payload.snapshot;
const st = payload.state;
const asm = 144000;

function halfForPart(full, part) {
  const f = Math.max(0, Math.floor(Number(full) || 0));
  const first = Math.round((f * 0.5) / 5) * 5;
  const second = Math.round((f - first) / 5) * 5;
  return part === 2 ? second : first;
}

function buildPartTotal(snapIn, stIn) {
  const kb = PIV.resolvePartialInvoiceKitchenBase(snapIn, stIn, asm);
  const spl = PIV.resolvePartialInvoiceSplittableTotal(snapIn, stIn, asm);
  const hw = (stIn.hardwareLines?.length ? stIn.hardwareLines : PIV.hardwareLinesFromSnapshot(snapIn)).reduce(
    (s, l) => s + l.qty * l.unit,
    0
  );
  const kd = (stIn.kiadvanyExtrasLines || []).reduce((s, l) => s + l.qty * l.unit, 0);
  const ship = Number(stIn.shippingFee || snapIn.shippingFee) || 0;
  const part1 =
    halfForPart(kb, 1) + halfForPart(hw, 1) + halfForPart(kd, 1) + halfForPart(ship, 1);
  return { kb, spl, part1 };
}

const full = buildPartTotal(snap, st);
console.log("full JSON:", full);

// Megrendelő import: csak bútor sorok + alulszámlált finalTotal, de footer kitchenTotal helyes
const cabinetLines = snap.lines.filter(
  (l) => l.code && !String(l.name).toLowerCase().includes("vasalat") && !String(l.name).toLowerCase().includes("gép")
);
const imported = MI.buildMegrendeloPayloadFromParts(
  {
    quoteNumber: payload.quoteNumber,
    snapLines: cabinetLines,
    summary: {
      finalTotal: 953360,
      kitchenTotal: 985830,
      shippingFee: 45000,
      discountPct: 20,
      fromFooter: true
    }
  },
  "MRDH-VACI-26-0510_megrendelo.pdf"
);
const importedSt = Object.assign({}, imported.state, {
  hardwareLines: st.hardwareLines,
  kiadvanyExtrasLines: st.kiadvanyExtrasLines,
  worktopLines: st.worktopLines,
  shippingFee: 45000,
  discount: 20
});
const fixed = buildPartTotal(imported.snapshot, importedSt);
console.log("megrendelo import path (was ~476680):", fixed);

const ok =
  full.spl === 1030830 &&
  full.part1 === 515415 &&
  fixed.spl === 1030830 &&
  fixed.part1 === 515415;

if (!ok) {
  console.error("FAIL: expected spl=1030830 part1=515415");
  process.exit(1);
}
console.log("OK: MRDH-VACI-26-0510 proforma totals");
