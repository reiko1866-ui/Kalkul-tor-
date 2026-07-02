/**
 * Asztalos munkalap — nyomtatható HTML, árak nélkül, határidő szerinti sorrend.
 */
(function (global) {
  "use strict";

  const HU_MONTHS_GENITIVE = [
    "január",
    "február",
    "március",
    "április",
    "május",
    "június",
    "július",
    "augusztus",
    "szeptember",
    "október",
    "november",
    "december"
  ];

  function formatQuoteValidityOneWeek(isoDate) {
    const m = String(isoDate || "")
      .trim()
      .match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return "—";
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    d.setDate(d.getDate() + 7);
    return (
      d.getFullYear() +
      ". " +
      (HU_MONTHS_GENITIVE[d.getMonth()] || "") +
      " " +
      d.getDate() +
      "."
    );
  }

  function formatIsoHu(iso) {
    const m = String(iso || "")
      .trim()
      .match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return String(iso || "—");
    return m[1] + ". " + (HU_MONTHS_GENITIVE[Number(m[2]) - 1] || m[2]) + " " + Number(m[3]) + ".";
  }

  function deadlineSortKey(entry) {
    const kind = String(entry?.deadline || "").toLowerCase();
    if (kind === "urgent" || kind === "surgos") return 0;
    if (kind === "1month" || kind === "1honap") return 1;
    if (kind === "2month" || kind === "2honap") return 2;
    const custom = String(entry?.deadlineDate || entry?.deadlineCustom || "").trim();
    if (custom) {
      const t = Date.parse(custom);
      if (Number.isFinite(t)) return 3 + t / 1e15;
    }
    return 9;
  }

  function sortByDeadlineUrgency(entries) {
    return (Array.isArray(entries) ? entries.slice() : []).sort((a, b) => {
      const ka = deadlineSortKey(a);
      const kb = deadlineSortKey(b);
      if (ka !== kb) return ka - kb;
      return String(a?.requestedAt || "").localeCompare(String(b?.requestedAt || ""));
    });
  }

  function deadlineLabel(entry) {
    const custom = String(entry?.deadlineDate || entry?.deadlineCustom || "").trim();
    if (custom) return formatIsoHu(custom);
    const kind = String(entry?.deadline || entry?.deadlineType || "").toLowerCase();
    if (kind === "urgent" || kind === "surgos") return "Sürgős";
    if (kind === "1month" || kind === "1honap") return "~1 hónap";
    if (kind === "2month" || kind === "2honap") return "~2 hónap";
    const custom = String(entry?.deadlineDate || entry?.deadlineCustom || "").trim();
    if (custom) return formatIsoHu(custom);
    return "—";
  }

  const KITCHEN_ORDER_WARNING_DAYS = 14;

  function parseIsoDateOnly(value) {
    const m = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isFinite(d.getTime()) ? d : null;
  }

  function startOfDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  /** Becsült konyha-szállítási / átadási dátum a határidő típus alapján. */
  function resolveKitchenDeliveryDate(entry) {
    const customDate = parseIsoDateOnly(entry?.deadlineDate || entry?.deadlineCustom);
    if (customDate) return customDate;
    const kind = String(entry?.deadline || entry?.deadlineType || "").toLowerCase();
    if (kind === "custom") {
      return null;
    }
    if (!kind || kind === "none") return null;
    const base =
      parseIsoDateOnly(entry?.quoteDate) ||
      (entry?.requestedAt ? startOfDay(new Date(entry.requestedAt)) : startOfDay(new Date()));
    const d = new Date(base.getTime());
    if (kind === "urgent" || kind === "surgos") d.setDate(d.getDate() + 14);
    else if (kind === "1month" || kind === "1honap") d.setDate(d.getDate() + 30);
    else if (kind === "2month" || kind === "2honap") d.setDate(d.getDate() + 60);
    else return parseIsoDateOnly(entry?.deadlineDate || entry?.deadlineCustom);
    return d;
  }

  function daysUntilKitchenDelivery(entry) {
    const target = resolveKitchenDeliveryDate(entry);
    if (!target) return null;
    const today = startOfDay(new Date());
    const t = startOfDay(target);
    return Math.round((t.getTime() - today.getTime()) / 86400000);
  }

  function kitchenDeliveryLabel(entry) {
    const target = resolveKitchenDeliveryDate(entry);
    if (!target) return deadlineLabel(entry) === "—" ? "—" : deadlineLabel(entry);
    return formatIsoHu(target.toISOString().slice(0, 10));
  }

  /** 2 héten belül szállítás — konyhát le kell adni (ha még nincs leadva / kész). */
  function kitchenOrderWarning(entry, leadDays) {
    const lead = leadDays == null ? KITCHEN_ORDER_WARNING_DAYS : Math.max(1, Math.floor(Number(leadDays) || 14));
    if (String(entry?.status || "") === "done") return null;
    if (entry?.kitchenOrderSubmitted) return null;
    const days = daysUntilKitchenDelivery(entry);
    if (days == null || days < 0) return null;
    if (days > lead) return null;
    return days <= 7 ? "critical" : "warn";
  }

  function felmeresStatusLabel(entry) {
    const requested = entry?.fromQueue ? true : !!entry?.felmeresRequested;
    if (!requested) return "Nem kért";
    if (entry?.felmeresDone || String(entry?.status || "") === "done") return "Kész";
    return "Várakozik";
  }

  function isFelmeresDone(entry) {
    return !!(entry?.felmeresDone || String(entry?.status || "") === "done");
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function buildSectionRows(lines, title) {
    if (!lines || !lines.length) return "";
    const body = lines
      .map(
        (line, idx) =>
          "<tr><td>" +
          (idx + 1) +
          "</td><td><strong>" +
          escapeHtml(line.code) +
          "</strong></td><td>" +
          escapeHtml(line.name) +
          "</td><td class='qty'>" +
          escapeHtml(String(line.qty || 0)) +
          " db</td><td class='legs'>" +
          (line.legs != null ? escapeHtml(String(line.legs)) + " láb" : "—") +
          "</td></tr>"
      )
      .join("");
    return (
      "<h3>" +
      escapeHtml(title) +
      "</h3><table class='lines'><thead><tr><th>#</th><th>Cikkszám</th><th>Megnevezés</th><th>Db</th><th>Láb</th></tr></thead><tbody>" +
      body +
      "</tbody></table>"
    );
  }

  function buildAsztalosMunkalapHtml(opts) {
    const o = opts && typeof opts === "object" ? opts : {};
    const customer = o.customer || {};
    const quoteNumber = String(o.quoteNumber || "").trim();
    const quoteDate = String(o.quoteDate || "").trim();
    const sections = o.sections || {};
    const note = String(o.note || "").trim();
    const validity = formatQuoteValidityOneWeek(quoteDate);

    const floorHtml = buildSectionRows(sections.floor || [], "Földön (alsó, magas/kamra, sziget)");
    const wallHtml = buildSectionRows(sections.wall || [], "Fali (felső, nyitott polc)");
    const extrasHtml = buildSectionRows(sections.extras || [], "Kiegészítők");

    return (
      "<!DOCTYPE html><html lang='hu'><head><meta charset='utf-8'><title>Asztalos munkalap" +
      (quoteNumber ? " — " + escapeHtml(quoteNumber) : "") +
      "</title><style>" +
      "body{font-family:system-ui,sans-serif;margin:24px;color:#1a1c21;}" +
      "h1{font-size:1.35rem;margin:0 0 4px;color:#800040;}" +
      "h2{font-size:1rem;font-weight:600;margin:20px 0 8px;}" +
      "h3{font-size:0.95rem;margin:16px 0 6px;color:#2d3a42;}" +
      ".meta{font-size:0.9rem;color:#3a4d58;margin-bottom:16px;}" +
      "table.lines{width:100%;border-collapse:collapse;font-size:0.88rem;margin-bottom:12px;}" +
      "table.lines th,table.lines td{border:1px solid #ccc;padding:6px 8px;text-align:left;}" +
      "table.lines th{background:#f6f7f9;}" +
      ".qty,.legs{text-align:center;white-space:nowrap;}" +
      ".note{margin-top:16px;padding:10px;background:#faf8f4;border-left:4px solid #f3bf35;}" +
      "@media print{body{margin:12px;} h1{font-size:1.1rem;}}" +
      "</style></head><body>" +
      "<h1>Asztalos munkalap — helyszíni felmérés</h1>" +
      "<div class='meta'>" +
      "<div><strong>Megrendelés:</strong> " +
      escapeHtml(quoteNumber || "—") +
      "</div>" +
      "<div><strong>Kelt:</strong> " +
      formatIsoHu(quoteDate) +
      " · <strong>Érvényes:</strong> " +
      validity +
      "-ig</div>" +
      "<div><strong>Vevő:</strong> " +
      escapeHtml(customer.name || "—") +
      (customer.phone ? " · " + escapeHtml(customer.phone) : "") +
      "</div>" +
      (customer.address
        ? "<div><strong>Cím:</strong> " + escapeHtml(customer.address) + "</div>"
        : "") +
      "</div>" +
      floorHtml +
      wallHtml +
      extrasHtml +
      (note ? "<div class='note'><strong>Megjegyzés:</strong> " + escapeHtml(note) + "</div>" : "") +
      "<p style='margin-top:24px;font-size:0.8rem;color:#6e7d76;'>Árak nélkül — Divian Konyhaműhely</p>" +
      "</body></html>"
    );
  }

  function openAsztalosMunkalapPrint(opts) {
    const html = buildAsztalosMunkalapHtml(opts);
    if (typeof PartialInvoiceView !== "undefined" && PartialInvoiceView.openHtmlInPrintWindow) {
      return PartialInvoiceView.openHtmlInPrintWindow(html);
    }
    const w = window.open("about:blank", "_blank");
    if (!w) return { ok: false, error: "popup-blocked" };
    w.document.open();
    w.document.write(html);
    w.document.close();
    try {
      w.opener = null;
      w.document.title = "Asztalos munkalap";
      w.focus();
    } catch (_e) {}
    return { ok: true };
  }

  function buildQueueWorksheetHtml(queueEntries, projectSectionsByQuote) {
    const sorted = sortByDeadlineUrgency(queueEntries);
    const parts = sorted.map((entry, i) => {
      const qn = String(entry.quoteNumber || "").trim();
      const sections = (projectSectionsByQuote && projectSectionsByQuote[qn]) || entry.sections || {};
      const inner = buildAsztalosMunkalapHtml({
        quoteNumber: qn,
        quoteDate: entry.quoteDate || entry.requestedAt,
        customer: {
          name: entry.customerName || entry.customer?.name,
          phone: entry.customerPhone || entry.customer?.phone,
          address: entry.customerAddress || entry.customer?.address
        },
        sections,
        note: (entry.note || "") + (entry.deadline ? " · Határidő: " + deadlineLabel(entry) : "")
      });
      return (
        "<section class='queue-sheet' style='page-break-after:always'>" +
        "<p style='font-size:0.85rem;color:#800040;font-weight:600'>#" +
        (i + 1) +
        " · " +
        escapeHtml(deadlineLabel(entry)) +
        "</p>" +
        inner.replace(/^[\s\S]*<body>/, "").replace(/<\/body>[\s\S]*$/, "") +
        "</section>"
      );
    });
    return (
      "<!DOCTYPE html><html lang='hu'><head><meta charset='utf-8'><title>Asztalos munkalapok</title>" +
      "<style>body{font-family:system-ui,sans-serif;margin:16px;} @media print{.queue-sheet{page-break-after:always;}}</style>" +
      "</head><body>" +
      parts.join("") +
      "</body></html>"
    );
  }

  const api = {
    formatQuoteValidityOneWeek,
    formatIsoHu,
    sortByDeadlineUrgency,
    deadlineLabel,
    KITCHEN_ORDER_WARNING_DAYS,
    parseIsoDateOnly,
    resolveKitchenDeliveryDate,
    daysUntilKitchenDelivery,
    kitchenDeliveryLabel,
    kitchenOrderWarning,
    felmeresStatusLabel,
    isFelmeresDone,
    buildAsztalosMunkalapHtml,
    openAsztalosMunkalapPrint,
    buildQueueWorksheetHtml
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.DivianAsztalosMunkalap = api;
})(typeof window !== "undefined" ? window : globalThis);
