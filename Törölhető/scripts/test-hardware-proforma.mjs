/**
 * Vasalat sorok a díjbekérőhöz — snapshot teszt (node, jsdom nélkül).
 * Futtatás: node scripts/test-hardware-proforma.mjs
 */
import { createRequire } from "module";
import vm from "vm";

const require = createRequire(import.meta.url);
const sandbox = { globalThis: {} };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(
  require("fs").readFileSync(new URL("../partial-invoice-view.js", import.meta.url), "utf8"),
  sandbox
);
vm.runInContext(
  require("fs").readFileSync(new URL("../divian-megrendelo-import.js", import.meta.url), "utf8"),
  sandbox
);

const PartialInvoiceView = sandbox.PartialInvoiceView;
const MegrendeloImport = sandbox.MegrendeloImport;

const snapLines = [
  {
    code: "TKKSE60",
    name: "TKKSE60 - Vasalat - Divian Separato 60 szelektív hulladéktároló",
    qty: 1,
    unit: 45700,
    total: 45700
  },
  {
    code: "TVKK40H_SZR",
    name: "TVKK40H_SZR - Vasalat - Divian Kamravasalat K40H 400 - Szürke rács tálcával",
    qty: 1,
    unit: 139000,
    total: 139000
  },
  { code: "AF60", name: "AF60 - Alsó 1+2 fiók 60-as", qty: 1, unit: 141500, total: 141500 }
];

const hw = PartialInvoiceView.hardwareLinesFromSnapshot({ lines: snapLines });
if (hw.length !== 2) {
  console.error("FAIL: várt 2 vasalat sor, kapott", hw.length, hw);
  process.exit(1);
}

const payload = MegrendeloImport.buildMegrendeloPayloadFromParts(
  {
    quoteNumber: "MRDH-VACI-26-0507",
    customer: { name: "Brájer Pál" },
    snapLines,
    summary: { finalTotal: 2004730, shippingFee: 60000 }
  },
  "MRDH-VACI-26-0507_megrendelo.pdf"
);

if ((payload.state.hardwareLines || []).length !== 2) {
  console.error("FAIL: import hardwareLines", payload.state.hardwareLines);
  process.exit(1);
}
if ((payload.state.selected || []).length !== 1) {
  console.error("FAIL: csak 1 bútor maradjon selected-ben", payload.state.selected);
  process.exit(1);
}

console.log("OK: vasalat proforma import", {
  hardware: payload.state.hardwareLines.map((l) => l.name),
  cabinets: payload.state.selected.length
});
