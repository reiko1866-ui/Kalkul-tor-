/**
 * Divian parancspult — Cyncly + árajánlat szinkron, admin/vevő mód.
 */
(function () {
  "use strict";

  const MODE_KEY = "divian_dashboard_mode_v1";
  const LEG_OVERRIDES_KEY = "divian_dashboard_leg_overrides_v1";
  const CYNCLY_PLANNER_URL_STORAGE = "divian_cyncly_planner_url_v1";
  const DEFAULT_CYNCLY_PLANNER_URL =
    "https://planner.cyncly-idealspaces.com/hu/design/25124ff4-e28a-47b0-8385-e87e16539a61/edit?partnership=divian";

  const root = document.getElementById("dashboardRoot");
  const plannerFrame = document.getElementById("plannerFrame");
  const quoteSyncFrame = document.getElementById("quoteSyncFrame");
  const toggleModeBtn = document.getElementById("dashboardModeFab");
  const headerMeta = document.getElementById("dashboardHeaderMeta");
  const grandTotalValue = document.getElementById("grandTotalValue");
  const dashboardStatus = document.getElementById("dashboardStatus");
  const sectionFloor = document.getElementById("sectionFloor");
  const sectionWall = document.getElementById("sectionWall");
  const sectionExtras = document.getElementById("sectionExtras");
  const deadlineSelect = document.getElementById("deadlineSelect");
  const deadlineCustom = document.getElementById("deadlineCustom");
  const plannerUrlHint = document.getElementById("plannerUrlHint");
  const openPlannerTab = document.getElementById("openPlannerTab");

  const DASHBOARD_SYNC_KEY = "divian_dashboard_to_quote_sync_v1";
  let lastDashboardData = null;
  let legOverrides = loadLegOverrides();
  let pollTimer = null;
  let queueSyncTimer = null;
  let lastQueueSyncKey = "";

  function defaultForwarderBase() {
    try {
      const loc = window.location;
      if ((loc.protocol === "http:" || loc.protocol === "https:") && loc.port === "17321") {
        return loc.origin;
      }
    } catch (_e) {}
    return "http://localhost:17321";
  }

  const FORWARDER_BASE = defaultForwarderBase();

  function loadLegOverrides() {
    try {
      const raw = sessionStorage.getItem(LEG_OVERRIDES_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (_e) {
      return {};
    }
  }

  function saveLegOverrides() {
    sessionStorage.setItem(LEG_OVERRIDES_KEY, JSON.stringify(legOverrides));
  }

  function isAdminMode() {
    return sessionStorage.getItem(MODE_KEY) !== "customer";
  }

  function setMode(admin) {
    sessionStorage.setItem(MODE_KEY, admin ? "admin" : "customer");
    root.classList.toggle("is-admin", admin);
    root.classList.toggle("is-customer", !admin);
    if (toggleModeBtn) {
      toggleModeBtn.textContent = admin ? "Vevő mód" : "Admin";
      toggleModeBtn.setAttribute("aria-pressed", admin ? "true" : "false");
      toggleModeBtn.title = admin
        ? "Váltás vevő módra — jobb oldali panel elrejtése"
        : "Váltás admin módra — élő tervezés panel megnyitása";
      toggleModeBtn.classList.toggle("is-admin-active", admin);
    }
  }

  function toggleMode() {
    setMode(!isAdminMode());
  }

  function formatHuf(n) {
    const v = Math.round(Number(n) || 0);
    return v.toLocaleString("hu-HU") + " Ft";
  }

  function setStatus(msg, tone) {
    dashboardStatus.textContent = String(msg || "");
    dashboardStatus.classList.remove("is-err", "is-ok");
    if (tone === "err") dashboardStatus.classList.add("is-err");
    if (tone === "ok") dashboardStatus.classList.add("is-ok");
  }

  function isValidCynclyPlannerUrl(url) {
    const u = String(url || "").trim();
    if (!u) return false;
    try {
      const p = new URL(u);
      if (p.hostname !== "planner.cyncly-idealspaces.com") return false;
      if (p.searchParams.get("partnership") !== "divian") return false;
      const pathname = String(p.pathname || "").toLowerCase();
      if (pathname.includes("/hu/design/")) return true;
      if (/^\/hu\/[^/]+\/edit\/?$/i.test(pathname)) return true;
      return false;
    } catch (_e) {
      return false;
    }
  }

  function getCynclyPlannerUrl() {
    const fromStore = String(localStorage.getItem(CYNCLY_PLANNER_URL_STORAGE) || "").trim();
    const pick = fromStore || DEFAULT_CYNCLY_PLANNER_URL;
    return isValidCynclyPlannerUrl(pick) ? pick : DEFAULT_CYNCLY_PLANNER_URL;
  }

  function initPlannerFrame() {
    const url = getCynclyPlannerUrl();
    plannerFrame.src = url;
    if (plannerUrlHint) plannerUrlHint.textContent = "· " + url.replace(/^https?:\/\//, "").slice(0, 48) + "…";
    if (openPlannerTab) openPlannerTab.href = url;
  }

  function getQuoteWindow() {
    try {
      return quoteSyncFrame?.contentWindow || null;
    } catch (_e) {
      return null;
    }
  }

  function getQuoteApi() {
    const w = getQuoteWindow();
    if (!w || !w.DivianQuoteWorkflow) return null;
    return w.DivianQuoteWorkflow;
  }

  function fetchDashboardData() {
    const api = getQuoteApi();
    if (!api) return null;
    if (typeof api.getDashboardData === "function") return api.getDashboardData();
    const state = typeof api.getState === "function" ? api.getState() : null;
    if (!state) return null;
    return {
      quoteNumber: "",
      quoteDate: "",
      customer: {},
      lines: (state.workflowLines || []).map(({ key, line }) => ({
        key,
        code: line.code,
        name: line.name || line.code,
        qty: line.qty,
        unit: 0,
        total: 0,
        band: line.band || "lower",
        category: "",
        autoLegs: 0,
        legCountable: false
      })),
      extras: [],
      summary: { finalTotal: 0 },
      toeKick: { legUnit: 0, legQty: 0 },
      payload: null
    };
  }

  function normalizeText(s) {
    return String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function classifyCabinetLine(line) {
    const api = globalThis.DivianCabinetCodes;
    if (api) {
      const band = api.inferCabinetBand(line.code, line.name);
      if (band === "wall") return "wall";
      if (band === "floor" || band === "tall") return "floor";
    }
    const hay = normalizeText(line.name + " " + line.code + " " + line.category);
    if (line.band === "upper" || line.category === "Felső elemek") return "wall";
    if (hay.includes("uveges")) return "wall";
    if (line.band === "island" || line.band === "lower") return "floor";
    if (line.category === "Magas elemek" || line.category === "Alsó elemek") return "floor";
    if (
      (hay.includes("munkalap") && !hay.includes("munkalapos")) ||
      hay.includes("labelo") ||
      hay.includes("lábazat") ||
      hay.includes("labazat") ||
      hay.includes("takar") ||
      hay.includes(" szilikon") ||
      (hay.includes("lab") && !hay.includes("label")) ||
      hay.includes("vasalat") ||
      hay.includes("gep") ||
      hay.includes("csap") ||
      hay.includes("mosogato")
    ) {
      return "extras";
    }
    if (line.category && /panel|munkalap|láb|lábelő|oldaltakar|kiegészítő/i.test(line.category)) {
      return "extras";
    }
    return "extras";
  }

  function groupLines(data) {
    const floor = [];
    const wall = [];
    const extras = [];
    (data?.lines || []).forEach((line) => {
      const bucket = classifyCabinetLine(line);
      if (bucket === "wall") wall.push(line);
      else if (bucket === "extras") extras.push(line);
      else floor.push(line);
    });
    (data?.extras || []).forEach((line) => {
      extras.push({
        key: "extra-" + (line.code || line.name),
        code: line.code || "",
        name: line.name || "Kiegészítő",
        qty: line.qty,
        unit: line.unit,
        total: line.total,
        autoLegs: 0,
        legCountable: false
      });
    });
    return { floor, wall, extras };
  }

  function effectiveLegs(line) {
    const key = String(line.key || line.code);
    if (Object.prototype.hasOwnProperty.call(legOverrides, key)) {
      return Math.max(0, Math.floor(Number(legOverrides[key]) || 0));
    }
    return Math.max(0, Math.floor(Number(line.autoLegs) || 0));
  }

  function renderCard(line, showPrices) {
    const legs = effectiveLegs(line);
    const hasLegStepper = !!(line.legCountable || line.autoLegs > 0);
    const legUi = hasLegStepper
        ? '<div class="leg-stepper" data-leg-key="' +
          escapeAttr(line.key || line.code) +
          '"><button type="button" data-leg-op="minus" aria-label="Kevesebb láb">−</button><span>' +
          legs +
          '</span><button type="button" data-leg-op="plus" aria-label="Több láb">+</button><span style="font-size:0.72rem;color:#6e7d76"> láb</span></div>'
        : '<span class="cabinet-card-qty">' + line.qty + " db</span>";

    return (
      '<article class="cabinet-card" data-key="' +
      escapeAttr(line.key || line.code) +
      '"><div class="cabinet-card-head"><span class="cabinet-card-code">' +
      escapeHtml(line.code) +
      "</span>" +
      (showPrices && line.total > 0
        ? '<span class="cabinet-card-price">' + formatHuf(line.total) + "</span>"
        : "") +
      '</div><div class="cabinet-card-name">' +
      escapeHtml(line.name) +
      '</div><div class="cabinet-card-foot">' +
      legUi +
      "</div></article>"
    );
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, "&quot;");
  }

  function renderSection(container, lines, showPrices) {
    if (!lines.length) {
      container.innerHTML = '<p class="dashboard-empty">Nincs tétel</p>';
      return;
    }
    container.innerHTML = lines.map((l) => renderCard(l, showPrices)).join("");
  }

  function computeDisplayTotal(data) {
    let total = Number(data?.summary?.finalTotal) || 0;
    if (!data?.toeKick) return total;
    const legUnit = Number(data.toeKick.legUnit) || 0;
    let autoSum = 0;
    let overrideSum = 0;
    (data.lines || []).forEach((line) => {
      if (!line.legCountable && !(line.autoLegs > 0)) return;
      const key = String(line.key || line.code);
      const auto = Math.max(0, Math.floor(Number(line.autoLegs) || 0));
      autoSum += auto;
      if (Object.prototype.hasOwnProperty.call(legOverrides, key)) {
        overrideSum += Math.max(0, Math.floor(Number(legOverrides[key]) || 0));
      } else {
        overrideSum += auto;
      }
    });
    const delta = (overrideSum - autoSum) * legUnit;
    return Math.round((total + delta) / 5) * 5;
  }

  function renderDashboard() {
    const data = fetchDashboardData();
    if (data) lastDashboardData = data;
    const showPrices = isAdminMode();
    const grouped = groupLines(lastDashboardData || { lines: [], extras: [] });

    renderSection(sectionFloor, grouped.floor, showPrices);
    renderSection(sectionWall, grouped.wall, showPrices);
    renderSection(sectionExtras, grouped.extras, showPrices);

    const qn = lastDashboardData?.quoteNumber || "—";
    const cust = lastDashboardData?.customer?.name || "—";
    headerMeta.textContent = qn + " · " + cust;

    if (showPrices && lastDashboardData) {
      grandTotalValue.textContent = formatHuf(computeDisplayTotal(lastDashboardData));
    } else {
      grandTotalValue.textContent = "—";
    }
  }

  function setupPlannerRelay() {
    window.addEventListener("message", (event) => {
      const data = event?.data;
      if (!data || typeof data !== "object") return;
      const t = data.type;
      if (
        t === "planner-items" ||
        t === "divian-playwright-items" ||
        t === "divian-planner-screenshot" ||
        t === "divian-planner-api-error"
      ) {
        const w = getQuoteWindow();
        if (w) {
          try {
            w.postMessage(data, "*");
          } catch (_e) {}
        }
      }
    });
  }

  function pollQuoteSync() {
    renderDashboard();
    if (lastDashboardData?.quoteNumber) {
      scheduleQueueSync();
    }
  }

  function wireLegSteppers() {
    document.addEventListener("click", (ev) => {
      const btn = ev.target.closest("[data-leg-op]");
      if (!btn) return;
      const wrap = btn.closest("[data-leg-key]");
      if (!wrap) return;
      const key = wrap.getAttribute("data-leg-key");
      if (!key || !lastDashboardData) return;
      const line = (lastDashboardData.lines || []).find((l) => String(l.key || l.code) === key);
      const base = line ? Math.max(0, Math.floor(Number(line.autoLegs) || 0)) : 0;
      const cur = Object.prototype.hasOwnProperty.call(legOverrides, key)
        ? Math.max(0, Math.floor(Number(legOverrides[key]) || 0))
        : base;
      const op = btn.getAttribute("data-leg-op");
      const next = op === "plus" ? cur + 1 : Math.max(0, cur - 1);
      legOverrides[key] = next;
      saveLegOverrides();
      renderDashboard();
    });
  }

  function wireKitchenDeadline() {
    function syncDeadlineUi() {
      const isCustom = deadlineSelect?.value === "custom";
      if (deadlineCustom) {
        deadlineCustom.hidden = !isCustom;
        deadlineCustom.disabled = !isCustom;
      }
    }
    deadlineSelect?.addEventListener("change", () => {
      syncDeadlineUi();
      pushDashboardSyncForQuoteBuilder();
    });
    deadlineCustom?.addEventListener("change", () => {
      pushDashboardSyncForQuoteBuilder();
    });
    syncDeadlineUi();
  }

  async function savePayloadToCustomerFolder(payload) {
    try {
      const jsonText = JSON.stringify(payload, null, 2);
      const fileName =
        String(payload.quoteNumber || "megrendeles").replace(/[<>:"/\\|?*]/g, "_") + ".json";
      await fetch(FORWARDER_BASE + "/saved-orders/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName,
          jsonText,
          customerName: payload.customer?.name,
          quoteNumber: payload.quoteNumber
        })
      });
    } catch (_e) {
      /* optional */
    }
  }

  function getKitchenDeadlinePayload() {
    const deadline = String(deadlineSelect?.value || "1month").trim();
    const deadlineDate =
      deadline === "custom" ? String(deadlineCustom?.value || "").trim() : "";
    return { deadline, deadlineDate };
  }

  async function syncKitchenDeadlineToQueue() {
    const data = lastDashboardData || fetchDashboardData();
    const qn = String(data?.quoteNumber || "").trim();
    if (!qn && !(data?.lines || []).length) return;
    const { deadline, deadlineDate } = getKitchenDeadlinePayload();
    if (deadline === "custom" && !deadlineDate) return;
    const syncKey = qn + "|" + deadline + "|" + deadlineDate;
    if (syncKey === lastQueueSyncKey) return;
    const grouped = groupLines(data || { lines: [], extras: [] });
    const body = {
      quoteNumber: qn,
      quoteDate: data?.quoteDate || "",
      customerName: data?.customer?.name || "",
      customerPhone: data?.customer?.phone || "",
      customerAddress: data?.customer?.address || "",
      felmeresRequested: false,
      deadline,
      deadlineDate,
      status: "open",
      source: "dashboard",
      sections: {
        floor: grouped.floor.map((l) => ({
          code: l.code,
          name: l.name,
          qty: l.qty,
          legs: effectiveLegs(l)
        })),
        wall: grouped.wall.map((l) => ({ code: l.code, name: l.name, qty: l.qty })),
        extras: grouped.extras.map((l) => ({ code: l.code, name: l.name, qty: l.qty }))
      },
      note: ""
    };
    if (!body.quoteNumber && !body.customerName) return;
    try {
      const res = await fetch(FORWARDER_BASE + "/api/felmeres-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.ok !== false) {
        lastQueueSyncKey = syncKey;
        setStatus("Határidő mentve a központba", "ok");
      }
    } catch (_e) {
      /* csendes — következő változtatáskor újra */
    }
  }

  function scheduleQueueSync() {
    clearTimeout(queueSyncTimer);
    queueSyncTimer = setTimeout(() => {
      void syncKitchenDeadlineToQueue();
    }, 500);
  }

  function pushDashboardSyncForQuoteBuilder() {
    const data = lastDashboardData || fetchDashboardData();
    const api = getQuoteApi();
    const dl = getKitchenDeadlinePayload();
    const sync = {
      savedAt: Date.now(),
      legOverrides: Object.assign({}, legOverrides),
      payload: data?.payload || null,
      dashboardData: data || null,
      wallSequenceConfirmed: !!(api && typeof api.isWallSequenceConfirmed === "function" && api.isWallSequenceConfirmed()),
      felmeres: {
        deadline: dl.deadline,
        customDate: dl.deadlineDate
      }
    };
    try {
      sessionStorage.setItem(DASHBOARD_SYNC_KEY, JSON.stringify(sync));
    } catch (_e) {}
    scheduleQueueSync();
    return sync;
  }

  function wireToolbar() {
    toggleModeBtn?.addEventListener("click", toggleMode);
    document.getElementById("refreshBtn")?.addEventListener("click", () => {
      renderDashboard();
      setStatus("Frissítve", "ok");
    });
    document.getElementById("confirmWallBtn")?.addEventListener("click", () => {
      const api = getQuoteApi();
      if (api && typeof api.confirmWallSequence === "function") {
        const res = api.confirmWallSequence({ source: "dashboard" });
        setStatus(res?.ok ? "Fal-sorrend jóváhagyva" : "Nem sikerült", res?.ok ? "ok" : "err");
        renderDashboard();
      } else {
        setStatus("Árajánlat szinkron még nem kész", "err");
      }
    });
  }

  function waitForQuoteApi(cb) {
    setStatus("Árajánlat szinkron betöltése…", "");
    let tries = 0;
    const tick = () => {
      if (getQuoteApi()) {
        setStatus("Szinkron kész — a Cyncly tételek a jobb oldali listában jelennek meg", "ok");
        cb();
        return;
      }
      tries += 1;
      if (tries < 180) setTimeout(tick, 500);
      else
        setStatus(
          "Árajánlat iframe nem válaszol — indítsd: inditas-teszt-tervezo.bat, majd http://localhost:17321/dashboard.html",
          "err"
        );
    };
    quoteSyncFrame?.addEventListener("load", () => setTimeout(tick, 800));
    tick();
  }

  function init() {
    if (window.location.protocol === "file:") {
      setStatus("Ne fájlból nyisd — indítsd: inditas-teszt-tervezo.bat → http://localhost:17321/dashboard.html", "err");
    } else if (window.location.port && window.location.port !== "17321") {
      setStatus("Figyelem: a szerver általában a 17321-es porton fut", "err");
    }
    setMode(isAdminMode());
    if (!isAdminMode()) {
      setStatus("Vevő mód — jobb oldali panel rejtve. A jobb alsó gombbal kapcsolható az admin mód.", "");
    }
    initPlannerFrame();
    setupPlannerRelay();
    wireLegSteppers();
    wireKitchenDeadline();
    wireToolbar();
    waitForQuoteApi(() => {
      pollQuoteSync();
      pollTimer = setInterval(pollQuoteSync, 2000);
      scheduleQueueSync();
    });
    quoteSyncFrame?.addEventListener("load", () => {
      setTimeout(pollQuoteSync, 1000);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
