import fs from "fs";
import vm from "vm";

const codesSrc = fs.readFileSync("divian-cabinet-codes.js", "utf8");
const sandbox = { window: {}, module: { exports: {} } };
sandbox.globalThis = sandbox.window;
vm.runInNewContext(codesSrc, sandbox);
const api = sandbox.window.DivianCabinetCodes;

function legsFor(code, qty, name = "") {
  if (api.isLegExemptCabinetCode(code)) return 0;
  const cat = api.inferCabinetCatalogCategory(code, name);
  if (cat === "Alsó elemek" || cat === "Magas elemek") return qty * 4;
  return 0;
}

const cases = [
  ["AF90", 1, 4],
  ["AF90", 3, 12],
  ["AML60P", 3, 12],
  ["KMTH75W", 1, 4],
  ["KMTB601F", 1, 4],
  ["AR20", 2, 0],
  ["F60", 2, 0],
  ["MO60", 1, 0],
  ["FU40", 2, 0],
  ["FÜ90", 1, 0],
  ["FU80F", 1, 0]
];

let ok = true;
for (const [code, qty, want] of cases) {
  const got = legsFor(code, qty);
  const pass = got === want;
  if (!pass) ok = false;
  console.log((pass ? "OK" : "FAIL") + " " + code + " x" + qty + " => " + got + " (want " + want + ")");
}
process.exit(ok ? 0 : 1);
