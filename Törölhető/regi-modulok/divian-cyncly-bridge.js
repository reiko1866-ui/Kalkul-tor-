/**
 * Cyncly áthozás — háttérben divian-cyncly-cli.js (Playwright, beépített Chromium).
 */
const { spawn } = require("child_process");
const path = require("path");

const CLI_SCRIPT = path.join(__dirname, "divian-cyncly-cli.js");
let queue = Promise.resolve();

function runCynclyCli(mode, plannerUrl, label) {
  const task = () =>
    new Promise((resolve, reject) => {
      const args = [CLI_SCRIPT, mode, String(plannerUrl || "").trim()];
      if (label) args.push(String(label));
      const child = spawn(process.execPath, args, {
        cwd: __dirname,
        env: {
          ...process.env,
          DIVIAN_PLAYWRIGHT_NO_CHANNEL: process.env.DIVIAN_PLAYWRIGHT_NO_CHANNEL || "1"
        },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: false
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d) => {
        stdout += String(d || "");
      });
      child.stderr.on("data", (d) => {
        stderr += String(d || "");
        process.stderr.write(d);
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(stderr.trim() || stdout.trim() || "Cyncly CLI kilépett: " + code));
          return;
        }
        try {
          const trimmed = stdout.trim();
          const jsonLine =
            trimmed
              .split("\n")
              .map((l) => l.trim())
              .filter((l) => l.startsWith("{"))
              .pop() || trimmed;
          resolve(JSON.parse(jsonLine));
        } catch (err) {
          reject(new Error("Cyncly CLI JSON hiba: " + stdout.slice(0, 240)));
        }
      });
    });

  queue = queue.then(task, task);
  return queue;
}

module.exports = {
  fetchPlannerItems(plannerUrl) {
    return runCynclyCli("planner-items", plannerUrl);
  },
  captureScreenshot(plannerUrl, label) {
    return runCynclyCli("screenshot", plannerUrl, label || "HD render");
  }
};
