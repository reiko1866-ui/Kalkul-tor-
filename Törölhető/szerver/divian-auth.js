/**
 * Helyi szerver bejelentkezés — token a mentés / API védelméhez.
 * Kikapcsolás (csak fejlesztés): DIVIAN_AUTH_OFF=1
 */
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const AUTH_DISABLED = process.env.DIVIAN_AUTH_OFF === "1";
const SESSION_TTL_MS = Math.max(
  60 * 1000,
  Number(process.env.DIVIAN_AUTH_SESSION_MS) || 12 * 60 * 60 * 1000
);

const DEFAULT_ACCOUNTS = [
  { email: "vaciut@divian.hu", password: "Nosa557238" },
  { email: "divian@vaciut.hu", password: "Nosa557238" },
  { email: "diviankonyhamuhelyekvaciut2@divian.hu", password: "Divian_9876" },
  { email: "diviankonyhamuhelyekvaciut2@gmail.com", password: "Divian_9876" }
];

const EMAIL_LICENSE_ALIASES = {
  "diviankonyhamuhelyekvaciut2@gmail.com": "vaciut@divian.hu",
  "diviankonyhamuhelyekvaciut2@divian.hu": "vaciut@divian.hu"
};

let accountsFilePath = "";
const sessions = new Map();

function configure(opts) {
  accountsFilePath = String(opts?.accountsFile || "").trim();
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizeAccounts(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((acc) => ({
      email: normalizeEmail(acc?.email),
      password: String(acc?.password || "")
    }))
    .filter((acc) => acc.email && acc.email.includes("@") && acc.password);
}

function getSetupKey() {
  return String(process.env.DIVIAN_ACCOUNT_SETUP_KEY || "").trim();
}

function getAdminEmails() {
  const fromEnv = String(process.env.DIVIAN_ADMIN_EMAILS || "")
    .split(/[,;]/)
    .map((e) => normalizeEmail(e))
    .filter(Boolean);
  if (fromEnv.length) return fromEnv;
  return DEFAULT_ACCOUNTS.map((acc) => acc.email);
}

function isAdminEmail(email) {
  return getAdminEmails().includes(normalizeEmail(email));
}

function readFileAccounts() {
  if (!accountsFilePath) return [];
  try {
    if (!fs.existsSync(accountsFilePath)) return [];
    const parsed = JSON.parse(fs.readFileSync(accountsFilePath, "utf8"));
    return normalizeAccounts(parsed?.accounts || parsed);
  } catch (_err) {
    return [];
  }
}

function writeFileAccounts(accounts) {
  if (!accountsFilePath) {
    throw new Error("accounts-file-not-configured");
  }
  const dir = path.dirname(accountsFilePath);
  fs.mkdirSync(dir, { recursive: true });
  const cleaned = normalizeAccounts(accounts);
  fs.writeFileSync(
    accountsFilePath,
    JSON.stringify({ updatedAt: new Date().toISOString(), accounts: cleaned }, null, 2),
    "utf8"
  );
  return cleaned;
}

function addAccountToFile(email, password) {
  const norm = normalizeEmail(email);
  const pwd = String(password || "");
  if (!norm || !norm.includes("@")) {
    throw new Error("invalid-email");
  }
  if (pwd.length < 6) {
    throw new Error("password-too-short");
  }
  if (loadAccounts().some((acc) => acc.email === norm)) {
    throw new Error("email-exists");
  }
  const fileAccounts = readFileAccounts();
  fileAccounts.push({ email: norm, password: pwd });
  return writeFileAccounts(fileAccounts);
}

function listAccountEmails() {
  return loadAccounts().map((acc) => ({ email: acc.email }));
}

function handleRegisterBody(body, sessionEmail) {
  let parsed = {};
  try {
    parsed = body ? JSON.parse(body) : {};
  } catch (_err) {
    return { ok: false, error: "invalid-json" };
  }
  const email = normalizeEmail(parsed.email);
  const password = String(parsed.password || "");
  const setupKey = String(parsed.setupKey || "").trim();
  const adminEmail = normalizeEmail(sessionEmail);
  const isAdmin = adminEmail && isAdminEmail(adminEmail);
  const envKey = getSetupKey();
  const hasKey = envKey && setupKey === envKey;

  if (!isAdmin && !hasKey) {
    return {
      ok: false,
      error: "forbidden",
      hint: envKey
        ? "Admin bejelentkezés vagy helyes csapat-kulcs szükséges."
        : "Csak admin adhat hozzá fiókot, vagy állíts be DIVIAN_ACCOUNT_SETUP_KEY-et a szerveren."
    };
  }

  try {
    addAccountToFile(email, password);
    return { ok: true, email };
  } catch (err) {
    const code = String(err?.message || err);
    if (code === "email-exists") {
      return { ok: false, error: "email-exists", hint: "Ez az e-mail már szerepel." };
    }
    if (code === "password-too-short") {
      return { ok: false, error: "password-too-short", hint: "A jelszó legalább 6 karakter." };
    }
    return { ok: false, error: code };
  }
}

function replaceFileAccounts(rawAccounts) {
  return writeFileAccounts(rawAccounts);
}

function loadAccounts() {
  const fromFile = readFileAccounts();
  const byEmail = new Map();
  [...DEFAULT_ACCOUNTS, ...fromFile].forEach((acc) => byEmail.set(acc.email, acc));
  return Array.from(byEmail.values());
}

function verifyLogin(email, password) {
  const norm = normalizeEmail(email);
  const pwd = String(password || "");
  const pool = loadAccounts();
  if (pool.some((acc) => acc.email === norm && acc.password === pwd)) {
    return norm;
  }
  const license = EMAIL_LICENSE_ALIASES[norm];
  if (license && pool.some((acc) => acc.email === license && acc.password === pwd)) {
    return norm;
  }
  for (const [alias, owner] of Object.entries(EMAIL_LICENSE_ALIASES)) {
    if (owner === norm && pool.some((acc) => acc.email === alias && acc.password === pwd)) {
      return norm;
    }
  }
  return null;
}

function createSession(email) {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, { email: normalizeEmail(email), createdAt: Date.now() });
  return token;
}

function validateToken(token) {
  if (AUTH_DISABLED) return { email: "local", createdAt: Date.now() };
  const t = String(token || "").trim();
  if (!t) return null;
  const session = sessions.get(t);
  if (!session) return null;
  if (Date.now() - session.createdAt > SESSION_TTL_MS) {
    sessions.delete(t);
    return null;
  }
  return session;
}

function revokeToken(token) {
  const t = String(token || "").trim();
  if (t) sessions.delete(t);
}

function extractToken(req) {
  const auth = String(req.headers.authorization || "");
  const bearer = auth.match(/^Bearer\s+(.+)$/i);
  if (bearer) return bearer[1].trim();
  return String(req.headers["x-divian-auth"] || "").trim();
}

function isPublicPath(pathname, method) {
  if (method === "OPTIONS") return true;
  if (pathname === "/health" && method === "GET") return true;
  if (pathname === "/auth/login" && method === "POST") return true;
  if (pathname === "/auth/register" && method === "POST") return true;
  return false;
}

function isStaticAssetPath(pathname) {
  const p = String(pathname || "").toLowerCase();
  if (!p || p === "/") return false;
  if (p.endsWith(".html")) return false;
  return /\.(js|mjs|css|png|jpg|jpeg|gif|webp|svg|ico|woff2?|map|txt|xlsx|xlsm)$/.test(p);
}

function isLoginHtmlPath(pathname) {
  const p = String(pathname || "").toLowerCase();
  return p === "/arajanlat.html" || p === "/" || p === "/index.html" || p === "/fiokok.html";
}

function requiresAuth(pathname, method) {
  if (isPublicPath(pathname, method)) return false;
  if (method === "GET" && isStaticAssetPath(pathname)) return false;
  if (method === "GET" && isLoginHtmlPath(pathname)) return false;
  return true;
}

function sendAuthRequired(res, pathname, method) {
  if (method === "GET" && String(pathname || "").toLowerCase().endsWith(".html")) {
    res.writeHead(302, { Location: "/arajanlat.html?login=required" });
    res.end();
    return;
  }
  res.writeHead(401, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      ok: false,
      error: "auth-required",
      hint: "Jelentkezz be az árajánlat oldalon (helyi szerver :17321)."
    })
  );
}

function guardRequest(req, res, pathname, method) {
  if (!requiresAuth(pathname, method)) {
    return { ok: true, session: null };
  }
  if (AUTH_DISABLED) {
    return { ok: true, session: { email: "local", createdAt: Date.now() } };
  }
  const session = validateToken(extractToken(req));
  if (!session) {
    sendAuthRequired(res, pathname, method);
    return { ok: false };
  }
  return { ok: true, session };
}

function handleLoginBody(body) {
  let parsed = {};
  try {
    parsed = body ? JSON.parse(body) : {};
  } catch (_err) {
    return { ok: false, error: "invalid-json" };
  }
  const email = verifyLogin(parsed.email, parsed.password);
  if (!email) {
    return { ok: false, error: "invalid-credentials" };
  }
  const token = createSession(email);
  return { ok: true, token, email, expiresInSec: Math.floor(SESSION_TTL_MS / 1000) };
}

function handleSessionRequest(req) {
  const session = validateToken(extractToken(req));
  if (!session) {
    return { ok: false, error: "auth-required" };
  }
  return { ok: true, email: session.email };
}

function handleLogoutRequest(req) {
  revokeToken(extractToken(req));
  return { ok: true };
}

module.exports = {
  configure,
  loadAccounts,
  readFileAccounts,
  replaceFileAccounts,
  listAccountEmails,
  isAdminEmail,
  handleRegisterBody,
  verifyLogin,
  guardRequest,
  handleLoginBody,
  handleSessionRequest,
  handleLogoutRequest,
  extractToken,
  validateToken,
  AUTH_DISABLED
};
