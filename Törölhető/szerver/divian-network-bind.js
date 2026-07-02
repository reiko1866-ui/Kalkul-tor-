/**
 * Hálózati kötés — alapból csak localhost; DIVIAN_PUBLIC_ACCESS=1 → 0.0.0.0
 */
"use strict";

const os = require("os");

function isPublicAccessEnabled() {
  const pub = String(process.env.DIVIAN_PUBLIC_ACCESS || "")
    .trim()
    .toLowerCase();
  if (pub === "1" || pub === "true" || pub === "yes") return true;
  const bind = String(process.env.DIVIAN_BIND_HOST || "").trim();
  return bind === "0.0.0.0";
}

function resolveBindHost(legacyHostEnv) {
  const explicit = String(process.env.DIVIAN_BIND_HOST || "").trim();
  if (explicit) return explicit;
  const legacy = String(legacyHostEnv || "").trim();
  if (legacy) return legacy;
  if (isPublicAccessEnabled()) return "0.0.0.0";
  return "127.0.0.1";
}

function collectLanIPv4() {
  const out = [];
  try {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] || []) {
        if (net.family !== "IPv4" && net.family !== 4) continue;
        if (net.internal) continue;
        const ip = String(net.address || "").trim();
        if (!ip || ip.startsWith("169.254.")) continue;
        out.push(ip);
      }
    }
  } catch (_err) {
    /* ignore */
  }
  return [...new Set(out)];
}

function logPublicAccessHints(port, label) {
  if (!isPublicAccessEnabled()) return;
  const tag = label ? "[" + label + "] " : "";
  console.log(tag + "TÁVOLI ELÉRÉS: szerver hallgat → 0.0.0.0:" + port);
  console.log(tag + "  Helyi gép: http://localhost:" + port + "/arajanlat.html");
  const ips = collectLanIPv4();
  ips.forEach((ip) => {
    console.log(tag + "  Ugyanazon Wi-Fi/LAN: http://" + ip + ":" + port + "/arajanlat.html");
  });
  console.log(tag + "  Internet (más hálózat): routerben TCP " + port + " port továbbítás erre a gépre");
  console.log(tag + "  Windows tűzfal: futtasd adminként: tools\\open-firewall-17321.bat");
  console.log(tag + "  Bejelentkezés kötelező — ne oszd meg a jelszót nyilvánosan.");
}

module.exports = {
  isPublicAccessEnabled,
  resolveBindHost,
  collectLanIPv4,
  logPublicAccessHints
};
