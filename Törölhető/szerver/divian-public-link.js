"use strict";

const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

const PORT = Number(process.env.DIVIAN_STATIC_PORT || 17321);
const ROOT = path.join(__dirname, "..");
const LINK_FILE = path.join(ROOT, "divian-public-link.txt");
const LINK_URL_FILE = path.join(ROOT, "divian-public-link.url");
const SERVER_SCRIPT = path.join(ROOT, "divian-static-server.js");

let serverProc = null;
let tunnelClose = null;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function httpGet(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let body = "";
      res.on("data", (c) => {
        body += c;
      });
      res.on("end", () => resolve({ status: res.statusCode || 0, body }));
    });
    req.on("error", reject);
    req.setTimeout(timeoutMs || 8000, () => {
      req.destroy();
      reject(new Error("timeout"));
    });
  });
}

async function waitForHealth(maxMs) {
  const limit = maxMs || 90000;
  const start = Date.now();
  while (Date.now() - start < limit) {
    try {
      const res = await httpGet("http://127.0.0.1:" + PORT + "/health", 5000);
      if (res.status === 200) return true;
    } catch (_e) {
      /* retry */
    }
    await wait(800);
  }
  return false;
}

async function verifyTunnelBase(base) {
  const url = String(base || "").replace(/\/+$/, "") + "/health";
  for (let i = 0; i < 20; i++) {
    try {
      const res = await httpGet(url, 12000);
      if (res.status === 200 && res.body.includes('"ok"')) return true;
    } catch (_e) {
      /* retry */
    }
    await wait(1500);
  }
  return false;
}

function saveLink(ajanlatUrl, baseUrl) {
  const text = [
    "Divian nyilvános link",
    "====================",
    "",
    "Árajánlat / megrendelő:",
    ajanlatUrl,
    "",
    "Parancspult:",
    baseUrl + "/dashboard.html",
    "",
    "Központ:",
    baseUrl + "/admin-center.html",
    "",
    "Generálva: " + new Date().toLocaleString("hu-HU"),
    "",
    "A link addig él, amíg fut az inditas-link.bat ablak.",
    "NE zárd be — Ctrl+C = leáll.",
    "Bejelentkezés kötelező.",
    ""
  ].join("\n");
  fs.writeFileSync(LINK_FILE, text, "utf8");
  fs.writeFileSync(LINK_URL_FILE, "[InternetShortcut]\r\nURL=" + ajanlatUrl + "\r\n", "utf8");
}

function startServer() {
  const env = Object.assign({}, process.env, {
    DIVIAN_PUBLIC_ACCESS: "1",
    DIVIAN_BIND_HOST: "0.0.0.0",
    SZAMLAZZ_LOCAL_ONLY: "1",
    SZAMLAZZ_USE_MARDOHOME_SELLER: "1",
    SZAMLAZZ_USE_DEMO: "0",
    SZAMLAZZ_USE_SANDBOX: "false",
    DIVIAN_PLAYWRIGHT_NO_CHANNEL: "1",
    DIVIAN_FAST_START: "1",
    DIVIAN_OPEN_BROWSER: "0"
  });
  serverProc = spawn(process.execPath, [SERVER_SCRIPT], {
    cwd: ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  serverProc.stdout.on("data", (chunk) => {
    const s = String(chunk || "");
    if (s.includes("ERROR") || s.includes("HIBA") || s.includes("EADDRINUSE")) {
      process.stderr.write("[szerver] " + s);
    }
  });
  serverProc.stderr.on("data", (chunk) => {
    process.stderr.write("[szerver] " + String(chunk || ""));
  });
  serverProc.on("exit", (code) => {
    if (code && code !== 0) {
      console.error("[link] A helyi szerver leállt (kód " + code + ").");
    }
  });
}

function startCloudflared() {
  return new Promise((resolve, reject) => {
    let settled = false;
    const proc = spawn(
      "npx",
      ["--yes", "cloudflared", "tunnel", "--url", "http://127.0.0.1:" + PORT],
      { shell: true, stdio: ["ignore", "pipe", "pipe"], windowsHide: true }
    );
    let combined = "";
    const finish = (err, tunnel) => {
      if (settled) return;
      settled = true;
      if (err) reject(err);
      else resolve(tunnel);
    };
    const tryMatch = () => {
      const m = combined.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
      if (m) {
        finish(null, {
          base: m[0],
          kind: "cloudflare",
          close: () => {
            try {
              proc.kill();
            } catch (_e) {
              /* ignore */
            }
          }
        });
      }
    };
    proc.stdout.on("data", (chunk) => {
      combined += String(chunk || "");
      tryMatch();
    });
    proc.stderr.on("data", (chunk) => {
      combined += String(chunk || "");
      tryMatch();
    });
    proc.on("error", (err) => finish(err));
    proc.on("exit", (code) => {
      if (!settled) finish(new Error("cloudflared leállt (kód " + code + ")"));
    });
    setTimeout(() => finish(new Error("cloudflared timeout (3 perc) — internet kell")), 180000);
  });
}

async function startLocaltunnel() {
  let lt;
  try {
    lt = require("localtunnel");
  } catch (_e) {
    throw new Error("localtunnel nincs telepítve (npm install)");
  }
  const tunnel = await lt({ port: PORT, local_host: "127.0.0.1" });
  return {
    base: String(tunnel.url || "").replace(/\/+$/, ""),
    kind: "localtunnel",
    close: () => tunnel.close()
  };
}

async function openTunnel() {
  const errors = [];

  console.log("[link] 1/2 — Cloudflare tunnel (stabilabb)…");
  try {
    const tunnel = await startCloudflared();
    console.log("[link] Tunnel URL: " + tunnel.base);
    console.log("[link] Ellenőrzés…");
    if (await verifyTunnelBase(tunnel.base)) {
      return tunnel;
    }
    errors.push("Cloudflare: a tunnel nem válaszolt");
    tunnel.close();
  } catch (err) {
    errors.push("Cloudflare: " + (err?.message || err));
  }

  console.log("[link] 2/2 — Localtunnel (tartalék)…");
  try {
    const tunnel = await startLocaltunnel();
    console.log("[link] Tunnel URL: " + tunnel.base);
    console.log("[link] Ellenőrzés…");
    if (await verifyTunnelBase(tunnel.base)) {
      return tunnel;
    }
    errors.push("Localtunnel: a tunnel nem válaszolt");
    tunnel.close();
  } catch (err) {
    errors.push("Localtunnel: " + (err?.message || err));
  }

  throw new Error(errors.join(" | "));
}

function openLinkFileWindows() {
  if (process.platform !== "win32") return;
  try {
    spawn("cmd", ["/c", "start", "", "notepad.exe", LINK_FILE], {
      detached: true,
      stdio: "ignore",
      windowsHide: true
    }).unref();
  } catch (_e) {
    /* ignore */
  }
}

function shutdown() {
  try {
    if (tunnelClose) tunnelClose();
  } catch (_e) {
    /* ignore */
  }
  try {
    if (serverProc && !serverProc.killed) serverProc.kill();
  } catch (_e) {
    /* ignore */
  }
}

async function main() {
  console.log("");
  console.log("=== Divian nyilvános link ===");
  console.log("");

  console.log("[link] Helyi szerver indítása (:" + PORT + ")…");
  startServer();

  if (!(await waitForHealth())) {
    console.error("");
    console.error("HIBA: a helyi szerver nem indult el a " + PORT + " porton.");
    console.error("Lehet, hogy foglalt a port → leallitas-17321.bat, majd újra.");
    shutdown();
    process.exit(1);
  }
  console.log("[link] Helyi szerver OK.");

  const tunnel = await openTunnel();
  tunnelClose = tunnel.close;

  const base = tunnel.base;
  const ajanlat = base + "/arajanlat.html";
  saveLink(ajanlat, base);
  openLinkFileWindows();

  console.log("");
  console.log("========================================");
  console.log("  KÉSZ — NYILVÁNOS LINK (másold ki):");
  console.log("");
  console.log("  " + ajanlat);
  console.log("");
  console.log("  Tunnel: " + tunnel.kind);
  console.log("========================================");
  console.log("");
  console.log("Mentve: divian-public-link.txt");
  console.log("Kattintható: divian-public-link.url");
  console.log("");
  console.log("FONTOS: NE zárd be ezt az ablakot!");
  console.log("A link addig él, amíg fut (Ctrl+C = leáll).");
  console.log("");

  process.on("SIGINT", () => {
    shutdown();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    shutdown();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("");
  console.error("HIBA: " + (err?.message || err));
  console.error("");
  console.error("Ellenőrizd:");
  console.error("  • fut-e az internet");
  console.error("  • npm install (a mappában)");
  console.error("  • leallitas-17321.bat → újra inditas-link.bat");
  shutdown();
  process.exit(1);
});
