/**
 * Díjbekérő regresszió — I.+II. összeg, anchor, szerelés kizárás, megrendelő import.
 * Futtatás: node scripts/test-proforma-comprehensive.mjs
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

const PARTIAL_RATE = 0.5;

function round5(v) {
  return Math.round((Number(v) || 0) / 5) * 5;
}

function splitHalf(full) {
  const f = Math.max(0, Math.floor(Number(full) || 0));
  const first = round5(Math.round(f * PARTIAL_RATE));
  const second = round5(f - first);
  return { first, second };
}

function halfForPart(full, part) {
  const s = splitHalf(full);
  return part === 2 ? s.second : s.first;
}

/** Mint arajanlat.html snapshotForPartialInvoice */
function snapshotForPartialInvoice(live, anchor) {
  if (!anchor || typeof anchor !== "object") return live;
  const merged = Object.assign({}, live);
  const savedFt = Math.max(0, Math.floor(Number(anchor.finalTotal) || 0));
  const savedKdt = Math.max(0, Math.floor(Number(anchor.kitchenDiscountedTotal) || 0));
  const liveFt = Math.max(0, Math.floor(Number(live.finalTotal) || 0));
  const liveKdt = Math.max(0, Math.floor(Number(live.kitchenDiscountedTotal) || 0));
  if (savedKdt > liveKdt + 5000) merged.kitchenDiscountedTotal = savedKdt;
  if (savedFt > liveFt + 5000) {
    merged.finalTotal = savedFt;
    const savedShip = Math.max(0, Math.floor(Number(anchor.shippingFee) || 0));
    if (savedShip > 0) merged.shippingFee = savedShip;
  }
  const savedGrand = Math.max(0, Math.floor(Number(anchor.grandTotal) || 0));
  if (savedGrand > 0) merged.grandTotal = savedGrand;
  if (anchor.discountPct > 0) merged.discountPct = anchor.discountPct;
  return merged;
}

function buildPartRows(snap, st, part, asm) {
  const kb = round5(PIV.resolvePartialInvoiceKitchenBase(snap, st, asm));
  const rows = [];
  const kitchenPart = halfForPart(kb, part);
  if (kitchenPart > 0) rows.push({ gross: kitchenPart });

  const hwLines =
    st.hardwareLines?.length > 0 ? st.hardwareLines : PIV.hardwareLinesFromSnapshot(snap);
  hwLines.forEach((line) => {
    const g = (Number(line.qty) || 0) * (Number(line.unit) || 0);
    if (g > 0 && !PIV.isAssemblyInstallFeeLine(line.name, line.code, g, asm)) {
      rows.push({ gross: halfForPart(g, part) });
    }
  });

  (st.kiadvanyExtrasLines || []).forEach((line) => {
    if (!PIV.isInvoiceKiadvanyLine(line)) return;
    const g = (Number(line.qty) || 0) * (Number(line.unit) || 0);
    if (g > 0 && !PIV.isAssemblyInstallFeeLine(line.name, line.code, g, asm)) {
      rows.push({ gross: halfForPart(g, part) });
    }
  });

  const ship = Math.max(0, Math.floor(Number(st.shippingFee ?? snap.shippingFee) || 0));
  if (ship > 0) rows.push({ gross: halfForPart(ship, part) });

  const sumGross = rows.reduce((s, r) => s + r.gross, 0);
  const splittable = round5(PIV.resolvePartialInvoiceSplittableTotal(snap, st, asm));
  return { sumGross, splittable, kitchenBase: kb };
}

function assertClose(label, actual, expected, tolerance = 5) {
  if (Math.abs(actual - expected) > tolerance) {
    console.error(`FAIL [${label}]: várt ${expected}, kapott ${actual}`);
    process.exit(1);
  }
}

function assertI2EqualsSplittable(label, snap, st, asm) {
  const p1 = buildPartRows(snap, st, 1, asm);
  const p2 = buildPartRows(snap, st, 2, asm);
  const combined = round5(p1.sumGross + p2.sumGross);
  assertClose(`${label} I+II`, combined, p1.splittable);
  return { p1, p2, combined };
}

let passed = 0;

// 1) Élő wizard — egyszerű bútor + szállítás
{
  const snap = {
    lines: [{ code: "MO60", name: "MO60 alsó", qty: 2, unit: 100000, total: 200000 }],
    grossTotal: 200000,
    kitchenDiscountedTotal: 200000,
    finalTotal: 245000,
    shippingFee: 45000,
    discountPct: 0
  };
  const st = { shippingFee: 45000, hardwareLines: [], kiadvanyExtrasLines: [] };
  const r = assertI2EqualsSplittable("live-wizard", snap, st, 0);
  assertClose("live-wizard splittable", r.p1.splittable, 245000);
  passed++;
}

// 2) Szerelés kizárása — assemblyFee nem része a díjbekérőnek
{
  const asm = 144000;
  const snap = {
    lines: [
      { code: "MO60", name: "MO60", qty: 1, unit: 500000, total: 500000 },
      { name: "Összeszerelés díja (tájékoztató)", qty: 1, unit: asm, total: asm, informational: true }
    ],
    kitchenDiscountedTotal: 500000,
    finalTotal: 545000,
    grandTotal: 689000,
    shippingFee: 45000,
    assemblyFee: asm
  };
  const st = { shippingFee: 45000, assemblyFee: asm, hardwareLines: [], kiadvanyExtrasLines: [] };
  const spl = PIV.resolvePartialInvoiceSplittableTotal(snap, st, asm);
  assertClose("assembly-excluded splittable", spl, 545000);
  assertI2EqualsSplittable("assembly-excluded", snap, st, asm);
  passed++;
}

// 3) Anchor megőrzés — alulszámlált élő snapshot, helyes mentett anchor
{
  const anchor = {
    finalTotal: 1030830,
    kitchenDiscountedTotal: 985830,
    shippingFee: 45000,
    grandTotal: 1070830,
    discountPct: 20
  };
  const liveUnder = {
    lines: [{ code: "AF60", name: "AF60", qty: 1, unit: 141500, total: 141500 }],
    kitchenDiscountedTotal: 141500,
    finalTotal: 476680,
    shippingFee: 45000
  };
  const st = {
    shippingFee: 45000,
    hardwareLines: [
      { name: "Separato", qty: 1, unit: 45700 },
      { name: "Kamravasalat", qty: 1, unit: 139000 }
    ],
    kiadvanyExtrasLines: [],
    worktopLines: [{ size: "60", fm: 2.45, unit: 125000, name: "Silestone" }],
    discount: 20
  };

  const merged = snapshotForPartialInvoice(liveUnder, anchor);
  assertClose("anchor-merge finalTotal", merged.finalTotal, 1030830);
  assertClose("anchor-merge kitchenDiscountedTotal", merged.kitchenDiscountedTotal, 985830);

  const badOverwrite = snapshotForPartialInvoice(liveUnder, {
    finalTotal: liveUnder.finalTotal,
    kitchenDiscountedTotal: liveUnder.kitchenDiscountedTotal,
    shippingFee: liveUnder.shippingFee
  });
  if (badOverwrite.finalTotal >= anchor.finalTotal) {
    console.error("FAIL [anchor-overwrite]: applyImportedQuote szimuláció nem csökkentheti az összeget");
    process.exit(1);
  }

  const r = assertI2EqualsSplittable("anchor-preserved", merged, st, 144000);
  assertClose("anchor-preserved part1", r.p1.sumGross, 515415);
  passed++;
}

// 4) Megrendelő import + MRDH-VACI-26-0510 JSON ha elérhető
const loadPath =
  "C:/Users/Divian-Dell231W/Desktop/Mentett megrendelők/Új mappa/MRDH-VACI-26-0510.json";
if (fs.existsSync(loadPath)) {
  const payload = JSON.parse(fs.readFileSync(loadPath, "utf8"));
  const cabinetLines = payload.snapshot.lines.filter(
    (l) => l.code && !String(l.name).toLowerCase().includes("vasalat")
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
  const st = Object.assign({}, imported.state, {
    hardwareLines: payload.state.hardwareLines,
    kiadvanyExtrasLines: payload.state.kiadvanyExtrasLines,
    worktopLines: payload.state.worktopLines
  });
  const r = assertI2EqualsSplittable("0510-import", imported.snapshot, st, 144000);
  assertClose("0510-import splittable", r.p1.splittable, 1030830);
  assertClose("0510-import vs finalTotal", r.combined, 1030830);
  passed++;
} else {
  console.log("SKIP: MRDH-VACI-26-0510.json nem található");
}

// 5) Vasalat külön sorokban, I+II egyezik
{
  const snapLines = [
    { code: "TKKSE60", name: "TKKSE60 - Vasalat - Separato", qty: 1, unit: 45700, total: 45700 },
    { code: "AF60", name: "AF60 alsó", qty: 1, unit: 200000, total: 200000 }
  ];
  const payload = MI.buildMegrendeloPayloadFromParts(
    {
      quoteNumber: "TEST-HW-01",
      snapLines,
      summary: { finalTotal: 290700, kitchenTotal: 200000, shippingFee: 45000 }
    },
    "TEST_megrendelo.pdf"
  );
  assertI2EqualsSplittable("hardware-split", payload.snapshot, payload.state, 0);
  passed++;
}

console.log(`OK: ${passed} proforma comprehensive checks passed`);
