/**
 * Megosztott kliens auth — Bearer token a helyi szerver API-hoz.
 */
(function () {
  "use strict";

  const AUTH_TOKEN_KEY = "divian_auth_token_v1";

  function getToken() {
    try {
      return String(localStorage.getItem(AUTH_TOKEN_KEY) || "").trim();
    } catch (_e) {
      return "";
    }
  }

  function setToken(token) {
    try {
      const t = String(token || "").trim();
      if (t) localStorage.setItem(AUTH_TOKEN_KEY, t);
      else localStorage.removeItem(AUTH_TOKEN_KEY);
    } catch (_e) {
      /* ignore */
    }
  }

  function authHeaders(extra) {
    const headers = {};
    if (extra && typeof extra === "object") {
      if (extra instanceof Headers) {
        extra.forEach((v, k) => {
          headers[k] = v;
        });
      } else {
        Object.assign(headers, extra);
      }
    }
    const token = getToken();
    if (token) headers.Authorization = "Bearer " + token;
    return headers;
  }

  async function authFetch(url, opts) {
    const options = { ...(opts || {}) };
    options.headers = authHeaders(options.headers);
    let res;
    try {
      res = await fetch(url, options);
    } catch (err) {
      throw err;
    }
    if (res.status === 401) {
      setToken("");
      const onLogin = "/arajanlat.html?login=required";
      if (!String(window.location.pathname || "").toLowerCase().includes("arajanlat.html")) {
        window.location.href = onLogin;
      }
      throw new Error("auth-required");
    }
    return res;
  }

  window.DivianClientAuth = {
    AUTH_TOKEN_KEY,
    getToken,
    setToken,
    authHeaders,
    authFetch
  };
})();
