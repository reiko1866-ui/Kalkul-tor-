/**
 * Cyncly terméklista → árajánlat payload (közös a forwarder és a CLI bridge számára).
 */
function safeString(value) {
  if (value === null || value === undefined) return null;
  return String(value);
}

function parseCommercialQty(value) {
  const cleaned = String(value ?? "")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.max(1, Math.floor(n));
}

function normalizeDishwasherFrontCode(code) {
  const up = String(code || "")
    .trim()
    .toUpperCase()
    .replace(/\uFEFF/g, "");
  const legacy = up.match(/^LMO(\d+_\d+)$/);
  if (legacy) return "MO" + legacy[1];
  const direct = up.match(/^(MO\d+_\d+)$/);
  if (direct) return direct[1];
  return up;
}

function isPlannerTransferExcluded(rawCode, rawName) {
  const code = String(rawCode || "")
    .trim()
    .toUpperCase()
    .replace(/\uFEFF/g, "");
  const base = code.split("_")[0].toUpperCase();
  const name = String(rawName || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (/^GEN[_-]?/i.test(code) || /^GEN[_-]?/i.test(base)) return true;
  if (/\bminta\b/.test(name) && /\b(mikro|suto|huto|gep|oven|fridge|hood)\b/.test(name)) return true;
  if (base === "MPF" || code.startsWith("MPF_")) return true;
  if (/\bfalipanel\b/.test(name)) return true;
  if (/^LE\d+/.test(base) || /^LE\d+/.test(code)) return true;
  if (/\b(labazat|labelo|toekick|plinth|kickboard)\b/.test(name)) return true;
  if (/^PFL/.test(base) || /^PFL/.test(code)) return true;
  if (/\b(muanyag\s*lab|butorlab)\b/.test(name)) return true;
  if (/^M\d{1,3}$/.test(base) && /\b(lab|labak)\b/.test(name)) return true;
  if (/^(KANFF|LIF)$/i.test(base) || /^(KANFF|LIF)$/i.test(code)) return true;
  if (/^(KANFF|LIF)_/i.test(code)) return true;
  if (/^LTF\d/i.test(base) || /^LTF\d/i.test(code)) return true;
  if (base === "MKP" || code === "MKP" || /^MKP[_-]/i.test(code)) return true;
  if (/\b(kitolto|kitöltő|takaropanel|filler|blokk|omsz)\b/.test(name)) return true;
  return false;
}

function extractCommercialCode(item) {
  const manufCode = String(item?.refCodes?.manufCode ?? "")
    .trim()
    .replace(/\uFEFF/g, "");
  const primaryGuess = String(item?.primaryRefCode ?? item?.articleNumber ?? "")
    .trim()
    .replace(/\uFEFF/g, "");
  const preferManufForDishwasher =
    /^MO\d+_\d+$/i.test(normalizeDishwasherFrontCode(primaryGuess)) &&
    /^LMO\d+_\d+$/i.test(manufCode);
  const raw = preferManufForDishwasher
    ? manufCode
    : item?.primaryRefCode ??
      item?.articleNumber ??
      item?.refCodes?.manufCode ??
      item?.refCodes?.others?.userCode ??
      item?.refCodes?.others?.cic ??
      item?.sku ??
      item?.itemNumber ??
      item?.name ??
      item?.description;
  let code = String(raw || "")
    .trim()
    .replace(/\uFEFF/g, "");
  if (!code) return null;
  const lead = code.match(/^([A-Za-z]{1,6}[A-Za-z0-9]{0,18})(?:\s*[-·–—]\s*|\s+|$)/);
  if (lead) code = lead[1];
  code = code.replace(/\s+/g, "").replace(/-+/g, "");
  const wall = code.match(/^([A-Za-z][A-Za-z0-9]*?)_([BJ])$/i);
  if (wall) code = wall[1] + "_" + wall[2].toUpperCase();
  const m = code.match(/[A-Za-z][A-Za-z0-9_]*/);
  if (!m) return null;
  code = m[0].replace(/_K$/i, "");
  return normalizeDishwasherFrontCode(code);
}

function isCommercialItemLike(item) {
  if (!item || typeof item !== "object") return false;
  return !!(
    item.primaryRefCode ||
    item.articleNumber ||
    item.refCodes ||
    item.sku ||
    item.itemNumber ||
    item.quantity != null ||
    item.qty != null ||
    item.mennyiseg != null
  );
}

function findCommercialItemsArray(parsedJson, maxNodes = 8000) {
  if (!parsedJson || typeof parsedJson !== "object") return null;
  const queue = [parsedJson];
  const seen = new Set();
  let visited = 0;
  while (queue.length && visited < maxNodes) {
    const cur = queue.shift();
    visited += 1;
    if (!cur || (typeof cur !== "object" && typeof cur !== "function")) continue;
    if (typeof cur === "object" && seen.has(cur)) continue;
    if (typeof cur === "object") seen.add(cur);
    if (Array.isArray(cur)) {
      if (cur.length && cur.every((x) => isCommercialItemLike(x))) return cur;
      for (let i = 0; i < cur.length; i += 1) queue.push(cur[i]);
      continue;
    }
    const keys = Object.keys(cur);
    for (let i = 0; i < keys.length; i += 1) {
      const k = keys[i];
      if (k === "commercialItems" && Array.isArray(cur[k])) {
        const arr = cur[k];
        if (arr.length && arr.every((x) => isCommercialItemLike(x))) return arr;
      }
    }
    for (let i = 0; i < keys.length; i += 1) {
      const v = cur[keys[i]];
      if (v && (typeof v === "object" || Array.isArray(v))) queue.push(v);
    }
  }
  return null;
}

function extractCommercialItemsFromJson(json) {
  const direct = Array.isArray(json?.commercialItems) ? json.commercialItems : [];
  if (direct.length) return direct;
  const found = findCommercialItemsArray(json, 8000);
  return Array.isArray(found) ? found : [];
}

function normalizePlannerBandHint(item) {
  const hay = String(
    [
      item?.name,
      item?.description,
      item?.label,
      item?.group?.name,
      item?.groupName,
      item?.roomName,
      item?.areaName,
      item?.installationType,
      item?.catalog?.name
    ]
      .filter(Boolean)
      .join(" ")
  )
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (hay.includes("sziget") || hay.includes("island")) return "island";
  if (
    hay.includes("magas") ||
    hay.includes("tall") ||
    hay.includes("torony") ||
    (hay.includes("kamra") && !hay.includes("vasalat"))
  ) {
    return "tall";
  }
  if (hay.includes("felso") || hay.includes("upper")) return "upper";
  if (hay.includes("also") || hay.includes("lower")) return "lower";
  return "";
}

function computeWallOrderRank(item, fallbackIndex) {
  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const x =
    num(item?.position?.x) ??
    num(item?.posX) ??
    num(item?.locationX) ??
    num(item?.transform?.x) ??
    num(item?.coordinates?.x);
  const seq =
    num(item?.sequence) ??
    num(item?.sortOrder) ??
    num(item?.displayOrder) ??
    num(item?.installationSequence);
  if (x != null) return x * 1000 + (num(item?.position?.y) ?? num(item?.posY) ?? 0);
  if (seq != null) return seq;
  return fallbackIndex;
}

function normalizeItems(commercialItems) {
  const ranked = commercialItems
    .map((item, idx) => ({
      item,
      rank: computeWallOrderRank(item, idx)
    }))
    .sort((a, b) => a.rank - b.rank);
  return ranked
    .map(({ item }, sortIndex) => {
      const rawCode =
        item?.primaryRefCode ??
        item?.articleNumber ??
        item?.refCodes?.manufCode ??
        item?.refCodes?.others?.userCode ??
        item?.refCodes?.others?.cic ??
        item?.sku ??
        item?.itemNumber ??
        item?.name;
      const cikkszam = extractCommercialCode(item);
      const nev = safeString(
        item?.name ?? item?.description ?? item?.label ?? item?.refCodes?.others?.userCode
      );
      if (isPlannerTransferExcluded(cikkszam || rawCode, nev)) return null;
      const band = normalizePlannerBandHint(item);
      return {
        cikkszam,
        rawCode: safeString(rawCode),
        nev,
        mennyiseg: parseCommercialQty(item?.quantity ?? item?.mennyiseg ?? item?.qty ?? 1),
        sortIndex,
        wallOrder: sortIndex,
        band: band || undefined
      };
    })
    .filter((row) => row && row.cikkszam && row.mennyiseg > 0);
}

function buildQtyOnlyPayload(items, requestUrl) {
  return {
    type: "divian-playwright-items",
    source: "divian-cyncly-cli",
    capturedAt: new Date().toISOString(),
    requestUrl,
    itemCount: items.length,
    items: items.map((item) => ({
      cikkszam: safeString(item?.cikkszam),
      mennyiseg: Number(item?.mennyiseg ?? 0),
      sortIndex: typeof item?.sortIndex === "number" ? item.sortIndex : undefined,
      wallOrder: typeof item?.wallOrder === "number" ? item.wallOrder : undefined,
      band: item?.band || undefined,
      rawCode: safeString(item?.rawCode)
    }))
  };
}

module.exports = {
  buildQtyOnlyPayload,
  normalizeItems,
  extractCommercialItemsFromJson
};
