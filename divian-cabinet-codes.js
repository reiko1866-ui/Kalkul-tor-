/**
 * Hivatalos bútor- és magas elem kódok (Divian katalógus).
 * Csak ezek számítanak konyha elemként a szállítólevélen; magas / kamra külön halmaz.
 * Munkalap, gép, csap, mosogató, vasalat → nagyker; minden más kiegészítő.
 */
(function (global) {
  "use strict";

  /** Magas / kamra szekrények — külön feljegyzés a szállítólevélen. */
  const TALL_CABINET_CODES = new Set(
    [
      "K40",
      "K40R",
      "K60",
      "K60F",
      "K60P",
      "K60R",
      "K60S",
      "KF60",
      "KF60F",
      "KF60P",
      "KT60",
      "KT60P",
      "KTB60",
      "KMTB60",
      "KMTB601F",
      "KMTB601P",
      "KMTB602F",
      "KMTB602P",
      "KMTB60F",
      "KMTB60K",
      "KMTB60P",
      "KMTB60S",
      "KMTS60",
      "KMTS601P",
      "KMTS602P",
      "KMTS60P",
      "KMTS60S",
      "KMTH60",
      "KMTH60W",
      "KMTH72W",
      "KMTH75W",
      "KTRAD"
    ].map((c) => c.toUpperCase())
  );

  /** Alsó + felső bútor elemek — hivatalos kódlista (2026). */
  const FURNITURE_ELEMENT_CODES = new Set(
    [
      "AAP540",
      "AAP545",
      "AAP550",
      "AAFE60",
      "AAFE60E",
      "AAFE80",
      "AAFE90",
      "AK110",
      "AF40",
      "AF45",
      "AF50",
      "AF60",
      "AFK5",
      "AF90",
      "AKL30",
      "AKL40",
      "AML100",
      "AML25",
      "AML30",
      "AML35",
      "AML40",
      "AML40P",
      "AML45",
      "AML45P",
      "AML50",
      "AML55",
      "AML60",
      "AML60E",
      "AML60P",
      "AML70",
      "AML80",
      "AML80P",
      "AML90",
      "AML90P",
      "AMO100",
      "AMO55",
      "AMO60",
      "AMO60E",
      "AMO60P",
      "AMO70",
      "AMO80",
      "AMO80P",
      "AMO90",
      "AMO90P",
      "AR30",
      "AS110",
      "ASL10",
      "ASL10MAGIC",
      "ASL10P",
      "ASL10YT",
      "AS90",
      "ASL90",
      "ASM105",
      "ASM110",
      "ASM35",
      "ASM45",
      "ASZB60",
      "ASTH545",
      "ASZDH60",
      "ATT60",
      "ATT60P",
      "AVZ30",
      "EF50",
      "EF60",
      "EF60_72",
      "EFT50",
      "EFT50_60",
      "EFT50_60E",
      "EFT50P",
      "EFT60",
      "EFT60_60",
      "EFT60_60E",
      "EFT60P",
      "F100",
      "F15",
      "F30",
      "F35",
      "F40",
      "F45",
      "F50",
      "F55",
      "F60",
      "F60E",
      "F65",
      "F70",
      "F80",
      "F90",
      "FFMB0",
      "FF24G",
      "FF250",
      "FF260",
      "FF270",
      "FF280",
      "FF290",
      "FKF30",
      "FKF35",
      "FKF40",
      "FKF45",
      "FKF50",
      "FKF55",
      "FKF60",
      "FKF60SZ",
      "FKF65",
      "FKF70",
      "FKF75",
      "FKF80",
      "FKF90",
      "FMF25",
      "FMF30",
      "FMF35",
      "FMF40",
      "FMF45",
      "FMF50",
      "FMF55",
      "FMF60",
      "FMF65",
      "FMF70",
      "FMF80",
      "FMF90",
      "FMFNYQ8",
      "FMFSL60",
      "FMF52",
      "FMFVZ30",
      "PNV30",
      "PS100",
      "PSZ",
      "PVZ30",
      "K30",
      "LT15"
    ].map((c) => c.toUpperCase())
  );

  /** AR20 — keskeny alsó elem, láb nem kell (régi projektek). */
  const LEG_EXEMPT_CABINET_CODES = new Set(["AR20"]);

  function isLegExemptCabinetCode(code) {
    return LEG_EXEMPT_CABINET_CODES.has(normalizeCabinetCode(code));
  }

  /** Felső szekrény kód minták (a bútor halmazon belül). */
  const UPPER_CODE_RE =
    /^(F\d{1,3}|FU\d|FUZ\d|FMF|FF|FKF|PSZ|PNV|PVZ|AS\d|ASL|ASM|ASZ|AAP)/i;

  const GLASS_UPPER_CODE_RE = /^FUZ?\d/i;

  function canonicalCabinetLetters(code) {
    return String(code || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "")
      .replace(/Ü/g, "U");
  }

  function normalizeCabinetCode(code) {
    return canonicalCabinetLetters(code);
  }

  function isGlassUpperFurnitureCode(code, name) {
    const c = normalizeCabinetCode(code);
    if (!isFurnitureElementCode(c)) return false;
    if (GLASS_UPPER_CODE_RE.test(c)) return true;
    const n = String(name || "").toLowerCase();
    return /\b(üveges|uveges)\b/.test(n) || /\bfelső üveges\b/.test(n) || /\bfelso uveges\b/.test(n);
  }

  function isTallCabinetCode(code) {
    return TALL_CABINET_CODES.has(normalizeCabinetCode(code));
  }

  function isFurnitureElementCode(code) {
    const c = normalizeCabinetCode(code);
    return FURNITURE_ELEMENT_CODES.has(c) || TALL_CABINET_CODES.has(c);
  }

  function isUpperFurnitureCode(code) {
    const c = normalizeCabinetCode(code);
    if (!isFurnitureElementCode(c)) return false;
    if (isTallCabinetCode(c)) return false;
    if (isGlassUpperFurnitureCode(c, "")) return true;
    return UPPER_CODE_RE.test(c);
  }

  function isLowerFurnitureCode(code) {
    const c = normalizeCabinetCode(code);
    return isFurnitureElementCode(c) && !isTallCabinetCode(c) && !isUpperFurnitureCode(c);
  }

  /** Katalógus-kategória: Alsó / Felső / Magas / null (nem bútor elem). */
  function inferCabinetCatalogCategory(code, name) {
    const c = normalizeCabinetCode(code);
    if (isTallCabinetCode(c)) return "Magas elemek";
    if (isUpperFurnitureCode(c)) return "Felső elemek";
    if (FURNITURE_ELEMENT_CODES.has(c)) return "Alsó elemek";
    const n = String(name || "").toLowerCase();
    if (/\bmunkalapos\b/.test(n) || /^AML\d/i.test(c)) return "Alsó elemek";
    return null;
  }

  /** Dashboard / szállítólevél sáv: floor | wall | tall | null */
  function inferCabinetBand(code, name) {
    const cat = inferCabinetCatalogCategory(code, name);
    if (cat === "Magas elemek") return "tall";
    if (cat === "Felső elemek") return "wall";
    if (cat === "Alsó elemek") return "floor";
    return null;
  }

  const api = {
    FURNITURE_ELEMENT_CODES,
    TALL_CABINET_CODES,
    normalizeCabinetCode,
    isTallCabinetCode,
    isFurnitureElementCode,
    isUpperFurnitureCode,
    isLowerFurnitureCode,
    inferCabinetCatalogCategory,
    inferCabinetBand,
    LEG_EXEMPT_CABINET_CODES,
    isLegExemptCabinetCode,
    isGlassUpperFurnitureCode,
    canonicalCabinetLetters
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.DivianCabinetCodes = api;
})(typeof window !== "undefined" ? window : globalThis);
