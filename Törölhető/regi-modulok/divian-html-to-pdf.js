/**
 * HTML → PDF mentés Playwright Chromium-mal (statikus szerver / HTTP API).
 */
const fsPromises = require("fs/promises");
const path = require("path");
const {
  ORDER_SAVE_DIR,
  sanitizeFileName,
  resolveOrderSaveTargetAsync
} = require("./divian-saved-orders");

let browserPromise = null;

async function launchPdfBrowser() {
  const { chromium } = require("playwright");
  const channel = process.env.DIVIAN_PLAYWRIGHT_NO_CHANNEL === "1" ? undefined : "chrome";
  return chromium.launch({
    headless: true,
    channel,
    args: ["--disable-dev-shm-usage"]
  });
}

async function getPdfBrowser() {
  if (!browserPromise) {
    browserPromise = launchPdfBrowser().catch((err) => {
      browserPromise = null;
      throw err;
    });
  }
  return browserPromise;
}

async function renderHtmlToPdfFile(htmlText, fullPath) {
  const browser = await getPdfBrowser();
  const page = await browser.newPage();
  try {
    const html = String(htmlText || "");
    await page.setContent(html, { waitUntil: "load" });
    if (html.includes("pdf-sheet-bg")) {
      await page
        .waitForFunction(
          () => {
            const img = document.querySelector(".pdf-sheet-bg img");
            return Boolean(img && img.complete && img.naturalWidth > 0);
          },
          { timeout: 20000 }
        )
        .catch(() => {});
    }
    const client = await page.context().newCDPSession(page);
    const pdf = await client.send("Page.printToPDF", {
      printBackground: true,
      preferCSSPageSize: true,
      paperWidth: 8.27,
      paperHeight: 11.69,
      marginTop: 0,
      marginBottom: 0,
      marginLeft: 0,
      marginRight: 0,
      scale: 1
    });
    await fsPromises.mkdir(path.dirname(fullPath), { recursive: true });
    await fsPromises.writeFile(fullPath, Buffer.from(pdf.data, "base64"));
    return fullPath;
  } finally {
    await page.close().catch(() => {});
  }
}

async function saveQuotePdfFromHtml(args) {
  const a = args && typeof args === "object" ? args : {};
  const fileName = String(a.fileName || "megrendelo.pdf");
  const htmlText = String(a.htmlText || "");
  if (!htmlText.trim()) throw new Error("missing-htmlText");
  const target = await resolveOrderSaveTargetAsync(ORDER_SAVE_DIR, {
    fileName,
    customerName: a.customerName,
    quoteNumber: a.quoteNumber
  });
  const safeFileName = sanitizeFileName(fileName, "megrendelo.pdf");
  const finalName = safeFileName.toLowerCase().endsWith(".pdf") ? safeFileName : safeFileName + ".pdf";
  const fullPath = path.join(target.dir, finalName);
  await renderHtmlToPdfFile(htmlText, fullPath);
  return fullPath;
}

module.exports = {
  saveQuotePdfFromHtml,
  renderHtmlToPdfFile
};
