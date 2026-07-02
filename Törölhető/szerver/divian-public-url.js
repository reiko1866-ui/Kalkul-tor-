"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const TUNNEL_URL_FILE = path.join(ROOT, "config", "aktualis-tunnel-url.txt");

function readActiveTunnelUrl() {
  try {
    if (!fs.existsSync(TUNNEL_URL_FILE)) return "";
    return String(fs.readFileSync(TUNNEL_URL_FILE, "utf8") || "")
      .trim()
      .replace(/\/+$/, "");
  } catch (_e) {
    return "";
  }
}

function writeActiveTunnelUrl(url) {
  const u = String(url || "").trim().replace(/\/+$/, "");
  fs.mkdirSync(path.dirname(TUNNEL_URL_FILE), { recursive: true });
  if (u) fs.writeFileSync(TUNNEL_URL_FILE, u + "\n", "utf8");
  else if (fs.existsSync(TUNNEL_URL_FILE)) fs.unlinkSync(TUNNEL_URL_FILE);
}

function resolvePublicBaseUrl() {
  const fromEnv = String(process.env.DIVIAN_PUBLIC_URL || "").trim().replace(/\/+$/, "");
  if (fromEnv) return fromEnv;
  return readActiveTunnelUrl();
}

module.exports = {
  TUNNEL_URL_FILE,
  readActiveTunnelUrl,
  writeActiveTunnelUrl,
  resolvePublicBaseUrl
};
