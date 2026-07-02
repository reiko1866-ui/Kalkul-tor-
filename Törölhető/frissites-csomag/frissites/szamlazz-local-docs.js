/**
 * Helyi díjbekérő és szállítólevél — Számlázz.hu API nélkül.
 * Ugyanaz a bizonylat-séma (eladó / vevő / tételek / összesítő), nyomtatható HTML.
 */
const {
  parseHungarianAddress,
  deliveryNoteDataToLineItems,
  resolvePaymentMethodLabel,
  buildDocumentComment
} = require("./szamlazz-integration");

const MARDOHOME_SELLER = {
  name: "MardoHome Kft.",
  taxNumber: "32787265-2-15",
  bankName: "CIB Bank",
  bankAccount: "10700062-75714152-51100005",
  email: "vaciut@divian.hu",
  vaci: {
    address: "1138 Budapest, Váci út 191.",
    phone: "+36 30 135 5821"
  },
  budaors: {
    address: "2040 Budaörs, Ady Endre utca 47.",
    phone: "+36 30 135 5821"
  }
};

const DOC_STYLES = `
  * { box-sizing: border-box; }
  body.sz-body {
    margin: 0;
    padding: 1.1rem 1.25rem 1.5rem;
    font-family: Arial, "Segoe UI", Calibri, sans-serif;
    font-size: 10pt;
    color: #222;
    background: #e8e8e8;
  }
  @media print {
    body.sz-body { padding: 0.4cm; background: #fff; }
    .sz-toolbar { display: none !important; }
  }
  .sz-toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
    margin-bottom: 0.85rem;
  }
  .sz-toolbar button {
    font: inherit;
    padding: 0.38rem 0.75rem;
    border: 1px solid #888;
    border-radius: 4px;
    background: #f5f5f5;
    cursor: pointer;
  }
  .sz-toolbar button.primary {
    background: #0066aa;
    color: #fff;
    border-color: #004477;
  }
  .sz-page {
    max-width: 210mm;
    margin: 0 auto;
    background: #fff;
    border: 1px solid #ccc;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    padding: 0.85rem 1rem 1.1rem;
  }
  .sz-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
    border-bottom: 3px solid #0066aa;
    padding-bottom: 0.55rem;
    margin-bottom: 0.65rem;
  }
  .sz-doc-type {
    font-size: 1.35rem;
    font-weight: 700;
    color: #0066aa;
    letter-spacing: 0.06em;
    margin: 0;
  }
  .sz-doc-num {
    font-size: 10pt;
    color: #333;
    margin: 0.2rem 0 0;
  }
  .sz-preview-badge {
    display: inline-block;
    margin-left: 0.35rem;
    padding: 0.1rem 0.45rem;
    font-size: 8pt;
    font-weight: 700;
    color: #8a5a00;
    background: #fff3cd;
    border: 1px solid #e0c060;
    border-radius: 3px;
    vertical-align: middle;
  }
  .sz-local-badge {
    display: inline-block;
    margin-left: 0.35rem;
    padding: 0.1rem 0.45rem;
    font-size: 7.5pt;
    font-weight: 600;
    color: #555;
    background: #eee;
    border: 1px solid #bbb;
    border-radius: 3px;
    vertical-align: middle;
  }
  .sz-parties {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
    margin-bottom: 0.65rem;
  }
  .sz-party {
    border: 1px solid #bbb;
    padding: 0.45rem 0.55rem;
    min-height: 5.5rem;
  }
  .sz-party h3 {
    margin: 0 0 0.35rem;
    font-size: 8.5pt;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #666;
    font-weight: 700;
  }
  .sz-party p {
    margin: 0.12rem 0;
    line-height: 1.35;
  }
  .sz-meta {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 0.55rem;
    font-size: 9pt;
  }
  .sz-meta td {
    padding: 0.2rem 0.45rem 0.2rem 0;
    vertical-align: top;
  }
  .sz-meta td.lbl {
    font-weight: 700;
    color: #444;
    white-space: nowrap;
    width: 9rem;
  }
  table.sz-items {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    font-size: 9pt;
    margin-bottom: 0.45rem;
  }
  table.sz-items col.c-name { width: 32%; }
  table.sz-items col.c-qty { width: 7%; }
  table.sz-items col.c-unit { width: 6%; }
  table.sz-items col.c-num { width: 11%; }
  table.sz-items thead th {
    background: #0066aa;
    color: #fff;
    font-weight: 700;
    text-align: left;
    padding: 0.35rem 0.4rem;
    border: 1px solid #005588;
  }
  table.sz-items thead th.num { text-align: right; }
  table.sz-items tbody td {
    padding: 0.32rem 0.4rem;
    border: 1px solid #ccc;
    vertical-align: top;
  }
  table.sz-items tbody tr:nth-child(even) td { background: #f7f7f7; }
  table.sz-items tbody td.num {
    text-align: right;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  table.sz-items tfoot td {
    padding: 0.35rem 0.4rem;
    border: 1px solid #ccc;
    font-weight: 700;
    background: #fafafa;
  }
  table.sz-items tfoot td.num { text-align: right; }
  .sz-totals {
    display: flex;
    justify-content: flex-end;
    margin-top: 0.35rem;
  }
  .sz-totals-box {
    min-width: 14rem;
    border: 2px solid #0066aa;
    padding: 0.45rem 0.65rem;
    text-align: right;
  }
  .sz-totals-box .lbl {
    font-size: 9pt;
    color: #444;
    margin-bottom: 0.15rem;
  }
  .sz-totals-box .amt {
    font-size: 1.15rem;
    font-weight: 800;
    color: #0066aa;
  }
  .sz-note {
    margin-top: 0.65rem;
    padding: 0.45rem 0.55rem;
    border: 1px dashed #aaa;
    font-size: 8.5pt;
    color: #333;
    white-space: pre-wrap;
  }
  .sz-footer {
    margin-top: 0.85rem;
    padding-top: 0.45rem;
    border-top: 1px solid #ccc;
    font-size: 8pt;
    color: #666;
    line-height: 1.4;
  }
  .sz-watermark {
    margin-top: 0.5rem;
    font-size: 7.5pt;
    color: #999;
    text-align: center;
  }
`;

function envFlag(name, defaultTrue) {
  const raw = process.env[name];
  if (raw == null || String(raw).trim() === "") return defaultTrue;
  const v = String(raw).trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function useMardoHomeSeller() {
  return envFlag("SZAMLAZZ_USE_MARDOHOME_SELLER", true);
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatHuf(n) {
  const v = Math.round(Number(n) || 0);
  return new Intl.NumberFormat("hu-HU", { maximumFractionDigits: 0 }).format(v);
}

function formatIsoHu(iso) {
  const s = String(iso || "").trim();
  const p = s.split("-");
  if (p.length === 3) return p[0] + "." + p[1] + "." + p[2] + ".";
  return s;
}

function parseIsoDate(value, fallback) {
  const s = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = fallback instanceof Date ? fallback : new Date();
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}

function addDaysIso(isoDate, days) {
  const d = new Date(isoDate + "T12:00:00");
  d.setDate(d.getDate() + days);
  return parseIsoDate("", d);
}

function resolveStoreKey(payload) {
  const s = String(payload?.kitchen?.store || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (s === "budaors" || s.includes("buda")) return "budaors";
  return "vaci";
}

function resolveSeller(payload) {
  if (!useMardoHomeSeller()) {
    return {
      name: "Eladó (helyi előnézet)",
      taxNumber: "",
      address: "",
      phone: "",
      bankName: "",
      bankAccount: "",
      email: ""
    };
  }
  const key = resolveStoreKey(payload);
  const branch = MARDOHOME_SELLER[key] || MARDOHOME_SELLER.vaci;
  return {
    name: MARDOHOME_SELLER.name,
    taxNumber: MARDOHOME_SELLER.taxNumber,
    address: branch.address,
    phone: branch.phone,
    bankName: MARDOHOME_SELLER.bankName,
    bankAccount: MARDOHOME_SELLER.bankAccount,
    email: MARDOHOME_SELLER.email
  };
}

function resolvePreviewOnly(body) {
  if (body && (body.previewOnly === true || body.preview === true || body.elonezet === true)) {
    return true;
  }
  if (body && (body.previewOnly === false || body.issue === true)) {
    return false;
  }
  return true;
}

function localDocumentNumber(docType, previewOnly, quoteNumber) {
  if (previewOnly) return "(előnézet — nincs bizonylatszám)";
  const prefix = docType === "deliveryNote" ? "SZL" : "DB";
  const q = String(quoteNumber || "").trim().replace(/[^\w-]+/g, "");
  const stamp = parseIsoDate("").replace(/-/g, "");
  return prefix + "-HELYI-" + (q || stamp);
}

function buildPartyHtml(label, fields) {
  const lines = [];
  if (fields.name) lines.push("<strong>" + escapeHtml(fields.name) + "</strong>");
  if (fields.taxNumber) lines.push("Adószám: " + escapeHtml(fields.taxNumber));
  if (fields.address) lines.push(escapeHtml(fields.address));
  if (fields.phone) lines.push("Tel.: " + escapeHtml(fields.phone));
  if (fields.email) lines.push(escapeHtml(fields.email));
  return (
    '<div class="sz-party"><h3>' +
    escapeHtml(label) +
    "</h3>" +
    lines.map((l) => "<p>" + l + "</p>").join("") +
    "</div>"
  );
}

function buildMetaTable(rows) {
  const body = rows
    .filter((r) => r && r.value)
    .map(
      (r) =>
        "<tr><td class=\"lbl\">" +
        escapeHtml(r.label) +
        ":</td><td>" +
        escapeHtml(r.value) +
        "</td></tr>"
    )
    .join("");
  return body ? '<table class="sz-meta"><tbody>' + body + "</tbody></table>" : "";
}

function buildProformaLineRows(proformaRows) {
  let sumNet = 0;
  let sumVat = 0;
  let sumGross = 0;
  const body = (Array.isArray(proformaRows) ? proformaRows : [])
    .map((row, i) => {
      const qty = Math.max(1, Math.floor(Number(row.qty) || 0));
      const net = Math.max(0, Math.round(Number(row.net) || 0));
      const vat = Math.max(0, Math.round(Number(row.vat) || 0));
      const gross = Math.max(0, Math.round(Number(row.gross) || 0));
      const unitNet = Math.max(0, Math.round(Number(row.unitNet) || 0));
      const vatPct = Number(row.vatPct) || 27;
      sumNet += net;
      sumVat += vat;
      sumGross += gross;
      const stripe = i % 2 === 0 ? "" : "";
      return (
        "<tr class=\"" +
        stripe +
        "\"><td>" +
        escapeHtml(row.megnevezes) +
        '</td><td class="num">' +
        qty +
        '</td><td class="num">db</td><td class="num">' +
        formatHuf(unitNet) +
        '</td><td class="num">' +
        vatPct +
        "%</td><td class=\"num\">" +
        formatHuf(net) +
        '</td><td class="num">' +
        formatHuf(vat) +
        '</td><td class="num">' +
        formatHuf(gross) +
        "</td></tr>"
      );
    })
    .join("");
  return { body, sumNet, sumVat, sumGross };
}

function buildZeroPriceLineRows(lineItems) {
  const body = (Array.isArray(lineItems) ? lineItems : [])
    .map((item, i) => {
      const qty = Number(item.quantity) || 1;
      const unit = String(item.unit || "db");
      return (
        "<tr><td>" +
        escapeHtml(item.label) +
        (item.comment ? "<br/><small>" + escapeHtml(item.comment) + "</small>" : "") +
        '</td><td class="num">' +
        qty +
        '</td><td class="num">' +
        escapeHtml(unit) +
        '</td><td class="num">0</td><td class="num">AAM</td><td class="num">0</td><td class="num">0</td><td class="num">0</td></tr>'
      );
    })
    .join("");
  return { body, sumNet: 0, sumVat: 0, sumGross: 0 };
}

function buildDocumentHtml(ctx) {
  const previewOnly = !!ctx.previewOnly;
  const docType = ctx.documentType;
  const docTitle = docType === "deliveryNote" ? "SZÁLLÍTÓLEVÉL" : "DÍJBEKÉRŐ";
  const docNumber = ctx.documentNumber || "";
  const seller = ctx.seller || {};
  const buyer = ctx.buyer || {};
  const lineBlock =
    docType === "deliveryNote"
      ? buildZeroPriceLineRows(ctx.lineItems)
      : buildProformaLineRows(ctx.proformaRows);

  const numHtml =
    '<p class="sz-doc-num"><strong>Bizonylatszám:</strong> ' +
    escapeHtml(docNumber) +
    (previewOnly ? '<span class="sz-preview-badge">ELŐNÉZET</span>' : "") +
    '<span class="sz-local-badge">Helyi — nem Számlázz.hu</span></p>';

  const metaRows = [
    { label: "Kelt", value: formatIsoHu(ctx.issueDate) },
    { label: "Teljesítés", value: formatIsoHu(ctx.fulfillmentDate) },
    { label: "Fizetési határidő", value: formatIsoHu(ctx.dueDate) },
    { label: "Fizetési mód", value: ctx.paymentMethod },
    { label: "Pénznem", value: "HUF" },
    { label: "Rendelésszám", value: ctx.quoteNumber }
  ];

  const itemsTable =
    '<table class="sz-items" aria-label="Tételek">' +
    "<colgroup>" +
    '<col class="c-name" /><col class="c-qty" /><col class="c-unit" />' +
    '<col class="c-num" /><col class="c-num" /><col class="c-num" /><col class="c-num" /><col class="c-num" />' +
    "</colgroup>" +
    "<thead><tr>" +
    "<th>Megnevezés</th>" +
    '<th class="num">Menny.</th>' +
    '<th class="num">M.e.</th>' +
    '<th class="num">Nettó egységár</th>' +
    '<th class="num">ÁFA</th>' +
    '<th class="num">Nettó</th>' +
    '<th class="num">ÁFA érték</th>' +
    '<th class="num">Bruttó</th>' +
    "</tr></thead><tbody>" +
    (lineBlock.body || '<tr><td colspan="8">Nincs tétel</td></tr>') +
    "</tbody><tfoot><tr>" +
    '<td colspan="5"><strong>Összesen:</strong></td>' +
    '<td class="num"><strong>' +
    formatHuf(lineBlock.sumNet) +
    "</strong></td>" +
    '<td class="num"><strong>' +
    formatHuf(lineBlock.sumVat) +
    "</strong></td>" +
    '<td class="num"><strong>' +
    formatHuf(lineBlock.sumGross) +
    "</strong></td></tr></tfoot></table>";

  const totalsBox =
    docType === "deliveryNote"
      ? ""
      : '<div class="sz-totals"><div class="sz-totals-box">' +
        '<div class="lbl">Fizetendő összeg:</div>' +
        '<div class="amt">' +
        formatHuf(lineBlock.sumGross) +
        " Ft</div></div></div>";

  const noteHtml = ctx.comment
    ? '<div class="sz-note"><strong>Megjegyzés</strong><br/>' + escapeHtml(ctx.comment) + "</div>"
    : "";

  const footerBits = [];
  if (seller.bankName && seller.bankAccount) {
    footerBits.push(
      escapeHtml(seller.bankName) + ": " + escapeHtml(seller.bankAccount)
    );
  }
  if (seller.email) footerBits.push(escapeHtml(seller.email));
  footerBits.push(
    "Helyi bizonylat — nem került kiállításra a Számlázz.hu rendszerben. NAV jelentés, hivatalos sorszám és e-számla nem vonatkozik."
  );

  return (
    "<!DOCTYPE html><html lang=\"hu\"><head><meta charset=\"utf-8\"/><title>" +
    escapeHtml(docTitle) +
    "</title><style>" +
    DOC_STYLES +
    "</style></head><body class=\"sz-body\">" +
    '<div class="sz-toolbar">' +
    '<button type="button" class="primary" onclick="window.print()">Nyomtatás / PDF mentés</button>' +
    '<button type="button" onclick="window.close()">Bezárás</button>' +
    "</div>" +
    '<div class="sz-page">' +
    '<div class="sz-head"><div><h1 class="sz-doc-type">' +
    escapeHtml(docTitle) +
    "</h1>" +
    numHtml +
    "</div></div>" +
    '<div class="sz-parties">' +
    buildPartyHtml("Eladó", seller) +
    buildPartyHtml("Vevő", buyer) +
    "</div>" +
    buildMetaTable(metaRows) +
    itemsTable +
    totalsBox +
    noteHtml +
    '<div class="sz-footer">' +
    footerBits.join(" · ") +
    "</div>" +
    '<div class="sz-watermark">Divian Kalkulátor — helyi bizonylat előnézet</div>' +
    "</div></body></html>"
  );
}

function issueLocalProforma(body) {
  const payload = body?.payload;
  const proformaRows = body?.proformaRows;
  if (!Array.isArray(proformaRows) || !proformaRows.length) {
    return { ok: false, error: "missing-proforma-rows" };
  }
  const previewOnly = resolvePreviewOnly(body);
  const customerName = String(payload?.customer?.name || "Vevő").trim();
  const customerAddr = parseHungarianAddress(payload?.customer?.address || "");
  const customerPhone = String(payload?.customer?.phone || "").trim();
  const customerEmail = String(payload?.customer?.email || "").trim();
  const quoteNumber = String(payload?.quoteNumber || "").trim();
  const issueDate = parseIsoDate(payload?.quoteDate);
  const fulfillmentDate = issueDate;
  const dueDate = addDaysIso(issueDate, 8);
  const paymentMethod = resolvePaymentMethodLabel(payload);
  const commentBase = buildDocumentComment(payload, null);
  const depositNote =
    "A megrendelés véglegesítéséhez a teljes vételár minimum 50%-ának megfelelő előleg megfizetése szükséges.";
  const comment = [commentBase, depositNote].filter(Boolean).join("\n").slice(0, 900);
  const seller = resolveSeller(payload);
  const buyer = {
    name: customerName,
    address:
      customerAddr.zip !== "0000"
        ? customerAddr.zip + " " + customerAddr.city + ", " + customerAddr.address
        : customerAddr.city + ", " + customerAddr.address,
    phone: customerPhone,
    email: customerEmail
  };
  const documentNumber = localDocumentNumber("proforma", previewOnly, quoteNumber);
  const html = buildDocumentHtml({
    documentType: "proforma",
    previewOnly,
    documentNumber,
    seller,
    buyer,
    proformaRows,
    lineItems: [],
    issueDate,
    fulfillmentDate,
    dueDate,
    paymentMethod,
    quoteNumber,
    comment
  });
  const totals = buildProformaLineRows(proformaRows);
  return {
    ok: true,
    local: true,
    documentType: "proforma",
    previewOnly,
    documentNumber,
    netTotal: String(totals.sumNet),
    grossTotal: String(totals.sumGross),
    html,
    hasHtml: true,
    hasPdf: false
  };
}

function issueLocalDeliveryNote(body) {
  const payload = body?.payload;
  const deliveryNoteData = body?.deliveryNoteData;
  if (!deliveryNoteData || typeof deliveryNoteData !== "object") {
    return { ok: false, error: "missing-delivery-note-data" };
  }
  const previewOnly = resolvePreviewOnly(body);
  const lineItems = deliveryNoteDataToLineItems(deliveryNoteData);
  if (!lineItems.length) {
    return { ok: false, error: "Nincs szállítólevél tétel a beküldött adatokban." };
  }
  const customerName = String(
    deliveryNoteData.customerName || payload?.customer?.name || "Vevő"
  ).trim();
  const customerAddr = parseHungarianAddress(
    deliveryNoteData.customerAddress || payload?.customer?.address || ""
  );
  const customerPhone = String(
    deliveryNoteData.customerPhone || payload?.customer?.phone || ""
  ).trim();
  const customerEmail = String(
    deliveryNoteData.customerEmail || payload?.customer?.email || ""
  ).trim();
  const quoteNumber = String(
    deliveryNoteData.quoteNumber || payload?.quoteNumber || ""
  ).trim();
  const issueDate = parseIsoDate(
    deliveryNoteData.deliveryNoteIssueDate || payload?.quoteDate
  );
  const fulfillmentDate = issueDate;
  const dueDate = addDaysIso(issueDate, 8);
  const paymentMethod = resolvePaymentMethodLabel(payload);
  const comment = buildDocumentComment(payload, deliveryNoteData);
  const seller = resolveSeller(payload);
  const buyer = {
    name: customerName,
    address:
      customerAddr.zip !== "0000"
        ? customerAddr.zip + " " + customerAddr.city + ", " + customerAddr.address
        : customerAddr.city + ", " + customerAddr.address,
    phone: customerPhone,
    email: customerEmail
  };
  const documentNumber = localDocumentNumber("deliveryNote", previewOnly, quoteNumber);
  const html = buildDocumentHtml({
    documentType: "deliveryNote",
    previewOnly,
    documentNumber,
    seller,
    buyer,
    proformaRows: [],
    lineItems,
    issueDate,
    fulfillmentDate,
    dueDate,
    paymentMethod,
    quoteNumber,
    comment
  });
  return {
    ok: true,
    local: true,
    documentType: "deliveryNote",
    previewOnly,
    documentNumber,
    netTotal: "0",
    grossTotal: "0",
    html,
    hasHtml: true,
    hasPdf: false
  };
}

function handleLocalSzamlazzRequest(body) {
  let parsed = body;
  if (typeof body === "string") {
    try {
      parsed = body ? JSON.parse(body) : {};
    } catch (_err) {
      return { ok: false, error: "invalid-json" };
    }
  }
  const docType = String(parsed?.documentType || parsed?.type || "").trim().toLowerCase();
  if (docType === "deliverynote" || docType === "delivery-note" || docType === "szallitolevel") {
    return issueLocalDeliveryNote(parsed);
  }
  if (docType === "proforma" || docType === "dijbekero" || docType === "díjbekérő") {
    return issueLocalProforma(parsed);
  }
  return { ok: false, error: "unknown-document-type", hint: "deliveryNote | proforma" };
}

module.exports = {
  handleLocalSzamlazzRequest,
  issueLocalProforma,
  issueLocalDeliveryNote,
  buildDocumentHtml,
  isLocalOnlyModeEnv: envFlag
};
