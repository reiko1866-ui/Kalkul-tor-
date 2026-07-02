/**
 * Leállítja azt a folyamatot, ami a 17321-es porton LISTENING állapotban van.
 * Futtatás: node tools/free-port-17321.js
 */
const { execSync } = require("child_process");

const PORT = Number(process.env.DIVIAN_STATIC_PORT || 17321);

function findListeningPids(port) {
  const out = execSync("netstat -ano", { encoding: "utf8", windowsHide: true });
  const pids = new Set();
  for (const line of out.split(/\r?\n/)) {
    if (!line.includes(":" + port)) continue;
    if (!/LISTENING/i.test(line)) continue;
    const parts = line.trim().split(/\s+/);
    const pid = parts[parts.length - 1];
    if (/^\d+$/.test(pid)) pids.add(pid);
  }
  return [...pids];
}

function killPid(pid) {
  try {
    execSync("taskkill /F /PID " + pid, { stdio: "ignore", windowsHide: true });
    return true;
  } catch (_err) {
    return false;
  }
}

const pids = findListeningPids(PORT);
if (!pids.length) {
  console.log("[free-port] " + PORT + " szabad.");
  process.exit(0);
}

let killed = 0;
for (const pid of pids) {
  if (killPid(pid)) {
    console.log("[free-port] Leállítva PID " + pid + " (port " + PORT + ")");
    killed += 1;
  } else {
    console.warn("[free-port] Nem sikerült leállítani PID " + pid);
  }
}

process.exit(0);
