/**
 * Smoke test: megrendelőlap footer → számla I+II összeg
 * Run: node scripts/test-megrendelo-summary.mjs [optional-xlsx-path]
 */
import fs from "fs";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");

function parseHufNumberCell(value) {
  const digits = String(value || "").replace(/[^\d]/g, "");
  return Math.max(0, Math.round(Number(digits) || 0));
}

function normalizeMegrendeloLabel(value) {
  return String(value || "")
    .trim()
    .replace(/:+$/, "")
    .replace(/\s+/g, " ");
}

function emptyMegrendeloSummary() {
  return {
    grossTotal: 0,
    finalTotal: 0,
    kitchenTotal: 0,
    grandTotal: 0,
    shippingFee: 0,
    assemblyFee: 0,
    discountPct: 0,
    discountHuf: 0,
    fromFooter: false
  };
}

function parseHufFromRowCells(cells, startIdx) {
  for (let j = startIdx; j < cells.length; j++) {
    const v = parseHufNumberCell(cells[j]);
    if (v > 0) return v;
  }
  return 0;
}

function applyMegrendeloSummaryLabel(summary, label, value, rowJoined) {
  const lab = normalizeMegrendeloLabel(label).toLowerCase();
  const joined = String(rowJoined || "").toLowerCase();
  const v = parseHufNumberCell(value);

  if ((lab.includes("szállítási díj") || lab.includes("kiszállítási díj")) && v > 0) {
    summary.shippingFee = v;
    summary.fromFooter = true;
  }
  if ((lab.includes("szerelés") || lab.includes("szerelési díj")) && v >= 1000) {
    summary.assemblyFee = v;
    summary.fromFooter = true;
  }
  if (lab.includes("összesen konyhabútor és kiegészítők") && v > 0) {
    summary.kitchenTotal = v;
    summary.fromFooter = true;
  }
  if (
    (lab.includes("kedvezmény nélküli") ||
      lab.includes("listaár összesen") ||
      lab.includes("listaar osszesen")) &&
    v > 0
  ) {
    summary.grossTotal = v;
    summary.fromFooter = true;
  }
  if (lab.includes("végösszeg") && lab.includes("szállítással")) {
    const embedded = parseHufNumberCell(
      label.replace(/.*v[eé]gösszeg\s+sz[aá]ll[ií]t[aá]ssal\s*:?\s*/i, "")
    );
    const amt = embedded > 100000 ? embedded : v > 100000 ? v : 0;
    if (amt > 0) {
      summary.grandTotal = amt;
      summary.fromFooter = true;
    }
  }
  if (joined.includes("végösszeg") && joined.includes("szállítással") && v > 0) {
    summary.grandTotal = v;
    summary.fromFooter = true;
  }
  const pctIn = (label + " " + rowJoined).match(/(\d{1,2})\s*%/);
  if (pctIn && Number(pctIn[1]) > 0 && Number(pctIn[1]) <= 50) {
    summary.discountPct = Number(pctIn[1]);
  }
}

function finalizeMegrendeloSummary(summary) {
  const ship = Math.max(0, summary.shippingFee || 0);
  const asm = Math.max(0, summary.assemblyFee || 0);
  const kitchen = Math.max(0, summary.kitchenTotal || 0);
  const grand = Math.max(0, summary.grandTotal || 0);
  if (kitchen > 0) {
    if (grand > 0 && asm > 0 && Math.abs(grand - kitchen - asm) <= 1000) {
      summary.finalTotal = kitchen;
    } else if (grand > 0 && ship > 0 && Math.abs(grand - kitchen - ship) <= 1000) {
      summary.finalTotal = grand;
    } else {
      summary.finalTotal = kitchen;
    }
  } else if (grand > 0) {
    summary.finalTotal = Math.max(0, grand - asm);
  } else {
    summary.finalTotal = 0;
  }
  return summary;
}

function parseMegrendeloSummaryFromAoA(aoa) {
  const summary = emptyMegrendeloSummary();
  for (const row of aoa || []) {
    const cells = (row || []).map((c) => String(c ?? "").trim());
    const rowJoined = cells.join(" ");
    for (let i = 0; i < cells.length; i++) {
      if (!cells[i]) continue;
      applyMegrendeloSummaryLabel(summary, cells[i], cells[i + 1] || "", rowJoined);
    }
    if (/v[eé]gösszeg\s+sz[aá]ll[ií]t[aá]ssal/i.test(rowJoined) && !summary.grandTotal) {
      const m = rowJoined.match(/v[eé]gösszeg\s+sz[aá]ll[ií]t[aá]ssal\s*:?\s*([\d\s]+)/i);
      if (m) {
        summary.grandTotal = parseHufNumberCell(m[1]);
        summary.fromFooter = true;
      }
    }
  }
  return finalizeMegrendeloSummary(summary);
}

const sampleFooterAoA = [
  ["", "", "Listaár összesen:", "4 342 920"],
  ["Előleg:", "1 500 000", "Összesen 20 % kedvezménnyel a konyhabútor:", "2 674 336"],
  ["Szállítási díj:", "80 000", "Összesen a kedvezményben nem szereplő kiegészítők összege:", "720 000"],
  ["Összesen konyhabútor és kiegészítők:", "3 394 336", "", ""],
  ["Végösszeg Szállítással: 3 474 336 Ft", "", "", ""]
];

const sampleFooterWithAssembly = [
  ["Kiszállítási díj:", "45 000", "", ""],
  ["Összesen konyhabútor és kiegészítők:", "3 170 220", "", ""],
  ["Szerelési díj:", "300 000", "", ""],
  ["Végösszeg (bruttó):", "3 470 220", "", ""]
];

const inline = parseMegrendeloSummaryFromAoA(sampleFooterAoA);
console.log("Inline footer test:");
console.log("  finalTotal:", inline.finalTotal, inline.fromFooter ? "(footer OK)" : "(FAIL)");
console.log("  shippingFee:", inline.shippingFee);
console.log("  discountPct:", inline.discountPct);

require(path.join(root, "partial-invoice-view.js"));
const PartialInvoiceView = globalThis.PartialInvoiceView;
const snap = {
  lines: [{ code: "MO60", name: "MO60 test", qty: 2, unit: 100000, total: 200000 }],
  grossTotal: inline.grossTotal,
  finalTotal: inline.finalTotal,
  shippingFee: inline.shippingFee,
  discountPct: inline.discountPct
};
const state = { shippingFee: inline.shippingFee, hardwareLines: [], kiadvanyExtrasLines: [] };
const splittable = PartialInvoiceView.resolvePartialInvoiceSplittableTotal(snap, state, 0);
console.log("  splittable (I+II target):", splittable);

const xlsxPath = process.argv[2];
if (xlsxPath && fs.existsSync(xlsxPath)) {
  const XLSX = require("xlsx");
  const wb = XLSX.readFile(xlsxPath);
  const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
  const fromFile = parseMegrendeloSummaryFromAoA(aoa);
  console.log("\nFile:", xlsxPath);
  console.log("  finalTotal:", fromFile.finalTotal, fromFile.fromFooter ? "(footer OK)" : "(no footer)");
} else if (xlsxPath) {
  console.log("\nFile not found:", xlsxPath);
}

const dnPayload = {
  snapshot: {
    lines: [
      { code: "MO60", name: "MO60 alsó 60cm", qty: 1, total: 100000 },
      { code: "MO60", name: "MO60 alsó 60cm", qty: 1, total: 100000 },
      { code: "MO80", name: "MO80 alsó 80cm", qty: 2, total: 200000 }
    ]
  },
  state: {
    selected: [
      ["MO60#0", { code: "MO60", name: "MO60 alsó 60cm", qty: 1 }],
      ["MO60#1", { code: "MO60", name: "MO60 alsó 60cm", qty: 1 }],
      ["MO80#2", { code: "MO80", name: "MO80 alsó 80cm", qty: 2 }]
    ]
  },
  kitchen: {},
  customer: {}
};
const dn = PartialInvoiceView.buildDeliveryNoteData(dnPayload);
console.log("\nCabinet db (duplicate MO60):", dn.cabinetDbTotal, "(expect 4)");

const withAsm = parseMegrendeloSummaryFromAoA(sampleFooterWithAssembly);
console.log("\nAssembly footer test (Mezei-Tóth style):");
console.log("  finalTotal:", withAsm.finalTotal, "(expect 3170220, szerelés nélkül)");

const ok =
  inline.finalTotal === 3474336 &&
  inline.fromFooter &&
  splittable === 3474336 &&
  withAsm.finalTotal === 3170220 &&
  dn.cabinetDbTotal === 4;
process.exit(ok ? 0 : 1);
