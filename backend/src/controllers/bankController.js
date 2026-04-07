import { SCRAPERS } from "israeli-bank-scrapers";
import Household from "../models/Household.js";
import { encryptValue } from "../services/credentialCrypto.js";
import {
  ensureHouseholdBankConnections,
  toStoredEncryptedFields,
} from "../services/householdBankConnections.js";

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

function isHouseholdManager(user) {
  return (user?.role || "manager") === "manager";
}

function getSerializedConnections(household) {
  const connections = Array.isArray(household?.bankConnections)
    ? household.bankConnections
    : [];
  return connections.map((connection) => ({
    id: String(connection?._id || ""),
    companyId: String(connection?.companyId || "").trim(),
    connectionName: String(connection?.connectionName || "").trim(),
    updatedAt: connection?.updatedAt || null,
    lastBankFetchAt: connection?.lastBankFetchAt || null,
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

async function getHouseholdWithConnections(req, res) {
  const householdId = String(req.user?.householdId || "").trim();
  if (!householdId) {
    res.status(400).json({ message: "User is not linked to a household" });
    return null;
  }

  const household = await Household.findById(householdId);
  if (!household) {
    res.status(404).json({ message: "Household not found" });
    return null;
  }

  const { migrated } = await ensureHouseholdBankConnections(household, {
    preferredUserId: req.user?._id,
    loadUsers: true,
  });
  if (migrated) {
    await household.save();
  }

  if (!Array.isArray(household.bankConnections)) {
    household.bankConnections = [];
  }

  return household;
}

export async function getBankProviders(req, res) {
  res.json({ providers: getProviders() });
}

export async function getBankCredentialStatus(req, res) {
  const household = await getHouseholdWithConnections(req, res);
  if (!household) return;

  const connections = getSerializedConnections(household);
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
  if (!isHouseholdManager(req.user)) {
    return res.status(403).json({
      message: "Only household managers can add or remove bank connections",
    });
  }

  const normalizedCompanyId = String(req.body?.companyId || "").trim();
  if (!normalizedCompanyId) {
    return res.status(400).json({ message: "companyId is required" });
  }

  const credentials = collectSubmittedCredentials(req.body);
  const validation = validateCredentials(normalizedCompanyId, credentials);
  if (!validation.valid) {
    return res.status(400).json({ message: validation.message });
  }

  const household = await getHouseholdWithConnections(req, res);
  if (!household) return;

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
    updatedIndex = household.bankConnections.findIndex(
      (connection) => String(connection?._id || "") === connectionId,
    );
    if (updatedIndex < 0) {
      return res.status(404).json({ message: "Bank connection not found" });
    }

    const existingConnection = household.bankConnections[updatedIndex];
    const existingAsObject =
      existingConnection && typeof existingConnection.toObject === "function"
        ? existingConnection.toObject()
        : existingConnection || {};
    household.bankConnections[updatedIndex] = {
      ...existingAsObject,
      ...nextConnection,
    };
  } else {
    household.bankConnections.push(nextConnection);
    updatedIndex = household.bankConnections.length - 1;
  }

  await household.save();

  const savedConnection = household.bankConnections[updatedIndex];
  const connectedCount = household.bankConnections.filter(hasConnectionCredentials).length;
  res.json({
    success: true,
    connected: connectedCount > 0,
    connectedCount,
    connection: {
      id: String(savedConnection?._id || ""),
      companyId: savedConnection?.companyId || "",
      connectionName: savedConnection?.connectionName || "",
      updatedAt: savedConnection?.updatedAt || null,
      lastBankFetchAt: savedConnection?.lastBankFetchAt || null,
      connected: hasConnectionCredentials(savedConnection),
    },
  });
}

export async function deleteBankCredentials(req, res) {
  if (!isHouseholdManager(req.user)) {
    return res.status(403).json({
      message: "Only household managers can add or remove bank connections",
    });
  }

  const household = await getHouseholdWithConnections(req, res);
  if (!household) return;

  const connectionId = String(req.params?.connectionId || "").trim();
  if (connectionId) {
    const nextConnections = household.bankConnections.filter(
      (connection) => String(connection?._id || "") !== connectionId,
    );
    if (nextConnections.length === household.bankConnections.length) {
      return res.status(404).json({ message: "Bank connection not found" });
    }
    household.bankConnections = nextConnections;
  } else {
    household.bankConnections = [];
  }

  await household.save();

  const connectedCount = household.bankConnections.filter(hasConnectionCredentials).length;
  res.json({ success: true, connected: connectedCount > 0, connectedCount });
}
