/**
 * I./II. részlet számla előkészítő — megjelenés (nyomtatás / előnézet).
 * Használat: arajanlat.html, szamla-eloreszlet.html
 */
(function (global) {
  const PI_VAT_PCT = 27;
  const PI_BRAND = "#800040";
  const PI_BRAND_DARK = "#5c002e";
  const PI_MUSTARD = "#f3bf35";

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /** Táblázat cellák: 656 559 (Ft nélkül) */
  function formatPiAmount(n) {
    const v = Math.round(Number(n) || 0);
    return new Intl.NumberFormat("hu-HU", { maximumFractionDigits: 0 })
      .format(v)
      .replace(/\u00a0/g, " ");
  }

  /** Végösszeg: 1 105 025 Ft */
  function formatPiGrandTotal(n) {
    return formatPiAmount(n) + " Ft";
  }

  function formatPiDate(iso) {
    const s = String(iso || "").trim();
    if (!s) return "";
    const p = s.split("-");
    if (p.length === 3) return p[0] + "." + p[1] + "." + p[2] + ".";
    return s;
  }

  const ASSEMBLY_UNIT_FEE_HUF = 12000;
  const DELIVERY_NOTE_PDF_FOLDER_HINT = "Mentett megrendelők (vevő mappa)";

  function normalizeInvoiceLineText(name, code) {
    return (String(name || "") + " " + String(code || ""))
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  /** Összeszerelés díja mező (árajánlat) — számlán nem szerepel. */
  function isAssemblyInstallFeeLine(name, code, lineTotal, assemblyFeeRef) {
    const t = normalizeInvoiceLineText(name, code);
    if (t) {
      if (t.includes("osszeszereles dij") || t.includes("osszeszereles")) return true;
      if (t.includes("osszeszere")) return true;
      if (/\bszereles\b/.test(t) && (t.includes("dij") || t.includes("dija"))) return true;
      if (t.includes("beepites") && t.includes("dij")) return true;
    }
    const total = Math.max(0, Math.floor(Number(lineTotal) || 0));
    const ref = Math.max(0, Math.floor(Number(assemblyFeeRef) || 0));
    if (ref > 0 && total === ref) return true;
    return false;
  }

  /** Összesítő snapshot sor = összeszerelés díja (név vagy DB×12 000 Ft mező összeg). */
  function isAssemblySnapshotLine(line, assemblyFeeRef) {
    if (!line || typeof line !== "object") return false;
    const name = String(line.name || "");
    const code = String(line.code || "");
    const total = Math.max(0, Math.floor(Number(line.total) || 0));
    const qty = Math.max(0, Math.floor(Number(line.qty) || 0));
    const unit = Math.max(0, Math.floor(Number(line.unit) || 0));
    if (isAssemblyInstallFeeLine(name, code, total, assemblyFeeRef)) return true;
    const ref = Math.max(0, Math.floor(Number(assemblyFeeRef) || 0));
    if (ref > 0 && total === ref) return true;
    if (
      unit === ASSEMBLY_UNIT_FEE_HUF &&
      qty > 0 &&
      total === qty * ASSEMBLY_UNIT_FEE_HUF &&
      !String(code || "").trim()
    ) {
      const t = normalizeInvoiceLineText(name, "");
      if (!t || t.includes("osszeszere") || t.includes("szereles")) return true;
    }
    return false;
  }

  function resolveAssemblyFeeFromPayload(payload) {
    const snap = payload?.snapshot || {};
    const st = payload?.state || {};
    return Math.max(
      0,
      Math.floor(Number(snap.assemblyFee) || 0) || Math.floor(Number(st.assemblyFee) || 0)
    );
  }

  /** Számla fő sor megnevezése: konyha neve + „konyha I./II. részlet”. */
  function resolvePartialInvoiceKitchenTitle(payload, part) {
    const k = payload?.kitchen || {};
    const kt = String(k.kitchenType || "").trim();
    const fam = String(k.family || "").trim();
    const base = kt || fam || "Konyha";
    const suffix = part === 2 ? "II. részlet" : "I. részlet";
    return base + " konyha " + suffix;
  }

  function invoiceLineGross(qty, unit) {
    return Math.max(
      0,
      Math.floor(Number(qty) || 0) * Math.floor(Number(unit) || 0)
    );
  }

  function sumInvoiceHardwareGross(lines, assemblyFeeRef) {
    let sum = 0;
    (lines || []).forEach((line) => {
      const g = invoiceLineGross(line.qty, line.unit);
      if (g <= 0) return;
      if (isAssemblyInstallFeeLine(line.name, line.code, g, assemblyFeeRef)) return;
      sum += g;
    });
    return sum;
  }

  function sumInvoiceKiadvanyGross(lines, assemblyFeeRef) {
    let sum = 0;
    (lines || []).forEach((line) => {
      if (!isInvoiceKiadvanyLine(line)) return;
      const g = invoiceLineGross(line.qty, line.unit);
      if (g <= 0) return;
      if (isAssemblyInstallFeeLine(line.name, line.code, g, assemblyFeeRef)) return;
      sum += g;
    });
    return sum;
  }

  function isInvoiceHardwareSnapshotLine(line) {
    if (!line || typeof line !== "object") return false;
    const t = normalizeInvoiceLineText(line.name, line.code);
    return t.includes("vasalat");
  }

  const KIADVANY_EXTRA_KINDS = ["trayDivian", "trayBlanco", "tap", "bundle", "appliance"];

  const NAGYKER_KIADVANY_KINDS = new Set([
    "appliance",
    "trayDivian",
    "trayBlanco",
    "tap",
    "bundle"
  ]);
  const NAGYKER_TAP_LABEL = "Csaptelep";

  const DELIVERY_STORES = {
    vaci: {
      fullName: "Divian Konyhaműhelyek - Váci út",
      address: "1138 Budapest, Váci út 191.",
      phone: "+36 30 135 5821",
      email: "vaciut@divian.hu"
    },
    budaors: {
      fullName: "Divian Konyhaműhelyek - Budaörs",
      address: "2040 Budaörs, Ady Endre u. 47.",
      phone: "+36 30 135 5821",
      email: "vaciut@divian.hu"
    }
  };

  function resolveDeliveryStoreKey(storeRaw) {
    const s = String(storeRaw || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    if (s === "budaors" || s.includes("buda")) return "budaors";
    return "vaci";
  }

  function resolveDeliveryStoreInfo(storeRaw) {
    const key = resolveDeliveryStoreKey(storeRaw);
    return Object.assign({ key }, DELIVERY_STORES[key] || DELIVERY_STORES.vaci);
  }

  function todayDeliveryNoteIsoDate() {
    const d = new Date();
    return (
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0")
    );
  }

  function lookupOfficialCatalogName(code) {
    const key = String(code || "")
      .trim()
      .toUpperCase()
      .replace(/_(FT|SO)$/i, "");
    if (!key) return "";
    try {
      const kisker = global.DIVIAN_KISKER_PRICEBOOK;
      if (kisker && kisker[key] && kisker[key].name) return String(kisker[key].name).trim();
      const fixed = global.DIVIAN_FIXED_PRICEBOOK;
      if (fixed && typeof fixed === "object") {
        for (const fam of Object.keys(fixed)) {
          const hit = fixed[fam] && fixed[fam][key];
          if (hit && hit.name) return String(hit.name).trim();
        }
      }
    } catch (_e) {
      /* ignore */
    }
    return "";
  }

  function stripCatalogCodeFromName(code, name) {
    const n = String(name || "").trim();
    const c = String(code || "").trim().toUpperCase();
    if (!n) return "";
    if (c && n.toUpperCase().startsWith(c)) {
      return n.slice(c.length).replace(/^[\s\-—–·]+/, "").trim();
    }
    return n;
  }

  function normalizeHungarianDeliverySpelling(text) {
    let s = String(text || "").trim();
    if (!s) return "";
    const pairs = [
      [/\bGep\b/g, "Gép"],
      [/\bgep\b/g, "gép"],
      [/\bMosogatotalca\b/gi, "Mosogatótálca"],
      [/\bKonyhabutor\b/gi, "Konyhabútor"],
      [/\bKiegeszitok\b/gi, "Kiegészítők"],
      [/\bOldaltakaro\b/gi, "Oldaltakaró"],
      [/\bSarok takaro\b/gi, "Sarok takaró"],
      [/\bMagas szekreny\b/gi, "Magas szekrény"],
      [/\bmely\b/gi, "mély"],
      [/\bSzallitasi\b/gi, "Szállítási"],
      [/\bszukseges\b/gi, "szükséges"],
      [/\bVasalat\b/g, "Vasalat"]
    ];
    pairs.forEach(([re, rep]) => {
      s = s.replace(re, rep);
    });
    return s.replace(/\s+/g, " ").trim();
  }

  function isDeliveryStructuralRowLabel(label) {
    const t = normalizeInvoiceLineText(String(label || ""), "");
    if (!t) return true;
    if (t === "konyha neve") return true;
    if (t === "konyhabutor + kiegeszitok") return true;
    if (t === "munkalap darab" || t.startsWith("munkalap (")) return true;
    if (/^munkalap \d+$/.test(t)) return true;
    if (t.startsWith("munkalap szin")) return true;
    if (t === "korpusz") return true;
    if (t === "also front" || t === "felso front" || t === "kamra felso front") return true;
    if (t.includes("nagy allo elem") || t.includes("magas allo elem")) return true;
    if (/^magas allo elem \d+$/.test(t)) return true;
    if (t === "szallitasi jelzes") return true;
    return false;
  }

  function formatOfficialDeliveryProductName(raw) {
    const s = String(raw || "").trim();
    if (!s || s === "—") return s || "—";
    if (isDeliveryStructuralRowLabel(s)) return s;

    const codeLead = s.match(/^([A-Z]{1,6}[\dA-Z_]*)\s*[—–\-·]\s*(.+)$/i);
    if (codeLead) {
      const code = codeLead[1].toUpperCase().replace(/_(FT|SO)$/i, "");
      const official = lookupOfficialCatalogName(code);
      if (official) {
        const desc = stripCatalogCodeFromName(code, official) || codeLead[2].trim();
        return normalizeHungarianDeliverySpelling(code + " — " + desc);
      }
    }

    const bareCode = s.match(/^([A-Z]{1,6}[\dA-Z_]*)$/i);
    if (bareCode) {
      const official = lookupOfficialCatalogName(bareCode[1]);
      if (official) return normalizeHungarianDeliverySpelling(official);
    }

    return normalizeHungarianDeliverySpelling(s);
  }

  const KIADVANY_APPLIANCE_BRANDS = [
    "whirlpool",
    "bosch",
    "evido",
    "aeg",
    "beko",
    "siemens",
    "zanussi",
    "electrolux",
    "candy",
    "hotpoint",
    "miele",
    "gorenje",
    "samsung",
    "lg"
  ];

  /** Bútorelem név (pl. ATF60 sütőtartó, FFM60 mikrotartó) — nem kiadvány / Nagyker. */
  function isLikelyCabinetModuleNameText(t) {
    if (!t) return false;
    if (/tartó\s*elem|tarto\s*elem/.test(t)) return true;
    if (/mikrotartó|mikrotarto/.test(t)) return true;
    if (/^atf\d|^ffm\d|^amo\d|^fny\d|^mo\d/.test(t)) return true;
    return false;
  }

  /** Számla / snapshot: tervező bútormodul — konyhatörzsbe tartozik, nem külön kiadvány sor. */
  function isInvoiceCabinetModuleLine(line) {
    if (!line || typeof line !== "object") return false;
    if (isDeliveryCabinetWithIntegratedHardwareLine(line)) return true;
    const code = String(line.code || "").trim();
    if (code && isDeliveryCountableCabinetLine(code, line.name, line.category)) return true;
    const t = normalizeInvoiceLineText(line.name, code);
    return isLikelyCabinetModuleNameText(t);
  }

  /** Divian / kiadvány szett, LED szett, Bosch–Evido csomag — nem összevonható „Csaptelep” sorba. */
  function isKiadvanyBundleOrSetLine(line) {
    if (!line || typeof line !== "object") return false;
    const kind = String(line.kind || "").trim();
    if (kind === "bundle") return true;
    const code = String(line.code || "")
      .trim()
      .toUpperCase();
    if (/^(SET_|LED_SET_|BOS-SZETT|EVI-SZETT)/.test(code)) return true;
    if (/^DIV-CSOM-/.test(code)) return true;
    const t = normalizeInvoiceLineText(line.name, line.code);
    if (!t) return false;
    if (/\b(szett|csomag)\b/.test(t) || t.includes("divian szett") || t.includes("led szett")) return true;
    if (/^szett\s*[·•\-]/.test(t)) return true;
    return false;
  }

  function isPureStandaloneTapLine(line) {
    if (!line || typeof line !== "object") return false;
    if (isKiadvanyBundleOrSetLine(line)) return false;
    const kind = String(line.kind || "").trim();
    if (kind === "tap") return true;
    const code = String(line.code || "")
      .trim()
      .toUpperCase();
    if (/^DIV-CSAP-/.test(code)) return true;
    const t = normalizeInvoiceLineText(line.name, line.code);
    if (!t) return false;
    if (t.startsWith("csaptelep")) return true;
    if (/\bcsaptelep\b/.test(t) && !/\b(szett|csomag|talca|mosogato)\b/.test(t)) return true;
    if (t.includes("csap") && (t.includes("telep") || t.includes("csaptelep"))) return true;
    return false;
  }

  function inferKiadvanyLineKind(line) {
    if (!line || typeof line !== "object") return "";
    const existing = String(line.kind || "").trim();
    if (existing) return existing;
    if (isKiadvanyBundleOrSetLine(line)) {
      const code = String(line.code || "")
        .trim()
        .toUpperCase();
      const t = normalizeInvoiceLineText(line.name, line.code);
      if (/^DIV-CSOM-/.test(code) || t.includes("csomag:")) return "bundle";
      return "bundle";
    }
    const code = String(line.code || "")
      .trim()
      .toUpperCase();
    const t = normalizeInvoiceLineText(line.name, line.code);
    if (/^TDIV-/.test(code) || (t.includes("talca") && t.includes("divian"))) return "trayDivian";
    if (t.includes("blanco") && t.includes("talca")) return "trayBlanco";
    if (isPureStandaloneTapLine(line)) return "tap";
    if (
      t.includes("suto") ||
      t.includes("fozolap") ||
      t.includes("mosogatogep") ||
      KIADVANY_APPLIANCE_BRANDS.some((b) => new RegExp("\\b" + b + "\\b").test(t))
    ) {
      return "appliance";
    }
    if (/\b(szett|csomag)\b/.test(t) || t.includes("divian szett")) return "bundle";
    return "";
  }

  function formatKiadvanyDetailTitle(prefix, line) {
    const name = String(line?.name || "").trim();
    const brand = String(line?.brand || "").trim();
    const code = String(line?.code || "").trim();
    const nm = name || code;
    if (!nm) return prefix;
    const lower = nm.toLowerCase();
    if (brand && !lower.includes(brand.toLowerCase())) {
      return prefix + " · " + brand + " · " + nm;
    }
    return prefix + " · " + nm;
  }

  function formatKiadvanyInvoiceTitle(line) {
    if (!line || typeof line !== "object") return "";
    const kind = inferKiadvanyLineKind(line);
    const name = String(line.name || "").trim();
    const code = String(line.code || "").trim();
    if (kind === "appliance") return formatKiadvanyDetailTitle("Gép", line);
    if (kind === "bundle") {
      if (/^DIV-CSOM-/.test(code.toUpperCase()) || name.toLowerCase().includes("csomag:")) {
        return formatKiadvanyDetailTitle("Csomag", { ...line, name: name.replace(/^csomag:\s*/i, "") });
      }
      if (/^szett\s*[·•]/i.test(name)) return name;
      return formatKiadvanyDetailTitle("Szett", { ...line, name: name.replace(/^szett\s*[·•]\s*/i, "") });
    }
    if (kind === "trayDivian") return formatKiadvanyDetailTitle("Mosogatótálca (Divian)", line);
    if (kind === "trayBlanco") return formatKiadvanyDetailTitle("Mosogatótálca (Blanco)", line);
    if (kind === "tap" || isPureStandaloneTapLine(line)) {
      return formatKiadvanyDetailTitle(NAGYKER_TAP_LABEL, line);
    }
    if (code && name && !name.toUpperCase().startsWith(code.toUpperCase())) {
      return code + " · " + name;
    }
    return name || code;
  }

  /** Megrendelőlap / kiadvány: csap, tálca, gép, szett — prefix nélkül is (pl. „Cados csap telep”). */
  function isLikelyKiadvanyDeliveryNameText(t) {
    if (!t) return false;
    if (isLikelyCabinetModuleNameText(t)) return false;
    if (/\b(szett|csomag)\b/.test(t) || t.includes("divian szett") || t.includes("led szett")) return true;
    if (/^szett\s*[·•\-]/.test(t)) return true;
    if (/^(set_|led_set_|bos-szett|evi-szett|div-csom-)/.test(t)) return true;
    if (t.startsWith("mosogatotalca")) return true;
    if (t.startsWith("csaptelep")) return true;
    if (t.startsWith("gep") || t.startsWith("szett")) return true;
    if (t.includes("csap") && (t.includes("telep") || t.includes("csaptelep"))) return true;
    if (t.includes("mosogato") && (t.includes("tarto") || t.includes("amo "))) return false;
    if (t.includes("talca") || t.includes("mosogatotalca")) return true;
    if (t.includes("mosogato") || t.includes("mosogatogep")) return true;
    if (t.includes("csepegteto") || t.includes("csepegtet")) return true;
    if (t.includes("konyhagep")) return true;
    if (/\bwhp\b/.test(t) || t.includes("whirlpool")) return true;
    if (t.includes("suto") || t.includes("fozolap") || t.includes("parael")) return true;
    if (t.includes("mikro")) return true;
    if (t.includes("fiokrendez") || t.includes("fiok rendez")) return true;
    if (t.includes("labpedal")) return true;
    if (t.includes("konzol")) return true;
    if (t.includes("asztallab")) return true;
    if (t.includes("hetich") || t.includes("blanco")) return true;
    if (KIADVANY_APPLIANCE_BRANDS.some((b) => new RegExp("\\b" + b + "\\b").test(t))) return true;
    return false;
  }

  /** Megrendelőlap kiegészítő sor — nem bútor törzs (közös mappa formátum). */
  function isDeliveryAccessoryLineText(t) {
    if (!t) return false;
    if (isLikelyKiadvanyDeliveryNameText(t)) return true;
    if (t.includes("vasalat")) return true;
    if (t.includes("oldaltakaro") || t.includes("sarok takar")) return true;
    if (t.includes("falipanel") || t.startsWith("fali panel")) return true;
    if (t.includes("fiokrendez") || t.includes("labpedal") || t.includes("konzol")) return true;
    if (t.includes("asztallab") || t.includes("hetich")) return true;
    return false;
  }

  /** Szállítólevél: bútor + láb/lábelő/vízzáró/panel — egy összesítő sorba, név nélkül. */
  function isDeliveryKitchenBundleText(t) {
    if (!t) return false;
    if (t.includes("labelo") || t.includes("labazo")) return true;
    if (/\blab\b/.test(t) && !t.includes("labelo") && !t.includes("asztallab") && !t.includes("labpedal")) {
      return true;
    }
    if (t.includes("szilikon") || t.includes("vizzaro") || t.includes("viz zaro")) return true;
    if (t.includes("oldaltakaro") || t.includes("sarok takar")) return true;
    if (t.includes("falipanel") || t.startsWith("fali panel")) return true;
    if (t.startsWith("butorlap") || t.startsWith("bútorlap")) return true;
    if (/^lot\d+/.test(t) && t.includes("takar")) return true;
    return false;
  }

  function cabinetCodesApi() {
    try {
      return typeof globalThis !== "undefined" && globalThis.DivianCabinetCodes
        ? globalThis.DivianCabinetCodes
        : null;
    } catch (_e) {
      return null;
    }
  }

  function normalizeDeliveryCabinetCode(code) {
    const api = cabinetCodesApi();
    if (api) return api.normalizeCabinetCode(code);
    return String(code || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "");
  }

  function isCanonicalFurnitureElementCode(code) {
    const api = cabinetCodesApi();
    if (api) return api.isFurnitureElementCode(code);
    return false;
  }

  function isCanonicalTallCabinetCode(code) {
    const api = cabinetCodesApi();
    if (api) return api.isTallCabinetCode(code);
    return false;
  }

  /**
   * Bútor elem — csak a hivatalos kódlistán (divian-cabinet-codes.js).
   */
  function isDeliveryCabinetWithIntegratedHardwareLine(line) {
    if (!line || typeof line !== "object") return false;
    const code = normalizeDeliveryCabinetCode(line.code);
    if (!code) return false;
    return isCanonicalFurnitureElementCode(code);
  }

  /** Megrendelőlap: kód nélküli bútorsor — nem számít bútornak (csak kódlista). */
  function isDeliveryCabinetLikeNameWithoutCode(line) {
    const code = String(line?.code || "").trim();
    if (code) return false;
    return false;
  }

  function isDeliveryKitchenBundleLine(line, assemblyFeeRef) {
    if (!line || typeof line !== "object" || line.informational) return false;
    if (isAssemblySnapshotLine(line, assemblyFeeRef)) return false;
    if (isDeliveryCutFeeOrServiceLine(line.name, line.code)) return false;
    const code = String(line.code || "").trim();
    const t = normalizeInvoiceLineText(line.name, code);
    if (!t || t === "szallitas" || t.includes("szallitas dij")) return false;
    if (isDeliveryCabinetWithIntegratedHardwareLine(line)) return true;
    if (isLikelyKiadvanyDeliveryNameText(t) || t.includes("vasalat")) return false;
    if (isInvoiceHardwareSnapshotLine(line)) return false;
    if (t.startsWith("munkalap")) return false;
    if (isDeliveryKitchenBundleText(t)) return false;
    if (code && isDeliveryCountableCabinetLine(code, line.name, line.category)) return true;
    return false;
  }

  /** Nagyker szállítólevél: vasalat, gép, csap, tálca (mint a Nagyker Excel). */
  function isDeliveryNagykerLine(line) {
    if (!line || typeof line !== "object") return false;
    if (isDeliveryCabinetWithIntegratedHardwareLine(line)) return false;
    const code = String(line.code || "").trim();
    if (code && isDeliveryCountableCabinetLine(code, line.name, line.category)) return false;
    const t = normalizeInvoiceLineText(line.name, line.code);
    if (isInvoiceHardwareSnapshotLine(line) || t.includes("vasalat")) return true;
    const kind = String(line.kind || "").trim();
    if (NAGYKER_KIADVANY_KINDS.has(kind)) return true;
    if (isInvoiceKiadvanyLine(line) && isLikelyKiadvanyDeliveryNameText(t)) return true;
    return false;
  }

  /** Szállítólevél: külön névvel listázandó (munkalap kieg., vasalat, gép, csap, tálca). */
  function isDeliverySeparateListedLine(line, assemblyFeeRef) {
    if (!line || typeof line !== "object" || line.informational) return false;
    if (isAssemblySnapshotLine(line, assemblyFeeRef)) return false;
    if (isDeliveryCutFeeOrServiceLine(line.name, line.code)) return false;
    const t = normalizeInvoiceLineText(line.name, line.code);
    if (!t || t === "szallitas" || t.includes("szallitas dij")) return false;
    if (isDeliveryKitchenBundleLine(line, assemblyFeeRef)) return false;
    const cat = snapshotDeliveryCategory(line, assemblyFeeRef);
    if (cat === "worktop" || cat === "skip" || cat === "service") return false;
    if (cat === "hardware" || t.includes("vasalat")) return true;
    if (cat === "worktopExtra") return true;
    if (isInvoiceKiadvanyLine(line) || isLikelyKiadvanyDeliveryNameText(t)) return true;
    return false;
  }

  /** Csak kiadvány plusz tétel (tálca, csap, szett, gép) — nem katalógus bútor (pl. AMO60, ATF60). */
  function isInvoiceKiadvanyLine(line) {
    if (!line || typeof line !== "object") return false;
    if (isInvoiceHardwareSnapshotLine(line)) return false;
    if (isInvoiceCabinetModuleLine(line)) return false;
    const kind = String(line.kind || "").trim();
    if (KIADVANY_EXTRA_KINDS.includes(kind)) return true;
    const t = normalizeInvoiceLineText(line.name, line.code);
    return isLikelyKiadvanyDeliveryNameText(t);
  }

  function isInvoiceKiadvanySnapshotLine(line) {
    return isInvoiceKiadvanyLine(line);
  }

  function isKitchenAddonSnapshotLine(line, assemblyFeeRef) {
    if (!line || line.informational) return false;
    if (isAssemblySnapshotLine(line, assemblyFeeRef)) return false;
    const t = normalizeInvoiceLineText(line.name, line.code);
    if (!t || t === "szallitas" || t.includes("szallitas dij")) return false;
    if (isInvoiceHardwareSnapshotLine(line) || isInvoiceKiadvanySnapshotLine(line)) return false;
    if (t.startsWith("munkalap")) return true;
    if (t.includes("butorlap")) return true;
    if (t.startsWith("labelo") || /^lab\b/.test(t) || t.startsWith("lab ")) return true;
    if (t.includes("szilikon")) return true;
    if (t.includes("vagasi") || t.includes("vagas dij") || t.includes("vagasidij")) return true;
    if (t.startsWith("fali panel")) return true;
    if (t.includes("fordito")) return true;
    return false;
  }

  function snapshotKitchenAddonGross(snap, assemblyFeeRef) {
    let sum = 0;
    (Array.isArray(snap?.lines) ? snap.lines : []).forEach((line) => {
      if (!isKitchenAddonSnapshotLine(line, assemblyFeeRef)) return;
      sum += Math.max(0, Math.floor(Number(line.total) || 0));
    });
    return sum;
  }

  function snapLinesIncludeWorktop(lines) {
    return (lines || []).some((line) => {
      const t = normalizeInvoiceLineText(line?.name, line?.code);
      return t.startsWith("munkalap") && !t.includes("vag");
    });
  }

  function worktopGrossFromStateLine(line) {
    const fm = Math.max(0, Number(line?.fm) || 0);
    const unit = Math.max(0, Math.floor(Number(line?.unit) || 0));
    return fm > 0 && unit > 0 ? Math.floor(fm * unit + 1e-9) : 0;
  }

  function sumKitchenAddonsFromState(state) {
    const st = state && typeof state === "object" ? state : {};
    let sum = 0;
    (Array.isArray(st.worktopLines) ? st.worktopLines : []).forEach((line) => {
      sum += worktopGrossFromStateLine(line);
    });
    (Array.isArray(st.customWorktopLines) ? st.customWorktopLines : []).forEach((line) => {
      sum += Math.max(0, Math.floor(Number(line.total) || 0));
    });
    (Array.isArray(st.wallPanelLines) ? st.wallPanelLines : []).forEach((line) => {
      sum += Math.max(0, Math.floor(Number(line.qty) || 0) * Math.floor(Number(line.unit) || 0));
    });
    const turnerQty = Math.max(0, Math.floor(Number(st.worktopTurnerQty) || 0));
    const turnerUnit = Math.max(0, Math.floor(Number(st.worktopTurnerUnitPrice) || 0));
    if (turnerQty > 0 && turnerUnit > 0) sum += turnerQty * turnerUnit;
    const siliconeQty = Math.max(0, Math.floor(Number(st.siliconeQty) || 0));
    const siliconeUnit = Math.max(0, Math.floor(Number(st.siliconeUnitPrice) || 0));
    if (siliconeQty > 0 && siliconeUnit > 0) sum += siliconeQty * siliconeUnit;
    return sum;
  }

  function estimateMissingKitchenAddonGross(snap, state) {
    const st = state && typeof state === "object" ? state : {};
    const stateAddons = sumKitchenAddonsFromState(st);
    const snapAddons = snapshotKitchenAddonGross(snap, 0);
    if (stateAddons <= snapAddons + 500) return 0;
    const extraGross = stateAddons - snapAddons;
    const discPct = Math.max(
      0,
      Math.min(100, Math.floor(Number(snap?.discountPct) || Number(st.discount) || 0))
    );
    const fixedHuf = Math.max(0, Math.floor(Number(st.discountHufFixed) || 0));
    if (fixedHuf > 0 && String(st.discountMode || snap?.discountMode || "") === "fixed") {
      return Math.max(0, extraGross - fixedHuf);
    }
    if (discPct <= 0) return extraGross;
    return Math.max(0, Math.floor((extraGross * (100 - discPct)) / 100));
  }

  function kitchenBaseFromSnapshot(snap, assemblyFeeRef) {
    const lines = Array.isArray(snap?.lines) ? snap.lines : [];
    let total = 0;
    lines.forEach((line) => {
      if (line?.informational) return;
      if (isAssemblySnapshotLine(line, assemblyFeeRef)) return;
      const name = String(line.name || "");
      const code = String(line.code || "");
      if (isAssemblyInstallFeeLine(name, code, line.total, assemblyFeeRef)) return;
      if (isInvoiceHardwareSnapshotLine(line)) return;
      if (isInvoiceKiadvanySnapshotLine(line)) return;
      const lower = name.toLowerCase();
      if (lower === "szállítás" || lower === "szallitas") return;
      total += Math.max(0, Math.floor(Number(line.total) || 0));
    });
    return total;
  }

  function sumAddonGrossFromSnapshot(snap, assemblyFeeRef) {
    const lines = Array.isArray(snap?.lines) ? snap.lines : [];
    let hardware = 0;
    let kiadvany = 0;
    lines.forEach((line) => {
      if (line?.informational) return;
      if (isAssemblySnapshotLine(line, assemblyFeeRef)) return;
      const t = Math.max(0, Math.floor(Number(line.total) || 0));
      if (t <= 0) return;
      if (isInvoiceHardwareSnapshotLine(line)) hardware += t;
      else if (isInvoiceKiadvanySnapshotLine(line)) kiadvany += t;
    });
    return { hardware, kiadvany };
  }

  /** Konyha törzs összege (kedvezménnyel), vasalat/kiadvány nélkül. */
  function resolvePartialInvoiceKitchenBase(snap, state, assemblyFeeRef) {
    const amounts = resolveInvoiceSummaryAmounts(snap, state);
    const st = state && typeof state === "object" ? state : {};
    let hardware = sumInvoiceHardwareGross(st.hardwareLines, assemblyFeeRef);
    let kiadvany = sumInvoiceKiadvanyGross(st.kiadvanyExtrasLines, assemblyFeeRef);
    if (hardware <= 0 && kiadvany <= 0) {
      const fromSnap = sumAddonGrossFromSnapshot(snap, assemblyFeeRef);
      hardware = fromSnap.hardware;
      kiadvany = fromSnap.kiadvany;
    }
    const kitchenDiscountedTotal = Math.max(0, Math.floor(Number(snap?.kitchenDiscountedTotal) || 0));
    if (kitchenDiscountedTotal > 0) {
      return Math.max(0, kitchenDiscountedTotal - hardware - kiadvany);
    }
    let diff = Math.max(0, amounts.payableBase - hardware - kiadvany);
    if (
      !snapLinesIncludeWorktop(snap?.lines) &&
      Array.isArray(st.worktopLines) &&
      st.worktopLines.length
    ) {
      const missing = estimateMissingKitchenAddonGross(snap, st);
      if (missing > 0) diff += missing;
    }
    if (diff > 0) return diff;
    const fromLines = kitchenBaseFromSnapshot(snap, assemblyFeeRef);
    return fromLines > 0 ? fromLines : Math.max(0, amounts.payableBase);
  }

  function hardwareLinesFromSnapshot(snap) {
    const out = [];
    (Array.isArray(snap?.lines) ? snap.lines : []).forEach((line) => {
      if (!isInvoiceHardwareSnapshotLine(line)) return;
      const total = Math.max(0, Math.floor(Number(line.total) || 0));
      if (total <= 0) return;
      let name = String(line.name || "").trim();
      name = name.replace(/^[A-Z0-9][A-Z0-9_./-]*\s*-\s*Vasalat\s*-\s*/i, "").trim();
      name = name.replace(/^Vasalat\s*[—–-]\s*/i, "").trim() || String(line.code || "").trim();
      const qty = Math.max(1, Math.floor(Number(line.qty) || 0) || 1);
      out.push({
        name,
        code: line.code,
        qty,
        unit: Math.max(0, Math.floor(Number(line.unit) || 0)) || Math.floor(total / qty) || total
      });
    });
    return out;
  }

  function kiadvanyLinesFromSnapshot(snap) {
    const out = [];
    (Array.isArray(snap?.lines) ? snap.lines : []).forEach((line) => {
      if (!isInvoiceKiadvanySnapshotLine(line)) return;
      const total = Math.max(0, Math.floor(Number(line.total) || 0));
      if (total <= 0 && Math.max(0, Math.floor(Number(line.unit) || 0)) <= 0) return;
      const qty = Math.max(1, Math.floor(Number(line.qty) || 0) || 1);
      const kind = inferKiadvanyLineKind(line);
      const row = {
        name: String(line.name || "").trim(),
        code: line.code,
        qty,
        unit: Math.max(0, Math.floor(Number(line.unit) || 0)) || Math.floor(total / qty) || total
      };
      if (kind) row.kind = kind;
      out.push(row);
    });
    return out;
  }

  function resolvePartialInvoiceSplittableTotal(snap, state, assemblyFeeRef) {
    const amounts = resolveInvoiceSummaryAmounts(snap, state);
    const st = state && typeof state === "object" ? state : {};
    let hardware = sumInvoiceHardwareGross(st.hardwareLines, assemblyFeeRef);
    let kiadvany = sumInvoiceKiadvanyGross(st.kiadvanyExtrasLines, assemblyFeeRef);
    if (hardware <= 0 && kiadvany <= 0) {
      const fromSnap = sumAddonGrossFromSnapshot(snap, assemblyFeeRef);
      hardware = fromSnap.hardware;
      kiadvany = fromSnap.kiadvany;
    }
    const kitchen = resolvePartialInvoiceKitchenBase(snap, state, assemblyFeeRef);
    return kitchen + hardware + kiadvany + amounts.shippingFee;
  }

  /** Számla: összesítő fő összeg (szállítás nélkül) + „Szállítás” — mint az árajánlat jobb oldali összesítő. */
  function resolveInvoiceSummaryAmounts(snap, state) {
    const s = snap && typeof snap === "object" ? snap : {};
    const st = state && typeof state === "object" ? state : {};
    const shippingFee = Math.max(
      0,
      Math.floor(Number(st.shippingFee ?? s.shippingFee) || 0)
    );
    const kitchenDiscountedTotal = Math.max(0, Math.floor(Number(s.kitchenDiscountedTotal) || 0));
    const grandTotal = Math.max(0, Math.floor(Number(s.grandTotal) || 0));
    let finalTotal = Math.max(0, Math.floor(Number(s.finalTotal) || 0));
    if (finalTotal <= 0) {
      const gross = Math.max(0, Math.floor(Number(s.grossTotal) || 0));
      const disc = Math.max(0, Math.floor(Number(s.discountHuf) || 0));
      finalTotal = Math.max(0, gross - disc + shippingFee);
    }
    if (grandTotal > finalTotal && grandTotal > 100000) {
      finalTotal = grandTotal;
    }
    if (kitchenDiscountedTotal > 0) {
      const expectedFinal = kitchenDiscountedTotal + shippingFee;
      if (finalTotal <= 0 || finalTotal + 5000 < expectedFinal) {
        finalTotal = expectedFinal;
      }
    }
    const payableBase = Math.max(0, finalTotal - shippingFee);
    return {
      payableBase,
      shippingFee,
      splittableFullTotal: payableBase + shippingFee
    };
  }

  const PI_STYLES = `
    * { box-sizing: border-box; }
    body.pi-body {
      margin: 0;
      padding: 1.25rem 1.5rem 2rem;
      font-family: Manrope, "Segoe UI", Calibri, Arial, sans-serif;
      font-size: 11pt;
      color: #2b3632;
      background: #faf8f4;
    }
    .pi-toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-bottom: 1.25rem;
      padding-bottom: 0.75rem;
      border-bottom: 1px solid #ddd;
    }
    @media print {
      .pi-toolbar { display: none !important; }
      body.pi-body { padding: 0.5cm; }
      .pi-page-break { page-break-before: always; }
    }
    .pi-toolbar button {
      font: inherit;
      padding: 0.4rem 0.85rem;
      border-radius: 8px;
      border: 1px solid #bbb;
      background: #f8f8f8;
      cursor: pointer;
    }
    .pi-toolbar button.primary {
      background: ${PI_BRAND};
      color: #fff;
      border-color: ${PI_BRAND_DARK};
    }
    .pi-sheet { margin-bottom: 2rem; }
    .pi-sheet-title {
      font-size: 1.05rem;
      font-weight: 700;
      color: ${PI_BRAND_DARK};
      margin: 0 0 0.35rem;
    }
    .pi-meta {
      font-size: 9.5pt;
      color: #444;
      margin-bottom: 0.65rem;
      line-height: 1.45;
    }
    .pi-meta span + span::before {
      content: " · ";
      color: #999;
    }
    table.pi-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    table.pi-table col.col-name { width: 34%; }
    table.pi-table col.col-qty { width: 8%; }
    table.pi-table col.col-num { width: 11%; }
    table.pi-table thead th {
      background: linear-gradient(180deg, ${PI_BRAND} 0%, ${PI_BRAND_DARK} 100%);
      color: #fff;
      font-weight: 800;
      text-align: left;
      padding: 0.45rem 0.55rem;
      border: 1px solid ${PI_BRAND_DARK};
      font-size: 10pt;
    }
    table.pi-table thead th.num {
      text-align: right;
    }
    table.pi-table tbody td {
      padding: 0.38rem 0.55rem;
      border: 1px solid #d8d8d8;
      vertical-align: top;
    }
    table.pi-table tbody tr.row-even td { background: #f0f0f0; }
    table.pi-table tbody tr.row-odd td { background: #fff; }
    table.pi-table tbody td.num,
    table.pi-table tfoot td.num {
      text-align: right;
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }
    table.pi-table tfoot td {
      padding: 0.42rem 0.55rem;
      border: 1px solid #d8d8d8;
      font-weight: 700;
      background: #fafafa;
    }
    table.pi-table tfoot .pi-tfoot-label {
      text-align: left;
    }
    .pi-vat-note {
      margin-top: 0.35rem;
      font-size: 9.5pt;
      color: #333;
      padding-left: 0.1rem;
    }
    .pi-grand-wrap {
      display: flex;
      justify-content: flex-end;
      margin-top: 1.1rem;
      padding-top: 0.25rem;
    }
    .pi-grand-box {
      text-align: right;
      min-width: 11rem;
    }
    .pi-grand-label {
      font-weight: 700;
      font-size: 11pt;
      color: ${PI_BRAND};
      margin-bottom: 0.15rem;
    }
    .pi-grand-amount {
      font-weight: 800;
      font-size: 1.55rem;
      color: ${PI_BRAND};
      letter-spacing: 0.02em;
      line-height: 1.15;
    }
    .pi-check {
      margin-top: 1.5rem;
      font-size: 9pt;
      color: #666;
      border-top: 1px dashed #ccc;
      padding-top: 0.5rem;
    }
    .pi-doc-header {
      margin-bottom: 1.15rem;
      padding: 0.65rem 0.75rem;
      border: 1px solid rgba(128, 0, 64, 0.22);
      border-radius: 10px;
      background: linear-gradient(160deg, #fff 0%, rgba(128, 0, 64, 0.04) 100%);
    }
    .pi-doc-main-title {
      margin: 0 0 0.35rem;
      font-size: 1.35rem;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: ${PI_BRAND_DARK};
    }
    .pi-doc-meta-line {
      margin: 0.15rem 0 0;
      font-size: 9.5pt;
      color: #444;
      line-height: 1.4;
    }
    .pi-preview-tag,
    .pi-local-tag {
      display: inline-block;
      margin-left: 0.35rem;
      padding: 0.08rem 0.4rem;
      font-size: 7.5pt;
      font-weight: 700;
      border-radius: 4px;
      vertical-align: middle;
    }
    .pi-preview-tag {
      color: #8a5a00;
      background: #fff3cd;
      border: 1px solid #e0c060;
    }
    .pi-local-tag {
      color: #555;
      background: #eee;
      border: 1px solid #bbb;
    }
  `;

  function buildPartialInvoiceTableHtml(data) {
    const rows = Array.isArray(data?.rows) ? data.rows : [];
    const bodyRows = rows
      .map((r, i) => {
        const stripe = i % 2 === 0 ? "row-even" : "row-odd";
        const qty = Math.max(1, Math.floor(Number(r.qty) || 0));
        return (
          "<tr class=\"" +
          stripe +
          "\"><td>" +
          escapeHtml(r.megnevezes) +
          '</td><td class="num">' +
          qty +
          " db</td><td class=\"num\">" +
          formatPiAmount(r.unitNet) +
          '</td><td class="num">' +
          formatPiAmount(r.net) +
          '</td><td class="num">' +
          (Number(r.vatPct) || PI_VAT_PCT) +
          "%</td><td class=\"num\">" +
          formatPiAmount(r.vat) +
          '</td><td class="num">' +
          formatPiAmount(r.gross) +
          "</td></tr>"
        );
      })
      .join("");

    const metaBits = [];
    if (data.customerName) metaBits.push("<span><strong>Vevő:</strong> " + escapeHtml(data.customerName) + "</span>");
    if (data.quoteNumber) metaBits.push("<span><strong>Ajánlat:</strong> " + escapeHtml(data.quoteNumber) + "</span>");
    if (data.quoteDate) metaBits.push("<span><strong>Dátum:</strong> " + escapeHtml(formatPiDate(data.quoteDate)) + "</span>");

    return (
      '<section class="pi-sheet">' +
      '<h2 class="pi-sheet-title">' +
      escapeHtml(data.partLabel || "I. részlet") +
      "</h2>" +
      (metaBits.length ? '<div class="pi-meta">' + metaBits.join("") + "</div>" : "") +
      '<table class="pi-table" aria-label="' +
      escapeHtml(data.partLabel) +
      '">' +
      "<colgroup>" +
      '<col class="col-name" /><col class="col-qty" /><col class="col-num" /><col class="col-num" /><col class="col-num" /><col class="col-num" /><col class="col-num" />' +
      "</colgroup>" +
      "<thead><tr>" +
      "<th>Megnevezés</th>" +
      '<th class="num">Menny.</th>' +
      '<th class="num">Egységár</th>' +
      '<th class="num">Nettó ár</th>' +
      '<th class="num">Áfa</th>' +
      '<th class="num">Áfaérték</th>' +
      '<th class="num">Bruttó ár</th>' +
      "</tr></thead><tbody>" +
      (bodyRows || '<tr><td colspan="7">Nincs tétel</td></tr>') +
      "</tbody><tfoot><tr>" +
      '<td class="pi-tfoot-label" colspan="3"><strong>Összesen:</strong></td>' +
      '<td class="num"><strong>' +
      formatPiAmount(data.sumNet) +
      "</strong></td>" +
      "<td></td>" +
      '<td class="num"><strong>' +
      formatPiAmount(data.sumVat) +
      "</strong></td>" +
      '<td class="num"><strong>' +
      formatPiAmount(data.sumGross) +
      "</strong></td></tr></tfoot></table>" +
      '<div class="pi-vat-note">áfa ' +
      PI_VAT_PCT +
      " %: " +
      formatPiAmount(data.sumVat) +
      "</div>" +
      '<div class="pi-grand-wrap"><div class="pi-grand-box">' +
      '<div class="pi-grand-label">Összesen:</div>' +
      '<div class="pi-grand-amount">' +
      formatPiGrandTotal(data.sumGross) +
      "</div></div></div></section>"
    );
  }

  /**
   * @param {{ data1: object, data2?: object, title?: string, showCheck?: boolean, docHeaderHtml?: string }} opts
   */
  function buildPartialInvoiceDocumentHtml(opts) {
    const data1 = opts.data1;
    const data2 = opts.data2;
    const title = opts.title || "Számla előkészítő — I. és II. részlet";
    let body = "";
    if (opts.docHeaderHtml) body += opts.docHeaderHtml;
    if (data1 && data1.rows && data1.rows.length) body += buildPartialInvoiceTableHtml(data1);
    if (data2 && data2.rows && data2.rows.length) {
      body += '<div class="pi-page-break"></div>' + buildPartialInvoiceTableHtml(data2);
    }
    if (opts.showCheck && data1 && data2) {
      const i2 = Math.round((Number(data1.sumGross) || 0) + (Number(data2.sumGross) || 0));
      body +=
        '<div class="pi-check">Ellenőrzés (I. + II. bruttó): <strong>' +
        formatPiGrandTotal(i2) +
        "</strong>" +
        (data1.splittableFullTotal
          ? " · Teljes felszámítható (bruttó): <strong>" + formatPiGrandTotal(data1.splittableFullTotal) + "</strong>"
          : "") +
        "</div>";
    }
    return (
      "<!DOCTYPE html><html lang=\"hu\"><head><meta charset=\"utf-8\"/><title>" +
      escapeHtml(title) +
      "</title><style>" +
      PI_STYLES +
      "</style></head><body class=\"pi-body\">" +
      '<div class="pi-toolbar">' +
      '<button type="button" class="primary" onclick="window.print()">Nyomtatás / PDF</button>' +
      '<button type="button" onclick="window.close()">Bezárás</button>' +
      "</div>" +
      body +
      "</body></html>"
    );
  }

  function openPartialInvoicePreview(data1, data2) {
    const html = buildPartialInvoiceDocumentHtml({
      data1,
      data2,
      showCheck: true
    });
    const opened = openHtmlInPrintWindow(html);
    if (!opened.ok) {
      alert("A böngésző blokkolta az új ablakot. Engedélyezd a felugró ablakokat, majd próbáld újra.");
      return false;
    }
    return true;
  }

  /**
   * Díjbekérő — ugyanaz az I./II. részlet táblázat-séma, mint a számla előkészítőben.
   * @param {{ data1: object, data2?: object, showCheck?: boolean, previewOnly?: boolean, documentNumber?: string, paymentMethod?: string, local?: boolean }} opts
   */
  function buildProformaDocumentHtml(opts) {
    const paymentMethod = String(opts.paymentMethod || "Bankkártya").trim() || "Bankkártya";
    const previewOnly = !!opts.previewOnly;
    const num = String(opts.documentNumber || "").trim();
    let header = '<div class="pi-doc-header">';
    header += '<h1 class="pi-doc-main-title">Díjbekérő</h1>';
    if (num || previewOnly || opts.local !== false) {
      header += '<p class="pi-doc-meta-line">';
      if (num) header += "<strong>Bizonylatszám:</strong> " + escapeHtml(num) + " ";
      if (previewOnly) header += '<span class="pi-preview-tag">ELŐNÉZET</span> ';
      if (opts.local !== false) header += '<span class="pi-local-tag">Helyi bizonylat</span>';
      header += "</p>";
    }
    header +=
      '<p class="pi-doc-meta-line"><strong>Fizetési mód:</strong> ' + escapeHtml(paymentMethod) + "</p>";
    header += "</div>";
    return buildPartialInvoiceDocumentHtml({
      data1: opts.data1,
      data2: opts.data2,
      showCheck: opts.showCheck !== false,
      title: previewOnly ? "Díjbekérő — előnézet" : "Díjbekérő",
      docHeaderHtml: header
    });
  }

  const WORKTOP_EXTRA_CM_DELIVERY = 10;

  const DN_STYLES =
    PI_STYLES +
    `
    .dn-sheet-title {
      font-size: 1.2rem;
      font-weight: 800;
      color: ${PI_BRAND_DARK};
      margin: 0 0 0.35rem;
      letter-spacing: 0.04em;
    }
    .dn-doc-number {
      margin: 0 0 0.65rem;
      padding: 0.45rem 0.65rem;
      background: #fff8e6;
      border: 2px solid ${PI_MUSTARD};
      border-radius: 8px;
      font-size: 11pt;
      color: ${PI_BRAND_DARK};
    }
    .dn-doc-number-hint {
      font-size: 8.5pt;
      font-weight: 500;
      color: #666;
    }
    .dn-kitchen {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
      gap: 0.35rem 1rem;
      font-size: 9pt;
      margin-bottom: 0.85rem;
      padding: 0.5rem 0.65rem;
      background: #fff;
      border: 1px solid #ddd;
      border-radius: 8px;
    }
    .dn-kitchen dt { font-weight: 700; color: ${PI_BRAND}; margin: 0; }
    .dn-kitchen dd { margin: 0 0 0.25rem; color: #333; }
    .dn-section-title {
      font-size: 9.5pt;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: ${PI_BRAND_DARK};
      margin: 0.75rem 0 0.35rem;
      padding-bottom: 0.2rem;
      border-bottom: 2px solid ${PI_MUSTARD};
    }
    .dn-section-nagyker {
      margin-top: 1.1rem;
      color: ${PI_BRAND};
      border-bottom-color: ${PI_BRAND};
    }
    table.dn-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      margin-bottom: 0.35rem;
    }
    table.dn-table col.col-dn-name { width: 46%; }
    table.dn-table col.col-dn-qty { width: 30%; }
    table.dn-table col.col-dn-unit { width: 24%; }
    table.dn-table tbody td {
      padding: 0.35rem 0.45rem;
      border: 1px solid #d8d8d8;
      vertical-align: middle;
      font-size: 9pt;
      line-height: 1.35;
    }
    table.dn-table tbody tr.row-even td { background: #f4f4f4; }
    table.dn-table tbody td.col-name {
      text-align: center;
      word-wrap: break-word;
      overflow-wrap: anywhere;
      hyphens: auto;
      font-weight: 600;
      color: ${PI_BRAND_DARK};
    }
    table.dn-table tbody td.num {
      text-align: right;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    table.dn-table tbody td.col-value-span {
      text-align: center;
      word-wrap: break-word;
      overflow-wrap: anywhere;
    }
    .dn-party {
      margin: 0.75rem 0 0.85rem;
      padding: 0.65rem 0.75rem;
      background: #f8faf6;
      border: 2px solid ${PI_BRAND};
      border-radius: 8px;
      font-size: 9.5pt;
      line-height: 1.5;
    }
    .dn-party h3 {
      margin: 0 0 0.45rem;
      font-size: 10pt;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: ${PI_BRAND_DARK};
    }
    .dn-party p { margin: 0.2rem 0; }
    .dn-party p strong {
      display: inline-block;
      min-width: 7.5em;
      color: ${PI_BRAND_DARK};
    }
    .dn-summary-table { margin-top: 0.5rem; }
    .dn-summary-table tr.dn-row-alert td {
      background: #fff8e6;
      color: ${PI_BRAND_DARK};
      font-weight: 800;
    }
    .dn-summary-table tr.dn-row-alert td.col-name { color: ${PI_BRAND}; }
    .dn-store-contact {
      margin: 0.85rem 0 0.5rem;
      padding: 0.55rem 0.65rem;
      background: #fff;
      border: 1px solid #ddd;
      border-radius: 8px;
      font-size: 9pt;
      line-height: 1.45;
    }
    .dn-store-contact h3 {
      margin: 0 0 0.35rem;
      font-size: 9.5pt;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: ${PI_BRAND_DARK};
    }
    .dn-store-contact p { margin: 0.12rem 0; }
    .dn-signature {
      margin-top: 1.35rem;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1.5rem 2rem;
    }
    .dn-signature-box { font-size: 9pt; }
    .dn-signature-label {
      margin: 0;
      font-weight: 700;
      color: ${PI_BRAND_DARK};
    }
    .dn-signature-line {
      border-bottom: 1px solid #333;
      height: 2.4rem;
      margin: 0.45rem 0 0.2rem;
    }
    .dn-signature-hint {
      margin: 0;
      font-size: 8pt;
      color: #666;
    }
  `;

  function coerceSelectedEntriesFromState(st) {
    const raw = st?.selected;
    const out = [];
    if (!raw) return out;
    if (Array.isArray(raw)) {
      raw.forEach((entry) => {
        if (Array.isArray(entry) && entry.length >= 2) {
          const k = entry[0];
          const v = entry[1];
          if (k && v && typeof v === "object") out.push([String(k), v]);
          return;
        }
        if (entry && typeof entry === "object") {
          const k = entry.code || entry.key || entry.id;
          if (k) out.push([String(k), entry]);
        }
      });
      return out;
    }
    if (raw && typeof raw === "object") {
      Object.entries(raw).forEach(([k, v]) => {
        if (k && v && typeof v === "object") out.push([String(k), v]);
      });
    }
    return out;
  }

  function deliveryRowKey(row) {
    return (
      String(row.megnevezes || "") +
      "\0" +
      String(row.unit || "db") +
      "\0" +
      String(row.qty ?? "")
    );
  }

  function dedupePushRow(rows, seen, row) {
    const label = String(row?.megnevezes || "").trim();
    if (!label || label === "—") return;
    const key = deliveryRowKey(row);
    if (seen.has(key)) return;
    seen.add(key);
    rows.push(row);
  }

  function normalizeWorktopForDelivery(line) {
    if (!line || typeof line !== "object") return null;
    const size = String(line.size || "").trim();
    const name = String(line.name || "").trim();
    let unit = Math.max(0, Number(line.unit ?? line.unitPerFm) || 0);
    if (!unit && Number(line.unitPerCm) > 0) unit = Math.round(Number(line.unitPerCm) * 100);
    let cm = Math.max(0, Number(line.cm) || 0);
    let adjustedCm = Math.max(0, Number(line.adjustedCm) || 0);
    let fm = Math.max(0, Number(line.fm) || 0);
    if (!fm && adjustedCm > 0) fm = adjustedCm / 100;
    if (!adjustedCm && cm > 0) adjustedCm = cm + WORKTOP_EXTRA_CM_DELIVERY;
    if (!cm && adjustedCm > WORKTOP_EXTRA_CM_DELIVERY) cm = adjustedCm - WORKTOP_EXTRA_CM_DELIVERY;
    if (!fm && cm > 0) {
      adjustedCm = cm + WORKTOP_EXTRA_CM_DELIVERY;
      fm = adjustedCm / 100;
    }
    if (fm <= 0) {
      const snapFm = Math.max(0, Number(line.qty) || 0);
      if (snapFm > 0) fm = snapFm;
    }
    if (fm <= 0 && adjustedCm > 0) fm = adjustedCm / 100;
    if (!size && !name && fm <= 0 && cm <= 0) return null;
    return { size: size || "—", name: name || "—", cm, fm: Math.max(0, fm) };
  }

  function formatDeliveryQty(qty, unit) {
    const u = String(unit || "db").trim();
    const n = Number(qty) || 0;
    if (u === "fm") return n > 0 ? n.toFixed(2).replace(".", ",") : "0";
    if (u === "m²") return n > 0 ? n.toFixed(3).replace(".", ",") : "0";
    return String(Math.max(0, Math.floor(n)) || 0);
  }

  function deliveryRow(megnevezes, qty, unit, detail) {
    const label = String(megnevezes || "").trim() || "—";
    const u = String(unit || "db");
    let q = qty;
    if (u === "—" && !isDeliveryStructuralRowLabel(label)) {
      q = formatOfficialDeliveryProductName(qty);
    }
    return {
      megnevezes: label,
      qty: q,
      unit: u,
      detail: detail ? String(detail).trim() : ""
    };
  }

  function pushDeliverySection(sections, title, rows) {
    const list = (rows || []).filter((r) => r && r.megnevezes);
    if (list.length) sections.push({ title, rows: list });
  }

  const DELIVERY_KAMRA_CORNER_CODE = "LTFK";
  const DELIVERY_ASSEMBLY_CABINET_CATEGORIES = new Set([
    "Alsó elemek",
    "Felső elemek",
    "Magas elemek"
  ]);
  const DELIVERY_NON_CABINET_CATEGORY_PREFIXES = [
    "Oldaltakarók -",
    "Lábak",
    "Lábelő",
    "Kamra elem vasalat"
  ];

  function isDishwasherFrontDeliveryCode(code) {
    const c = String(code || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "");
    return /^MO\d+_\d+$/i.test(c);
  }

  function isLikelyKamraHardwareDeliveryLine(code, name) {
    const c = String(code || "").trim().toUpperCase();
    const n = normalizeInvoiceLineText(name, code);
    if (n.includes("kamravasalat")) return true;
    if (n.includes("vasalat") && !n.includes("kamraszekreny") && !n.includes("magas")) return true;
    if (/^K\d{2,4}$/.test(c)) return true;
    return false;
  }

  /** Katalógus-kategória — hivatalos kódlista + munkalap / vasalat / kiegészítő. */
  function inferDeliveryCabinetCategory(code, name, categoryHint) {
    const c = normalizeDeliveryCabinetCode(code);
    const api = cabinetCodesApi();
    if (api) {
      const fromList = api.inferCabinetCatalogCategory(c, name);
      if (fromList) return fromList;
    } else if (isCanonicalTallCabinetCode(c)) {
      return "Magas elemek";
    } else if (isCanonicalFurnitureElementCode(c)) {
      return "Alsó elemek";
    }

    const hint = String(categoryHint || "").trim();
    if (hint && DELIVERY_ASSEMBLY_CABINET_CATEGORIES.has(hint)) return hint;

    const n = normalizeInvoiceLineText(String(name || ""), code);
    if (c === DELIVERY_KAMRA_CORNER_CODE || n.includes("sarok takar")) return "Sarok takarók";
    if (n.includes("foganty")) return "Fogantyúk";
    if (n.includes("pant")) return "Pántok";
    if (/\bmunkalapos\b/i.test(n) || /^AML\d/i.test(c)) return "Alsó elemek";
    if (n.includes("munkalap")) return "Munkalapok";
    if (isDishwasherFrontDeliveryCode(c) || n.includes("mosogatogep ajto")) {
      return "Oldaltakarók - Mosogatógép ajtó";
    }
    if (n.includes("oldaltakaro")) return "Oldaltakarók";
    if (n.includes("uveges") || /^FU\d/i.test(c)) return "Felső elemek";
    if (n.includes("labelo")) return "Lábelő";
    if (/\blab\b/.test(n) && !n.includes("labelo")) return "Láb";
    if (isLikelyKamraHardwareDeliveryLine(c, name)) return "Kamra elem vasalat";
    return "Kiegészítők";
  }

  function isDeliveryCountableCabinetLine(code, name, categoryHint) {
    const key = normalizeDeliveryCabinetCode(code);
    if (!key) return false;
    if (/^(SET_|LED_SET_)/i.test(key)) return false;
    if (isDishwasherFrontDeliveryCode(key)) return false;
    if (isCanonicalFurnitureElementCode(key)) return true;
    const category = inferDeliveryCabinetCategory(key, name, categoryHint);
    return DELIVERY_ASSEMBLY_CABINET_CATEGORIES.has(category);
  }

  function isDeliveryTallStandingCabinetLine(code, name, categoryHint) {
    if (!isDeliveryCountableCabinetLine(code, name, categoryHint)) return false;
    return inferDeliveryCabinetCategory(code, name, categoryHint) === "Magas elemek";
  }

  function formatTallCabinetDeliveryLabel(code, name) {
    const c = String(code || "").trim();
    const n = String(name || "").trim();
    if (c && n) return formatOfficialDeliveryProductName(c + " — " + n);
    return formatOfficialDeliveryProductName(c || n || "");
  }

  function snapshotDeliveryCategory(line, assemblyFeeRef) {
    if (!line || typeof line !== "object") return "skip";
    if (isAssemblySnapshotLine(line, assemblyFeeRef)) return "skip";
    if (line.informational) return "skip";
    const name = String(line.name || "");
    const code = String(line.code || "").trim();
    const t = normalizeInvoiceLineText(name, code);
    if (t === "szallitas" || t === "szallitas dij") return "skip";
    if (isDeliveryCutFeeOrServiceLine(name, code)) return "service";
    if (isDeliveryCabinetWithIntegratedHardwareLine(line)) return "cabinet";
    if (isInvoiceHardwareSnapshotLine(line) || t.includes("vasalat")) return "hardware";
    if (isDeliveryKitchenBundleText(t)) {
      if (t.includes("labelo") || t.includes("labazo") || (/\blab\b/.test(t) && !t.includes("asztallab"))) {
        return "plinth";
      }
      if (t.includes("szilikon") || t.includes("vizzaro")) return "silicone";
      if (t.startsWith("butorlap")) return "customBoard";
      return "wallPanel";
    }
    if (!code && isDeliveryCabinetLikeNameWithoutCode(line)) return "cabinet";
    if (isInvoiceKiadvanyLine(line) || isDeliveryAccessoryLineText(t)) return "kiadvany";
    if (t.includes("oldaltakaro") || t.includes("sarok takar")) return "wallPanel";
    if (t.includes("falipanel") || t.startsWith("fali panel")) return "wallPanel";
    if (code) return "cabinet";
    if (t.startsWith("munkalap")) {
      if (t.includes("vag")) return "service";
      if (t.includes("fordito")) return "worktopExtra";
      return "worktop";
    }
    if (t.startsWith("butorlap")) return "customBoard";
    if (t.startsWith("fali panel")) return "wallPanel";
    if (t.startsWith("vasalat")) return "hardware";
    if (isInvoiceKiadvanyLine(line)) return "kiadvany";
    if (t.includes("labelo") || t.startsWith("lab (") || t.startsWith("lab ")) return "plinth";
    if (t.includes("szilikon")) return "silicone";
    if (t.includes("vagasidij")) return "service";
    if (isInvoiceHardwareSnapshotLine(line)) return "hardware";
    if (isInvoiceKiadvanySnapshotLine(line)) return "kiadvany";
    return "other";
  }

  function parseWorktopSnapshotName(name) {
    const raw = String(name || "").replace(/^Munkalap\s*—\s*/i, "").trim();
    const dot = raw.indexOf("·");
    if (dot >= 0) {
      return {
        size: raw.slice(0, dot).trim(),
        color: raw.slice(dot + 1).trim()
      };
    }
    return { size: raw, color: "" };
  }

  function parseCustomBoardSnapshotName(name) {
    const base = String(name || "").replace(/^Bútorlap\s*—\s*/i, "").replace(/^Butorlap\s*—\s*/i, "").trim();
    const paren = base.match(/\(([^)]+)\)\s*$/);
    const size = paren ? paren[1].trim() : "";
    const label = paren ? base.slice(0, base.lastIndexOf("(")).trim() : base;
    return { label: label || base, size };
  }

  function resolveDeliveryKitchenName(k) {
    const kt = String(k?.kitchenType || "").trim();
    const fam = String(k?.family || "").trim();
    const handle = String(k?.handleStyle || "").trim();
    if (looksLikeHandleOrHardwareSpec(kt)) {
      if (fam) return fam;
    }
    if (handle && kt && normalizeInvoiceLineText(kt, "") === normalizeInvoiceLineText(handle, "")) {
      if (fam) return fam;
    }
    if (kt && fam && kt !== fam && !kt.toLowerCase().includes(fam.toLowerCase())) {
      return fam + " — " + kt;
    }
    return kt || fam || "Konyha";
  }

  function looksLikeHandleOrHardwareSpec(text) {
    const t = String(text || "").trim();
    if (!t) return false;
    if (/\d+\s*mm\b/i.test(t)) return true;
    if (/\b(foganty[uú]|gomb|kr[oó]m|matt|antik|ac[eé]l)\b/i.test(t)) return true;
    return false;
  }

  function isDeliveryPriceLikeText(text) {
    const s = String(text || "").trim();
    if (!s) return false;
    if (/\bFt\b/i.test(s)) return true;
    if (/^\d[\d\s\u00a0.,]+(\s+\d[\d\s\u00a0.,]+)+$/.test(s)) return true;
    return false;
  }

  function uniqueDeliveryTextParts(items) {
    const seen = new Set();
    const out = [];
    (Array.isArray(items) ? items : []).forEach((item) => {
      const s = String(item || "").trim();
      if (!s || isDeliveryPriceLikeText(s) || seen.has(s.toLowerCase())) return;
      seen.add(s.toLowerCase());
      out.push(s);
    });
    return out;
  }

  function resolveDeliveryWorktopStyleText(k, st, worktopDetailLabels) {
    if (Array.isArray(worktopDetailLabels) && worktopDetailLabels.length) {
      return uniqueDeliveryTextParts(worktopDetailLabels).join("; ");
    }
    const fromLines = [];
    (Array.isArray(st?.worktopLines) ? st.worktopLines : []).forEach((line) => {
      const n = normalizeWorktopForDelivery(line);
      if (!n || n.fm <= 0) return;
      const desc = formatWorktopDeliveryDescription(n, n.fm);
      if (desc) fromLines.push(desc);
    });
    (Array.isArray(st?.customWorktopLines) ? st.customWorktopLines : []).forEach((line) => {
      const color = String(line?.color || line?.name || line?.boardColor || "").trim();
      if (color) fromLines.push(color);
    });
    const merged = uniqueDeliveryTextParts(fromLines);
    if (merged.length) return merged.join("; ");
    const fromKitchen = String(k?.worktopStyle || "").trim();
    if (fromKitchen && !isDeliveryPriceLikeText(fromKitchen)) return fromKitchen;
    return "";
  }

  function pushDeliveryKitchenConfigRows(summaryRows, k) {
    const korpusz = String(k?.korpuszColor || "").trim();
    const lowerFront = String(k?.lowerFront || "").trim();
    const upperFront = String(k?.upperFront || "").trim();
    const kamraUpper = String(k?.kamraUpperFront || "").trim();
    if (korpusz) summaryRows.push(deliveryRow("Korpusz", korpusz, "—"));
    if (lowerFront) summaryRows.push(deliveryRow("Alsó front", lowerFront, "—"));
    if (upperFront) summaryRows.push(deliveryRow("Felső front", upperFront, "—"));
    if (kamraUpper && kamraUpper !== upperFront) {
      summaryRows.push(deliveryRow("Kamra felső front", kamraUpper, "—"));
    }
  }

  function deliveryCustomerDisplayValue(value) {
    const s = String(value ?? "").trim();
    return s || "—";
  }

  function extractCustomerFromImportFileName(fileName) {
    return extractCustomerHintFromImportPath(fileName);
  }

  /** Vevőnév a fájlnévből vagy mappaútvonalból: (Név), „Név — MRDH…”, „Mappa/Név — MRDH…/sorszám.pdf”. */
  function extractCustomerHintFromImportPath(filePath) {
    const raw = String(filePath || "").trim();
    if (!raw) return "";

    const paren = raw.match(/\(([^)]+)\)\s*$/);
    if (paren && paren[1].trim()) return paren[1].trim();

    const segments = raw.split(/[/\\]/);
    for (let i = segments.length - 1; i >= 0; i--) {
      const seg = String(segments[i] || "").trim();
      if (!seg) continue;
      const folderM = seg.match(/^(.+?)\s*[—–-]\s*MRDH-/i);
      if (folderM && folderM[1].trim()) return folderM[1].trim();
    }

    const base = raw.replace(/\.[^.\\/]+$/, "").trim();
    const baseClean = base.replace(/_(megrendelo|szallitolevel|dijbekero)$/i, "").trim();
    const dashM = baseClean.match(/^(.+?)\s*[—–-]\s*MRDH-/i);
    if (dashM && dashM[1].trim()) return dashM[1].trim();

    const mrdhIdx = baseClean.search(/MRDH-/i);
    if (mrdhIdx > 0) {
      const prefix = baseClean
        .slice(0, mrdhIdx)
        .replace(/[_\s—–-]+$/g, "")
        .trim();
      if (prefix && prefix.length >= 2 && !/^MRDH/i.test(prefix)) return prefix;
    }
    return "";
  }

  function extractAddressFromFreeText(text) {
    const labeled = extractLabeledAddressFromFreeText(text);
    if (labeled) return labeled;

    const t = String(text || "");
    if (!t) return "";
    const patterns = [
      /\b(\d{4}\.\s?[A-ZÁÉÍÓÖŐÚÜŰa-záéíóöőúüű][^|\n]{2,48}?,\s*[^|\n]+)/,
      /\b(\d{4}\s+[A-ZÁÉÍÓÖŐÚÜŰ][a-záéíóöőúüű]+(?:\s+[A-ZÁÉÍÓÖŐÚÜŰa-záéíóöőúüű][a-záéíóöőúüű.-]*)*\s+(?:utca|u\.|út|u\b|tér|köz|körút|krt\.|sétány|fasor|park)[^|\n,]*)/i,
      /\b(\d{4}\s+[A-ZÁÉÍÓÖŐÚÜŰ][a-záéíóöőúüű]+(?:\s+[A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű.-]+){0,6})/i
    ];
    for (const re of patterns) {
      const m = t.match(re);
      if (m && m[1]) {
        const addr = trimAddressCandidate(m[1]);
        if (addr && isPlausibleCustomerAddress(addr)) return addr;
      }
    }
    return "";
  }

  /** Megrendelőlap / PDF: „Vevő címe:” és hasonló címkék — elsőbbség a szabad szöveg minták előtt. */
  function extractLabeledAddressFromFreeText(text) {
    const t = String(text || "");
    if (!t) return "";
    const patterns = [
      /Vevő\s*c[ií]me\s*:?\s*([^\n|]+)/i,
      /Vásárló\s*c[ií]me\s*:?\s*([^\n|]+)/i,
      /Szállítási\s*c[ií]m\s*:?\s*([^\n|]+)/i,
      /(?:^|\n)\s*C[ií]m\s*:?\s*([^\n|]+)/i
    ];
    for (const re of patterns) {
      const m = t.match(re);
      if (!m || !m[1]) continue;
      const addr = trimAddressCandidate(m[1]);
      if (addr && isPlausibleCustomerAddress(addr)) return addr;
    }
    return "";
  }

  function trimAddressCandidate(value) {
    let v = String(value || "")
      .replace(/\r/g, "")
      .trim();
    if (!v) return "";
    v = v.replace(/\s+(Felső|Alsó|Also|Felso)\s+front\s*:.*$/i, "").trim();
    v = v.replace(/\s{2,}(Telefon|E-?mail|Konyha|Mennyiség|Ajánlat).*$/i, "").trim();
    const lines = v
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length <= 1) return v;
    for (let i = 0; i < lines.length; i++) {
      if (isPlausibleCustomerAddress(lines[i])) return lines[i];
    }
    return lines[0];
  }

  function isPlausibleCustomerAddress(value) {
    const v = trimAddressCandidate(value);
    if (!v || v === "-" || v === "—") return false;
    if (isDeliveryKitchenGridMislabel(v)) return false;
    if (/^[\d\s/+-]+$/.test(v)) return false;
    if (/^\d{4}\b/.test(v)) return true;
    if (
      /(utca|út|u\.|tér|köz|körút|krt\.|sétány|fasor|park|hrsz|lakópark|lakopark|település)/i.test(
        v
      )
    ) {
      return true;
    }
    if (/,/.test(v) && v.length >= 10) return true;
    if (/front|korpusz|munkalap|foganty|felső front|alsó front/i.test(v)) return false;
    return v.length >= 8;
  }

  function isDeliveryKitchenGridMislabel(value) {
    const v = String(value || "")
      .trim()
      .toLowerCase();
    if (!v || v === "-") return true;
    if (/^korpusz\s*\(/i.test(v)) return true;
    if (/^(felső|alsó|also|felso)\s+front/i.test(v)) return true;
    if (/^10\d{2}\s+(felső|alsó|also|felso)\s+front/i.test(v)) return true;
    if (/^munkalap/i.test(v)) return true;
    if (/^fogantyú/i.test(v) || /^fogantyu/i.test(v)) return true;
    if (/^falipanel/i.test(v)) return true;
    if (/^konyha\s*típus/i.test(v)) return true;
    if (/^antónia\b|^antonía\b|^doroti\b/i.test(v) && !/(utca|út|u\.|tér|köz|,)/i.test(v)) return true;
    return false;
  }

  function isDeliveryInvalidCustomerName(value) {
    const v = String(value || "").trim();
    if (!v || v === "-") return true;
    if (isDeliveryKitchenGridMislabel(v)) return true;
    const low = v.toLowerCase();
    if (/megrendel[oő]lap/.test(low)) return true;
    if (/^divian\s+(konyha|megrendel)/i.test(v)) return true;
    if (/divian/i.test(low) && /konyha|megrendel/i.test(low)) return true;
    if (/^mrdh-/i.test(v)) return true;
    return false;
  }

  const HUNGARIAN_NAME_ACCENTS = {
    petro: "Petró",
    zoltan: "Zoltán",
    gabor: "Gábor",
    zsolt: "Zsolt",
    istvan: "István",
    laszlo: "László",
    jozsef: "József",
    attila: "Attila",
    ferenc: "Ferenc",
    katalin: "Katalin",
    erzsebet: "Erzsébet",
    regina: "Regina"
  };

  function capitalizeHungarianNameToken(token) {
    const t = String(token || "")
      .toLowerCase()
      .replace(/[^a-záéíóöőúüű]/g, "");
    if (!t) return "";
    if (HUNGARIAN_NAME_ACCENTS[t]) return HUNGARIAN_NAME_ACCENTS[t];
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  /** pl. petro.zoltan92@gmail.com → Petró Zoltán */
  function inferCustomerNameFromEmail(email) {
    const raw = String(email || "").trim().toLowerCase();
    if (!raw.includes("@")) return "";
    const local = raw.split("@")[0];
    const parts = local.split(/[._-]+/).filter((p) => p && !/^\d+$/.test(p));
    if (parts.length >= 2) {
      return parts
        .slice(0, 2)
        .map((p) => capitalizeHungarianNameToken(p.replace(/\d+$/g, "")))
        .filter(Boolean)
        .join(" ")
        .trim();
    }
    if (parts.length === 1) return capitalizeHungarianNameToken(parts[0].replace(/\d+$/g, ""));
    return "";
  }

  function sanitizeDeliveryCustomerField(kind, value) {
    const v = String(value || "").trim();
    if (!v || v === "-" || v === "—") return "";
    if (kind === "name" && isDeliveryInvalidCustomerName(v)) return "";
    if (kind === "address") {
      const addr = trimAddressCandidate(v);
      return isPlausibleCustomerAddress(addr) ? addr : "";
    }
    if (isDeliveryKitchenGridMislabel(v)) return "";
    return v;
  }

  /** Kézi vevő adat, ha import/PDF nem ad megbízható címet (e-mail vagy ajánlatszám alapján). */
  const DELIVERY_CUSTOMER_OVERRIDES = [
    {
      match: { quoteNumber: "MRDH-VACI-26-221" },
      name: "Mezei-Tóth Regina",
      address: "1047 Budapest Abrus Zoltán utca 7",
      phone: "30/ 921 02 14",
      email: "treginazsofia@gmail.com"
    },
    {
      match: { email: "treginazsofia@gmail.com" },
      name: "Mezei-Tóth Regina",
      address: "1047 Budapest Abrus Zoltán utca 7",
      phone: "30/ 921 02 14",
      email: "treginazsofia@gmail.com"
    },
    {
      match: { email: "petro.zoltan92@gmail.com" },
      name: "Petró Zoltán",
      email: "petro.zoltan92@gmail.com"
    },
    {
      match: { quoteNumber: "MRDH-VACI-25-0144" },
      name: "Petró Zoltán",
      email: "petro.zoltan92@gmail.com"
    }
  ];

  function normalizeDeliveryCustomerEmail(email) {
    return String(email || "")
      .trim()
      .toLowerCase();
  }

  function applyDeliveryCustomerOverrides(fields, payload) {
    const out = Object.assign({}, fields);
    const emailKey = normalizeDeliveryCustomerEmail(out.email);
    const quoteKey = String(payload?.quoteNumber || "")
      .trim()
      .toUpperCase();
    DELIVERY_CUSTOMER_OVERRIDES.forEach((row) => {
      const m = row.match && typeof row.match === "object" ? row.match : {};
      if (m.email && normalizeDeliveryCustomerEmail(m.email) !== emailKey) return;
      if (m.quoteNumber && String(m.quoteNumber).toUpperCase() !== quoteKey) return;
      if (row.name) out.name = row.name;
      if (row.address) out.address = row.address;
      if (row.phone) out.phone = row.phone;
      if (row.email) out.email = row.email;
    });
    return out;
  }

  /** Hiányzó vevő mezők pótlása másik payloadból (pl. megrendelő PDF → páros JSON). */
  function mergeDeliveryCustomerFields(primary, fallback) {
    if (!primary || typeof primary !== "object") return fallback;
    if (!fallback || typeof fallback !== "object") return primary;
    const out = Object.assign({}, primary);
    const cur = resolveDeliveryCustomerFromPayload(out);
    const fb = resolveDeliveryCustomerFromPayload(fallback);
    out.customer = Object.assign(
      {},
      fallback.customer && typeof fallback.customer === "object" ? fallback.customer : {},
      out.customer && typeof out.customer === "object" ? out.customer : {}
    );
    if (fallback.vevo && typeof fallback.vevo === "object") {
      out.vevo = Object.assign(
        {},
        fallback.vevo,
        out.vevo && typeof out.vevo === "object" ? out.vevo : {}
      );
    }
    const pairs = [
      ["name", "customerName"],
      ["address", "customerAddress"],
      ["phone", "customerPhone"],
      ["email", "customerEmail"]
    ];
    pairs.forEach(([field, flatKey]) => {
      const curVal = String(cur[field] || "").trim();
      const fbVal = String(fb[field] || "").trim();
      if (!fbVal) return;
      if (field === "address") {
        if (isPlausibleCustomerAddress(curVal)) return;
        if (isPlausibleCustomerAddress(fbVal)) {
          out.customer[field] = fbVal;
          out[flatKey] = fbVal;
        }
        return;
      }
      if (!curVal) {
        out.customer[field] = fbVal;
        out[flatKey] = fbVal;
      }
    });
    return out;
  }

  function firstSanitizedDeliveryCustomerField(kind, candidates) {
    const list = Array.isArray(candidates) ? candidates : [];
    for (let i = 0; i < list.length; i++) {
      const v = sanitizeDeliveryCustomerField(kind, list[i]);
      if (v) return v;
    }
    return "";
  }

  function resolveDeliveryVevoObject(payload) {
    const p = payload && typeof payload === "object" ? payload : {};
    if (p.vevo && typeof p.vevo === "object") return p.vevo;
    const customer = p.customer && typeof p.customer === "object" ? p.customer : {};
    if (customer.vevo && typeof customer.vevo === "object") return customer.vevo;
    return {};
  }

  /** Vevő mezők — customer, vevo (megrendelő JSON), lapos mezők, import fájlnév. */
  function resolveDeliveryCustomerFromPayload(payload) {
    const p = payload && typeof payload === "object" ? payload : {};
    const customer = p.customer && typeof p.customer === "object" ? p.customer : {};
    const vevo = resolveDeliveryVevoObject(p);
    const importPath = String(
      p._importFileName || p.importFileName || p.sourceFileName || ""
    ).trim();
    const importName = extractCustomerHintFromImportPath(importPath);
    const email = String(
      customer.email || vevo.email || p.customerEmail || ""
    ).trim();
    const inferredName = inferCustomerNameFromEmail(email);
    const name = firstSanitizedDeliveryCustomerField("name", [
      customer.name,
      customer.nev,
      vevo.nev,
      vevo.name,
      p.customerName,
      inferredName,
      importName
    ]);
    const address = firstSanitizedDeliveryCustomerField("address", [
      customer.address,
      customer.cim,
      customer.szallitasiCim,
      customer.shippingAddress,
      vevo.cim,
      vevo.address,
      p.cim,
      p.customerAddress,
      extractLabeledAddressFromFreeText(p._importFullText || p.importFullText || ""),
      extractAddressFromFreeText(p._importFullText || p.importFullText || "")
    ]);
    const phone = String(
      customer.phone ||
        customer.telefon ||
        vevo.telefon ||
        vevo.phone ||
        p.customerPhone ||
        ""
    ).trim();
    return applyDeliveryCustomerOverrides({ name, address, phone, email }, p);
  }

  /** Szállítólevél száma — Számlázz.hu-ból (payload / state / mentett sor). */
  function resolveDeliveryNoteNumberFromPayload(payload) {
    const p = payload && typeof payload === "object" ? payload : {};
    const st = p.state && typeof p.state === "object" ? p.state : {};
    return String(p.deliveryNoteNumber || st.deliveryNoteNumber || p.szallitolevelSzam || "").trim();
  }

  function deliveryNoteNumberDisplayValue(value) {
    const v = String(value ?? "").trim();
    return v || "—";
  }

  /** Szállítólevél data objektum vevő mezői — payload + meglévő sorok egyesítése. */
  function ensureDeliveryNoteCustomerFields(data, payload) {
    const d = data && typeof data === "object" ? data : {};
    const p = payload && typeof payload === "object" ? payload : {};
    const vevo = resolveDeliveryVevoObject(p);
    const mergedPayload = Object.assign({}, p, {
      quoteNumber: String(d.quoteNumber || p.quoteNumber || "").trim(),
      quoteDate: String(d.quoteDate || p.quoteDate || "").trim(),
      _importFileName: String(p._importFileName || p.importFileName || d._importFileName || "").trim(),
      _importFullText: String(p._importFullText || p.importFullText || d._importFullText || "").trim(),
      customerName: String(d.customerName || p.customerName || "").trim(),
      customerAddress: String(d.customerAddress || p.customerAddress || "").trim(),
      customerPhone: String(d.customerPhone || p.customerPhone || "").trim(),
      customerEmail: String(d.customerEmail || p.customerEmail || "").trim(),
      deliveryNoteNumber: String(d.deliveryNoteNumber || "").trim(),
      customer: Object.assign(
        {},
        p.customer && typeof p.customer === "object" ? p.customer : {},
        {
          name: String(
            d.customerName || p.customer?.name || p.customer?.nev || vevo.nev || vevo.name || ""
          ).trim(),
          address: String(
            d.customerAddress ||
              p.customerAddress ||
              p.customer?.address ||
              p.customer?.cim ||
              vevo.cim ||
              vevo.address ||
              ""
          ).trim(),
          phone: String(
            d.customerPhone || p.customer?.phone || p.customer?.telefon || vevo.telefon || vevo.phone || ""
          ).trim(),
          email: String(d.customerEmail || p.customer?.email || vevo.email || "").trim()
        }
      )
    });
    const customer = resolveDeliveryCustomerFromPayload(mergedPayload);
    const deliveryNoteNumber =
      String(d.deliveryNoteNumber || "").trim() ||
      resolveDeliveryNoteNumberFromPayload(mergedPayload);
    const storeInfo = d.storeAddress
      ? {
          key: d.storeKey || resolveDeliveryStoreKey(d.store),
          fullName: String(d.store || "").trim() || DELIVERY_STORES.vaci.fullName,
          address: String(d.storeAddress || "").trim(),
          phone: String(d.storePhone || "").trim(),
          email: String(d.storeEmail || "").trim()
        }
      : resolveDeliveryStoreInfo(
          d.store || p?.kitchen?.store || mergedPayload?.kitchen?.store
        );
    return Object.assign({}, d, {
      customerName: customer.name,
      customerAddress: customer.address,
      customerPhone: customer.phone,
      customerEmail: customer.email,
      store: storeInfo.fullName,
      storeKey: storeInfo.key,
      storeAddress: storeInfo.address,
      storePhone: storeInfo.phone,
      storeEmail: storeInfo.email,
      deliveryNoteIssueDate:
        String(d.deliveryNoteIssueDate || "").trim() || todayDeliveryNoteIsoDate(),
      deliveryNoteNumber
    });
  }

  function formatWorktopSizeForDelivery(size) {
    const s = String(size || "").trim();
    if (!s || s === "—") return "";
    if (/cm\s*mély/i.test(s) || /\bmély\b/i.test(s)) return s;
    return s + " cm mély";
  }

  function worktopDeliveryIdentityKey(size, color, fm) {
    const sz = normalizeInvoiceLineText(String(size || ""), "");
    const col = normalizeInvoiceLineText(String(color || ""), "");
    const f = Math.round((Math.max(0, Number(fm) || 0)) * 100);
    return sz + "\0" + col + "\0" + f;
  }

  function formatWorktopDeliveryDescription(n, fm) {
    const parts = [];
    const size = String(n?.size || "").trim();
    const color = String(n?.name || "").trim();
    const depth = formatWorktopSizeForDelivery(size);
    if (depth) parts.push(depth);
    if (color && color !== "—") parts.push(color);
    const cm = Math.max(0, Number(n?.cm) || 0);
    const fmVal = Math.max(0, Number(fm) || Number(n?.fm) || 0);
    if (cm > 0) {
      parts.push(
        cm.toFixed(0) + " cm +" + WORKTOP_EXTRA_CM_DELIVERY + " cm"
      );
    }
    if (fmVal > 0) {
      parts.push(fmVal.toFixed(2).replace(".", ",") + " fm");
    }
    return parts.length ? parts.join(" · ") : "Munkalap";
  }

  function formatWorktopSnapshotDescription(p, fm) {
    const parts = [];
    const size = String(p?.size || "").trim();
    const color = String(p?.color || "").trim();
    if (size && size !== "—") {
      const depth = formatWorktopSizeForDelivery(size);
      if (depth) parts.push(depth);
    }
    if (color) parts.push(color);
    const fmVal = Math.max(0, Number(fm) || 0);
    if (fmVal > 0) parts.push(fmVal.toFixed(2).replace(".", ",") + " fm");
    return parts.length ? parts.join(" · ") : "Munkalap";
  }

  function isDeliveryCutFeeOrServiceLine(name, code) {
    const t = normalizeInvoiceLineText(name, code);
    if (!t) return false;
    if (t.includes("vagasidij") || t.includes("vagas idij")) return true;
    if (t.includes("munkalap") && t.includes("vag")) return true;
    if (t.includes("osszeszere")) return true;
    if (t === "szerel" || t.startsWith("szerel ") || t.startsWith("szerelés")) return true;
    return false;
  }

  function isDeliveryExtraDeliverableSnapshotLine(line, assemblyFeeRef) {
    return isDeliverySeparateListedLine(line, assemblyFeeRef);
  }

  function formatExtraDeliveryLabel(line) {
    return formatNagykerDeliveryLabel(line);
  }

  function isKiadvanyTapLine(line) {
    if (!line || typeof line !== "object") return false;
    if (isKiadvanyBundleOrSetLine(line)) return false;
    return isPureStandaloneTapLine(line);
  }

  function isNagykerTapLabel(name, code) {
    return isPureStandaloneTapLine({ name, code });
  }

  function nagykerRowConsolidationKey(label, line) {
    if (isKiadvanyBundleOrSetLine(line)) {
      const code =
        String(line?.code || "")
          .trim()
          .toUpperCase() || extractNagykerCatalogRowCode({ megnevezes: label, name: label });
      if (code) return "bundle:" + code;
      const norm = formatOfficialDeliveryProductName(String(label || "").trim()).toLowerCase();
      return "bundle:" + norm;
    }
    if (isKiadvanyTapLine(line) || isNagykerTapLabel(label)) return "csaptelep";
    const code =
      String(line?.code || "")
        .trim()
        .toUpperCase() || extractNagykerCatalogRowCode({ megnevezes: label, name: label });
    if (code) return "code:" + code;
    const norm = formatOfficialDeliveryProductName(String(label || "").trim()).toLowerCase();
    return "raw:" + norm;
  }

  /** Nagyker szállítólevél sor címe — árajánlat kiadvány / vasalat formátum. */
  function formatNagykerDeliveryLabel(line) {
    if (!line || typeof line !== "object") return "";
    const kind = inferKiadvanyLineKind(line);
    const name = String(line.name || "").trim();
    const code = String(line.code || "").trim();
    if (kind === "tap" || isKiadvanyTapLine(line)) return NAGYKER_TAP_LABEL;
    if (kind === "trayDivian") return "Mosogatótálca (Divian) · " + name;
    if (kind === "trayBlanco") return "Mosogatótálca (Blanco) · " + name;
    if (kind === "appliance") return "Gép · " + name;
    if (kind === "bundle") {
      if (/^DIV-CSOM-/.test(code.toUpperCase()) || name.toLowerCase().includes("csomag:")) {
        return "Csomag · " + name.replace(/^csomag:\s*/i, "");
      }
      if (/^szett\s*[·•]/i.test(name)) return name;
      return "Szett · " + name.replace(/^szett\s*[·•]\s*/i, "");
    }
    let hwName = name.replace(/^Vasalat\s*—\s*/i, "").trim();
    if (code && hwName && !hwName.toUpperCase().startsWith(code.toUpperCase())) {
      return formatOfficialDeliveryProductName(code + " — " + hwName);
    }
    return formatOfficialDeliveryProductName(hwName || code || name);
  }

  function isDeliveryNagykerKiadvanyLine(line) {
    if (!line || typeof line !== "object") return false;
    const kind = String(line.kind || "").trim();
    if (NAGYKER_KIADVANY_KINDS.has(kind)) return true;
    return isInvoiceKiadvanyLine(line);
  }

  function extractNagykerCatalogRowCode(row) {
    const code = String(row?.code || "")
      .trim()
      .toUpperCase();
    if (code) return code;
    const label = String(row?.megnevezes || row?.name || "").trim();
    const m = label.match(/^([A-Z]{1,4}\d{1,3}[A-Z]?)\b/i);
    return m ? m[1].toUpperCase() : "";
  }

  /** Nagyker katalógus sor — valójában bútorelem (pl. ATF60, FFM60), nem kiegészítő. */
  function isNagykerCatalogRowCabinet(row) {
    const label = String(row?.megnevezes || row?.name || "").trim();
    if (!label) return false;
    const code = extractNagykerCatalogRowCode(row);
    if (code && isDeliveryCountableCabinetLine(code, label, "")) return true;
    const line = { code, name: label };
    if (isDeliveryCabinetWithIntegratedHardwareLine(line)) return true;
    const t = normalizeInvoiceLineText(label, code);
    if (/tartó\s*elem|tarto\s*elem|mikrotartó|mikrotarto/i.test(t) && !isLikelyKiadvanyDeliveryNameText(t)) {
      return true;
    }
    if (/^atf\d|^ffm\d|^amo\d|^fny\d|^mo\d/i.test(t)) return true;
    return false;
  }

  function populateNagykerFromCatalogLines(catalogLines, addRowFn, addCabinetFn) {
    let tapQty = 0;
    (Array.isArray(catalogLines) ? catalogLines : []).forEach((row, idx) => {
      const label = String(row?.megnevezes || row?.name || "").trim();
      const qty = Math.max(1, Math.floor(Number(row?.qty) || 0) || 1);
      if (!label) return;
      if (isNagykerCatalogRowCabinet(row)) {
        const code = extractNagykerCatalogRowCode(row) || "XL";
        if (typeof addCabinetFn === "function") {
          addCabinetFn(code, qty, label, "cat-cab:" + idx);
        }
        return;
      }
      if (isNagykerTapLabel(label) && !isKiadvanyBundleOrSetLine({ name: label, code: extractNagykerCatalogRowCode(row) })) {
        tapQty += qty;
        return;
      }
      addRowFn("cat:" + idx, label, qty, "db", row);
    });
    if (tapQty > 0) {
      addRowFn("cat:tap", NAGYKER_TAP_LABEL, tapQty, "db", {
        kind: "tap",
        name: NAGYKER_TAP_LABEL,
        code: ""
      });
    }
  }

  function extraDeliveryUnitForLine(line, assemblyFeeRef) {
    const cat = snapshotDeliveryCategory(line, assemblyFeeRef);
    const t = normalizeInvoiceLineText(line?.name, line?.code);
    if (cat === "worktop" || (t.startsWith("munkalap") && !t.includes("vag"))) return "db";
    if (cat === "silicone" || t.includes("szilikon")) return "db";
    return "db";
  }

  function extraDeliveryQtyForLine(line) {
    const qty = Math.max(0, Number(line?.qty) || 0);
    if (qty > 0) return Math.max(1, Math.floor(qty) || 1);
    const total = Math.max(0, Math.floor(Number(line?.total) || 0));
    const unit = Math.max(0, Math.floor(Number(line?.unit) || 0));
    if (unit > 0 && total > 0) return Math.max(1, Math.round(total / unit) || 1);
    return 1;
  }

  function deliveryCabinetLineQty(line) {
    return Math.max(0, Math.floor(Number(line?.qty) || 0) || extraDeliveryQtyForLine(line));
  }

  function sumDeliveryCabinetQtyFromSelected(entries) {
    let sum = 0;
    (entries || []).forEach(([, line]) => {
      if (isDeliveryCabinetWithIntegratedHardwareLine(line)) {
        sum += extraDeliveryQtyForLine(line);
        return;
      }
      const code = String(line?.code || "").trim();
      if (!isDeliveryCountableCabinetLine(code, line?.name, line?.category)) return;
      sum += deliveryCabinetLineQty(line);
    });
    return sum;
  }

  function sumDeliveryCabinetQtyFromSnapLines(lines, assemblyFeeRef) {
    let sum = 0;
    (lines || []).forEach((line) => {
      if (!line || line.informational) return;
      if (isAssemblySnapshotLine(line, assemblyFeeRef)) return;
      if (isDeliveryCutFeeOrServiceLine(line.name, line.code)) return;
      const code = String(line.code || "").trim();
      const name = String(line.name || "").trim();
      const t = normalizeInvoiceLineText(name, code);
      if (isDeliveryKitchenBundleText(t)) return;
      if (!code && isDeliveryCabinetLikeNameWithoutCode(line)) {
        sum += Math.max(1, deliveryCabinetLineQty(line));
        return;
      }
      if (code && isDeliveryCountableCabinetLine(code, name, line.category)) {
        sum += deliveryCabinetLineQty(line);
      }
    });
    return sum;
  }

  function deliveryCabinetQtyByCodeFromSelected(entries) {
    const map = new Map();
    (entries || []).forEach(([, line]) => {
      if (isDeliveryCabinetWithIntegratedHardwareLine(line)) {
        const code =
          String(line.code || "")
            .trim()
            .toUpperCase() || "XL";
        map.set(code, (map.get(code) || 0) + extraDeliveryQtyForLine(line));
        return;
      }
      const code = String(line?.code || "")
        .trim()
        .toUpperCase();
      if (!code || !isDeliveryCountableCabinetLine(code, line?.name, line?.category)) return;
      map.set(code, (map.get(code) || 0) + deliveryCabinetLineQty(line));
    });
    return map;
  }

  function deliveryCabinetQtyByCodeFromSnap(lines, assemblyFeeRef) {
    const map = new Map();
    (lines || []).forEach((line) => {
      if (!line || line.informational) return;
      if (isAssemblySnapshotLine(line, assemblyFeeRef)) return;
      if (isDeliveryCutFeeOrServiceLine(line.name, line.code)) return;
      const code = String(line.code || "")
        .trim()
        .toUpperCase();
      const name = String(line.name || "").trim();
      const t = normalizeInvoiceLineText(name, code);
      if (isDeliveryKitchenBundleText(t)) return;
      if (!code) return;
      if (!isDeliveryCountableCabinetLine(code, name, line.category)) return;
      map.set(code, (map.get(code) || 0) + deliveryCabinetLineQty(line));
    });
    return map;
  }

  /** Szállítólevél: összesítő (konyha név, bútor db, munkalap darab) + vevő / cím. */
  function buildDeliveryNoteData(payload) {
    const st = payload?.state && typeof payload.state === "object" ? payload.state : {};
    const snap = payload?.snapshot && typeof payload.snapshot === "object" ? payload.snapshot : {};
    const k = payload?.kitchen && typeof payload.kitchen === "object" ? payload.kitchen : {};
    const customer = resolveDeliveryCustomerFromPayload(payload);
    const customerName = String(customer.name || "").trim();
    const customerAddress = String(customer.address || "").trim();
    const customerPhone = String(customer.phone || "").trim();
    const customerEmail = String(customer.email || "").trim();
    const assemblyFeeRef = resolveAssemblyFeeFromPayload(payload);

    const cabinetInstanceKeysSeen = new Set();
    const cabinetCodesFromSelected = new Set();
    const worktopKeysSeen = new Set();
    const nagykerRowByConsolidationKey = new Map();
    const nagykerRows = [];
    const worktopDetailLabels = [];
    const tallCabinetDetailLabels = [];
    let cabinetDbTotal = 0;
    let tallCabinetDbTotal = 0;
    let worktopPieceCount = 0;

    function addNagykerRow(_sourceKey, label, qty, unit, line) {
      const cKey = nagykerRowConsolidationKey(label, line);
      const text = formatOfficialDeliveryProductName(
        cKey === "csaptelep" ? NAGYKER_TAP_LABEL : String(label || "").trim()
      );
      if (!text) return;
      const u = String(unit || "db").trim() || "db";
      const q = u === "—" ? text : Math.max(1, Math.floor(Number(qty) || 0) || 1);
      const existing = nagykerRowByConsolidationKey.get(cKey);
      if (existing) {
        if (u !== "—") existing.qty = Math.max(0, Number(existing.qty) || 0) + q;
        return;
      }
      const row = deliveryRow(text, q, u);
      nagykerRowByConsolidationKey.set(cKey, row);
      nagykerRows.push(row);
    }

    function ingestIntegratedCabinetLine(line, sourceKey) {
      if (!isDeliveryCabinetWithIntegratedHardwareLine(line)) return false;
      const code =
        String(line.code || "")
          .trim()
          .toUpperCase()
          .replace(/\s+/g, "") ||
        (/^ar20\b|\bar20\b/.test(normalizeInvoiceLineText(line.name, "")) ? "AR20" : "") ||
        (/^k\s*40\s*r\b|\bk40r\b/.test(normalizeInvoiceLineText(line.name, "")) ? "K40R" : "");
      addCabinetQty(
        code || "XL",
        extraDeliveryQtyForLine(line),
        true,
        String(line.name || "").trim(),
        line.category,
        sourceKey
      );
      return true;
    }

    function ingestNagykerLine(line, sourceKey, assemblyFeeRef) {
      if (!line || typeof line !== "object") return;
      if (ingestIntegratedCabinetLine(line, sourceKey)) return;
      if (!isDeliveryNagykerLine(line)) return;
      if (isDeliveryKitchenBundleLine(line, assemblyFeeRef)) return;
      if (isDeliveryCutFeeOrServiceLine(line.name, line.code)) return;
      if (isAssemblyInstallFeeLine(line.name, line.code, line.total, assemblyFeeRef)) return;
      const label = formatNagykerDeliveryLabel(line);
      if (!label) return;
      addNagykerRow(
        sourceKey + ":" + label,
        label,
        extraDeliveryQtyForLine(line),
        extraDeliveryUnitForLine(line, assemblyFeeRef),
        line
      );
    }

    function addCabinetQty(code, qty, fromSnapshot, name, categoryHint, instanceKey) {
      const q = Math.max(0, Math.floor(Number(qty) || 0));
      if (q <= 0) return;
      const iKey = String(instanceKey || "").trim();
      if (iKey) {
        if (cabinetInstanceKeysSeen.has(iKey)) return;
        cabinetInstanceKeysSeen.add(iKey);
      }
      const key = String(code || "")
        .trim()
        .toUpperCase();
      if (iKey && String(iKey).startsWith("sel:") && key) {
        cabinetCodesFromSelected.add(key);
      }
      cabinetDbTotal += q;
      if (isDeliveryTallStandingCabinetLine(key, name, categoryHint)) {
        tallCabinetDbTotal += q;
        const label = formatTallCabinetDeliveryLabel(key, name);
        if (label) {
          for (let i = 0; i < q; i++) tallCabinetDetailLabels.push(label);
        }
      }
    }

    function addWorktopPiece(key, description) {
      const k = String(key || "").trim();
      if (!k || worktopKeysSeen.has(k)) return;
      worktopKeysSeen.add(k);
      worktopPieceCount += 1;
      const desc = String(description || "").trim();
      if (desc) worktopDetailLabels.push(desc);
    }

    const snapLines = Array.isArray(snap.lines) ? snap.lines : [];
    const isMegrendeloImport = !!payload._megrendeloImport;
    const selectedEntries = coerceSelectedEntriesFromState(st);
    const catalogNagykerLines = Array.isArray(payload.nagykerCatalogLines)
      ? payload.nagykerCatalogLines
      : [];
    const hasCatalogNagyker = catalogNagykerLines.length > 0;
    const hasStructuredState =
      !isMegrendeloImport &&
      (selectedEntries.length > 0 ||
        (Array.isArray(st.hardwareLines) && st.hardwareLines.length > 0) ||
        (Array.isArray(st.kiadvanyExtrasLines) && st.kiadvanyExtrasLines.length > 0));
    const selectedCabinetSum = sumDeliveryCabinetQtyFromSelected(selectedEntries);
    const snapCabinetSum = sumDeliveryCabinetQtyFromSnapLines(snapLines, assemblyFeeRef);
    const selectedCabinetByCode = deliveryCabinetQtyByCodeFromSelected(selectedEntries);
    const snapCabinetByCode = deliveryCabinetQtyByCodeFromSnap(snapLines, assemblyFeeRef);
    const skipSnapLineProcessing = !isMegrendeloImport && (hasStructuredState || hasCatalogNagyker);

    if (!isMegrendeloImport && selectedEntries.length > 0) {
      selectedEntries.forEach(([, line], idx) => {
        if (isDeliveryCabinetWithIntegratedHardwareLine(line)) {
          ingestIntegratedCabinetLine(line, "sel:" + idx);
          return;
        }
        const code = String(line.code || "").trim();
        if (!isDeliveryCountableCabinetLine(code, line.name, line.category)) return;
        addCabinetQty(
          line.code,
          deliveryCabinetLineQty(line),
          false,
          line.name,
          line.category,
          "sel:" + idx
        );
      });
    }

    const ingestFullSnapCabinets = isMegrendeloImport || selectedCabinetSum <= 0;
    const ingestSnapCabinetSupplement =
      !ingestFullSnapCabinets && snapCabinetSum > selectedCabinetSum;
    const snapCabinetExtraByCode = new Map();
    if (ingestSnapCabinetSupplement) {
      snapCabinetByCode.forEach((snapQty, code) => {
        const extra = snapQty - (selectedCabinetByCode.get(code) || 0);
        if (extra > 0) snapCabinetExtraByCode.set(code, extra);
      });
    }

    if (ingestFullSnapCabinets || ingestSnapCabinetSupplement) {
      snapLines.forEach((line, idx) => {
        if (!line || line.informational) return;
        if (isAssemblySnapshotLine(line, assemblyFeeRef)) return;
        if (isDeliveryCutFeeOrServiceLine(line.name, line.code)) return;
        const code = String(line.code || "")
          .trim()
          .toUpperCase();
        const name = String(line.name || "").trim();
        const t = normalizeInvoiceLineText(name, code);
        if (isDeliveryKitchenBundleText(t)) return;
        if (!code && isDeliveryCabinetLikeNameWithoutCode(line)) {
          if (!ingestFullSnapCabinets) return;
          addCabinetQty(
            "XL" + idx,
            Math.max(1, deliveryCabinetLineQty(line)),
            true,
            name,
            line.category,
            "snap:" + idx
          );
          return;
        }
        if (!code || !isDeliveryCountableCabinetLine(code, name, line.category)) return;
        const lineQty = deliveryCabinetLineQty(line);
        let take = lineQty;
        if (ingestSnapCabinetSupplement) {
          const remaining = snapCabinetExtraByCode.get(code) || 0;
          if (remaining <= 0) return;
          take = Math.min(lineQty, remaining);
          snapCabinetExtraByCode.set(code, remaining - take);
        }
        addCabinetQty(
          code,
          Math.max(1, take),
          true,
          name,
          line.category,
          (ingestFullSnapCabinets ? "snap:" : "snap-extra:") + idx
        );
      });
    }

    snapLines.forEach((line, idx) => {
      if (!line || line.informational) return;
      if (isAssemblySnapshotLine(line, assemblyFeeRef)) return;
      if (isDeliveryCutFeeOrServiceLine(line.name, line.code)) return;
      const name = String(line.name || "").trim();
      const t = normalizeInvoiceLineText(name, line.code);
      if (!isDeliveryKitchenBundleText(t)) return;
      const qtySnap = deliveryCabinetLineQty(line);
      addCabinetQty(
        line.code || "bundle:" + idx,
        Math.max(1, qtySnap || 1),
        true,
        name,
        line.category,
        "snap-bundle:" + idx
      );
    });

    const stateWorktopIdentityKeys = new Set();
    (Array.isArray(st.worktopLines) ? st.worktopLines : []).forEach((line, idx) => {
      if (isDeliveryCutFeeOrServiceLine(line?.name, line?.code)) return;
      const n = normalizeWorktopForDelivery(line);
      if (!n || n.fm <= 0) return;
      const idKey = worktopDeliveryIdentityKey(n.size, n.name, n.fm);
      stateWorktopIdentityKeys.add(idKey);
      addWorktopPiece(
        "st:" + idKey + ":" + idx,
        formatWorktopDeliveryDescription(n, n.fm)
      );
    });

    if (!skipSnapLineProcessing) {
      snapLines.forEach((line, idx) => {
        const cat = snapshotDeliveryCategory(line, assemblyFeeRef);
        if (cat === "skip") return;
        const name = String(line.name || "").trim();
        const qtySnap = Math.max(0, Number(line.qty) || 0);

        if (cat === "worktop") {
          if (isDeliveryCutFeeOrServiceLine(name, line.code)) return;
          const p = parseWorktopSnapshotName(name);
          const fm = qtySnap > 0 ? qtySnap : 0;
          if (fm <= 0) return;
          const idKey = worktopDeliveryIdentityKey(p.size, p.color, fm);
          if (stateWorktopIdentityKeys.has(idKey)) return;
          addWorktopPiece(
            "snap:" + idKey + ":" + idx,
            formatWorktopSnapshotDescription(p, fm)
          );
          return;
        }
        if (cat === "worktopExtra") {
          addWorktopPiece("snap:extra:" + idx, formatNagykerDeliveryLabel(line) || name);
        }
      });
    }

    const stateKiadvanyLines = Array.isArray(st.kiadvanyExtrasLines) ? st.kiadvanyExtrasLines : [];
    const stateHardwareLines = Array.isArray(st.hardwareLines) ? st.hardwareLines : [];
    const useStateAddonLines =
      hasStructuredState ||
      (isMegrendeloImport && (stateKiadvanyLines.length > 0 || stateHardwareLines.length > 0));

    if (hasCatalogNagyker) {
      populateNagykerFromCatalogLines(catalogNagykerLines, addNagykerRow, (code, qty, name, iKey) => {
        const key = String(code || "")
          .trim()
          .toUpperCase();
        if (key && cabinetCodesFromSelected.has(key)) return;
        addCabinetQty(code, qty, false, name, "", iKey);
      });
    } else if (useStateAddonLines) {
      stateHardwareLines.forEach((line, idx) => {
        ingestNagykerLine(line, "hw:" + idx, assemblyFeeRef);
      });
      stateKiadvanyLines.forEach((line, idx) => {
        if (!isDeliveryNagykerKiadvanyLine(line)) return;
        ingestNagykerLine(line, "ki:" + idx, assemblyFeeRef);
      });
    } else if (!skipSnapLineProcessing && snapLines.length > 0) {
      const hardwareFromSnap = hardwareLinesFromSnapshot(snap);
      hardwareFromSnap.forEach((line, idx) => {
        ingestNagykerLine(line, "snap-hw:" + idx, assemblyFeeRef);
      });
      kiadvanyLinesFromSnapshot(snap).forEach((line, idx) => {
        ingestNagykerLine(line, "snap-ki:" + idx, assemblyFeeRef);
      });
    }

    const kitchenName = resolveDeliveryKitchenName(k);
    const worktopStyleText = resolveDeliveryWorktopStyleText(k, st, worktopDetailLabels);
    const storeInfo = resolveDeliveryStoreInfo(k.store);
    const deliveryNoteIssueDate = todayDeliveryNoteIsoDate();
    const deliveryNoteNumber = resolveDeliveryNoteNumberFromPayload(payload);

    const summaryRows = [
      deliveryRow("Konyha neve", kitchenName, "—"),
      deliveryRow("Konyhabútor + kiegészítők", cabinetDbTotal, "db"),
      deliveryRow("Munkalap (darab)", worktopPieceCount, "db")
    ];
    pushDeliveryKitchenConfigRows(summaryRows, k);
    if (tallCabinetDbTotal > 0) {
      summaryRows.push(deliveryRow("Magas álló elem (darab)", tallCabinetDbTotal, "db"));
      summaryRows.push(
        deliveryRow(
          "Szállítási jelzés",
          "Nagy autó / emelős szállítás szükséges",
          "—"
        )
      );
      tallCabinetDetailLabels.forEach((label, idx) => {
        summaryRows.push(deliveryRow("Magas álló elem " + (idx + 1), label, "—"));
      });
    }
    worktopDetailLabels.forEach((label, idx) => {
      summaryRows.push(deliveryRow("Munkalap " + (idx + 1), label, "—"));
    });
    if (worktopStyleText && worktopDetailLabels.length === 0) {
      summaryRows.push(deliveryRow("Munkalap szín / típus", worktopStyleText, "—"));
    }

    const sections = [{ title: "Szállítás összesítő", rows: summaryRows }];
    if (nagykerRows.length > 0) {
      sections.push({ title: "Nagyker", rows: nagykerRows });
    }

    return ensureDeliveryNoteCustomerFields(
      {
      title: "Szállítólevél",
      customerName,
      customerAddress,
      customerPhone,
      customerEmail,
      quoteNumber: String(payload?.quoteNumber || "").trim(),
      quoteDate: String(payload?.quoteDate || "").trim(),
      deliveryNoteIssueDate,
      deliveryNoteNumber,
      store: storeInfo.fullName,
      storeKey: storeInfo.key,
      storeAddress: storeInfo.address,
      storePhone: storeInfo.phone,
      storeEmail: storeInfo.email,
      kitchenName,
      cabinetDbTotal,
      tallCabinetDbTotal,
      tallCabinetDetailLabels,
      worktopPieceCount,
      worktopDetailLabels,
      nagykerRows,
      nagykerCount: nagykerRows.length,
      summaryRows,
      sections,
      totalLines: summaryRows.length + nagykerRows.length,
      hasContent: !!(
        kitchenName ||
        cabinetDbTotal > 0 ||
        tallCabinetDbTotal > 0 ||
        worktopPieceCount > 0 ||
        nagykerRows.length > 0 ||
        customerName ||
        customerAddress ||
        customerPhone ||
        customerEmail
      )
      },
      payload
    );
  }

  function resolveDivianForwarderBase() {
    try {
      if (
        typeof global.__DIVIAN_FORWARDER_BASE__ === "string" &&
        global.__DIVIAN_FORWARDER_BASE__.trim()
      ) {
        return String(global.__DIVIAN_FORWARDER_BASE__).trim().replace(/\/+$/, "");
      }
      const loc = global.location;
      if (loc) {
        const p = String(loc.protocol || "");
        const port = String(loc.port || "");
        if ((p === "http:" || p === "https:") && port === "17321") {
          return loc.origin;
        }
        const h = String(loc.hostname || "").toLowerCase();
        if ((p === "http:" || p === "https:") && h && h !== "localhost" && h !== "127.0.0.1") {
          return loc.protocol + "//" + loc.hostname + ":17321";
        }
      }
    } catch (_e) {
      /* ignore */
    }
    return "http://localhost:17321";
  }

  /** Levél törzs: üres — csak a PDF melléklet (szállítólevél kép). */
  function buildDeliveryNotePlainBody(_data) {
    return "";
  }

  function buildDeliveryNotePdfFileName(data) {
    const quote = String(data?.quoteNumber || "")
      .trim()
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
    const num = String(data?.deliveryNoteNumber || "")
      .trim()
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
      .slice(0, 56);
    if (num) return num + "_szallitolevel.pdf";
    return (quote || "szallitolevel") + "_szallitolevel.pdf";
  }

  function buildDeliveryNoteSaveMeta(data, opts) {
    const d = data || {};
    const o = opts || {};
    return {
      customerName: String(d.customerName || o.customerName || "").trim(),
      quoteNumber: String(d.quoteNumber || o.quoteNumber || "").trim()
    };
  }

  async function saveDeliveryNotePdfToFolder(data, opts) {
    const html = buildDeliveryNoteDocumentHtml(data, {
      forPdf: true,
      embedSendScript: false,
      forwarderBase: opts?.forwarderBase
    });
    const fileName = buildDeliveryNotePdfFileName(data);
    const meta = buildDeliveryNoteSaveMeta(data, opts);
    if (typeof global.divianSaveDeliveryNotePdf === "function") {
      try {
        const res = await global.divianSaveDeliveryNotePdf({
          fileName,
          htmlText: html,
          customerName: meta.customerName,
          quoteNumber: meta.quoteNumber
        });
        if (res?.ok) {
          return {
            ok: true,
            mode: "desktop",
            savedPath: res.savedPath || fileName,
            fileName,
            folder: DELIVERY_NOTE_PDF_FOLDER_HINT
          };
        }
        return { ok: false, error: String(res?.error || "save-failed") };
      } catch (e) {
        return { ok: false, error: String(e?.message || e) };
      }
    }
    const forwarderBase = String(opts?.forwarderBase || resolveDivianForwarderBase()).replace(
      /\/+$/,
      ""
    );
    try {
      const res = await fetch(forwarderBase + "/delivery-note/save-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName,
          htmlText: html,
          customerName: meta.customerName,
          quoteNumber: meta.quoteNumber
        })
      });
      const out = await res.json().catch(() => ({}));
      if (res.ok && out.ok) {
        return {
          ok: true,
          mode: "desktop",
          savedPath: out.savedPath || fileName,
          fileName,
          folder: out.folder || DELIVERY_NOTE_PDF_FOLDER_HINT
        };
      }
      return { ok: false, error: String(out.error || "forwarder-" + res.status) };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  }

  function buildDeliveryNoteSavePdfInlineScript(data, sendOpts) {
    const meta = buildDeliveryNoteSaveMeta(data, sendOpts);
    const cfg = {
      pdfFileName: buildDeliveryNotePdfFileName(data),
      customerName: meta.customerName,
      quoteNumber: meta.quoteNumber,
      folderHint: DELIVERY_NOTE_PDF_FOLDER_HINT,
      forwarderBase: String(sendOpts?.forwarderBase || resolveDivianForwarderBase()).replace(
        /\/+$/,
        ""
      )
    };
    return (
      "<script>\n" +
      "(function(){\n" +
      "var CFG=" +
      JSON.stringify(cfg) +
      ";\n" +
      "function buildDnPdfHtml(){\n" +
      'return "<!DOCTYPE html><html lang=\\"hu\\">"+document.documentElement.innerHTML+"</html>";\n' +
      "}\n" +
      "async function saveDnPdf(){\n" +
      'var btn=document.getElementById("dnSavePdfBtn");\n' +
      'if(btn){btn.disabled=true;btn.textContent="Mentés…";}\n' +
      "try{\n" +
      "var html=buildDnPdfHtml();\n" +
      "if(typeof window.divianSaveDeliveryNotePdf===\"function\"){\n" +
      'var r=await window.divianSaveDeliveryNotePdf({fileName:CFG.pdfFileName,htmlText:html,customerName:CFG.customerName,quoteNumber:CFG.quoteNumber});\n' +
      'if(r&&r.ok){alert("Szállítólevél PDF mentve:\\n"+(r.savedPath||CFG.pdfFileName)+\"\\n\\nA \"+CFG.folderHint+\" mappából csatolhatod a levélhez.\");return;}\n' +
      'throw new Error((r&&r.error)||"save-failed");\n' +
      "}\n" +
      "if(!CFG.forwarderBase)throw new Error(\"no-forwarder\");\n" +
      'var res=await fetch(CFG.forwarderBase+"/delivery-note/save-pdf",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({fileName:CFG.pdfFileName,htmlText:html,customerName:CFG.customerName,quoteNumber:CFG.quoteNumber})});\n' +
      "var out=await res.json().catch(function(){return{};});\n" +
      'if(res.ok&&out.ok){alert("Szállítólevél PDF mentve:\\n"+(out.savedPath||CFG.pdfFileName)+\"\\n\\nA \"+CFG.folderHint+\" mappából csatolhatod a levélhez.\");return;}\n' +
      'throw new Error(out.error||"forwarder-error");\n' +
      "}catch(e){\n" +
      'alert("PDF mentés sikertelen. Indítsd a Divian Indítást, majd próbáld újra.\\n\\n"+String(e&&e.message||e));\n' +
      "}finally{\n" +
      'if(btn){btn.disabled=false;btn.textContent="PDF mentése mappába";}\n' +
      "}\n" +
      "}\n" +
      'var el=document.getElementById("dnSavePdfBtn");\n' +
      "if(el)el.addEventListener(\"click\",function(){void saveDnPdf();});\n" +
      "})();\n" +
      "</script>"
    );
  }

  function appendDeliveryNoteRowsToAoA(aoa, rows) {
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const unit = String(row?.unit || "db");
      if (unit === "—") {
        aoa.push([String(row.megnevezes || ""), String(row.qty ?? ""), ""]);
        return;
      }
      aoa.push([
        String(row.megnevezes || ""),
        formatDeliveryQty(row.qty, unit),
        unit
      ]);
    });
  }

  /** Szállítólevél egyszerű Excel táblázat (ár nélkül). */
  function buildDeliveryNoteExcelAoA(data) {
    const d = data && typeof data === "object" ? data : {};
    const aoa = [];
    aoa.push([String(d.title || "Szállítólevél")]);
    aoa.push(["Szállítólevél száma", deliveryNoteNumberDisplayValue(d.deliveryNoteNumber)]);
    if (d.quoteNumber) aoa.push(["Ajánlat #", d.quoteNumber]);
    if (d.deliveryNoteIssueDate) {
      aoa.push(["Szállítólevél kelte", formatPiDate(d.deliveryNoteIssueDate)]);
    }
    if (d.store) aoa.push(["Áruház", d.store]);
    if (d.storeAddress) aoa.push(["Áruház címe", d.storeAddress]);
    if (d.storePhone) aoa.push(["Áruház telefon", d.storePhone]);
    if (d.storeEmail) aoa.push(["Áruház e-mail", d.storeEmail]);
    aoa.push([]);
    aoa.push(["Vevő", deliveryCustomerDisplayValue(d.customerName)]);
    aoa.push(["Szállítási cím", deliveryCustomerDisplayValue(d.customerAddress)]);
    aoa.push(["Telefon", deliveryCustomerDisplayValue(d.customerPhone)]);
    aoa.push(["E-mail", deliveryCustomerDisplayValue(d.customerEmail)]);
    aoa.push([]);
    const sections =
      Array.isArray(d.sections) && d.sections.length
        ? d.sections
        : [{ title: "Szállítás összesítő", rows: d.summaryRows || [] }];
    sections.forEach((section, idx) => {
      if (idx > 0) aoa.push([]);
      aoa.push([String(section.title || "Szállítás összesítő")]);
      appendDeliveryNoteRowsToAoA(aoa, section.rows);
    });
    aoa.push([]);
    aoa.push(["Átadó (szállító) aláírása", ""]);
    return aoa;
  }

  function buildDeliveryNoteDocumentHtml(data, sendOpts) {
    const dnNum = String(data.deliveryNoteNumber || "").trim();
    const dnNumberHtml =
      '<p class="dn-doc-number"><strong>Szállítólevél száma:</strong> ' +
      escapeHtml(deliveryNoteNumberDisplayValue(dnNum)) +
      (dnNum
        ? ""
        : ' <span class="dn-doc-number-hint">(Számlázz.hu-ban kiállított szám — add meg az árajánlatban)</span>') +
      "</p>";

    const metaBits = [];
    if (data.quoteNumber) metaBits.push("<span><strong>Ajánlat:</strong> " + escapeHtml(data.quoteNumber) + "</span>");
    if (data.deliveryNoteIssueDate) {
      metaBits.push(
        "<span><strong>Szállítólevél kelte:</strong> " +
          escapeHtml(formatPiDate(data.deliveryNoteIssueDate)) +
          "</span>"
      );
    }
    if (data.store) metaBits.push("<span><strong>Áruház:</strong> " + escapeHtml(data.store) + "</span>");

    const storeContactHtml =
      '<div class="dn-store-contact"><h3>Áruház elérhetősége</h3>' +
      "<p><strong>" +
      escapeHtml(data.store || "") +
      "</strong></p>" +
      (data.storeAddress ? "<p>" + escapeHtml(data.storeAddress) + "</p>" : "") +
      (data.storePhone ? "<p><strong>Telefon:</strong> " + escapeHtml(data.storePhone) + "</p>" : "") +
      (data.storeEmail ? "<p><strong>E-mail:</strong> " + escapeHtml(data.storeEmail) + "</p>" : "") +
      "</div>";

    const signatureHtml =
      '<div class="dn-signature">' +
      '<div class="dn-signature-box">' +
      '<p class="dn-signature-label">Átadó (szállító)</p>' +
      '<div class="dn-signature-line"></div>' +
      '<p class="dn-signature-hint">név · aláírás · dátum</p>' +
      "</div>" +
      '<div class="dn-signature-box">' +
      '<p class="dn-signature-label">Átvevő</p>' +
      '<div class="dn-signature-line"></div>' +
      '<p class="dn-signature-hint">név · aláírás · dátum</p>' +
      "</div>" +
      "</div>";

    const partyHtml =
      '<div class="dn-party"><h3>Vevő és szállítás</h3>' +
      "<p><strong>Név:</strong> " +
      escapeHtml(deliveryCustomerDisplayValue(data.customerName)) +
      "</p>" +
      "<p><strong>Szállítási cím:</strong> " +
      escapeHtml(deliveryCustomerDisplayValue(data.customerAddress)) +
      "</p>" +
      "<p><strong>Telefon:</strong> " +
      escapeHtml(deliveryCustomerDisplayValue(data.customerPhone)) +
      "</p>" +
      "<p><strong>E-mail:</strong> " +
      escapeHtml(deliveryCustomerDisplayValue(data.customerEmail)) +
      "</p></div>";

    function buildDeliveryNoteTableBodyHtml(rows, stripeOffset) {
      let offset = Math.max(0, Math.floor(Number(stripeOffset) || 0));
      return (Array.isArray(rows) ? rows : []).map((r) => {
        const stripe = offset % 2 === 0 ? "row-even" : "row-odd";
        offset += 1;
        const alert =
          String(r.megnevezes || "") === "Szállítási jelzés" ? " dn-row-alert" : "";
        if (r.unit === "—") {
          return (
            '<tr class="' +
            stripe +
            alert +
            '"><td class="col-name">' +
            escapeHtml(r.megnevezes) +
            '</td><td class="col-value-span" colspan="2">' +
            escapeHtml(String(r.qty)) +
            "</td></tr>"
          );
        }
        return (
          '<tr class="' +
          stripe +
          alert +
          '"><td class="col-name">' +
          escapeHtml(r.megnevezes) +
          '</td><td class="num">' +
          formatDeliveryQty(r.qty, r.unit) +
          '</td><td class="num">' +
          escapeHtml(r.unit) +
          "</td></tr>"
        );
      });
    }

    const noteSections =
      Array.isArray(data.sections) && data.sections.length
        ? data.sections
        : [{ title: "Szállítás összesítő", rows: data.summaryRows || [] }];
    let stripeOffset = 0;
    const sectionsHtml = noteSections
      .map((section) => {
        const title = String(section.title || "Szállítás összesítő");
        const rows = buildDeliveryNoteTableBodyHtml(section.rows, stripeOffset);
        stripeOffset += Array.isArray(section.rows) ? section.rows.length : 0;
        const isNagyker = title.toLowerCase() === "nagyker";
        return (
          '<h3 class="dn-section-title' +
          (isNagyker ? " dn-section-nagyker" : "") +
          '">' +
          escapeHtml(title) +
          "</h3>" +
          '<table class="dn-table dn-summary-table" aria-label="' +
          escapeHtml(title) +
          '">' +
          "<colgroup><col class=\"col-dn-name\" /><col class=\"col-dn-qty\" /><col class=\"col-dn-unit\" /></colgroup>" +
          "<tbody>" +
          (rows.join("") || '<tr><td class="col-name" colspan="3">—</td></tr>') +
          "</tbody></table>"
        );
      })
      .join("");

    const toolbarHtml = sendOpts?.forPdf
      ? ""
      : '<div class="pi-toolbar">' +
        '<button type="button" id="dnSavePdfBtn" class="primary" title="' +
        escapeHtml(DELIVERY_NOTE_PDF_FOLDER_HINT) +
        ' mappa az Asztalon">PDF mentése mappába</button>' +
        '<button type="button" onclick="window.print()">Nyomtatás</button>' +
        '<button type="button" onclick="window.close()">Bezárás</button>' +
        "</div>";

    return (
      "<!DOCTYPE html><html lang=\"hu\"><head><meta charset=\"utf-8\"/><title>" +
      escapeHtml(data.title || "Szállítólevél") +
      "</title><style>" +
      DN_STYLES +
      "</style></head><body class=\"pi-body\">" +
      toolbarHtml +
      '<section class="pi-sheet">' +
      '<h2 class="dn-sheet-title">' +
      escapeHtml(data.title || "Szállítólevél") +
      "</h2>" +
      dnNumberHtml +
      (metaBits.length ? '<div class="pi-meta">' + metaBits.join("") + "</div>" : "") +
      partyHtml +
      sectionsHtml +
      storeContactHtml +
      signatureHtml +
      "</section>" +
      (sendOpts && sendOpts.embedSendScript === false
        ? ""
        : buildDeliveryNoteSavePdfInlineScript(data, sendOpts)) +
      "</body></html>"
    );
  }

  function openHtmlInPrintWindow(html) {
    const text = String(html || "").trim();
    if (!text) return { ok: false, mode: "empty" };
    try {
      const blob = new Blob([text], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const w = window.open(url, "_blank");
      if (w) {
        try {
          w.opener = null;
          w.focus();
        } catch (_e) {
          /* ignore */
        }
        setTimeout(() => URL.revokeObjectURL(url), 120000);
        return { ok: true, mode: "blob" };
      }
      URL.revokeObjectURL(url);
    } catch (_e) {
      /* ignore */
    }
    const w2 = window.open("about:blank", "_blank");
    if (!w2) return { ok: false, mode: "blocked" };
    w2.document.open();
    w2.document.write(text);
    w2.document.close();
    try {
      w2.opener = null;
      w2.focus();
    } catch (_e) {
      /* ignore */
    }
    return { ok: true, mode: "window" };
  }

  function openDeliveryNotePreview(payload, sendOpts) {
    const data = buildDeliveryNoteData(payload);
    const html = buildDeliveryNoteDocumentHtml(data, {
      forwarderBase: sendOpts?.forwarderBase,
      fromEmail: sendOpts?.fromEmail
    });
    const opened = openHtmlInPrintWindow(html);
    if (!opened.ok) {
      alert(
        "A szállítólevél nem nyitható meg — engedélyezd a felugró ablakokat, vagy próbáld újra."
      );
      return { ok: false, blocked: true, data };
    }
    return { ok: true, mode: opened.mode, data };
  }

  function injectPartialInvoiceStyles(targetDoc) {
    const d = targetDoc || (typeof document !== "undefined" ? document : null);
    if (!d || !d.head) return;
    if (d.getElementById("pi-shared-styles")) return;
    const el = d.createElement("style");
    el.id = "pi-shared-styles";
    el.textContent = PI_STYLES;
    d.head.appendChild(el);
  }

  global.PartialInvoiceView = {
    PI_VAT_PCT,
    formatPiAmount,
    formatPiGrandTotal,
    isAssemblyInstallFeeLine,
    isAssemblySnapshotLine,
    resolveAssemblyFeeFromPayload,
    resolveInvoiceSummaryAmounts,
    resolvePartialInvoiceKitchenTitle,
    resolvePartialInvoiceKitchenBase,
    resolvePartialInvoiceSplittableTotal,
    sumInvoiceHardwareGross,
    sumInvoiceKiadvanyGross,
    hardwareLinesFromSnapshot,
    kiadvanyLinesFromSnapshot,
    isInvoiceKiadvanyLine,
    isInvoiceCabinetModuleLine,
    extractCustomerHintFromImportPath,
    extractLabeledAddressFromFreeText,
    extractAddressFromFreeText,
    isPlausibleCustomerAddress,
    inferCustomerNameFromEmail,
    isDeliveryInvalidCustomerName,
    isKiadvanyTapLine,
    isKiadvanyBundleOrSetLine,
    inferKiadvanyLineKind,
    formatKiadvanyInvoiceTitle,
    isNagykerTapLabel,
    NAGYKER_TAP_LABEL,
    formatNagykerDeliveryLabel,
    ASSEMBLY_UNIT_FEE_HUF,
    injectPartialInvoiceStyles,
    buildPartialInvoiceTableHtml,
    buildPartialInvoiceDocumentHtml,
    buildProformaDocumentHtml,
    openPartialInvoicePreview,
    DELIVERY_NOTE_PDF_FOLDER_HINT,
    resolveDivianForwarderBase,
    buildDeliveryNoteData,
    ensureDeliveryNoteCustomerFields,
    resolveDeliveryCustomerFromPayload,
    mergeDeliveryCustomerFields,
    resolveDeliveryNoteNumberFromPayload,
    resolveDeliveryCustomerFromPayload,
    buildDeliveryNoteExcelAoA,
    buildDeliveryNoteDocumentHtml,
    buildDeliveryNotePlainBody,
    buildDeliveryNotePdfFileName,
    saveDeliveryNotePdfToFolder,
    openDeliveryNotePreview,
    openHtmlInPrintWindow
  };
})(typeof window !== "undefined" ? window : globalThis);
