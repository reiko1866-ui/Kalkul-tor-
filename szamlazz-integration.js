/**
 * Számlázz.hu Agent integráció (szerver oldal).
 *
 * Környezeti változók:
 *   SZAMLAZZ_USE_DEMO     — "true": Számlázz.hu nyilvános demo fiók (demo / demo)
 *   SZAMLAZZ_USER         — felhasználónév (Agent kulcs helyett)
 *   SZAMLAZZ_PASSWORD     — jelszó
 *   SZAMLAZZ_AGENT_KEY    — Számla Agent kulcs (éles / saját fiók)
 *   SZAMLAZZ_USE_SANDBOX  — "true": előnézeti PDF (elonezetpdf). Demo módban alapból false.
 *   SZAMLAZZ_LOCAL_ONLY   — "true" (alapértelmezett): helyi HTML bizonylat, API hívás nélkül.
 *   SZAMLAZZ_USE_API      — "true": kényszeríti a Számlázz.hu API-t (SZAMLAZZ_LOCAL_ONLY=0).
 *
 * Megjegyzés: a szamlazz.js csomag nem támogatja a szállítólevelet (szallitolevel) — azt nyers XML-lel küldjük.
 */
const fs = require("fs");
const path = require("path");
const FormData = require("form-data");
const axios = require("axios");

const SZAMLAZZ_URL = "https://www.szamlazz.hu/szamla/";
const XMLNS = "http://www.szamlazz.hu/xmlszamla";
const AGENT_KEY_FILE = path.join(__dirname, "szamlazz-agent-key.txt");

const PLACEHOLDER_AGENT_KEYS = new Set([
  "",
  "test",
  "mardo_sandbox_aktiv",
  "IDE_ILLESZD_BE_A_SZAMLA_AGENT_KULCSOT"
]);

/** MardoHome Kft. — Számlázz.hu eladói adatok (bankszámla, e-mail). A cégadatok a fiókban vannak beállítva. */
const MARDOHOME_SELLER = {
  bankName: "CIB Bank",
  bankAccount: "10700062-75714152-51100005",
  email: "vaciut@divian.hu",
  taxNumber: "32787265-2-15"
};

function envFlag(name, defaultTrue) {
  const raw = process.env[name];
  if (raw == null || String(raw).trim() === "") return defaultTrue;
  const v = String(raw).trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function readAgentKeyFromFile() {
  try {
    const raw = fs.readFileSync(AGENT_KEY_FILE, "utf8");
    const line = String(raw || "")
      .split(/\r?\n/)
      .map((x) => x.trim())
      .find((x) => x && !x.startsWith("#"));
    return line || "";
  } catch (_err) {
    return "";
  }
}

function resolveAgentKey() {
  const fromEnv = String(process.env.SZAMLAZZ_AGENT_KEY || "").trim();
  const fromFile = readAgentKeyFromFile();
  if (fromFile && (!fromEnv || PLACEHOLDER_AGENT_KEYS.has(fromEnv))) return fromFile;
  if (fromEnv && !PLACEHOLDER_AGENT_KEYS.has(fromEnv)) return fromEnv;
  return fromFile;
}

function isDemoModeRequested() {
  return envFlag("SZAMLAZZ_USE_DEMO", false) || envFlag("SZAMLAZZ_DEMO", false);
}

function resolveAuth() {
  if (isDemoModeRequested()) {
    const user = String(process.env.SZAMLAZZ_USER || "demo").trim();
    const password = String(process.env.SZAMLAZZ_PASSWORD || "demo").trim();
    return { mode: "user", user, password, isDemo: true };
  }
  const agentKey = resolveAgentKey();
  if (agentKey && !PLACEHOLDER_AGENT_KEYS.has(agentKey)) {
    return { mode: "token", authToken: agentKey, isDemo: false };
  }
  const user = String(process.env.SZAMLAZZ_USER || "").trim();
  const password = String(process.env.SZAMLAZZ_PASSWORD || "").trim();
  if (user && password) {
    return {
      mode: "user",
      user,
      password,
      isDemo: user.toLowerCase() === "demo" && password.toLowerCase() === "demo"
    };
  }
  return { mode: "none", isDemo: false };
}

function hasValidAuth(config) {
  if (!config || config.mode === "none") return false;
  if (config.mode === "token") return !!String(config.authToken || "").trim();
  return !!String(config.user || "").trim() && !!String(config.password || "").trim();
}

/** Helyi bizonylat mód — alapértelmezett; API: SZAMLAZZ_USE_API=1 vagy SZAMLAZZ_LOCAL_ONLY=0. */
function isLocalOnlyMode() {
  if (envFlag("SZAMLAZZ_USE_API", false)) return false;
  if (process.env.SZAMLAZZ_LOCAL_ONLY != null && String(process.env.SZAMLAZZ_LOCAL_ONLY).trim() !== "") {
    return envFlag("SZAMLAZZ_LOCAL_ONLY", true);
  }
  return true;
}

function loadSzamlazzConfig() {
  const auth = resolveAuth();
  // Teszt fiók (Agent kulcs + tesztüzem): valódi bizonylat a fiókban — elonezetpdf NEM kell.
  // Elonezetpdf (SZAMLAZZ_USE_SANDBOX=true): csak PDF előnézet, nincs bizonylatszám.
  let useSandbox = envFlag("SZAMLAZZ_USE_SANDBOX", false);
  if (auth.isDemo && (process.env.SZAMLAZZ_USE_SANDBOX == null || String(process.env.SZAMLAZZ_USE_SANDBOX).trim() === "")) {
    useSandbox = false;
  }
  return { ...auth, useSandbox };
}

function resolvePreviewOnly(body, config) {
  if (body && (body.previewOnly === true || body.preview === true || body.elonezet === true)) {
    return true;
  }
  if (body && (body.previewOnly === false || body.issue === true)) {
    return false;
  }
  return !!config.useSandbox;
}

function appendAuthSettingsXml(xml, indent, auth) {
  if (auth.mode === "token") {
    return xml + xmlEl("szamlaagentkulcs", auth.authToken, indent);
  }
  if (auth.mode === "user") {
    xml += xmlEl("felhasznalo", auth.user, indent);
    xml += xmlEl("jelszo", auth.password, indent);
  }
  return xml;
}

function appendSellerXml(xml, indent, config) {
  const useMardo = envFlag("SZAMLAZZ_USE_MARDOHOME_SELLER", false);
  if (config?.isDemo || !useMardo) {
    return xml + padXml(indent) + "<elado></elado>\n";
  }
  xml += padXml(indent) + "<elado>\n";
  xml += xmlEl("bank", MARDOHOME_SELLER.bankName, indent + 1);
  xml += xmlEl("bankszamlaszam", MARDOHOME_SELLER.bankAccount, indent + 1);
  if (MARDOHOME_SELLER.email) xml += xmlEl("emailReplyto", MARDOHOME_SELLER.email, indent + 1);
  xml += padXml(indent) + "</elado>\n";
  return xml;
}

function buildSzamlazzClientOptions(config) {
  const base = {
    eInvoice: false,
    requestInvoiceDownload: true,
    downloadedInvoiceCount: 1,
    responseVersion: 1,
    timeout: 60000
  };
  if (config.mode === "token") {
    return { ...base, authToken: config.authToken };
  }
  return { ...base, user: config.user, password: config.password };
}

function buildSzamlazzSeller(Seller, config, quoteNumber) {
  if (config.isDemo || !envFlag("SZAMLAZZ_USE_MARDOHOME_SELLER", false)) {
    return new Seller({});
  }
  return new Seller({
    bank: {
      name: MARDOHOME_SELLER.bankName,
      accountNumber: MARDOHOME_SELLER.bankAccount
    },
    email: {
      replyToAddress: MARDOHOME_SELLER.email,
      subject: "Díjbekérő — " + (quoteNumber || "Divian"),
      message: ""
    }
  });
}

function formatSzamlazzApiError(err) {
  const code = String(err?.code || "").trim();
  const msg = String(err?.message || err || "ismeretlen hiba");
  if (code === "3") {
    return (
      "Sikertelen bejelentkezés (hibakód 3). Ellenőrizd a szamlazz-agent-key.txt kulcsot " +
      "(kisbetű, egy sor, Számlázz.hu → Számla Agent kulcsok)."
    );
  }
  if (code === "136") {
    return (
      "Számla Agent nem használható (hibakód 136). Jelentkezz be szamlazz.hu-ra: előfizetés, tartozás vagy függő díj."
    );
  }
  if (code === "164") {
    return (
      "Több Számlázz.hu fiókhoz van hozzáférésed — generálj dedikált Agent kulcsot, és azt használd."
    );
  }
  if (msg.includes("díjbekérő") || msg.includes("dijbekero") || msg.includes("díjcsomagod")) {
    return (
      msg +
      " — A tesztfiókban kapcsold be: Vezérlőpult → Tesztüzem bekapcsolása (#profi). " +
      "Addig próbáld a SZL előnézet gombot, vagy állíts ki díjbekérőt kézzel a Számlázz.hu-n."
    );
  }
  return msg;
}

function pdfBufferToBase64(pdf) {
  if (!pdf) return "";
  if (Buffer.isBuffer(pdf)) return pdf.length ? pdf.toString("base64") : "";
  if (pdf instanceof ArrayBuffer) {
    const buf = Buffer.from(pdf);
    return buf.length ? buf.toString("base64") : "";
  }
  if (Array.isArray(pdf) || pdf?.byteLength != null) {
    const buf = Buffer.from(pdf);
    return buf.length ? buf.toString("base64") : "";
  }
  return "";
}

function attachPdfToResult(result, pdf) {
  const pdfBase64 = pdfBufferToBase64(pdf);
  if (pdfBase64) {
    result.pdfBase64 = pdfBase64;
    result.hasPdf = true;
  }
  return result;
}

function padXml(level) {
  return "  ".repeat(Math.max(0, level || 0));
}

function xmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function xmlEl(name, value, indent) {
  if (value == null) return "";
  if (value === false || value === true) {
    return padXml(indent) + "<" + name + ">" + (value ? "true" : "false") + "</" + name + ">\n";
  }
  const v = String(value);
  if (v === "") return padXml(indent) + "<" + name + "></" + name + ">\n";
  return padXml(indent) + "<" + name + ">" + xmlEscape(v) + "</" + name + ">\n";
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

/** Magyar cím → irsz, település, utca (egyszerű heurisztika). */
function parseHungarianAddress(raw) {
  const s = String(raw || "").trim();
  if (!s) return { zip: "0000", city: "-", address: "-" };
  const comma = s.match(/^(\d{4})\s+([^,]+),\s*(.+)$/);
  if (comma) {
    return { zip: comma[1], city: comma[2].trim(), address: comma[3].trim() };
  }
  const spaced = s.match(/^(\d{4})\s+(.+)$/);
  if (spaced) {
    const rest = spaced[2].trim();
    const parts = rest.split(/\s+/);
    if (parts.length >= 2) {
      return { zip: spaced[1], city: parts[0], address: parts.slice(1).join(" ") };
    }
    return { zip: spaced[1], city: rest, address: rest };
  }
  return { zip: "0000", city: s, address: s };
}

function resolvePaymentMethodLabel(payload) {
  const fromPayload = String(payload?.paymentMethod || payload?.fizetesiMod || "").trim();
  if (fromPayload) return fromPayload;
  return "Átutalás";
}

function buildDocumentComment(payload, deliveryNoteData) {
  const bits = [];
  const note = String(payload?.note || "").trim();
  if (note) bits.push(note);
  if (deliveryNoteData?.tallCabinetDbTotal > 0) {
    bits.push("Nagy autó / emelős szállítás szükséges.");
  }
  const store = String(payload?.kitchen?.store || "").trim();
  if (store) bits.push("Áruház: " + store);
  return bits.join("\n").slice(0, 900);
}

/** Szállítólevél tételek — összesítő + munkalap + nagyker (ár nélkül, 0 Ft tétel). */
function deliveryNoteDataToLineItems(data) {
  const d = data && typeof data === "object" ? data : {};
  const items = [];
  const kitchenName = String(d.kitchenName || "Konyha").trim() || "Konyha";
  const cabinetDb = Math.max(0, Math.floor(Number(d.cabinetDbTotal) || 0));

  if (kitchenName || cabinetDb > 0) {
    const label =
      kitchenName +
      " konyha " +
      cabinetDb +
      " elem" +
      (cabinetDb > 0 ? " + kiegészítő elemek" : "");
    items.push({ label, quantity: 1, unit: "db", comment: "" });
  }

  (Array.isArray(d.worktopDetailLabels) ? d.worktopDetailLabels : []).forEach((label) => {
    const text = String(label || "").trim();
    if (text) items.push({ label: text, quantity: 1, unit: "db", comment: "Munkalap" });
  });

  if (Array.isArray(d.tallCabinetDetailLabels) && d.tallCabinetDetailLabels.length) {
    d.tallCabinetDetailLabels.forEach((label, idx) => {
      const text = String(label || "").trim();
      if (text) {
        items.push({
          label: "Magas álló elem " + (idx + 1) + ": " + text,
          quantity: 1,
          unit: "db",
          comment: ""
        });
      }
    });
  }

  const nagyker = Array.isArray(d.nagykerRows) ? d.nagykerRows : [];
  nagyker.forEach((row) => {
    if (!row || !row.megnevezes) return;
    const unit = String(row.unit || "db");
    if (unit === "—") return;
    const qty = Math.max(0, Number(row.qty) || 0) || 1;
    items.push({
      label: String(row.megnevezes).trim(),
      quantity: qty,
      unit: unit || "db",
      comment: row.detail ? String(row.detail) : ""
    });
  });

  if (!items.length) {
    const sections = Array.isArray(d.sections) ? d.sections : [];
    sections.forEach((section) => {
      (Array.isArray(section.rows) ? section.rows : []).forEach((row) => {
        if (!row || !row.megnevezes) return;
        const unit = String(row.unit || "db");
        if (unit === "—") {
          items.push({
            label: String(row.megnevezes) + ": " + String(row.qty || ""),
            quantity: 1,
            unit: "db",
            comment: ""
          });
          return;
        }
        items.push({
          label: String(row.megnevezes).trim(),
          quantity: Math.max(1, Number(row.qty) || 1),
          unit: unit || "db",
          comment: ""
        });
      });
    });
  }

  return items.filter((it) => it.label);
}

function buildZeroPriceTetelXml(item, indent) {
  const qty = Number(item.quantity) || 1;
  const unit = String(item.unit || "db");
  let xml = padXml(indent) + "<tetel>\n";
  xml += xmlEl("megnevezes", item.label, indent + 1);
  xml += xmlEl("mennyiseg", qty, indent + 1);
  xml += xmlEl("mennyisegiEgyseg", unit, indent + 1);
  xml += xmlEl("nettoEgysegar", 0, indent + 1);
  xml += xmlEl("afakulcs", "AAM", indent + 1);
  xml += xmlEl("nettoErtek", 0, indent + 1);
  xml += xmlEl("afaErtek", 0, indent + 1);
  xml += xmlEl("bruttoErtek", 0, indent + 1);
  if (item.comment) xml += xmlEl("megjegyzes", item.comment, indent + 1);
  xml += padXml(indent) + "</tetel>\n";
  return xml;
}

function buildDeliveryNoteXml(opts) {
  const auth = opts.auth || { mode: "none" };
  const previewOnly = !!opts.previewOnly;
  const payload = opts.payload || {};
  const data = opts.deliveryNoteData || {};
  const customerName = String(
    data.customerName || payload?.customer?.name || "Vevő"
  ).trim();
  const customerAddr = parseHungarianAddress(
    data.customerAddress || payload?.customer?.address || ""
  );
  const customerPhone = String(data.customerPhone || payload?.customer?.phone || "").trim();
  const customerEmail = String(data.customerEmail || payload?.customer?.email || "").trim();
  const quoteNumber = String(data.quoteNumber || payload?.quoteNumber || "").trim();
  const issueDate = parseIsoDate(data.deliveryNoteIssueDate || payload?.quoteDate);
  const fulfillmentDate = issueDate;
  const dueDate = addDaysIso(issueDate, 8);
  const paymentMethod = resolvePaymentMethodLabel(payload);
  const comment = buildDocumentComment(payload, data);
  const lineItems = deliveryNoteDataToLineItems(data);
  if (!lineItems.length) {
    throw new Error("Nincs szállítólevél tétel a beküldött adatokban.");
  }

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml +=
    '<xmlszamla xmlns="' +
    XMLNS +
    '" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="' +
    XMLNS +
    " https://www.szamlazz.hu/szamla/docs/xsds/agent/xmlszamla.xsd\">\n";
  xml += padXml(1) + "<beallitasok>\n";
  xml = appendAuthSettingsXml(xml, 2, auth);
  xml += xmlEl("eszamla", false, 2);
  xml += xmlEl("szamlaLetoltes", true, 2);
  xml += xmlEl("valaszVerzio", 1, 2);
  xml += padXml(1) + "</beallitasok>\n";
  xml += padXml(1) + "<fejlec>\n";
  xml += xmlEl("keltDatum", issueDate, 2);
  xml += xmlEl("teljesitesDatum", fulfillmentDate, 2);
  xml += xmlEl("fizetesiHataridoDatum", dueDate, 2);
  xml += xmlEl("fizmod", paymentMethod, 2);
  xml += xmlEl("penznem", "HUF", 2);
  xml += xmlEl("szamlaNyelve", "hu", 2);
  if (comment) xml += xmlEl("megjegyzes", comment, 2);
  if (quoteNumber) xml += xmlEl("rendelesSzam", quoteNumber, 2);
  xml += xmlEl("dijbekero", false, 2);
  xml += xmlEl("szallitolevel", true, 2);
  if (previewOnly) xml += xmlEl("elonezetpdf", true, 2);
  xml += padXml(1) + "</fejlec>\n";
  xml = appendSellerXml(xml, 1, { isDemo: !!opts.isDemo });
  xml += padXml(1) + "<vevo>\n";
  xml += xmlEl("nev", customerName, 2);
  xml += xmlEl("irsz", customerAddr.zip, 2);
  xml += xmlEl("telepules", customerAddr.city, 2);
  xml += xmlEl("cim", customerAddr.address, 2);
  if (customerEmail) xml += xmlEl("email", customerEmail, 2);
  xml += xmlEl("sendEmail", false, 2);
  if (customerPhone) xml += xmlEl("telefonszam", customerPhone, 2);
  xml += padXml(1) + "</vevo>\n";
  xml += padXml(1) + "<tetelek>\n";
  lineItems.forEach((item) => {
    xml += buildZeroPriceTetelXml(item, 2);
  });
  xml += padXml(1) + "</tetelek>\n";
  xml += "</xmlszamla>\n";
  return xml;
}

async function postSzamlazzXml(xml, responseVersion) {
  const formData = new FormData();
  formData.append("action-xmlagentxmlfile", xml, "request.xml");
  const httpResponse = await axios.post(SZAMLAZZ_URL, formData.getBuffer(), {
    headers: formData.getHeaders(),
    withCredentials: true,
    timeout: 60000,
    responseType: responseVersion === 1 ? "arraybuffer" : "text",
    validateStatus: () => true
  });
  if (httpResponse.status !== 200) {
    throw new Error("Számlázz.hu HTTP " + httpResponse.status + " " + httpResponse.statusText);
  }
  const headers = httpResponse.headers || {};
  if (headers.szlahu_error_code) {
    const err = new Error(
      decodeURIComponent(String(headers.szlahu_error || "Számlázz.hu hiba").replace(/\+/g, " "))
    );
    err.code = headers.szlahu_error_code;
    throw err;
  }
  return {
    invoiceId: headers.szlahu_szamlaszam || "",
    netTotal: headers.szlahu_nettovegosszeg || "",
    grossTotal: headers.szlahu_bruttovegosszeg || "",
    customerAccountUrl: headers.szlahu_vevoifiokurl || "",
    pdf: httpResponse.data
  };
}

async function issueDeliveryNote(body) {
  const config = loadSzamlazzConfig();
  if (!hasValidAuth(config)) {
    return {
      ok: false,
      error: "missing-auth",
      hint:
        "Hozd létre a szamlazz-agent-key.txt fájlt (egy sor: Számlázz.hu Számla Agent kulcs)."
    };
  }
  const payload = body?.payload;
  const deliveryNoteData = body?.deliveryNoteData;
  if (!deliveryNoteData || typeof deliveryNoteData !== "object") {
    return { ok: false, error: "missing-delivery-note-data" };
  }
  const previewOnly = resolvePreviewOnly(body, config);
  const xml = buildDeliveryNoteXml({
    auth: config,
    isDemo: config.isDemo,
    previewOnly,
    payload,
    deliveryNoteData
  });
  try {
    const result = await postSzamlazzXml(xml, 1);
    return attachPdfToResult(
      {
        ok: true,
        documentType: "deliveryNote",
        previewOnly,
        documentNumber: result.invoiceId || (previewOnly ? "(előnézet — nincs bizonylatszám)" : ""),
        netTotal: result.netTotal,
        grossTotal: result.grossTotal,
        customerAccountUrl: result.customerAccountUrl,
        hasPdf: !!result.pdf && result.pdf.length > 0,
        sandbox: previewOnly,
        demo: config.isDemo
      },
      result.pdf
    );
  } catch (err) {
    return {
      ok: false,
      error: formatSzamlazzApiError(err),
      code: err?.code || "",
      sandbox: previewOnly,
      demo: config.isDemo
    };
  }
}

async function loadSzamlazzModule() {
  return import("szamlazz.js");
}

function proformaRowsToItems(rows, Item) {
  const list = Array.isArray(rows) ? rows : [];
  return list.map((row) => {
    const qty = Math.max(1, Math.floor(Number(row.qty) || 0));
    const netUnit = Math.max(0, Math.round(Number(row.unitNet) || 0));
    return new Item({
      label: String(row.megnevezes || "Tétel").trim(),
      quantity: qty,
      unit: "db",
      vat: Number(row.vatPct) || 27,
      netUnitPrice: netUnit,
      comment: ""
    });
  });
}

async function issueProforma(body) {
  const config = loadSzamlazzConfig();
  if (!hasValidAuth(config)) {
    return {
      ok: false,
      error: "missing-auth",
      hint:
        "Hozd létre a szamlazz-agent-key.txt fájlt (egy sor: Számlázz.hu Számla Agent kulcs)."
    };
  }
  const payload = body?.payload;
  const proformaRows = body?.proformaRows;
  if (!Array.isArray(proformaRows) || !proformaRows.length) {
    return { ok: false, error: "missing-proforma-rows" };
  }
  const sz = await loadSzamlazzModule();
  const {
    Buyer,
    Client,
    Invoice,
    Item,
    Seller,
    Currencies,
    Languages,
    PaymentMethods,
    TaxSubjects
  } = sz;

  const customerName = String(payload?.customer?.name || "Vevő").trim();
  const customerAddr = parseHungarianAddress(payload?.customer?.address || "");
  const customerPhone = String(payload?.customer?.phone || "").trim();
  const customerEmail = String(payload?.customer?.email || "").trim();
  const quoteNumber = String(payload?.quoteNumber || "").trim();
  const issueDate = parseIsoDate(payload?.quoteDate);
  const fulfillmentDate = issueDate;
  const dueDate = addDaysIso(issueDate, 8);
  const paymentMethod = resolvePaymentMethodLabel(payload);
  const pm =
    paymentMethod === "Bankkártya" || paymentMethod.toLowerCase().includes("kártya")
      ? PaymentMethods.CreditCard
      : paymentMethod === "Készpénz"
        ? PaymentMethods.Cash
        : PaymentMethods.BankTransfer;

  const buyer = new Buyer({
    name: customerName,
    zip: customerAddr.zip,
    city: customerAddr.city,
    address: customerAddr.address,
    email: customerEmail,
    phone: customerPhone,
    taxSubject: TaxSubjects.NoTaxID,
    sendEmail: false
  });

  const seller = buildSzamlazzSeller(Seller, config, quoteNumber);

  const items = proformaRowsToItems(proformaRows, Item);
  const comment = buildDocumentComment(payload, null);
  const depositNote =
    "A megrendelés véglegesítéséhez a teljes vételár minimum 50%-ának megfelelő előleg megfizetése szükséges.";
  const fullComment = [comment, depositNote].filter(Boolean).join("\n").slice(0, 900);

  const invoiceOpts = {
    issueDate: new Date(issueDate + "T12:00:00"),
    fulfillmentDate: new Date(fulfillmentDate + "T12:00:00"),
    dueDate: new Date(dueDate + "T12:00:00"),
    paymentMethod: pm,
    currency: Currencies.HUF,
    language: Languages.Hungarian,
    seller,
    buyer,
    items,
    orderNumber: quoteNumber,
    proforma: true,
    comment: fullComment,
    noNavReport: config.isDemo ? undefined : true
  };

  const client = new Client(buildSzamlazzClientOptions(config));
  const previewOnly = resolvePreviewOnly(body, config);

  if (previewOnly) {
    const previewXml = buildProformaPreviewXml({
      auth: config,
      isDemo: config.isDemo,
      paymentMethodLabel: paymentMethod,
      proformaRows,
      customerName,
      customerAddr,
      customerPhone,
      customerEmail,
      quoteNumber,
      issueDate,
      fulfillmentDate,
      dueDate,
      comment: fullComment
    });
    try {
      const result = await postSzamlazzXml(previewXml, 1);
      return attachPdfToResult(
        {
          ok: true,
          documentType: "proforma",
          previewOnly: true,
          documentNumber: result.invoiceId || "(előnézet — nincs bizonylatszám)",
          netTotal: result.netTotal,
          grossTotal: result.grossTotal,
          hasPdf: !!result.pdf && result.pdf.length > 0,
          sandbox: true,
          demo: config.isDemo
        },
        result.pdf
      );
    } catch (err) {
      return {
        ok: false,
        error: formatSzamlazzApiError(err),
        code: err?.code || "",
        sandbox: true,
        demo: config.isDemo
      };
    }
  }

  const invoice = new Invoice(invoiceOpts);
  try {
    const result = await client.issueInvoice(invoice);
    return attachPdfToResult(
      {
        ok: true,
        documentType: "proforma",
        previewOnly: false,
        documentNumber: result.invoiceId || "",
        netTotal: result.netTotal,
        grossTotal: result.grossTotal,
        customerAccountUrl: result.customerAccountUrl,
        hasPdf: !!result.pdf,
        sandbox: false,
        demo: config.isDemo
      },
      result.pdf
    );
  } catch (err) {
    return {
      ok: false,
      error: formatSzamlazzApiError(err),
      code: err?.code || "",
      sandbox: false,
      demo: config.isDemo
    };
  }
}

/** Díjbekérő előnézet (sandbox) — elonezetpdf, szamlazz.js Invoice nem támogatja ezt a mezőt. */
function buildProformaPreviewXml(ctx) {
  const auth = ctx.auth || { mode: "none" };
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml +=
    '<xmlszamla xmlns="' +
    XMLNS +
    '" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="' +
    XMLNS +
    " https://www.szamlazz.hu/szamla/docs/xsds/agent/xmlszamla.xsd\">\n";
  xml += padXml(1) + "<beallitasok>\n";
  xml = appendAuthSettingsXml(xml, 2, auth);
  xml += xmlEl("eszamla", false, 2);
  xml += xmlEl("szamlaLetoltes", true, 2);
  xml += xmlEl("valaszVerzio", 1, 2);
  xml += padXml(1) + "</beallitasok>\n";
  xml += padXml(1) + "<fejlec>\n";
  xml += xmlEl("keltDatum", ctx.issueDate, 2);
  xml += xmlEl("teljesitesDatum", ctx.fulfillmentDate, 2);
  xml += xmlEl("fizetesiHataridoDatum", ctx.dueDate, 2);
  xml += xmlEl("fizmod", ctx.paymentMethodLabel, 2);
  xml += xmlEl("penznem", "HUF", 2);
  xml += xmlEl("szamlaNyelve", "hu", 2);
  if (ctx.comment) xml += xmlEl("megjegyzes", ctx.comment, 2);
  if (ctx.quoteNumber) xml += xmlEl("rendelesSzam", ctx.quoteNumber, 2);
  xml += xmlEl("dijbekero", true, 2);
  xml += xmlEl("elonezetpdf", true, 2);
  xml += padXml(1) + "</fejlec>\n";
  xml = appendSellerXml(xml, 1, { isDemo: !!ctx.isDemo });
  xml += padXml(1) + "<vevo>\n";
  xml += xmlEl("nev", ctx.customerName, 2);
  xml += xmlEl("irsz", ctx.customerAddr.zip, 2);
  xml += xmlEl("telepules", ctx.customerAddr.city, 2);
  xml += xmlEl("cim", ctx.customerAddr.address, 2);
  if (ctx.customerEmail) xml += xmlEl("email", ctx.customerEmail, 2);
  xml += xmlEl("sendEmail", false, 2);
  if (ctx.customerPhone) xml += xmlEl("telefonszam", ctx.customerPhone, 2);
  xml += padXml(1) + "</vevo>\n";
  xml += padXml(1) + "<tetelek>\n";
  (ctx.proformaRows || []).forEach((row) => {
    const qty = Math.max(1, Math.floor(Number(row.qty) || 0));
    const net = Math.max(0, Math.round(Number(row.net) || 0));
    const vat = Math.max(0, Math.round(Number(row.vat) || 0));
    const gross = Math.max(0, Math.round(Number(row.gross) || 0));
    const unitNet = Math.max(0, Math.round(Number(row.unitNet) || 0));
    let block = padXml(2) + "<tetel>\n";
    block += xmlEl("megnevezes", row.megnevezes, 3);
    block += xmlEl("mennyiseg", qty, 3);
    block += xmlEl("mennyisegiEgyseg", "db", 3);
    block += xmlEl("nettoEgysegar", unitNet, 3);
    block += xmlEl("afakulcs", Number(row.vatPct) || 27, 3);
    block += xmlEl("nettoErtek", net, 3);
    block += xmlEl("afaErtek", vat, 3);
    block += xmlEl("bruttoErtek", gross, 3);
    block += padXml(2) + "</tetel>\n";
    xml += block;
  });
  xml += padXml(1) + "</tetelek>\n";
  xml += "</xmlszamla>\n";
  return xml;
}

async function handleSzamlazzRequest(body) {
  let parsed = body;
  if (typeof body === "string") {
    try {
      parsed = body ? JSON.parse(body) : {};
    } catch (_err) {
      return { ok: false, error: "invalid-json" };
    }
  }
  if (isLocalOnlyMode()) {
    const { handleLocalSzamlazzRequest } = require("./szamlazz-local-docs");
    return handleLocalSzamlazzRequest(parsed);
  }
  const docType = String(parsed?.documentType || parsed?.type || "").trim().toLowerCase();
  if (docType === "deliverynote" || docType === "delivery-note" || docType === "szallitolevel") {
    return issueDeliveryNote(parsed);
  }
  if (docType === "proforma" || docType === "dijbekero" || docType === "díjbekérő") {
    return issueProforma(parsed);
  }
  return { ok: false, error: "unknown-document-type", hint: "deliveryNote | proforma" };
}

function verifyModuleLoads() {
  return loadSzamlazzModule().then(() => ({ ok: true }));
}

module.exports = {
  loadSzamlazzConfig,
  isLocalOnlyMode,
  resolveAuth,
  hasValidAuth,
  handleSzamlazzRequest,
  issueDeliveryNote,
  issueProforma,
  verifyModuleLoads,
  deliveryNoteDataToLineItems,
  parseHungarianAddress,
  resolvePaymentMethodLabel,
  buildDocumentComment
};
