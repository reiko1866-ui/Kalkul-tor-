/**
 * Divian tervező – terméklista CSV export (bookmarklet)
 *
 * Elsődlegesen a Chrome bővítményt érdemes használni: `divian-planner-csv-extension`
 *
 * Használat:
 * - Nyisd meg a tervezőben a "Terméklista" nézetet.
 * - Illeszd be a böngésző konzoljába (vagy könyvjelző URL-ként egy sorba `javascript:` előtaggal).
 */
(function () {
  try {
    function cleanCode(code) {
      return String(code || "")
        .trim()
        .replace(/\uFEFF/g, "")
        .replace(/_J$/i, "")
        .replace(/_B$/i, "")
        .replace(/_K$/i, "");
    }

    function normalizeForMatch(value) {
      return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
    }

    function looksLikeProductCode(code) {
      const c = String(code || "").trim();
      if (!c) return false;
      if (c.length > 32) return false;
      if (/HUF/i.test(c)) return false;
      if (!/[A-Z]/i.test(c)) return false;
      return /^[A-Z0-9_-]+$/i.test(c);
    }

    function parseQtyToken(token) {
      const raw = String(token || "")
        .replace(/\u00A0/g, " ")
        .replace(/\s+/g, "")
        .replace(/\./g, "")
        .replace(",", ".");
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= 0) return 0;
      return Math.max(1, Math.floor(n));
    }

    function parseStrictQtyToken(token) {
      const t = String(token || "")
        .replace(/\u00A0/g, " ")
        .replace(/\s+/g, "")
        .trim();
      if (!/^\d+$/.test(t)) return 0;
      const n = Number(t);
      if (!Number.isFinite(n) || n <= 0) return 0;
      if (n > 999) return 0;
      return Math.floor(n);
    }

    function isHeaderishRow(cellsNorm) {
      return cellsNorm.some((t) => t.includes("cikksz")) && cellsNorm.some((t) => t.includes("mennyis"));
    }

    function findColumnIndexes(headerCellsNorm) {
      let codeIdx = -1;
      let qtyIdx = -1;
      for (let i = 0; i < headerCellsNorm.length; i += 1) {
        const t = headerCellsNorm[i];
        if (codeIdx === -1 && t.includes("cikksz")) codeIdx = i;
        if (qtyIdx === -1 && t.includes("mennyis")) qtyIdx = i;
      }
      if (codeIdx === -1 || qtyIdx === -1 || codeIdx === qtyIdx) return null;
      return { codeIdx, qtyIdx };
    }

    function getRowCells(row) {
      return Array.from(row.querySelectorAll("th,td")).map((c) =>
        String(c.innerText || "")
          .replace(/\s+/g, " ")
          .trim()
      );
    }

    function discoverBestHeaderMap() {
      const rows = Array.from(document.querySelectorAll("tr"));
      let best = null;
      let bestScore = -1;

      rows.forEach((row) => {
        const cells = getRowCells(row);
        if (cells.length < 3) return;
        const cellsNorm = cells.map((c) => normalizeForMatch(c));
        if (!isHeaderishRow(cellsNorm)) return;
        const map = findColumnIndexes(cellsNorm);
        if (!map) return;

        const score = cells.length * 100 + Math.abs(map.qtyIdx - map.codeIdx);
        if (score > bestScore) {
          bestScore = score;
          best = map;
        }
      });

      return best;
    }

    function extractRowsUsingHeaderMap(map) {
      const qtyByCode = new Map();

      function incRow(rawCode, rawQty) {
        const clean = cleanCode(rawCode);
        if (!looksLikeProductCode(clean)) return;
        const safeQty = parseQtyToken(rawQty) || parseStrictQtyToken(rawQty);
        if (!safeQty) return;
        const key = clean.toLowerCase();
        const prev = qtyByCode.get(key);
        if (!prev) qtyByCode.set(key, { code: clean, qty: safeQty });
        else prev.qty += safeQty;
      }

      const rows = Array.from(document.querySelectorAll("tr"));
      rows.forEach((row) => {
        const cells = getRowCells(row);
        if (!cells.length) return;
        if (cells.length <= Math.max(map.codeIdx, map.qtyIdx)) return;

        const cellsNorm = cells.map((c) => normalizeForMatch(c));
        if (isHeaderishRow(cellsNorm)) return;

        const codeText = cells[map.codeIdx];
        let qtyText = cells[map.qtyIdx];

        if (!codeText) return;

        if (!qtyText || !String(qtyText).trim()) {
          const fallbackQty = [...cells].reverse().map((t) => parseStrictQtyToken(t)).find((q) => q > 0);
          if (fallbackQty) qtyText = String(fallbackQty);
        }

        incRow(codeText, qtyText);
      });

      return Array.from(qtyByCode.values()).map((x) => x.code + ";" + x.qty);
    }

    function extractRowsHeuristic() {
      const qtyByCode = new Map();

      function incRow(rawCode, rawQty) {
        const clean = cleanCode(rawCode);
        if (!looksLikeProductCode(clean)) return;
        const safeQty = parseQtyToken(rawQty) || parseStrictQtyToken(rawQty);
        if (!safeQty) return;
        const key = clean.toLowerCase();
        const prev = qtyByCode.get(key);
        if (!prev) qtyByCode.set(key, { code: clean, qty: safeQty });
        else prev.qty += safeQty;
      }

      function extractFromGenericRow(row) {
        const cells = getRowCells(row);
        if (cells.length < 3) return;

        const cellsNorm = cells.map((c) => normalizeForMatch(c));
        if (isHeaderishRow(cellsNorm)) return;

        let codeIdx = -1;
        let qtyIdx = -1;
        for (let i = 0; i < cellsNorm.length; i += 1) {
          const t = cellsNorm[i];
          if (codeIdx === -1 && (t.includes("cikksz") || t === "sku" || t.includes("cikkszam"))) codeIdx = i;
          if (qtyIdx === -1 && (t.includes("mennyis") || t === "qty" || t === "db")) qtyIdx = i;
        }

        if (codeIdx >= 0 && qtyIdx >= 0 && codeIdx !== qtyIdx) {
          incRow(cells[codeIdx], cells[qtyIdx]);
          return;
        }

        const codeCell = cells.find((t) => looksLikeProductCode(t));
        if (!codeCell) return;

        let qty = 0;
        for (let i = cells.length - 1; i >= 0; i -= 1) {
          const q = parseStrictQtyToken(cells[i]);
          if (q) {
            qty = q;
            break;
          }
        }
        if (!qty) qty = 1;
        incRow(codeCell, String(qty));
      }

      document.querySelectorAll("tr, .product-item, [class*='item']").forEach((row) => extractFromGenericRow(row));
      return Array.from(qtyByCode.values()).map((x) => x.code + ";" + x.qty);
    }

    function extractRowsFromDom() {
      const headerMap = discoverBestHeaderMap();
      if (headerMap) {
        const rows = extractRowsUsingHeaderMap(headerMap);
        if (rows.length) return rows;
      }
      return extractRowsHeuristic();
    }

    const rows = extractRowsFromDom();
    if (!rows.length) {
      window.alert("Nem találtam exportálható sort. Nyisd meg a Terméklista táblázatot, majd próbáld újra.");
      return;
    }

    const csv = "\uFEFFTermékkód;Mennyiség\n" + rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "divian_tervezo_termekek.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2500);
  } catch (e) {
    window.alert("Hiba: " + (e && e.message ? e.message : String(e)));
  }
})();
