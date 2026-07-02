"use strict";

const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn, execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const LINK_FILE = path.join(ROOT, "divian-public-link.txt");
const LINK_URL_FILE = path.join(ROOT, "divian-public-link.url");
const SERVER_SCRIPT = path.join(ROOT, "divian-static-server.js");

require("./load-server-env")();
process.env.DIVIAN_SERVER_MODE = "1";

const { writeActiveTunnelUrl } = require("../divian-public-url");

const PORT = Number(process.env.DIVIAN_STATIC_PORT || 17321);
let serverProc = null;
let tunnelClose = null;
let serverChildLog = "";

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
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
  const start = Date.now();
  while (Date.now() - start < (maxMs || 90000)) {
    try {
      const res = await httpGet("http://127.0.0.1:" + PORT + "/health", 5000);
      if (res.status === 200) return true;
    } catch (_e) {}
    await wait(800);
  }
  return false;
}

function saveLink(ajanlatUrl, baseUrl) {
  const text = [
    "Divian TAVOLI SZERVER — fo gep",
    "================================",
    "",
    "Parancspult (100 km-rol is):",
    baseUrl + "/dashboard.html",
    "",
    "Arajanlat:",
    ajanlatUrl,
    "",
    "Admin:",
    baseUrl + "/admin-center.html",
    "",
    "Generalva: " + new Date().toLocaleString("hu-HU"),
    "",
    "FONTOS:",
    "• A gep bekapcsolva + ez az ablak fut = elerheto barhonnan",
    "• Kikapcsolas / Ctrl+C = tavolrol nem megy",
    "• Ujrainditas utan a link VALTOZHAT (mentes: divian-public-link.txt)",
    "• Tervezes helyben: INDITAS.bat",
    ""
  ].join("\n");
  fs.writeFileSync(LINK_FILE, text, "utf8");
  fs.writeFileSync(LINK_URL_FILE, "[InternetShortcut]\r\nURL=" + baseUrl + "/dashboard.html\r\n", "utf8");
}

function startServer() {
  serverProc = spawn(process.execPath, [SERVER_SCRIPT], {
    cwd: ROOT,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  serverProc.stdout.on("data", (chunk) => {
    const s = String(chunk || "");
    serverChildLog += s;
    if (serverChildLog.length > 12000) serverChildLog = serverChildLog.slice(-12000);
    if (/error|hiba|eaddrinuse/i.test(s)) process.stderr.write("[szerver] " + s);
  });
  serverProc.stderr.on("data", (chunk) => {
    const s = String(chunk || "");
    serverChildLog += s;
    if (serverChildLog.length > 12000) serverChildLog = serverChildLog.slice(-12000);
    process.stderr.write("[szerver] " + s);
  });
}

function startCloudflaredQuick() {
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
          kind: "cloudflare-quick",
          close: () => {
            try {
              proc.kill();
            } catch (_e) {}
          }
        });
      }
    };
    proc.stdout.on("data", (c) => {
      combined += String(c || "");
      tryMatch();
    });
    proc.stderr.on("data", (c) => {
      combined += String(c || "");
      tryMatch();
    });
    proc.on("error", (e) => {
      const msg =
        e && e.code === "ENOENT"
          ? new Error("npx/cloudflared nem talalhato. Node.js 18+ es internet kell.")
          : e;
      finish(msg);
    });
    proc.on("exit", (code) => {
      if (!settled) finish(new Error("cloudflared leallt (" + code + ")"));
    });
    setTimeout(() => finish(new Error("cloudflared timeout")), 180000);
  });
}

function startCloudflaredNamed() {
  const token = String(process.env.CLOUDFLARE_TUNNEL_TOKEN || "").trim();
  const hostname = String(process.env.CLOUDFLARE_TUNNEL_HOSTNAME || "").trim().replace(/\/+$/, "");
  if (!token || !hostname) return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    const proc = spawn("npx", ["--yes", "cloudflared", "tunnel", "run", "--token", token], {
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    proc.on("error", reject);
    proc.on("exit", (code) => {
      if (code) reject(new Error("cloudflared named leallt (" + code + ")"));
    });
    const base = hostname.startsWith("http") ? hostname : "https://" + hostname;
    setTimeout(() => {
      resolve({
        base,
        kind: "cloudflare-named",
        close: () => {
          try {
            proc.kill();
          } catch (_e) {}
        }
      });
    }, 6000);
  });
}

async function openTunnel() {
  const named = await startCloudflaredNamed().catch((err) => {
    console.warn("[tavoli] Named tunnel:", err?.message || err);
    return null;
  });
  if (named) {
    console.log("[tavoli] Cloudflare allando tunnel:", named.base);
    return named;
  }
  console.log("[tavoli] Cloudflare gyors tunnel (trycloudflare.com)…");
  return startCloudflaredQuick();
}

function shutdown() {
  writeActiveTunnelUrl("");
  try {
    if (tunnelClose) tunnelClose();
  } catch (_e) {}
  try {
    if (serverProc && !serverProc.killed) serverProc.kill();
  } catch (_e) {}
}

function requireNodeVersion() {
  const major = Number(String(process.versions.node || "0").split(".")[0]);
  if (major < 18) {
    console.error("[tavoli] HIBA: Node.js 18+ kell (most: " + process.versions.node + ").");
    process.exit(1);
  }
}

async function main() {
  requireNodeVersion();
  console.log("");
  console.log("=== Divian TAVOLI FO SZERVER ===");
  console.log("Kozponti szerver + internetes link. Tervezeshez: INDITAS.bat");
  console.log("");

  try {
    execSync('node "' + path.join(__dirname, "init-server-data.js") + '"', {
      cwd: ROOT,
      stdio: "inherit"
    });
  } catch (_e) {
    console.error("[tavoli] init-server-data hiba");
  }

  try {
    execSync('node "' + path.join(__dirname, "free-port-17321.js") + '"', { cwd: ROOT, stdio: "ignore" });
  } catch (_e) {}

  console.log("[tavoli] Helyi szerver inditasa…");
  startServer();
  if (!(await waitForHealth())) {
    console.error("[tavoli] HIBA: a szerver nem indult el (port " + PORT + ").");
    if (serverChildLog.trim()) {
      console.error("[tavoli] Naplo:\n" + serverChildLog.trim().slice(-2500));
    }
    shutdown();
    process.exit(1);
  }

  const tunnel = await openTunnel();
  tunnelClose = tunnel.close;
  const base = tunnel.base.replace(/\/+$/, "");
  writeActiveTunnelUrl(base);
  saveLink(base + "/arajanlat.html", base);

  console.log("");
  console.log("========================================");
  console.log("  TAVOLI ELERES — masold / mentsd el:");
  console.log("");
  console.log("  " + base + "/dashboard.html");
  console.log("");
  console.log("  Tunnel: " + tunnel.kind);
  console.log("========================================");
  console.log("");
  console.log("Mentve: divian-public-link.txt");
  console.log("Adatok: " + (process.env.DIVIAN_DATA_ROOT || "C:\\DivianSzerver\\data"));
  console.log("");
  console.log("NE zard be ezt az ablakot. Leallitas: Ctrl+C");
  console.log("Helyi tervezes: INDITAS.bat");

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
  console.error("[tavoli] HIBA:", err?.message || err);
  shutdown();
  process.exit(1);
});
