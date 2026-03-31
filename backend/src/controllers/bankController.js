import { SCRAPERS } from "israeli-bank-scrapers";
import User from "../models/User.js";
import { encryptValue } from "../services/credentialCrypto.js";

const COMPANY_LABELS = {
  hapoalim: "Bank Hapoalim",
  leumi: "Bank Leumi",
  mizrahi: "Mizrahi-Tefahot",
  discount: "Discount Bank",
  mercantile: "Mercantile Bank",
  otsarHahayal: "Otsar HaHayal",
  max: "MAX",
  visaCal: "CAL",
  isracard: "Isracard",
  amex: "American Express",
  union: "Union Bank",
  beinleumi: "First International",
  massad: "Massad",
  yahav: "Yahav",
  beyahadBishvilha: "Poalei Agudat Israel",
  oneZero: "ONE ZERO",
  behatsdaa: "BeHatsdaa",
  pagi: "Pagi",
};

const FIELD_META = {
  username: { label: "Username", type: "text" },
  password: { label: "Password", type: "password" },
  nationalID: { label: "National ID", type: "text" },
  userCode: { label: "User Code", type: "text" },
  id: { label: "ID", type: "text" },
  num: { label: "Account Number", type: "text" },
  card6Digits: { label: "Last 6 Digits of Card", type: "text" },
  email: { label: "Email", type: "email" },
  phoneNumber: { label: "Phone Number", type: "tel" },
  otpLongTermToken: { label: "OTP Long-Term Token", type: "password" },
};

const ONE_ZERO_API_REQUIRED_FIELDS = new Set([
  "email",
  "password",
  "otpLongTermToken",
]);

function getCompany(companyId = "") {
  return SCRAPERS[String(companyId).trim()] || null;
}

function getApiLoginFields(companyId = "") {
  const scraper = getCompany(companyId);
  if (!scraper) return [];

  return scraper.loginFields
    .filter((field) => field !== "otpCodeRetriever")
    .map((field) => ({
      name: field,
      required:
        companyId === "oneZero"
          ? ONE_ZERO_API_REQUIRED_FIELDS.has(field)
          : true,
      ...FIELD_META[field],
    }));
}

function getProviders() {
  return Object.keys(SCRAPERS).map((companyId) => ({
    companyId,
    label: COMPANY_LABELS[companyId] || companyId,
    fields: getApiLoginFields(companyId),
  }));
}

function toStoredEncryptedFields(bankCredentials = {}) {
  const encryptedFields = bankCredentials?.encryptedFields;
  if (encryptedFields && typeof encryptedFields.entries === "function") {
    return Object.fromEntries(encryptedFields.entries());
  }
  if (encryptedFields && typeof encryptedFields === "object") {
    return { ...encryptedFields };
  }

  const legacy = {
    username: bankCredentials?.usernameEnc || "",
    nationalID: bankCredentials?.nationalIdEnc || "",
    password: bankCredentials?.passwordEnc || "",
  };
  return Object.fromEntries(
    Object.entries(legacy).filter(([, value]) => Boolean(value)),
  );
}

function hasConnectionCredentials(bankConnection = {}) {
  const companyId = String(bankConnection?.companyId || "").trim();
  if (!companyId) return false;

  const requiredFields = getApiLoginFields(companyId)
    .filter((field) => field.required)
    .map((field) => field.name);
  const storedFields = toStoredEncryptedFields(bankConnection);

  return requiredFields.every((fieldName) => Boolean(storedFields[fieldName]));
}

function normalizeConnectionName(value) {
  return String(value || "").trim();
}

function clearLegacyCredentials(user) {
  user.bankCredentials = {
    companyId: "",
    usernameEnc: "",
    nationalIdEnc: "",
    passwordEnc: "",
    encryptedFields: {},
    updatedAt: null,
  };
}

function syncLegacyCredentialSnapshot(user) {
  const [firstConnection] = Array.isArray(user.bankConnections)
    ? user.bankConnections
    : [];
  if (!firstConnection) {
    clearLegacyCredentials(user);
    return;
  }

  user.bankCredentials = {
    companyId: firstConnection.companyId || "",
    usernameEnc: firstConnection.usernameEnc || "",
    nationalIdEnc: firstConnection.nationalIdEnc || "",
    passwordEnc: firstConnection.passwordEnc || "",
    encryptedFields: toStoredEncryptedFields(firstConnection),
    updatedAt: firstConnection.updatedAt || null,
  };
}

function migrateLegacyCredentialsIfNeeded(user) {
  const hasModernConnections =
    Array.isArray(user.bankConnections) && user.bankConnections.length > 0;
  if (hasModernConnections) return false;

  const legacyCompanyId = String(user?.bankCredentials?.companyId || "").trim();
  const legacyEncryptedFields = toStoredEncryptedFields(user?.bankCredentials);
  if (!legacyCompanyId || Object.keys(legacyEncryptedFields).length === 0) {
    return false;
  }

  user.bankConnections = [
    {
      companyId: legacyCompanyId,
      connectionName: "",
      usernameEnc: user?.bankCredentials?.usernameEnc || "",
      nationalIdEnc: user?.bankCredentials?.nationalIdEnc || "",
      passwordEnc: user?.bankCredentials?.passwordEnc || "",
      encryptedFields: legacyEncryptedFields,
      updatedAt: user?.bankCredentials?.updatedAt || null,
      lastBankFetchAt: user?.expenseSyncMeta?.lastBankFetchAt || null,
    },
  ];
  syncLegacyCredentialSnapshot(user);
  return true;
}

function getSerializedConnections(user) {
  const connections = Array.isArray(user?.bankConnections) ? user.bankConnections : [];
  return connections.map((connection) => ({
    id: String(connection?._id || ""),
    companyId: String(connection?.companyId || "").trim(),
    connectionName: String(connection?.connectionName || "").trim(),
    updatedAt: connection?.updatedAt || null,
    connected: hasConnectionCredentials(connection),
  }));
}

function getLastUpdatedAt(connections = []) {
  const timestamps = connections
    .map((connection) => {
      const ts = new Date(connection?.updatedAt || "").getTime();
      return Number.isFinite(ts) ? ts : null;
    })
    .filter((ts) => ts != null);

  if (!timestamps.length) return null;
  return new Date(Math.max(...timestamps));
}

function sanitizeCredentialValues(credentials = {}) {
  const output = {};
  for (const [key, value] of Object.entries(credentials)) {
    const normalizedKey = String(key || "").trim();
    if (!normalizedKey) continue;
    output[normalizedKey] = String(value ?? "").trim();
  }
  return output;
}

function collectSubmittedCredentials(body = {}) {
  const payloadCredentials =
    body.credentials && typeof body.credentials === "object" ? body.credentials : {};
  const merged = { ...payloadCredentials };

  for (const legacyField of [
    "username",
    "password",
    "nationalID",
    "id",
    "num",
    "card6Digits",
    "userCode",
    "email",
    "phoneNumber",
    "otpLongTermToken",
  ]) {
    if (!(legacyField in merged) && body[legacyField] != null) {
      merged[legacyField] = body[legacyField];
    }
  }

  return sanitizeCredentialValues(merged);
}

function validateCredentials(companyId, credentials) {
  const company = getCompany(companyId);
  if (!company) {
    return { valid: false, message: "Unsupported companyId" };
  }

  const fields = getApiLoginFields(companyId);
  const missingFields = fields
    .filter((field) => field.required)
    .filter((field) => !credentials[field.name])
    .map((field) => field.name);

  if (missingFields.length > 0) {
    return {
      valid: false,
      message: `Missing required credentials: ${missingFields.join(", ")}`,
    };
  }

  return { valid: true };
}

export async function getBankProviders(req, res) {
  res.json({ providers: getProviders() });
}

export async function getBankCredentialStatus(req, res) {
  const user = await User.findById(req.user._id);
  if (!user) return res.status(404).json({ message: "User not found" });

  const migrated = migrateLegacyCredentialsIfNeeded(user);
  if (migrated) {
    await user.save();
  }

  const connections = getSerializedConnections(user);
  const connectedCount = connections.filter((connection) => connection.connected).length;

  res.json({
    connected: connectedCount > 0,
    connectedCount,
    companyId: connections[0]?.companyId || "",
    updatedAt: getLastUpdatedAt(connections),
    connections,
  });
}

export async function setBankCredentials(req, res) {
  const normalizedCompanyId = String(req.body?.companyId || "").trim();
  if (!normalizedCompanyId) {
    return res.status(400).json({ message: "companyId is required" });
  }

  const credentials = collectSubmittedCredentials(req.body);
  const validation = validateCredentials(normalizedCompanyId, credentials);
  if (!validation.valid) {
    return res.status(400).json({ message: validation.message });
  }

  const user = await User.findById(req.user._id);
  if (!user) return res.status(404).json({ message: "User not found" });

  migrateLegacyCredentialsIfNeeded(user);
  if (!Array.isArray(user.bankConnections)) {
    user.bankConnections = [];
  }

  const encryptedFields = {};
  for (const [key, value] of Object.entries(credentials)) {
    if (!value) continue;
    encryptedFields[key] = encryptValue(value);
  }

  const nextConnection = {
    companyId: normalizedCompanyId,
    connectionName: normalizeConnectionName(req.body?.connectionName),
    usernameEnc: encryptedFields.username || "",
    nationalIdEnc: encryptedFields.nationalID || "",
    passwordEnc: encryptedFields.password || "",
    encryptedFields,
    updatedAt: new Date(),
    lastBankFetchAt: null,
  };

  const connectionId = String(req.body?.connectionId || "").trim();
  let updatedIndex = -1;
  if (connectionId) {
    updatedIndex = user.bankConnections.findIndex(
      (connection) => String(connection?._id || "") === connectionId,
    );
    if (updatedIndex < 0) {
      return res.status(404).json({ message: "Bank connection not found" });
    }
    const existingConnection = user.bankConnections[updatedIndex];
    const existingAsObject =
      existingConnection && typeof existingConnection.toObject === "function"
        ? existingConnection.toObject()
        : existingConnection || {};
    user.bankConnections[updatedIndex] = {
      ...existingAsObject,
      ...nextConnection,
    };
  } else {
    user.bankConnections.push(nextConnection);
    updatedIndex = user.bankConnections.length - 1;
  }

  syncLegacyCredentialSnapshot(user);
  await user.save();

  const savedConnection = user.bankConnections[updatedIndex];
  const connectedCount = user.bankConnections.filter(hasConnectionCredentials).length;
  res.json({
    success: true,
    connected: connectedCount > 0,
    connectedCount,
    connection: {
      id: String(savedConnection?._id || ""),
      companyId: savedConnection?.companyId || "",
      connectionName: savedConnection?.connectionName || "",
      updatedAt: savedConnection?.updatedAt || null,
      connected: hasConnectionCredentials(savedConnection),
    },
  });
}

export async function deleteBankCredentials(req, res) {
  const user = await User.findById(req.user._id);
  if (!user) return res.status(404).json({ message: "User not found" });

  migrateLegacyCredentialsIfNeeded(user);
  if (!Array.isArray(user.bankConnections)) {
    user.bankConnections = [];
  }

  const connectionId = String(req.params?.connectionId || "").trim();
  if (connectionId) {
    const nextConnections = user.bankConnections.filter(
      (connection) => String(connection?._id || "") !== connectionId,
    );
    if (nextConnections.length === user.bankConnections.length) {
      return res.status(404).json({ message: "Bank connection not found" });
    }
    user.bankConnections = nextConnections;
  } else {
    user.bankConnections = [];
  }

  syncLegacyCredentialSnapshot(user);
  await user.save();

  const connectedCount = user.bankConnections.filter(hasConnectionCredentials).length;
  res.json({ success: true, connected: connectedCount > 0, connectedCount });
}
