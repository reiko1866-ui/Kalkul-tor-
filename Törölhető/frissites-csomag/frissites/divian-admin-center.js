/**
 * Divian központi adminisztrációs központ — Kanban, archívum, beállítások.
 */
(function () {
  "use strict";

  const KANBAN_COLUMNS = [
    { id: "urgent", title: "Sürgős", match: (e) => colOf(e) === "urgent" },
    { id: "1month", title: "~1 hónap", match: (e) => colOf(e) === "1month" },
    { id: "2month", title: "~2 hónap", match: (e) => colOf(e) === "2month" },
    { id: "custom", title: "Egyedi határidő", match: (e) => colOf(e) === "custom" },
    { id: "done", title: "Kész", match: (e) => String(e?.status || "") === "done" }
  ];

  function defaultForwarderBase() {
    try {
      const loc = window.location;
      if ((loc.protocol === "http:" || loc.protocol === "https:") && loc.port === "17321") {
        return loc.origin;
      }
    } catch (_e) {}
    return "http://localhost:17321";
  }

  const API = defaultForwarderBase();
  let archiveRows = [];
  let kanbanRows = [];
  let dragEntryId = "";

  function colOf(entry) {
    if (String(entry?.status || "") === "done") return "done";
    const customDate = String(entry?.deadlineDate || entry?.deadlineCustom || "").trim();
    if (customDate) return "custom";
    const k = String(entry?.deadline || "").toLowerCase();
    if (k === "none" || k === "") return "custom";
    if (k === "urgent" || k === "surgos") return "urgent";
    if (k === "1month" || k === "1honap") return "1month";
    if (k === "2month" || k === "2honap") return "2month";
    if (k === "custom") return "custom";
    return "custom";
  }

  function $(id) {
    return document.getElementById(id);
  }

  function setStatus(el, msg, tone) {
    if (!el) return;
    el.textContent = String(msg || "");
    el.classList.remove("is-err", "is-ok");
    if (tone === "err") el.classList.add("is-err");
    if (tone === "ok") el.classList.add("is-ok");
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function formatDate(iso) {
    const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return "—";
    return m[1] + "." + m[2] + "." + m[3] + ".";
  }

  function deadlineLabel(entry) {
    if (typeof DivianAsztalosMunkalap !== "undefined" && DivianAsztalosMunkalap.deadlineLabel) {
      return DivianAsztalosMunkalap.deadlineLabel(entry);
    }
    return String(entry?.deadline || "—");
  }

  function getQuoteWindow() {
    try {
      return $("quoteEngineFrame")?.contentWindow || null;
    } catch (_e) {
      return null;
    }
  }

  async function apiJson(url, opts) {
    const res = await fetch(url, opts);
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.ok === false) {
      throw new Error(json.error || "HTTP " + res.status);
    }
    return json;
  }

  function switchView(viewId) {
    document.querySelectorAll(".admin-nav button[data-view]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.getAttribute("data-view") === viewId);
    });
    document.querySelectorAll(".admin-panel").forEach((panel) => {
      panel.classList.remove("is-active");
    });
    const map = {
      munkaszervezes: "panelMunkaszervezes",
      archivum: "panelArchivum",
      beallitasok: "panelBeallitasok"
    };
    const panel = $(map[viewId]);
    if (panel) panel.classList.add("is-active");
    if (viewId === "munkaszervezes") loadKanban();
    if (viewId === "archivum") loadArchive();
    if (viewId === "beallitasok") loadSettings();
  }

  function munkalapApi() {
    return typeof DivianAsztalosMunkalap !== "undefined" ? DivianAsztalosMunkalap : null;
  }

  function renderKanbanAlerts(rows) {
    const box = $("kanbanAlerts");
    if (!box) return;
    const api = munkalapApi();
    if (!api) {
      box.innerHTML = "";
      return;
    }
    const warnings = (rows || []).filter((r) => api.kitchenOrderWarning(r));
    if (!warnings.length) {
      box.innerHTML = "";
      return;
    }
    box.innerHTML = warnings
      .map((row) => {
        const level = api.kitchenOrderWarning(row);
        const days = api.daysUntilKitchenDelivery(row);
        const name = escapeHtml(row.customerName || "Ismeretlen ügyfél");
        const qn = escapeHtml(row.quoteNumber || "—");
        const cls = level === "critical" ? "is-critical" : "is-warn";
        const dayText = days === 0 ? "ma" : days === 1 ? "holnap" : days + " nap múlva";
        return (
          '<div class="summary-alert ' +
          cls +
          '"><strong>' +
          name +
          "</strong> · " +
          qn +
          " — Szállítás " +
          escapeHtml(dayText) +
          " (" +
          escapeHtml(api.kitchenDeliveryLabel(row)) +
          "). <strong>Le kell adni a konyhát!</strong></div>"
        );
      })
      .join("");
  }

  function renderKanban() {
    const board = $("kanbanBoard");
    if (!board) return;
    const api = munkalapApi();
    board.innerHTML = KANBAN_COLUMNS.map((col) => {
      const cards = kanbanRows.filter((e) => col.match(e));
      const cardsHtml = cards
        .map((entry) => {
          const title = escapeHtml(entry.customerName || "Ismeretlen ügyfél");
          const qn = escapeHtml(entry.quoteNumber || "—");
          const felmeres = api?.felmeresStatusLabel
            ? api.felmeresStatusLabel(Object.assign({ fromQueue: true }, entry))
            : "Kért";
          const felmeresDone = api?.isFelmeresDone
            ? api.isFelmeresDone(Object.assign({ fromQueue: true }, entry))
            : !!entry.felmeresDone;
          const delivery = api?.kitchenDeliveryLabel ? api.kitchenDeliveryLabel(entry) : deadlineLabel(entry);
          const days = api?.daysUntilKitchenDelivery ? api.daysUntilKitchenDelivery(entry) : null;
          const daysText =
            days == null ? "" : days === 0 ? " (ma)" : days > 0 ? " (" + days + " nap)" : "";
          const warn = api?.kitchenOrderWarning ? api.kitchenOrderWarning(entry) : null;
          const warnHtml = warn
            ? '<p class="kanban-card-warn">⚠ Le kell adni a konyhát — szállítás' +
              escapeHtml(daysText) +
              "</p>"
            : "";
          const submitBtn =
            warn && !entry.kitchenOrderSubmitted
              ? '<button type="button" class="admin-btn" data-action="submitted" data-id="' +
                escapeHtml(entry.id) +
                '">Konyha leadva</button>'
              : "";
          const felmeresBtn = !felmeresDone
            ? '<button type="button" class="admin-btn is-accent" data-action="felmeres-done" data-id="' +
              escapeHtml(entry.id) +
              '">Felmérés kész</button>'
            : "";
          return (
            '<article class="kanban-card' +
            (warn ? " has-warn" : "") +
            (felmeresDone ? " is-felmeres-done" : "") +
            '" draggable="true" data-entry-id="' +
            escapeHtml(entry.id) +
            '"><h4>' +
            title +
            '</h4><p class="kanban-card-sub">' +
            qn +
            '</p><p class="kanban-card-meta">Felmérés: <strong class="' +
            (felmeresDone ? "is-ok-text" : "") +
            '">' +
            escapeHtml(felmeres) +
            "</strong> · Szállítás: <strong>" +
            escapeHtml(delivery) +
            "</strong></p>" +
            warnHtml +
            '<div class="kanban-card-actions">' +
            '<button type="button" class="admin-btn" data-action="asztalos" data-id="' +
            escapeHtml(entry.id) +
            '">Asztalos munkalap</button>' +
            felmeresBtn +
            submitBtn +
            '<button type="button" class="admin-btn" data-action="done" data-id="' +
            escapeHtml(entry.id) +
            '">Lezárás</button>' +
            '<button type="button" class="admin-btn" data-action="delete" data-id="' +
            escapeHtml(entry.id) +
            '">Törlés</button></div></article>'
          );
        })
        .join("");
      return (
        '<div class="kanban-col" data-col="' +
        col.id +
        '"><h3>' +
        escapeHtml(col.title) +
        ' <span style="opacity:.6">(' +
        cards.length +
        ")</span></h3>" +
        cardsHtml +
        "</div>"
      );
    }).join("");
  }

  function dedupeKanbanRows(rows) {
    const api = munkalapApi();
    const list = Array.isArray(rows) ? rows : [];
    const byQuote = new Map();
    list.forEach((row) => {
      const qn = String(row?.quoteNumber || "").trim();
      const key = qn || String(row?.id || "");
      if (!key) return;
      const prev = byQuote.get(key);
      if (!prev) {
        byQuote.set(key, row);
        return;
      }
      const tNew = Date.parse(String(row?.updatedAt || row?.savedAt || row?.requestedAt || ""));
      const tOld = Date.parse(String(prev?.updatedAt || prev?.savedAt || prev?.requestedAt || ""));
      if ((Number.isFinite(tNew) ? tNew : 0) >= (Number.isFinite(tOld) ? tOld : 0)) {
        byQuote.set(key, row);
      }
    });
    return Array.from(byQuote.values());
  }

  async function loadKanban() {
    try {
      const json = await apiJson(API + "/api/felmeres-queue");
      kanbanRows = dedupeKanbanRows(Array.isArray(json.rows) ? json.rows : []);
      if (munkalapApi()?.sortByDeadlineUrgency) {
        kanbanRows = munkalapApi().sortByDeadlineUrgency(kanbanRows);
      }
      renderKanbanAlerts(kanbanRows);
      renderKanban();
      const warnCount = kanbanRows.filter((r) => munkalapApi()?.kitchenOrderWarning(r)).length;
      setStatus(
        $("kanbanStatus"),
        kanbanRows.length + " felmérés" + (warnCount ? " · " + warnCount + " figyelmeztetés" : ""),
        warnCount > 0 ? "err" : "ok"
      );
    } catch (err) {
      setStatus($("kanbanStatus"), String(err?.message || err), "err");
    }
  }

  async function patchFelmeres(id, patch) {
    await apiJson(API + "/api/felmeres-queue", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, patch })
    });
    await loadKanban();
  }

  function openAsztalosFromEntry(entry) {
    if (!entry || typeof DivianAsztalosMunkalap === "undefined") return;
    DivianAsztalosMunkalap.openAsztalosMunkalapPrint({
      quoteNumber: entry.quoteNumber,
      quoteDate: entry.quoteDate,
      customer: {
        name: entry.customerName,
        phone: entry.customerPhone,
        address: entry.customerAddress
      },
      sections: entry.sections || { floor: [], wall: [], extras: [] }
    });
  }

  async function loadPayloadForQuote(quoteNumber) {
    const q = String(quoteNumber || "").trim();
    if (!q) throw new Error("Nincs sorszám");
    const hit = await apiJson(API + "/saved-orders/resolve?quote=" + encodeURIComponent(q));
    if (!hit.jsonText) {
      throw new Error("Nincs JSON ehhez a sorszámhoz — csak PDF van a mappában");
    }
    return JSON.parse(hit.jsonText || "{}");
  }

  async function waitForQuoteEngineApi(maxTries) {
    const limit = maxTries == null ? 80 : maxTries;
    for (let i = 0; i < limit; i += 1) {
      const w = getQuoteWindow();
      if (w && w.DivianAdminQuoteApi && typeof w.DivianAdminQuoteApi.issueArchiveDoc === "function") {
        return w.DivianAdminQuoteApi;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error("Árajánlat motor még tölt — várj pár másodpercet, majd próbáld újra");
  }

  const ARCHIVE_DOC_LABELS = {
    proforma: "Előleg / díjbekérő",
    delivery: "Szállítólevél",
    final: "Végszámla"
  };

  async function openDocForQuote(quoteNumber, kind) {
    const payload = await loadPayloadForQuote(quoteNumber);
    const api = await waitForQuoteEngineApi();
    const res = await api.issueArchiveDoc(kind, payload);
    if (!res || !res.ok) {
      throw new Error((res && res.error) || "Generálás sikertelen");
    }
    return res;
  }

  function renderArchiveTable(filter) {
    const tbody = $("archiveTableBody");
    if (!tbody) return;
    const q = String(filter || "").trim().toLowerCase();
    const rows = archiveRows.filter((r) => {
      if (!q) return true;
      const hay = (r.quoteNumber + " " + r.customerName + " " + (r.orderFolder || "")).toLowerCase();
      return hay.includes(q);
    });
    tbody.innerHTML = rows
      .map((row) => {
        const saved = row.savedAt ? formatDate(row.savedAt) : "—";
        const badges =
          '<span class="archive-badge ' +
          (row.hasPdf ? "is-yes" : "") +
          '">PDF</span>' +
          '<span class="archive-badge ' +
          (row.hasExcel ? "is-yes" : "") +
          '">XLS</span>' +
          '<span class="archive-badge ' +
          (row.editableJsonFile || row.orderJsonFile ? "is-yes" : "") +
          '">JSON</span>';
        const qn = escapeHtml(row.quoteNumber || "");
        return (
          "<tr><td>" +
          escapeHtml(saved) +
          "</td><td><strong>" +
          qn +
          "</strong></td><td>" +
          escapeHtml(row.customerName || "—") +
          '</td><td><div class="archive-doc-badges">' +
          badges +
          '</div></td><td><div class="archive-actions">' +
          '<button type="button" class="admin-btn" data-doc="proforma" data-quote="' +
          qn +
          '" title="Díjbekérő / előleg PDF + mentés">Előleg</button>' +
          '<button type="button" class="admin-btn" data-doc="delivery" data-quote="' +
          qn +
          '" title="Szállítólevél PDF + Excel + mentés">Szállító</button>' +
          '<button type="button" class="admin-btn" data-doc="final" data-quote="' +
          qn +
          '" title="Végszámla I.+II. részlet PDF + Excel">Végszámla</button>' +
          "</div></td></tr>"
        );
      })
      .join("");
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="5">Nincs mentett megrendelés</td></tr>';
    }
  }

  async function loadArchive() {
    try {
      const json = await apiJson(API + "/saved-orders/list?enriched=1");
      archiveRows = Array.isArray(json.rows) ? json.rows : [];
      renderArchiveTable($("archiveSearch")?.value || "");
      setStatus($("archiveStatus"), archiveRows.length + " projekt az archívumban", "ok");
    } catch (err) {
      setStatus($("archiveStatus"), String(err?.message || err), "err");
    }
  }

  function fillSettingsForm(settings) {
    const s = settings || {};
    $("setCutFee").value = s.cutFeeUnit ?? "";
    $("setSilicone").value = s.siliconeUnitPrice ?? "";
    $("setLeg10I").value = s.legPricePerDb?.["10"]?.I ?? "";
    $("setLeg10II").value = s.legPricePerDb?.["10"]?.II ?? "";
    $("setLeg15I").value = s.legPricePerDb?.["15"]?.I ?? "";
    $("setLeg15II").value = s.legPricePerDb?.["15"]?.II ?? "";
    $("setToe10I").value = s.toeKickPricePerFm?.["10"]?.I ?? "";
    $("setToe10II").value = s.toeKickPricePerFm?.["10"]?.II ?? "";
    $("setToe15I").value = s.toeKickPricePerFm?.["15"]?.I ?? "";
    $("setToe15II").value = s.toeKickPricePerFm?.["15"]?.II ?? "";
    $("setQuoteFooter").value = s.pdfTexts?.quoteFooter ?? "";
    $("setDeliveryNote").value = s.pdfTexts?.deliveryNoteNote ?? "";
    $("setProformaNote").value = s.pdfTexts?.proformaNote ?? "";
  }

  function readSettingsForm() {
    const num = (id) => Math.max(0, Math.floor(Number($(id)?.value) || 0));
    return {
      cutFeeUnit: num("setCutFee"),
      siliconeUnitPrice: num("setSilicone"),
      legPricePerDb: {
        "10": { I: num("setLeg10I"), II: num("setLeg10II") },
        "15": { I: num("setLeg15I"), II: num("setLeg15II") }
      },
      toeKickPricePerFm: {
        "10": { I: num("setToe10I"), II: num("setToe10II") },
        "15": { I: num("setToe15I"), II: num("setToe15II") }
      },
      pdfTexts: {
        quoteFooter: String($("setQuoteFooter")?.value || "").trim(),
        deliveryNoteNote: String($("setDeliveryNote")?.value || "").trim(),
        proformaNote: String($("setProformaNote")?.value || "").trim()
      }
    };
  }

  async function loadSettings() {
    try {
      const json = await apiJson(API + "/api/admin-settings");
      fillSettingsForm(json.settings);
      setStatus($("settingsStatus"), "Beállítások betöltve", "ok");
    } catch (err) {
      setStatus($("settingsStatus"), String(err?.message || err), "err");
    }
  }

  async function saveSettings() {
    try {
      const settings = readSettingsForm();
      await apiJson(API + "/api/admin-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings })
      });
      const w = getQuoteWindow();
      if (w && typeof w.applyDivianAdminSettings === "function") {
        w.applyDivianAdminSettings(settings);
      }
      setStatus($("settingsStatus"), "Beállítások mentve — új árajánlatoknál érvényes", "ok");
    } catch (err) {
      setStatus($("settingsStatus"), String(err?.message || err), "err");
    }
  }

  function wireNav() {
    document.querySelectorAll(".admin-nav button[data-view]").forEach((btn) => {
      btn.addEventListener("click", () => switchView(btn.getAttribute("data-view")));
    });
    $("refreshKanbanBtn")?.addEventListener("click", loadKanban);
    $("refreshArchiveBtn")?.addEventListener("click", loadArchive);
    $("archiveSearch")?.addEventListener("input", (ev) => {
      renderArchiveTable(ev.target.value);
    });
    $("saveSettingsBtn")?.addEventListener("click", saveSettings);
  }

  function wireKanban() {
    const board = $("kanbanBoard");
    if (!board) return;
    board.addEventListener("dragstart", (ev) => {
      const card = ev.target.closest(".kanban-card");
      if (!card) return;
      dragEntryId = card.getAttribute("data-entry-id") || "";
      ev.dataTransfer?.setData("text/plain", dragEntryId);
    });
    board.addEventListener("dragover", (ev) => {
      if (ev.target.closest(".kanban-col")) ev.preventDefault();
    });
    board.addEventListener("drop", async (ev) => {
      ev.preventDefault();
      const col = ev.target.closest(".kanban-col");
      if (!col || !dragEntryId) return;
      const colId = col.getAttribute("data-col");
      const patch =
        colId === "done"
          ? { status: "done", felmeresDone: true, felmeresDoneAt: new Date().toISOString() }
          : { status: "open", deadline: colId === "custom" ? "custom" : colId };
      try {
        await patchFelmeres(dragEntryId, patch);
        setStatus($("kanbanStatus"), "Áthelyezve: " + colId, "ok");
      } catch (err) {
        setStatus($("kanbanStatus"), String(err?.message || err), "err");
      }
      dragEntryId = "";
    });
    board.addEventListener("click", async (ev) => {
      const btn = ev.target.closest("button[data-action]");
      if (!btn) return;
      const id = btn.getAttribute("data-id");
      const entry = kanbanRows.find((r) => String(r.id) === String(id));
      const action = btn.getAttribute("data-action");
      if (action === "asztalos" && entry) {
        openAsztalosFromEntry(entry);
        return;
      }
      if (action === "submitted") {
        try {
          await patchFelmeres(id, {
            kitchenOrderSubmitted: true,
            kitchenOrderSubmittedAt: new Date().toISOString()
          });
        } catch (err) {
          setStatus($("kanbanStatus"), String(err?.message || err), "err");
        }
        return;
      }
      if (action === "felmeres-done") {
        try {
          await patchFelmeres(id, {
            felmeresDone: true,
            felmeresDoneAt: new Date().toISOString()
          });
          setStatus($("kanbanStatus"), "Felmérés késznek jelölve", "ok");
        } catch (err) {
          setStatus($("kanbanStatus"), String(err?.message || err), "err");
        }
        return;
      }
      if (action === "done") {
        try {
          await patchFelmeres(id, { status: "done" });
        } catch (err) {
          setStatus($("kanbanStatus"), String(err?.message || err), "err");
        }
        return;
      }
      if (action === "delete") {
        if (!confirm("Törlöd ezt a felmérést a listából?")) return;
        try {
          await apiJson(API + "/api/felmeres-queue?id=" + encodeURIComponent(id), { method: "DELETE" });
          await loadKanban();
        } catch (err) {
          setStatus($("kanbanStatus"), String(err?.message || err), "err");
        }
      }
    });
  }

  function wireArchive() {
    $("archiveTableBody")?.addEventListener("click", async (ev) => {
      const btn = ev.target.closest("button[data-doc]");
      if (!btn) return;
      const quote = btn.getAttribute("data-quote");
      const kind = btn.getAttribute("data-doc");
      const label = ARCHIVE_DOC_LABELS[kind] || kind;
      setStatus($("archiveStatus"), label + " készítése: " + quote + "…", "");
      btn.disabled = true;
      try {
        const res = await openDocForQuote(quote, kind);
        const tail = res.savedPath ? " · mentve: " + res.savedPath : res.feedbackMsg ? " · " + res.feedbackMsg : "";
        setStatus($("archiveStatus"), label + " kész: " + quote + tail, "ok");
      } catch (err) {
        setStatus($("archiveStatus"), String(err?.message || err), "err");
      } finally {
        btn.disabled = false;
      }
    });
  }

  function init() {
    if (window.location.protocol === "file:") {
      setStatus($("kanbanStatus"), "Csak localhost:17321-ről nyisd meg", "err");
    }
    wireNav();
    wireKanban();
    wireArchive();
    const params = new URLSearchParams(window.location.search);
    let view = params.get("view") || "munkaszervezes";
    if (view === "osszefoglalo" || view === "arajanlat") view = "munkaszervezes";
    switchView(view);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
