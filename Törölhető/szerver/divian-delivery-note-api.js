"use strict";

const path = require("path");
const { renderHtmlToPdfFile } = require("./divian-html-to-pdf");
const {
  ORDER_SAVE_DIR,
  sanitizeFileName,
  resolveOrderSaveTargetAsync,
  mirrorOrderFileToSecondary
} = require("./divian-saved-orders");

async function saveDeliveryNotePdfToFolder(opts) {
  const htmlText = String(opts?.htmlText || "");
  if (!htmlText) throw new Error("missing-htmlText");
  const fileName = sanitizeFileName(String(opts?.fileName || "szallitolevel.pdf"), "szallitolevel.pdf");
  const finalName = fileName.toLowerCase().endsWith(".pdf") ? fileName : fileName + ".pdf";
  const target = await resolveOrderSaveTargetAsync(ORDER_SAVE_DIR, {
    fileName: finalName,
    customerName: opts?.customerName,
    quoteNumber: opts?.quoteNumber
  });
  const fullPath = path.join(target.dir, finalName);
  await renderHtmlToPdfFile(htmlText, fullPath);
  await mirrorOrderFileToSecondary(fullPath, {
    customerName: opts?.customerName,
    quoteNumber: opts?.quoteNumber
  });
  return { savedPath: fullPath, folder: target.dir, fileName: finalName };
}

async function handleDeliveryNoteSavePdfRequest(bodyText) {
  let parsed = {};
  try {
    parsed = bodyText ? JSON.parse(bodyText) : {};
  } catch (_err) {
    throw new Error("invalid-json");
  }
  const result = await saveDeliveryNotePdfToFolder(parsed);
  return {
    ok: true,
    savedPath: result.savedPath,
    folder: result.folder,
    fileName: result.fileName
  };
}

module.exports = {
  saveDeliveryNotePdfToFolder,
  handleDeliveryNoteSavePdfRequest
};
