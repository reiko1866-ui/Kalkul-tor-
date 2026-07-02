/**
 * HTTP szerver védelem: body limit, kérés-időtúllépés, állapot a /health-hez.
 */
"use strict";

const DEFAULT_BODY_MAX = Number(process.env.DIVIAN_HTTP_BODY_MAX_BYTES) || 32 * 1024 * 1024;

function readRequestBody(req, maxBytes) {
  const limit = Number(maxBytes) > 0 ? Number(maxBytes) : DEFAULT_BODY_MAX;
  return new Promise((resolve, reject) => {
    let body = "";
    let size = 0;
    req.on("data", (chunk) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk || ""));
      size += buf.length;
      if (size > limit) {
        const err = new Error("body-too-large");
        err.code = "BODY_TOO_LARGE";
        reject(err);
        try {
          req.destroy();
        } catch (_e) {}
        return;
      }
      body += buf.toString("utf8");
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function withTimeout(promise, ms, label) {
  const timeoutMs = Math.max(1000, Number(ms) || 60000);
  const err = new Error(String(label || "request-timeout"));
  err.code = "REQUEST_TIMEOUT";
  let timer = null;
  return Promise.race([
    promise,
    new Promise((_resolve, reject) => {
      timer = setTimeout(() => reject(err), timeoutMs);
    })
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function createServerMonitor() {
  const startedAt = Date.now();
  let activeRequests = 0;
  let totalRequests = 0;
  let lastFinishedAt = Date.now();
  let lastError = "";
  let busyPath = "";

  function begin(pathname) {
    activeRequests += 1;
    totalRequests += 1;
    if (activeRequests === 1) busyPath = String(pathname || "");
  }

  function end() {
    activeRequests = Math.max(0, activeRequests - 1);
    lastFinishedAt = Date.now();
    if (activeRequests === 0) busyPath = "";
  }

  function fail(err) {
    lastError = String(err?.message || err || "").slice(0, 240);
    end();
  }

  function snapshot() {
    return {
      uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
      activeRequests,
      totalRequests,
      lastFinishedAt: new Date(lastFinishedAt).toISOString(),
      busyPath: activeRequests > 0 ? busyPath : "",
      lastError: lastError || null
    };
  }

  return { begin, end, fail, snapshot };
}

function installProcessGuards(tag) {
  const prefix = String(tag || "divian");
  process.on("uncaughtException", (err) => {
    console.error("[" + prefix + "] uncaughtException:", err?.stack || err?.message || err);
  });
  process.on("unhandledRejection", (reason) => {
    console.error("[" + prefix + "] unhandledRejection:", reason);
  });
}

module.exports = {
  readRequestBody,
  withTimeout,
  createServerMonitor,
  installProcessGuards,
  DEFAULT_BODY_MAX
};
