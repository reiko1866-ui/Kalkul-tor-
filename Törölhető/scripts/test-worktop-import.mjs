/**
 * Munkalap sorok visszaállítása PDF snapshot sorokból.
 * Futtatás: node scripts/test-worktop-import.mjs
 */
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { extractWorktopStateFromSnapLines } = require("../divian-megrendelo-import.js");

const snap = [
  {
    name: "Munkalap — 60 · Silestone Et. Calacatta Gold",
    qty: 2.45,
    unit: 125000,
    total: 306250
  },
  { name: "Munkalap fordító", qty: 2, unit: 2890, total: 5780 },
  { name: "AKL60 Alsó szekrény", qty: 1, unit: 50000, total: 50000, code: "AKL60" }
];

const r = extractWorktopStateFromSnapLines(snap);
if (!r.worktopLines.length) {
  console.error("FAIL: nincs munkalap sor");
  process.exit(1);
}
const wt = r.worktopLines[0];
if (wt.size !== "60" || wt.fm !== 2.45 || wt.unit !== 125000) {
  console.error("FAIL: hibás munkalap mezők", wt);
  process.exit(1);
}
if (r.worktopTurnerQty !== 2) {
  console.error("FAIL: fordító db", r.worktopTurnerQty);
  process.exit(1);
}
console.log("OK: worktop import", {
  lines: r.worktopLines.length,
  size: wt.size,
  fm: wt.fm,
  cm: wt.cm,
  turnerQty: r.worktopTurnerQty
});
