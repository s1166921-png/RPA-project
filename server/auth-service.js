const crypto = require("node:crypto");

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decode(value) {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const digest = crypto.scryptSync(String(password || ""), salt, 32).toString("hex");
  return `scrypt$${salt}$${digest}`;
}

function passwordMatches(password, encoded) {
  const [algorithm, salt, expectedHex] = String(encoded || "").split("$");
  if (algorithm !== "scrypt" || !salt || !expectedHex) return false;
  const actual = Buffer.from(crypto.scryptSync(String(password || ""), salt, 32).toString("hex"));
  const expected = Buffer.from(expectedHex);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function sign(payload, secret) {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

function createAuthService({ secret, users = [], userStore = null, ttlMs = 3_600_000, now = () => Date.now() }) {
  if (!secret) throw new Error("Auth token secret is required");
  const normalizeUser = (user) => ({
    username: String(user.username),
    passwordHash: String(user.passwordHash),
    tenantId: String(user.tenantId),
    role: user.role === "admin" ? "admin" : "customer",
    allowedCustomerCodes: Array.isArray(user.allowedCustomerCodes) ? user.allowedCustomerCodes.map(String) : [],
    enabled: user.enabled !== false
  });
  const records = users.map(normalizeUser);
  const findUser = (username) => {
    const normalizedUsername = String(username || "");
    const stored = userStore?.get(normalizedUsername);
    return stored ? normalizeUser(stored) : records.find((user) => user.username === normalizedUsername) || null;
  };

  function login(username, password) {
    const record = findUser(username);
    if (!record || !record.enabled) return null;
    if (!passwordMatches(password, record.passwordHash)) return null;
    const payload = { username: record.username, tenantId: record.tenantId, exp: now() + ttlMs };
    const encoded = encode(payload);
    const { passwordHash, ...publicUser } = record;
    return { token: `${encoded}.${sign(encoded, secret)}`, user: publicUser };
  }

  function verify(token) {
    try {
      const [encoded, signature] = String(token || "").split(".");
      if (!encoded || !signature || sign(encoded, secret) !== signature) return null;
      const payload = decode(encoded);
      if (!payload.exp || payload.exp <= now()) return null;
      const record = findUser(payload.username);
      return record?.enabled && record.tenantId === payload.tenantId ? record : null;
    } catch {
      return null;
    }
  }

  function canAccess(user, shipment) {
    if (!user || !shipment) return false;
    if (user.role === "admin") return true;
    return Boolean(shipment.customerCode && user.allowedCustomerCodes.includes(shipment.customerCode));
  }

  function isAdmin(user) {
    return user?.role === "admin";
  }

  function publicUser(user) {
    if (!user) return null;
    const { passwordHash, ...profile } = user;
    return profile;
  }

  return { login, verify, canAccess, isAdmin, publicUser };
}

function loadUsers(value = "[]") {
  const users = JSON.parse(value);
  if (!Array.isArray(users)) throw new Error("PORTAL_USERS_JSON must be an array");
  return users;
}

module.exports = { createAuthService, hashPassword, loadUsers };
