/**
 * Megrendelőlap PDF import — közös modul (arajanlat.html, szamla-eloreszlet.html).
 */
(function (global) {
  function extractQuoteNumberFromText(text) {
    const m = String(text || "").match(/MRDH-[A-Z]+-\d{2}-\d+/i);
    return m ? m[0].toUpperCase() : "";
  }

  function parseHufNumberCell(value) {
    const digits = String(value || "").replace(/[^\d]/g, "");
    return Math.max(0, Math.round(Number(digits) || 0));
  }

  function parseQtyCell(value) {
    const m = String(value || "").match(/[\d]+(?:[.,]\d+)?/);
    if (!m) return 1;
    return Math.max(0, Number(String(m[0]).replace(",", ".")) || 0) || 1;
  }

  function parseDotsDateToIso(value) {
    const m = String(value || "")
      .trim()
      .match(/^(\d{4})\.(\d{2})\.(\d{2})\.?/);
    if (!m) return String(value || "").trim();
    return m[1] + "-" + m[2] + "-" + m[3];
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

  function finalizeMegrendeloSummary(summary) {
    const ship = Math.max(0, summary.shippingFee || 0);
    const asm = Math.max(0, summary.assemblyFee || 0);
    const kitchen = Math.max(0, summary.kitchenTotal || 0);
    const grand = Math.max(0, summary.grandTotal || 0);

    if (kitchen > 0) {
      if (grand > 0 && asm > 0 && Math.abs(grand - kitchen - asm) <= 1000) {
        summary.finalTotal = kitchen + ship;
      } else if (grand > 0 && ship > 0 && Math.abs(grand - kitchen - ship) <= 1000) {
        summary.finalTotal = grand;
      } else if (grand > 0 && grand >= kitchen) {
        summary.finalTotal = grand;
      } else {
        summary.finalTotal = kitchen + ship;
      }
    } else if (grand > 0) {
      summary.finalTotal = Math.max(0, grand - asm);
    } else {
      summary.finalTotal = 0;
    }
    if (summary.grossTotal <= 0 && summary.finalTotal > 0 && summary.discountHuf > 0) {
      summary.grossTotal = summary.finalTotal + Math.max(0, summary.discountHuf);
    }
    return summary;
  }

  function parseMegrendeloSummaryFromText(text) {
    const summary = emptyMegrendeloSummary();
    const t = String(text || "");
    const pick = (re) => {
      const m = t.match(re);
      return m ? parseHufNumberCell(m[1]) : 0;
    };
    const ship = pick(/(?:Szállítási|Kiszállítási)\s*díj[:\s]*([\d\s.,]+)/i);
    if (ship) summary.shippingFee = ship;
    const asm = pick(/Szerel(?:és|ési\s*díj)[:\s]*([\d\s.,]+)/i);
    if (asm) summary.assemblyFee = asm;
    const kitchen = pick(/Összesen\s*konyhabútor\s*és\s*kiegészítők[:\s]*([\d\s.,]+)/i);
    if (kitchen) summary.kitchenTotal = kitchen;
    const grand =
      pick(/Végösszeg\s*\(?\s*bruttó\s*\)?[:\s]*([\d\s.,]+)/i) ||
      pick(/Végösszeg\s*Szállítással[:\s]*([\d\s.,]+)/i);
    if (grand) summary.grandTotal = grand;
    const gross =
      pick(/Kedvezmény\s*nélküli\s*összeg[:\s]*([\d\s.,]+)/i) ||
      pick(/Listaár\s*összesen[:\s]*([\d\s.,]+)/i);
    if (gross) summary.grossTotal = gross;
    const disc = pick(/Kedvezmény\s*összege[:\s]*([\d\s.,]+)/i);
    if (disc) summary.discountHuf = disc;
    const pctM = t.match(/(\d{1,2})\s*%\s*kedvezmény/i);
    if (pctM) summary.discountPct = Number(pctM[1]);
    if (summary.shippingFee || summary.kitchenTotal || summary.grandTotal) {
      summary.fromFooter = true;
    }
    return finalizeMegrendeloSummary(summary);
  }

  function customerNameFromOrderFolder(folder) {
    const seg = String(folder || "").trim();
    const m = seg.match(/^(.+?)\s*[—–-]\s*MRDH-/i);
    return m && m[1] ? m[1].trim() : "";
  }

  function extractCustomerFromMegrendeloFileName(fileName) {
    if (typeof PartialInvoiceView !== "undefined" && PartialInvoiceView.extractCustomerHintFromImportPath) {
      return PartialInvoiceView.extractCustomerHintFromImportPath(fileName);
    }
    const m = String(fileName || "").match(/\(([^)]+)\)\s*$/);
    if (m && m[1].trim()) return m[1].trim();
    const segments = String(fileName || "").split(/[/\\]/);
    for (let i = segments.length - 1; i >= 0; i--) {
      const seg = String(segments[i] || "").trim();
      const folderM = seg.match(/^(.+?)\s*[—–-]\s*MRDH-/i);
      if (folderM && folderM[1].trim()) return folderM[1].trim();
    }
    return "";
  }

  function isMegrendeloCustomerFieldLabel(rawLabel) {
    const label = normalizeMegrendeloLabel(rawLabel).toLowerCase();
    return (
      label === "név" ||
      label === "vevő neve" ||
      label === "cím" ||
      label === "cim" ||
      label === "vevő címe" ||
      label === "telefon" ||
      label === "e-mail" ||
      label === "email" ||
      label === "email cím" ||
      label === "email cim"
    );
  }

  function isMegrendeloKitchenGridValue(value) {
    const v = String(value || "")
      .trim()
      .toLowerCase();
    if (!v || v === "-") return true;
    if (/^korpusz\s*\(/i.test(v)) return true;
    if (/^(felső|alsó|also|felso)\s+front/i.test(v)) return true;
    if (/^munkalap/i.test(v)) return true;
    if (/^fogantyú/i.test(v) || /^fogantyu/i.test(v)) return true;
    if (/^falipanel/i.test(v)) return true;
    if (/^konyha\s*típus/i.test(v)) return true;
    return false;
  }

  function isPlausibleMegrendeloCustomerName(value) {
    const v = String(value || "").trim();
    if (!v || v === "-") return false;
    if (isMegrendeloKitchenGridValue(v)) return false;
    const low = v.toLowerCase();
    if (/megrendel[oő]lap/.test(low)) return false;
    if (/divian/i.test(low) && /konyha|megrendel/i.test(low)) return false;
    if (
      typeof PartialInvoiceView !== "undefined" &&
      PartialInvoiceView.isDeliveryInvalidCustomerName &&
      PartialInvoiceView.isDeliveryInvalidCustomerName(v)
    ) {
      return false;
    }
    return true;
  }

  function isPlausibleMegrendeloCustomerAddress(value) {
    if (typeof PartialInvoiceView !== "undefined" && PartialInvoiceView.isPlausibleCustomerAddress) {
      return PartialInvoiceView.isPlausibleCustomerAddress(value);
    }
    const v = String(value || "").trim();
    if (!v || v === "-" || v === "—") return false;
    if (isMegrendeloKitchenGridValue(v)) return false;
    if (/^10\d{2}\s+(felső|alsó|also|felso)\s+front/i.test(v)) return false;
    if (/^[\d\s/+-]+$/.test(v)) return false;
    return true;
  }

  function cleanupMegrendeloCustomer(customer) {
    if (!customer || typeof customer !== "object") return;
    if (!isPlausibleMegrendeloCustomerName(customer.name)) customer.name = "";
    if (!isPlausibleMegrendeloCustomerAddress(customer.address)) customer.address = "";
    if (!customer.name && customer.email) {
      const inferred =
        typeof PartialInvoiceView !== "undefined" && PartialInvoiceView.inferCustomerNameFromEmail
          ? PartialInvoiceView.inferCustomerNameFromEmail(customer.email)
          : "";
      if (inferred) customer.name = inferred;
    }
  }

  function applyMegrendeloCustomerField(customer, rawLabel, rawValue) {
    if (!isMegrendeloCustomerFieldLabel(rawLabel)) return;
    const label = normalizeMegrendeloLabel(rawLabel).toLowerCase();
    let value = String(rawValue || "")
      .trim()
      .replace(/^:+\s*/, "");
    if (!value || value === "-") return;
    if (label === "név" || label === "vevő neve") {
      if (!customer.name && isPlausibleMegrendeloCustomerName(value)) customer.name = value;
      return;
    }
    if (label === "cím" || label === "cim" || label === "vevő címe") {
      if (!customer.address && isPlausibleMegrendeloCustomerAddress(value)) customer.address = value;
      return;
    }
    if (label === "telefon") {
      if (!customer.phone) customer.phone = value;
      return;
    }
    if (label === "e-mail" || label === "email" || label === "email cím" || label === "email cim") {
      if (!customer.email) customer.email = value;
    }
  }

  function findNextMegrendeloPdfValueLine(pdfLines, startIdx) {
    for (let i = startIdx; i < (pdfLines || []).length; i++) {
      const t = String(pdfLines[i].text || "").trim();
      if (!t) continue;
      if (/^(Vevő|Telefon|E-?mail|Konyha|Mennyiség|Ajánlat|Áruház|Korpusz|Alsó|Felső|Munkalap|Fogantyú)/i.test(t)) {
        return "";
      }
      if (isMegrendeloKitchenGridValue(t)) return "";
      if (/^[\d\s]+Ft$/i.test(t)) return "";
      if (/^MRDH-/i.test(t)) return "";
      return t;
    }
    return "";
  }

  function enrichCustomerFromMegrendeloPdfLines(customer, pdfLines) {
    const lines = pdfLines || [];
    for (let i = 0; i < lines.length; i++) {
      const t = String(lines[i].text || "").trim();
      const parts = Array.isArray(lines[i].parts) ? lines[i].parts : [];

      for (let p = 0; p < parts.length - 1; p++) {
        applyMegrendeloCustomerField(customer, parts[p].str, parts[p + 1].str);
      }

      const inlinePatterns = [
        [/^(Vevő neve|Név|Vásárló neve)\s*:?\s+(.+)$/i, "name"],
        [/^(Vevő címe|Cím|Vásárló címe)\s*:?\s+(.+)$/i, "address"],
        [/^(Telefon)\s*:?\s+(.+)$/i, "phone"],
        [/^(E-?mail|Email cím)\s*:?\s+(.+)$/i, "email"]
      ];
      inlinePatterns.forEach(([re, field]) => {
        const m = t.match(re);
        if (!m || !m[2]) return;
        const val = String(m[2]).trim();
        if (!val || val === "-") return;
        if (field === "name" && !isPlausibleMegrendeloCustomerName(val)) return;
        if (field === "address" && !isPlausibleMegrendeloCustomerAddress(val)) return;
        if (!customer[field]) customer[field] = val;
      });

      if (/^(Vevő neve|Név|Vásárló neve)\s*:?$/i.test(t) && !customer.name) {
        const next = findNextMegrendeloPdfValueLine(lines, i + 1);
        if (next) customer.name = next;
      }
      if (/^(Vevő címe|Cím|Vásárló címe)\s*:?$/i.test(t) && !customer.address) {
        const next = findNextMegrendeloPdfValueLine(lines, i + 1);
        if (next && isPlausibleMegrendeloCustomerAddress(next)) customer.address = next;
      }
    }
  }

  function normalizeMegrendeloLineText(name) {
    return String(name || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isMegrendeloAccessoryLineName(name) {
    const t = normalizeMegrendeloLineText(name);
    if (!t) return false;
    if (t.includes("vagasi") || t.includes("vagas dij")) return true;
    if (t === "szerel" || t.startsWith("szerel ")) return true;
    if (/\b(szett|csomag)\b/.test(t) || t.includes("divian szett") || t.includes("led szett")) return true;
    if (/^szett\s*[·•\-]/.test(t)) return true;
    if (t.includes("csaptelep") || (t.includes("csap") && t.includes("telep"))) return true;
    if (t.includes("talca") || t.includes("mosogato") || t.includes("mosogatogep")) return true;
    if (/\bwhp\b/.test(t) || t.includes("whirlpool")) return true;
    if (t.includes("suto") || t.includes("fozolap") || t.includes("parael") || t.includes("mikro")) {
      return true;
    }
    if (
      t.includes("vasalat") ||
      t.includes("fiokrendez") ||
      t.includes("labpedal") ||
      t.includes("konzol") ||
      t.includes("asztallab") ||
      t.includes("hetich") ||
      t.includes("blanco") ||
      t.includes("bosch") ||
      t.includes("evido")
    ) {
      return true;
    }
    if (t.includes("oldaltakaro") || t.includes("falipanel")) return true;
    if (/^(lab|láb)$/i.test(String(name || "").trim()) || t.includes("labelo") || t.includes("labazati")) {
      return true;
    }
    return false;
  }

  function extractCodeFromMegrendeloLineDescription(name) {
    const s = String(name || "").trim();
    if (!s) return "";
    if (isMegrendeloAccessoryLineName(s)) return "";
    const lower = normalizeMegrendeloLineText(s);
    if (
      lower.startsWith("lot") ||
      lower.includes("takaro") ||
      /^lab$/.test(lower) ||
      lower.includes("labelo") ||
      lower.includes("labazati") ||
      lower.includes("szilikon") ||
      lower.includes("butorlapbol")
    ) {
      return "";
    }
    const patterns = [
      /^(SET_[A-Z0-9_]+)/i,
      /^(LED_SET_[A-Z0-9_]+)/i,
      /^(BOS-SZETT-\d+)/i,
      /^(EVI-SZETT-\d+)/i,
      /^(DIV-CSOM-[A-Z0-9-]+)/i,
      /^(DIV-CSAP-[A-Z0-9-]+)/i,
      /^(TDIV-[A-Z0-9-]+)/i,
      /^(MO\d+_\d+)/i,
      /^(ASZB\d+)/i,
      /^(KMT[BS]\d+)/i,
      /^(EFT\d+F?)/i,
      /^(FSL\d+)/i,
      /^(F60E)\b/i,
      /^(ASM\d+)/i,
      /^(AF\d+)/i,
      /^(AML\d+P?)/i,
      /^(AKL)\b/i,
      /^(KMTH\d+W?)/i,
      /^(FKF\d+(?:\s+SZ)?)/i,
      /^(FFM\d+)/i,
      /^(FK\d+)/i,
      /^(ATF\d+)/i,
      /^([A-Z]{1,4}\d{1,3}[A-Z]?)\b/i
    ];
    for (const p of patterns) {
      const m = s.match(p);
      if (m) return String(m[1]).replace(/\s+/g, "").toUpperCase();
    }
    return "";
  }

  const WORKTOP_EXTRA_CM = 10;
  const WORKTOP_TURNER_UNIT_DEFAULT = 2890;

  function normalizeImportedWorktopSizeKey(size) {
    const s = String(size || "")
      .trim()
      .toLowerCase();
    if (!s) return "";
    if (s.includes("920") || s === "92") return "92";
    if (s.includes("90")) return "90";
    if (s.includes("60")) return "60";
    const n = parseInt(s, 10);
    if (n === 920) return "92";
    if (n === 60 || n === 90 || n === 92) return String(n);
    return String(size || "").trim();
  }

  function isMegrendeloWorktopSnapLine(line) {
    const name = String(line?.name || "").trim();
    if (!name) return false;
    const low = normalizeMegrendeloLineText(name);
    if (!low.startsWith("munkalap")) return false;
    if (low.includes("fordito") || low.includes("vagasi") || low.includes("vagas dij")) return false;
    return true;
  }

  function parseWorktopSnapLineName(name) {
    if (typeof PartialInvoiceView !== "undefined" && PartialInvoiceView.parseWorktopSnapshotName) {
      const p = PartialInvoiceView.parseWorktopSnapshotName(name);
      return {
        size: normalizeImportedWorktopSizeKey(p.size),
        name: String(p.color || "").trim()
      };
    }
    const raw = String(name || "")
      .replace(/^Munkalap\s*[—–-]\s*/i, "")
      .replace(/^Munkalap\s*·\s*/i, "")
      .trim();
    const dot = raw.indexOf("·");
    if (dot >= 0) {
      return {
        size: normalizeImportedWorktopSizeKey(raw.slice(0, dot).trim()),
        name: raw.slice(dot + 1).trim()
      };
    }
    return { size: normalizeImportedWorktopSizeKey(raw), name: "" };
  }

  function worktopLineFromSnapLine(line) {
    if (!isMegrendeloWorktopSnapLine(line)) return null;
    const parsed = parseWorktopSnapLineName(line.name);
    let unit = Math.max(0, Math.round(Number(line.unit) || 0));
    let fm = Math.max(0, Number(line.qty) || 0);
    const total = Math.max(0, Math.round(Number(line.total) || 0));
    if (!fm && total > 0 && unit > 0) fm = total / unit;
    if (!unit && fm > 0 && total > 0) unit = Math.round(total / fm);
    if (fm <= 0 || unit <= 0) return null;
    const adjustedCm = Math.round(fm * 1000) / 10;
    const cm = Math.max(0, Math.round((adjustedCm - WORKTOP_EXTRA_CM) * 10) / 10);
    return {
      size: parsed.size,
      name: parsed.name,
      cm,
      adjustedCm,
      fm,
      unit
    };
  }

  function extractWorktopStateFromSnapLines(snapLines) {
    const worktopLines = [];
    let worktopTurnerQty = 0;
    let worktopTurnerUnitPrice = 0;

    (snapLines || []).forEach((line) => {
      const wt = worktopLineFromSnapLine(line);
      if (wt) {
        worktopLines.push(wt);
        return;
      }
      const low = normalizeMegrendeloLineText(line?.name);
      if (low.startsWith("munkalap") && (low.includes("fordito") || low.includes("fordító"))) {
        worktopTurnerQty = Math.max(0, Math.floor(Number(line.qty) || 0));
        worktopTurnerUnitPrice = Math.max(
          0,
          Math.round(Number(line.unit) || 0) || WORKTOP_TURNER_UNIT_DEFAULT
        );
      }
    });

    return {
      worktopLines,
      worktopTurnerQty,
      worktopTurnerUnitPrice: worktopTurnerUnitPrice || WORKTOP_TURNER_UNIT_DEFAULT
    };
  }

  function isMegrendeloHardwareSnapLine(line) {
    if (
      typeof PartialInvoiceView !== "undefined" &&
      PartialInvoiceView.isInvoiceHardwareSnapshotLine
    ) {
      return PartialInvoiceView.isInvoiceHardwareSnapshotLine(line);
    }
    const t = (
      normalizeMegrendeloLineText(line?.name) + " " + normalizeMegrendeloLineText(line?.code)
    ).trim();
    return t.includes("vasalat");
  }

  function extractHardwareLinesFromSnapLines(snapLines) {
    if (typeof PartialInvoiceView !== "undefined" && PartialInvoiceView.hardwareLinesFromSnapshot) {
      return PartialInvoiceView.hardwareLinesFromSnapshot({ lines: snapLines });
    }
    const out = [];
    (snapLines || []).forEach((line) => {
      if (!isMegrendeloHardwareSnapLine(line)) return;
      const total = Math.max(0, Math.round(Number(line.total) || 0));
      const qty = Math.max(1, Math.floor(Number(line.qty) || 0) || 1);
      const unit =
        Math.max(0, Math.round(Number(line.unit) || 0)) ||
        (total > 0 ? Math.round(total / qty) : 0);
      if (total <= 0 && unit <= 0) return;
      let name = String(line.name || "").trim();
      name = name.replace(/^[A-Z0-9][A-Z0-9_./-]*\s*-\s*Vasalat\s*-\s*/i, "").trim();
      name = name.replace(/^Vasalat\s*[—–-]\s*/i, "").trim() || String(line.code || "").trim();
      out.push({
        name,
        code: line.code,
        qty,
        unit
      });
    });
    return out;
  }

  function buildMegrendeloPayloadFromParts(parts, fileName) {
    const snapLines = (parts.snapLines || []).map((line) => {
      const name = String(line.name || "").trim();
      const code = String(line.code || "").trim() || extractCodeFromMegrendeloLineDescription(name);
      const qty = Math.max(0, Number(line.qty) || 0);
      const unit = Math.max(0, Math.round(Number(line.unit) || 0));
      const total = Math.max(0, Math.round(Number(line.total) || 0)) || unit * qty;
      return { code, name, qty, unit, total };
    });

    const selected = [];
    const kiadvanyExtrasLines = [];
    const worktopState = extractWorktopStateFromSnapLines(snapLines);
    const hardwareLinesImported = extractHardwareLinesFromSnapLines(snapLines);
    snapLines.forEach((line, idx) => {
      if (isMegrendeloWorktopSnapLine(line)) return;
      if (isMegrendeloHardwareSnapLine(line)) return;
      const isKiadvany =
        typeof PartialInvoiceView !== "undefined" &&
        PartialInvoiceView.isInvoiceKiadvanyLine &&
        PartialInvoiceView.isInvoiceKiadvanyLine(line);
      if (isKiadvany) {
        const kind =
          typeof PartialInvoiceView.inferKiadvanyLineKind === "function"
            ? PartialInvoiceView.inferKiadvanyLineKind(line)
            : "";
        kiadvanyExtrasLines.push({
          code: line.code,
          name: line.name,
          qty: line.qty,
          unit: line.unit,
          ...(kind ? { kind } : {})
        });
        return;
      }
      if (!line.code) return;
      const key = String(line.code || "XL" + idx).toUpperCase() + "#" + idx;
      selected.push([key, { code: line.code, name: line.name, qty: line.qty }]);
    });

    let quoteNumber = String(parts.quoteNumber || "").trim();
    if (!quoteNumber && fileName) quoteNumber = extractQuoteNumberFromText(fileName);

    const kitchen = Object.assign(
      {
        kitchenType: "",
        korpuszColor: "",
        upperFront: "",
        lowerFront: "",
        worktopStyle: "",
        handleStyle: "",
        store: "vaci"
      },
      parts.kitchen || {}
    );
    if (quoteNumber.toUpperCase().includes("BUD")) kitchen.store = "budaors";

    const summary = parts.summary || emptyMegrendeloSummary();

    return {
      quoteNumber,
      quoteDate: String(parts.quoteDate || "").trim(),
      customer: parts.customer || {},
      _importFileName: String(fileName || "").trim(),
      _importFullText: String(parts.importFullText || "").trim(),
      kitchen,
      note: String(parts.note || "").trim(),
      snapshot: {
        lines: snapLines,
        grossTotal: summary.grossTotal || 0,
        finalTotal: summary.finalTotal || 0,
        grandTotal: summary.grandTotal || 0,
        kitchenDiscountedTotal: summary.kitchenTotal || 0,
        shippingFee: summary.shippingFee || 0,
        assemblyFee: summary.assemblyFee || 0,
        discountPct: summary.discountPct || 0,
        discountHuf: summary.discountHuf || 0
      },
      state: {
        selected,
        hardwareLines: hardwareLinesImported,
        kiadvanyExtrasLines,
        worktopLines: worktopState.worktopLines,
        worktopTurnerQty: worktopState.worktopTurnerQty || 0,
        worktopTurnerUnitPrice: worktopState.worktopTurnerUnitPrice || WORKTOP_TURNER_UNIT_DEFAULT,
        shippingFee: summary.shippingFee || 0,
        assemblyFee: summary.assemblyFee || 0,
        discount: summary.discountPct || 0
      },
      _megrendeloImport: true,
      _summaryFromFooter: !!summary.fromFooter
    };
  }

  let pdfJsLoadPromise = null;

  function ensurePdfJs() {
    if (typeof pdfjsLib !== "undefined") {
      return Promise.resolve(pdfjsLib);
    }
    if (!pdfJsLoadPromise) {
      pdfJsLoadPromise = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js";
        s.onload = () => {
          try {
            pdfjsLib.GlobalWorkerOptions.workerSrc =
              "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
          } catch (_e) {
            /* ignore */
          }
          resolve(pdfjsLib);
        };
        s.onerror = () => reject(new Error("PDF.js betöltése sikertelen."));
        document.head.appendChild(s);
      });
    }
    return pdfJsLoadPromise;
  }

  async function extractPdfStructuredLines(arrayBuffer) {
    const pdfjs = await ensurePdfJs();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
    const out = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const buckets = new Map();
      content.items.forEach((it) => {
        const y = Math.round(it.transform[5]);
        if (!buckets.has(y)) buckets.set(y, []);
        buckets.get(y).push({ x: it.transform[4], str: String(it.str || "") });
      });
      [...buckets.keys()]
        .sort((a, b) => b - a)
        .forEach((y) => {
          const parts = buckets
            .get(y)
            .sort((a, b) => a.x - b.x)
            .filter((pt) => pt.str.trim());
          if (!parts.length) return;
          out.push({ y, parts, text: parts.map((pt) => pt.str).join(" ").replace(/\s+/g, " ").trim() });
        });
    }
    return out;
  }

  function tryParsePdfItemLine(text) {
    const t = String(text || "").replace(/\s+/g, " ").trim();
    if (!t || !/Ft/i.test(t)) return null;

    let m = t.match(/^(\d+)\s*(?:db|szett|fm|m2|m²)?\s+(.+?)\s+([\d\s]+)\s*Ft\s+([\d\s]+)\s*Ft$/i);
    if (m) {
      return {
        qty: parseQtyCell(m[1]),
        name: m[2].trim(),
        unit: parseHufNumberCell(m[3]),
        total: parseHufNumberCell(m[4])
      };
    }
    m = t.match(/^(\d+)\s+(.+?)\s+([\d\s]+)\s*Ft\s+([\d\s]+)\s*Ft$/i);
    if (m) {
      return {
        qty: parseQtyCell(m[1]),
        name: m[2].trim(),
        unit: parseHufNumberCell(m[3]),
        total: parseHufNumberCell(m[4])
      };
    }
    m = t.match(/([\d\s]+)\s*Ft\s+([\d\s]+)\s*Ft\s+(\d+)\s+(.+)$/i);
    if (m) {
      return {
        qty: parseQtyCell(m[3]),
        name: m[4].trim(),
        unit: parseHufNumberCell(m[1]),
        total: parseHufNumberCell(m[2])
      };
    }
    m = t.match(/([\d\s]+)\s*Ft\s+([\d\s]+)\s*Ft\s+(\d+)\s+(.+)/i);
    if (m) {
      return {
        qty: parseQtyCell(m[3]),
        name: m[4].trim(),
        unit: parseHufNumberCell(m[1]),
        total: parseHufNumberCell(m[2])
      };
    }
    return null;
  }

  function parseMegrendeloPdfFieldBlock(fullText, fileName) {
    const text = String(fullText || "");
    const customer = { name: "", address: "", phone: "", email: "" };
    const kitchen = {
      kitchenType: "",
      korpuszColor: "",
      upperFront: "",
      lowerFront: "",
      worktopStyle: "",
      kamraUpperFront: "",
      handleStyle: ""
    };

    let quoteNumber = extractQuoteNumberFromText(text) || extractQuoteNumberFromText(fileName);
    const qSplit = text.match(/(MRDH-[A-Z]+-\d{2})[\s-]+(\d{3,4})/i);
    if (qSplit) quoteNumber = (qSplit[1] + "-" + String(Number(qSplit[2])).padStart(4, "0")).toUpperCase();

    let quoteDate = "";
    const dateM = text.match(/Ajánlatadás dátuma:\s*(\d{4}\.\d{2}\.\d{2}\.?)/i);
    if (dateM) quoteDate = parseDotsDateToIso(dateM[1]);
    if (!quoteDate) {
      const anyDate = text.match(/\b(\d{4}\.\d{2}\.\d{2})\.?/);
      if (anyDate) quoteDate = parseDotsDateToIso(anyDate[1]);
    }

    const emailM = text.match(/[\w.+-]+@[\w.-]+\.\w+/);
    if (emailM) customer.email = emailM[0];

    const phoneM = text.match(/\b\d{2}\/\d{3}-\d{4}\b/);
    if (phoneM) customer.phone = phoneM[0];

    const pick = (re) => {
      const m = text.match(re);
      return m ? String(m[1]).trim() : "";
    };
    const sanitizeImportedWorktopStyle = (raw) => {
      const s = String(raw || "").trim();
      if (!s) return "";
      if (/\bFt\b/i.test(s)) return "";
      if (/^\d[\d\s\u00a0.,]+(\s+\d[\d\s\u00a0.,]+)+$/.test(s)) return "";
      return s;
    };
    customer.name =
      pick(/Vevő\s+neve\s*:?\s*([^\n|]+?)(?=\s{2,}|Vevő\s+címe|Telefon|E-?mail|Konyha|$)/i) ||
      pick(/Vevő neve\s+([^\n]+)/i) ||
      pick(/Név\s*:?\s*([^\n|]+?)(?=\s{2,}|Cím|Telefon|E-?mail|Konyha|$)/i) ||
      pick(/Vásárló\s+neve\s*:?\s*([^\n|]+)/i) ||
      customer.name;
    const labeledAddress =
      pick(/Vevő\s+címe\s*:?\s*([^\n|]+?)(?=\s{2,}|Telefon|E-?mail|Konyha|$)/i) ||
      pick(/Vevő címe\s+([^\n]+)/i) ||
      pick(/Cím\s*:?\s*([^\n|]+?)(?=\s{2,}|Telefon|E-?mail|Konyha|$)/i) ||
      pick(/Vásárló\s+címe\s*:?\s*([^\n|]+)/i);
    if (labeledAddress && isPlausibleMegrendeloCustomerAddress(labeledAddress)) {
      customer.address = labeledAddress;
    } else if (
      !customer.address &&
      typeof PartialInvoiceView !== "undefined" &&
      PartialInvoiceView.extractAddressFromFreeText
    ) {
      customer.address = PartialInvoiceView.extractAddressFromFreeText(text);
    }
    kitchen.korpuszColor = pick(/Korpusz\s*\(\s*bútor\s*\):\s*([^|\n]+?)(?=\s{2,}|$)/i);
    kitchen.upperFront = pick(/Felső front:\s*([^|\n]+)/i);
    kitchen.lowerFront = pick(/Alsó front:\s*([^|\n]+)/i);
    kitchen.kamraUpperFront = pick(/Kamra felső front:\s*([^|\n]+)/i);
    kitchen.worktopStyle = sanitizeImportedWorktopStyle(
      pick(/Munkalap:\s*([^|\n]+?)(?=\s+Falipanel:|$)/i)
    );
    kitchen.handleStyle = pick(/Fogantyú[^:]*:\s*([^|\n]+)/i);

    const ktM = text.match(/Konyha\s*Típus:\s*([^\n]+)/i);
    if (ktM) {
      kitchen.kitchenType = ktM[1].replace(/Mennyiség.*/i, "").trim();
    } else {
      const selectM = text.match(/(Select\s+[^\n]+?)(?:\s+Konyha\s*Típus:|$)/i);
      if (selectM) kitchen.kitchenType = selectM[1].trim();
    }

    if (text.includes("Vevő neve") || text.includes("Név") || text.includes("Vásárló")) {
      kitchen.kitchenType = pick(/Konyha típus\s+([^\n]+)/i) || kitchen.kitchenType;
      kitchen.korpuszColor = pick(/Korpusz\s+([^\n]+)/i) || kitchen.korpuszColor;
      kitchen.lowerFront = pick(/Alsó front\s+([^\n]+)/i) || kitchen.lowerFront;
      kitchen.upperFront = pick(/Felső front\s+([^\n]+)/i) || kitchen.upperFront;
      kitchen.kamraUpperFront =
        pick(/Kamra felső front\s+([^\n]+)/i) || kitchen.kamraUpperFront;
      kitchen.worktopStyle =
        sanitizeImportedWorktopStyle(pick(/Munkalap\s+([^\n]+)/i)) || kitchen.worktopStyle;
      kitchen.handleStyle = pick(/Fogantyú\s+([^\n]+)/i) || kitchen.handleStyle;
      const aruhaz = pick(/Áruház\s+([^\n]+)/i);
      if (aruhaz.toLowerCase().includes("buda")) kitchen.store = "budaors";
    }

    if (!customer.name) customer.name = extractCustomerFromMegrendeloFileName(fileName);

    cleanupMegrendeloCustomer(customer);

    return { quoteNumber, quoteDate, customer, kitchen };
  }

  function parseMegrendeloPdfLines(pdfLines, fileName) {
    const fullText = pdfLines.map((l) => l.text).join("\n");
    const meta = parseMegrendeloPdfFieldBlock(fullText, fileName);
    enrichCustomerFromMegrendeloPdfLines(meta.customer, pdfLines);
    cleanupMegrendeloCustomer(meta.customer);
    const snapLines = [];
    let inItems = false;

    for (const line of pdfLines) {
      const t = line.text;
      if (/Mennyiség/i.test(t) && /Leírás/i.test(t)) {
        inItems = true;
        continue;
      }
      if (!inItems) continue;
      if (/Az árajánlat/i.test(t) || /Az ajánlat/i.test(t)) break;
      if (/^Előleg:/i.test(t) || /Végösszeg/i.test(t)) break;

      const item = tryParsePdfItemLine(t);
      if (!item || !item.name) continue;
      snapLines.push({
        code: extractCodeFromMegrendeloLineDescription(item.name),
        name: item.name,
        qty: item.qty,
        unit: item.unit,
        total: item.total > 0 ? item.total : item.unit * item.qty
      });
    }

    const summary = parseMegrendeloSummaryFromText(fullText);
    const payload = buildMegrendeloPayloadFromParts(
      Object.assign({}, meta, { snapLines, summary, importFullText: fullText }),
      fileName
    );
    if (!payload) return null;
    if (!snapLines.length && !meta.customer.name && !meta.kitchen.kitchenType) return null;
    return payload;
  }

  async function parseMegrendeloPdfBuffer(arrayBuffer, fileName) {
    const lines = await extractPdfStructuredLines(arrayBuffer);
    return parseMegrendeloPdfLines(lines, fileName);
  }

  const api = {
    customerNameFromOrderFolder,
    extractCustomerFromMegrendeloFileName,
    extractQuoteNumberFromText,
    extractWorktopStateFromSnapLines,
    extractHardwareLinesFromSnapLines,
    isMegrendeloHardwareSnapLine,
    isMegrendeloWorktopSnapLine,
    parseMegrendeloPdfBuffer,
    parseMegrendeloPdfLines,
    parseMegrendeloSummaryFromText,
    finalizeMegrendeloSummary,
    buildMegrendeloPayloadFromParts
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.MegrendeloImport = api;
})(typeof window !== "undefined" ? window : globalThis);
