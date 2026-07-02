/**
 * API alap URL — helyi :17321, LAN IP, vagy nyilvános tunnel (ugyanaz az origin).
 */
(function (global) {
  "use strict";

  function resolveDivianForwarderBase() {
    try {
      if (
        typeof global.__DIVIAN_FORWARDER_BASE__ === "string" &&
        global.__DIVIAN_FORWARDER_BASE__.trim()
      ) {
        return String(global.__DIVIAN_FORWARDER_BASE__).trim().replace(/\/+$/, "");
      }
      const loc = global.location;
      if (!loc) return "http://localhost:17321";
      const p = String(loc.protocol || "");
      if (p !== "http:" && p !== "https:") return "http://localhost:17321";
      const port = String(loc.port || "");
      if (port === "17321") return loc.origin;
      if (!port || port === "80" || port === "443") return loc.origin;
      const h = String(loc.hostname || "").toLowerCase();
      if (h && h !== "localhost" && h !== "127.0.0.1") {
        return loc.protocol + "//" + loc.hostname + ":17321";
      }
    } catch (_e) {
      /* ignore */
    }
    return "http://localhost:17321";
  }

  global.resolveDivianForwarderBase = resolveDivianForwarderBase;
})(typeof window !== "undefined" ? window : globalThis);
