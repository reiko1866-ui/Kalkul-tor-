/**
 * Divian szerver őr — /health ping. Ha nem válaszol, figyelmeztet (és opcionálisan újraindít).
 *
 * Használat (külön ablakban, a forwarder mellett):
 *   node tools/divian-server-watchdog.js
 *
 * Automatikus újraindítás (óvatosan):
 *   set DIVIAN_WATCHDOG_AUTO_RESTART=1
 *   node tools/divian-server-watchdog.js
 */
"use strict";

const http = require("http");
const path = require("path");
const { spawn, execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const PORT = Number(process.env.DIVIAN_STATIC_PORT || 17321);
const HOST = String(process.env.DIVIAN_HEALTH_HOST || "127.0.0.1").trim();
const INTERVAL_MS = Math.max(5000, Number(process.env.DIVIAN_WATCHDOG_INTERVAL_MS) || 20000);
const FAIL_THRESHOLD = Math.max(2, Number(process.env.DIVIAN_WATCHDOG_FAILS) || 3);
const HEALTH_TIMEOUT_MS = Math.max(2000, Number(process.env.DIVIAN_WATCHDOG_TIMEOUT_MS) || 8000);
const AUTO_RESTART = process.env.DIVIAN_WATCHDOG_AUTO_RESTART === "1";

let failStreak = 0;
let restarting = false;

function pingHealth() {
  return new Promise((resolve, reject) => {
    const req = http.get(
      {
        hostname: HOST,
        port: PORT,
        path: "/health",
        timeout: HEALTH_TIMEOUT_MS
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += String(chunk || "");
        });
        res.on("end", () => {
          if (res.statusCode !== 200) {
            reject(new Error("health-status-" + res.statusCode));
            return;
          }
          try {
            const json = JSON.parse(data);
            if (json.ok !== true) {
              reject(new Error("health-not-ok"));
              return;
            }
            resolve(json);
          } catch (err) {
            reject(err);
          }
        });
      }
    );
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("health-timeout"));
    });
    req.on("error", reject);
  });
}

async function restartForwarder() {
  if (restarting) return;
  restarting = true;
  console.log("[watchdog] Szerver nem válaszol — port felszabadítás és újraindítás…");
  try {
    execSync('node "' + path.join(__dirname, "free-port-17321.js") + '"', {
      cwd: ROOT,
      stdio: "inherit",
      windowsHide: true
    });
  } catch (_e) {}
  await new Promise((r) => setTimeout(r, 2000));
  const child = spawn(process.execPath, [path.join(ROOT, "divian-playwright-forwarder.js")], {
    cwd: ROOT,
    detached: true,
    stdio: "ignore",
    env: process.env,
    windowsHide: true
  });
  child.unref();
  console.log("[watchdog] Új forwarder indítva (PID " + child.pid + ").");
  failStreak = 0;
  restarting = false;
}

async function tick() {
  try {
    const health = await pingHealth();
    failStreak = 0;
    if (health.busyPath && Number(health.activeRequests) > 0) {
      console.log(
        "[watchdog] OK · foglalt:",
        health.busyPath,
        "(" + health.activeRequests + " kérés, uptime " + health.uptimeSec + "s)"
      );
    }
  } catch (err) {
    failStreak += 1;
    const msg = String(err?.message || err);
    console.warn("[watchdog] Nincs válasz (" + failStreak + "/" + FAIL_THRESHOLD + "): " + msg);
    if (failStreak >= FAIL_THRESHOLD) {
      if (AUTO_RESTART) {
        await restartForwarder();
      } else {
        console.warn(
          "[watchdog] A szerver nem él. Indítsd újra: inditas-teszt-tervezo.bat  (vagy DIVIAN_WATCHDOG_AUTO_RESTART=1)"
        );
        failStreak = 0;
      }
    }
  }
}

console.log("[watchdog] Figyelés: http://" + HOST + ":" + PORT + "/health · " + INTERVAL_MS + "ms");
if (AUTO_RESTART) console.log("[watchdog] Automatikus újraindítás BEKAPCSOLVA.");
setInterval(() => {
  void tick();
}, INTERVAL_MS);
void tick();
