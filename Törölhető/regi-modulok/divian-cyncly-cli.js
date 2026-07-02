/**
 * Cyncly tervező áthozás — önálló Playwright folyamat (statikus szerver hívja).
 * Használat: node divian-cyncly-cli.js planner-items <url>
 *           node divian-cyncly-cli.js screenshot <url> [label]
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const { chromium } = require("playwright");
const {
  buildQtyOnlyPayload,
  normalizeItems,
  extractCommercialItemsFromJson
} = require("./divian-planner-payload");

const TARGET_HINT = "item-lists";
const CYNCLY_DEFAULT_URL =
  "https://planner.cyncly-idealspaces.com/hu/design/Draft?partnership=divian";
const CYNCLY_PLANNER_URL_FILE = path.join(__dirname, "divian-planner-url.txt");
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function log(msg) {
  console.error("[cyncly-cli] " + msg);
}

function isValidCynclyPlannerUrl(url) {
  const u = String(url || "").trim();
  if (!u) return false;
  try {
    const parsed = new URL(u);
    if (parsed.hostname !== "planner.cyncly-idealspaces.com") return false;
    if (parsed.searchParams.get("partnership") !== "divian") return false;
    const pathname = String(parsed.pathname || "").toLowerCase();
    if (pathname.includes("/hu/design/")) return true;
    if (/^\/hu\/[^/]+\/edit\/?$/i.test(pathname)) return true;
    return false;
  } catch (_err) {
    return false;
  }
}

function readPlannerUrlFromFile() {
  try {
    const raw = fs.readFileSync(CYNCLY_PLANNER_URL_FILE, "utf8");
    const line = String(raw || "")
      .split(/\r?\n/)
      .map((x) => x.trim())
      .find((x) => x && !x.startsWith("#"));
    if (line && isValidCynclyPlannerUrl(line)) return line;
  } catch (_err) {}
  return "";
}

function resolveCynclyPlannerUrl(override) {
  const o = String(override || "").trim();
  if (o && isValidCynclyPlannerUrl(o)) return o;
  const fromEnv = process.env.CYNCLY_PLANNER_URL && String(process.env.CYNCLY_PLANNER_URL).trim();
  if (fromEnv && isValidCynclyPlannerUrl(fromEnv)) return fromEnv;
  const fromFile = readPlannerUrlFromFile();
  if (fromFile) return fromFile;
  return CYNCLY_DEFAULT_URL;
}

function plannerProjectKey(url) {
  try {
    const pathname = String(new URL(String(url || "")).pathname || "");
    let m = pathname.match(/\/hu\/design\/([^/]+)/i);
    if (m) return m[1].toLowerCase();
    m = pathname.match(/\/hu\/([^/]+)\/edit/i);
    if (m) return m[1].toLowerCase();
    return "";
  } catch (_err) {
    return "";
  }
}

function resolvePlaywrightUserDataDir() {
  const root = process.env.DIVIAN_USER_DATA_DIR
    ? path.resolve(String(process.env.DIVIAN_USER_DATA_DIR))
    : path.join(process.env.USERPROFILE || os.homedir(), ".divian-kalkulator");
  fs.mkdirSync(root, { recursive: true });
  return path.join(root, "pw-user-data");
}

function buildLaunchOptions() {
  const opts = {
    headless: false,
    ignoreHTTPSErrors: true,
    userAgent: DEFAULT_USER_AGENT,
    locale: "hu-HU",
    viewport: null,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--start-maximized",
      "--use-fake-ui-for-media-stream"
    ]
  };
  const noChannel =
    String(process.env.DIVIAN_PLAYWRIGHT_NO_CHANNEL || "1").trim().toLowerCase() !== "0" &&
    String(process.env.DIVIAN_PLAYWRIGHT_NO_CHANNEL || "1").trim().toLowerCase() !== "false";
  if (!noChannel && process.env.DIVIAN_PLAYWRIGHT_CHANNEL) {
    opts.channel = process.env.DIVIAN_PLAYWRIGHT_CHANNEL;
  } else if (!noChannel) {
    opts.channel = "chrome";
  }
  return opts;
}

async function clickPlannerControl(page, patterns, opts = {}) {
  const timeout = opts.timeout || 2500;
  const settleMs = opts.settleMs || 900;
  for (const pat of patterns) {
    const rx =
      pat instanceof RegExp
        ? pat
        : new RegExp(String(pat).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const locators = [
      () => page.getByRole("button", { name: rx }).first(),
      () => page.getByRole("tab", { name: rx }).first(),
      () => page.getByLabel(rx).first(),
      () => page.getByText(rx).first()
    ];
    for (const mk of locators) {
      try {
        const loc = mk();
        await loc.click({ timeout });
        await page.waitForTimeout(settleMs);
        return true;
      } catch (_e) {
        /* next */
      }
    }
  }
  return false;
}

async function openPlannerPage(context, plannerUrl) {
  const targetUrl = resolveCynclyPlannerUrl(plannerUrl);
  let page = context.pages()[0];
  if (!page || page.isClosed()) {
    page = await context.newPage();
  }
  const currentKey = plannerProjectKey(page.url());
  const targetKey = plannerProjectKey(targetUrl);
  if (currentKey !== targetKey || !page.url().includes("planner.cyncly-idealspaces.com")) {
    log("Navigálás: " + targetUrl);
    try {
      await page.goto(targetUrl, { waitUntil: "networkidle", timeout: 120000 });
    } catch (_navErr) {
      await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 120000 });
    }
    await page.waitForTimeout(3500);
    try {
      await page.waitForSelector("canvas", { timeout: 90000 });
    } catch (_e) {
      log("canvas timeout — folytatás");
    }
  }
  return { page, targetUrl };
}

async function fetchPlannerItemsPayload(page, targetUrl) {
  let itemListsUrl = "";
  const respPromise = page
    .waitForResponse(
      (r) => r.url().includes(TARGET_HINT) && r.status() >= 200 && r.status() < 400,
      { timeout: 50000 }
    )
    .catch(() => null);

  await clickPlannerControl(
    page,
    ["Terméklista", "Termeklista", /term[eé]k\s*lista/i, "Product list", "Tételek", "Items"],
    { settleMs: 2200, timeout: 5000 }
  );

  const resp = await respPromise;
  let json = null;
  if (resp) {
    itemListsUrl = resp.url();
    json = await resp.json();
  }
  if (!json) {
    const captured = await page.evaluate(() => {
      return window.__divianLastItemListsUrl || "";
    });
    if (captured) {
      itemListsUrl = captured;
      json = await page.evaluate(async (url) => {
        const r = await fetch(url, { credentials: "include" });
        return r.ok ? r.json() : null;
      }, captured);
    }
  }
  if (!json) {
    throw new Error(
      "no-items — jelentkezz be a Cyncly-be a megnyíló ablakban, nyisd meg a Terméklista nézetet, majd próbáld újra."
    );
  }
  const commercialItems = extractCommercialItemsFromJson(json);
  const items = normalizeItems(commercialItems);
  if (!items.length) {
    throw new Error("no-items — a terméklista üres vagy nem oldható fel.");
  }
  return buildQtyOnlyPayload(items, itemListsUrl || targetUrl);
}

async function pageShowsPreviewGenerating(page) {
  return page
    .evaluate(() => {
      const t = String(document.body?.innerText || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
      return (
        t.includes("elonezet letrehozasa zajlik") ||
        t.includes("preview creation in progress")
      );
    })
    .catch(() => false);
}

async function waitForCynclyPreviewGeneration(page, maxMs = 240000) {
  const stepMs = 1800;
  const deadline = Date.now() + maxMs;
  let sawBusy = false;
  while (Date.now() < deadline) {
    const busy = await pageShowsPreviewGenerating(page);
    if (busy) sawBusy = true;
    if (sawBusy && !busy) {
      await page.waitForTimeout(2000);
      return true;
    }
    await page.waitForTimeout(stepMs);
  }
  return false;
}

async function runHdPreviewPipeline(page) {
  log("HD előnézet készítése…");
  for (const menu of ["Nézet", "Nezet", "Render"]) {
    await clickPlannerControl(page, [menu], { settleMs: 1500, timeout: 3000 });
    await clickPlannerControl(page, [/^HD$/i, "HD render", "HD Render"], { settleMs: 2000 });
    const created = await clickPlannerControl(page, [
      "Előnézet létrehozása",
      "Elonezet letrehozasa",
      /előnézet létrehozása/i
    ], { settleMs: 1500, timeout: 4000 });
    if (created) {
      await waitForCynclyPreviewGeneration(page, 240000);
      await clickPlannerControl(
        page,
        ["Előnézet megtekintése", "Elonezet megtekintese", /^Előnézet$/i],
        { settleMs: 2000 }
      );
      return;
    }
  }
}

async function tryDownloadRender(page) {
  for (const pat of ["letöltés", "letoltes", /^download$/i]) {
    try {
      const downloadPromise = page.waitForEvent("download", { timeout: 25000 });
      const clicked = await clickPlannerControl(page, [pat], { timeout: 2500, settleMs: 400 });
      if (!clicked) continue;
      const download = await downloadPromise;
      const stream = await download.createReadStream();
      if (!stream) continue;
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      const buf = Buffer.concat(chunks);
      if (buf.length >= 60000) return buf;
    } catch (_e) {
      /* next */
    }
  }
  return null;
}

function bufferToDataUrl(buf, contentType) {
  const ct = String(contentType || "image/png").split(";")[0].trim() || "image/png";
  return `data:${ct};base64,${buf.toString("base64")}`;
}

async function captureScreenshotPayload(page, targetUrl, label) {
  await runHdPreviewPipeline(page);
  await page.waitForTimeout(2000);
  let buf = await tryDownloadRender(page);
  let contentType = "image/png";
  if (!buf) {
    buf = await page.screenshot({ type: "jpeg", quality: 88 });
    contentType = "image/jpeg";
    log("Render letöltés nem sikerült — képernyőkép mentve.");
  }
  if (!buf || buf.length < 10000) {
    throw new Error("Nem sikerült render képet készíteni — ellenőrizd a Cyncly előnézetet.");
  }
  return {
    type: "divian-planner-screenshot",
    source: "cyncly-render",
    captureMode: "cyncly-cli",
    capturedAt: new Date().toISOString(),
    label: String(label || "HD render"),
    plannerUrl: targetUrl,
    plannerProject: plannerProjectKey(targetUrl),
    imageDataUrl: bufferToDataUrl(buf, contentType)
  };
}

async function withCynclySession(plannerUrl, fn) {
  const userDataDir = resolvePlaywrightUserDataDir();
  const context = await chromium.launchPersistentContext(userDataDir, buildLaunchOptions());
  try {
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    });
    context.on("response", async (response) => {
      try {
        const url = response.url();
        if (!url.includes(TARGET_HINT)) return;
        if (response.status() < 200 || response.status() >= 400) return;
        await context.pages()[0]?.evaluate((u) => {
          window.__divianLastItemListsUrl = u;
        }, url);
      } catch (_e) {}
    });
    const { page, targetUrl } = await openPlannerPage(context, plannerUrl);
    return await fn(page, targetUrl);
  } finally {
    await context.close();
  }
}

async function runPlannerItems(plannerUrl) {
  return withCynclySession(plannerUrl, async (page, targetUrl) => {
    return fetchPlannerItemsPayload(page, targetUrl);
  });
}

async function runScreenshot(plannerUrl, label) {
  return withCynclySession(plannerUrl, async (page, targetUrl) => {
    try {
      await fetchPlannerItemsPayload(page, targetUrl);
    } catch (_syncErr) {
      log("Tételek szinkron opcionális — folytatás renderrel");
    }
    return captureScreenshotPayload(page, targetUrl, label);
  });
}

async function main() {
  const mode = String(process.argv[2] || "").trim();
  const plannerUrl = String(process.argv[3] || "").trim();
  const label = String(process.argv[4] || "HD render").trim();
  if (!mode || !plannerUrl) {
    throw new Error("Használat: node divian-cyncly-cli.js planner-items|screenshot <url> [label]");
  }
  let result;
  if (mode === "planner-items") {
    result = await runPlannerItems(plannerUrl);
  } else if (mode === "screenshot") {
    result = await runScreenshot(plannerUrl, label);
  } else {
    throw new Error("Ismeretlen mód: " + mode);
  }
  process.stdout.write(JSON.stringify(result));
}

if (require.main === module) {
  main().catch((err) => {
    console.error(String(err?.message || err));
    process.exit(1);
  });
}

module.exports = { runPlannerItems, runScreenshot };
