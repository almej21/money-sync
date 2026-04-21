import { SCRAPERS } from "israeli-bank-scrapers";
import Expense from "../models/Expense.js";
import Household from "../models/Household.js";
import { encryptValue } from "../services/credentialCrypto.js";
import {
  buildHouseholdConnectionVisibilityMap,
  normalizeVisibilityScope,
  resolveConnectionVisibility,
  resolveExpenseVisibilityForConnection,
} from "../services/expenseVisibility.js";
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
const HIDDEN_COMPANY_IDS = new Set(["isracard"]);

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
  const normalizedCompanyId = String(companyId).trim();
  if (HIDDEN_COMPANY_IDS.has(normalizedCompanyId)) return null;
  return SCRAPERS[normalizedCompanyId] || null;
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
  return Object.keys(SCRAPERS)
    .filter((companyId) => !HIDDEN_COMPANY_IDS.has(companyId))
    .map((companyId) => ({
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

function normalizeSourceAccountId(value) {
  return String(value || "").trim();
}

function normalizeCompanyId(value) {
  return String(value || "").trim();
}

function isHouseholdManager(user) {
  return (user?.role || "manager") === "manager";
}

function parseRequestedVisibilityScope(body = {}) {
  if (!Object.hasOwn(body, "visibilityScope")) {
    return { hasValue: false, value: null, valid: true };
  }

  const raw = String(body.visibilityScope || "")
    .trim()
    .toLowerCase();
  if (!raw) {
    return { hasValue: false, value: null, valid: true };
  }
  if (raw !== "shared" && raw !== "private") {
    return { hasValue: true, value: null, valid: false };
  }
  return { hasValue: true, value: raw, valid: true };
}

function serializeConnectionRules(connectionVisibility = {}) {
  const rules = Array.isArray(connectionVisibility?.accountVisibilityRules)
    ? connectionVisibility.accountVisibilityRules
    : [];
  return rules.map((rule) => ({
    sourceAccountId: normalizeSourceAccountId(rule?.sourceAccountId),
    visibilityScope: normalizeVisibilityScope(rule?.visibilityScope),
  }));
}

async function getSourceAccountsByConnection(household) {
  const householdId = household?._id || null;
  if (!householdId) return new Map();
  const connections = Array.isArray(household?.bankConnections)
    ? household.bankConnections
    : [];
  if (!connections.length) return new Map();

  const uniqueCompanyConnectionMap = buildUniqueCompanyConnectionMap(household);
  const sourceConnectionKeyToConnectionId = new Map();
  for (const connection of connections) {
    const connectionId = String(connection?._id || "").trim();
    if (!connectionId) continue;
    sourceConnectionKeyToConnectionId.set(connectionId, connectionId);
  }
  for (const [companyId, connectionId] of uniqueCompanyConnectionMap.entries()) {
    if (!sourceConnectionKeyToConnectionId.has(companyId)) {
      sourceConnectionKeyToConnectionId.set(companyId, connectionId);
    }
  }
  const keyAliases = Array.from(sourceConnectionKeyToConnectionId.keys());
  const uniqueCompanyIds = Array.from(uniqueCompanyConnectionMap.keys());

  const rows = await Expense.aggregate([
    {
      $match: {
        householdId: household._id,
        sourceAccountId: { $nin: ["", null] },
        $or: [
          { sourceConnectionKey: { $in: keyAliases } },
          {
            sourceCompanyId: { $in: uniqueCompanyIds },
            $or: [
              { sourceConnectionKey: { $exists: false } },
              { sourceConnectionKey: null },
              { sourceConnectionKey: "" },
            ],
          },
        ],
      },
    },
    { $sort: { date: -1, updatedAt: -1, _id: -1 } },
    {
      $group: {
        _id: {
          sourceConnectionKey: "$sourceConnectionKey",
          sourceCompanyId: "$sourceCompanyId",
          sourceAccountId: "$sourceAccountId",
        },
        sourceAccountName: { $first: "$sourceAccountName" },
        lastSeenAt: { $first: "$date" },
      },
    },
    {
      $project: {
        _id: 0,
        sourceConnectionKey: "$_id.sourceConnectionKey",
        sourceCompanyId: "$_id.sourceCompanyId",
        sourceAccountId: "$_id.sourceAccountId",
        sourceAccountName: 1,
        lastSeenAt: 1,
      },
    },
  ]);

  const map = new Map();
  for (const row of rows) {
    const rowSourceConnectionKey = String(row?.sourceConnectionKey || "").trim();
    const rowSourceCompanyId = normalizeCompanyId(row?.sourceCompanyId);
    const connectionKey =
      String(sourceConnectionKeyToConnectionId.get(rowSourceConnectionKey) || "").trim() ||
      String(uniqueCompanyConnectionMap.get(rowSourceCompanyId) || "").trim();
    const sourceAccountId = normalizeSourceAccountId(row?.sourceAccountId);
    if (!connectionKey || !sourceAccountId) continue;
    if (!map.has(connectionKey)) map.set(connectionKey, []);
    map.get(connectionKey).push({
      sourceAccountId,
      sourceAccountName: String(row?.sourceAccountName || "").trim(),
      lastSeenAt: row?.lastSeenAt || null,
    });
  }
  return map;
}

function buildUniqueCompanyConnectionMap(household) {
  const counts = new Map();
  const connectionByCompany = new Map();
  const connections = Array.isArray(household?.bankConnections)
    ? household.bankConnections
    : [];

  for (const connection of connections) {
    const connectionId = String(connection?._id || "").trim();
    const companyId = normalizeCompanyId(connection?.companyId);
    if (!connectionId || !companyId) continue;
    counts.set(companyId, Number(counts.get(companyId) || 0) + 1);
    connectionByCompany.set(companyId, connectionId);
  }

  const uniqueMap = new Map();
  for (const [companyId, count] of counts.entries()) {
    if (count === 1) {
      uniqueMap.set(companyId, connectionByCompany.get(companyId));
    }
  }
  return uniqueMap;
}

function buildConnectionExpenseMatch({
  sourceConnectionKey = "",
  connectionCompanyId = "",
  uniqueCompanyConnectionMap = new Map(),
}) {
  const connectionId = String(sourceConnectionKey || "").trim();
  if (!connectionId) return null;

  const companyId = normalizeCompanyId(connectionCompanyId);
  const clauses = [{ sourceConnectionKey: connectionId }];

  if (
    companyId &&
    String(uniqueCompanyConnectionMap.get(companyId) || "") === connectionId
  ) {
    clauses.push({ sourceConnectionKey: companyId });
    clauses.push({
      sourceCompanyId: companyId,
      $or: [
        { sourceConnectionKey: { $exists: false } },
        { sourceConnectionKey: null },
        { sourceConnectionKey: "" },
      ],
    });
  }

  if (clauses.length === 1) return clauses[0];
  return { $or: clauses };
}

function getSerializedConnections(household, sourceAccountsByConnection = new Map()) {
  const connections = Array.isArray(household?.bankConnections)
    ? household.bankConnections
    : [];
  const connectionVisibilityMap = buildHouseholdConnectionVisibilityMap(household);
  return connections
    .map((connection) => {
      const connectionId = String(connection?._id || "");
      const resolvedVisibility = resolveConnectionVisibility({
        scope: connection?.visibilityScope,
        ownerUserId: connection?.ownerUserId,
      });
      const connectionVisibility = connectionVisibilityMap.get(connectionId) || {
        visibilityScope: resolvedVisibility.visibilityScope,
        ownerUserId: resolvedVisibility.ownerUserId,
        accountVisibilityRules: [],
      };
      const sourceAccounts = (
        sourceAccountsByConnection.get(connectionId) || []
      ).map((account) => {
        const resolvedAccountVisibility = resolveExpenseVisibilityForConnection({
          sourceConnectionKey: connectionId,
          sourceAccountId: account.sourceAccountId,
          connectionVisibilityMap,
        });
        return {
          sourceAccountId: account.sourceAccountId,
          sourceAccountName: account.sourceAccountName,
          visibilityScope: resolvedAccountVisibility.visibilityScope,
          lastSeenAt: account.lastSeenAt || null,
        };
      });
      return {
        id: connectionId,
        companyId: String(connection?.companyId || "").trim(),
        connectionName: String(connection?.connectionName || "").trim(),
        visibilityScope: resolvedVisibility.visibilityScope,
        accountVisibilityRules: serializeConnectionRules(connectionVisibility),
        sourceAccounts,
        updatedAt: connection?.updatedAt || null,
        lastBankFetchAt: connection?.lastBankFetchAt || null,
        connected: hasConnectionCredentials(connection),
      };
    });
}

async function applyConnectionExpenseVisibility({
  householdId,
  sourceConnectionKey,
  connectionCompanyId = "",
  uniqueCompanyConnectionMap = new Map(),
  connectionVisibilityMap,
  fallbackOwnerUserId,
  sourceAccountId = "",
}) {
  const connectionKey = String(sourceConnectionKey || "").trim();
  if (!householdId || !connectionKey) return;
  const connectionMatch = buildConnectionExpenseMatch({
    sourceConnectionKey: connectionKey,
    connectionCompanyId,
    uniqueCompanyConnectionMap,
  });
  if (!connectionMatch) return;

  const normalizedSourceAccountId = normalizeSourceAccountId(sourceAccountId);
  if (normalizedSourceAccountId) {
    const visibility = resolveExpenseVisibilityForConnection({
      sourceConnectionKey: connectionKey,
      sourceAccountId: normalizedSourceAccountId,
      connectionVisibilityMap,
      fallbackOwnerUserId,
    });
    await Expense.updateMany(
      {
        householdId,
        ...connectionMatch,
        sourceAccountId: normalizedSourceAccountId,
      },
      {
        $set: {
          visibilityScope: visibility.visibilityScope,
          visibleToUserId: visibility.visibleToUserId,
        },
      },
    );
    return;
  }

  const defaultVisibility = resolveExpenseVisibilityForConnection({
    sourceConnectionKey: connectionKey,
    sourceAccountId: "",
    connectionVisibilityMap,
    fallbackOwnerUserId,
  });
  await Expense.updateMany(
    {
      householdId,
      ...connectionMatch,
    },
    {
      $set: {
        visibilityScope: defaultVisibility.visibilityScope,
        visibleToUserId: defaultVisibility.visibleToUserId,
      },
    },
  );

  const connectionVisibility = connectionVisibilityMap.get(connectionKey);
  const rules = Array.isArray(connectionVisibility?.accountVisibilityRules)
    ? connectionVisibility.accountVisibilityRules
    : [];
  for (const rule of rules) {
    const ruleAccountId = normalizeSourceAccountId(rule?.sourceAccountId);
    if (!ruleAccountId) continue;
    const ruleVisibility = resolveExpenseVisibilityForConnection({
      sourceConnectionKey: connectionKey,
      sourceAccountId: ruleAccountId,
      connectionVisibilityMap,
      fallbackOwnerUserId,
    });
    await Expense.updateMany(
      {
        householdId,
        ...connectionMatch,
        sourceAccountId: ruleAccountId,
      },
      {
        $set: {
          visibilityScope: ruleVisibility.visibilityScope,
          visibleToUserId: ruleVisibility.visibleToUserId,
        },
      },
    );
  }
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

  const sourceAccountsByConnection = await getSourceAccountsByConnection(
    household,
  );
  const connections = getSerializedConnections(household, sourceAccountsByConnection);
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
  const requestedVisibility = parseRequestedVisibilityScope(req.body || {});
  if (!requestedVisibility.valid) {
    return res.status(400).json({
      message: "visibilityScope must be one of: shared, private",
    });
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
    const resolvedVisibility = resolveConnectionVisibility({
      scope: requestedVisibility.hasValue
        ? requestedVisibility.value
        : existingAsObject.visibilityScope,
      ownerUserId: requestedVisibility.hasValue
        ? requestedVisibility.value === "private"
          ? req.user?._id
          : null
        : existingAsObject.ownerUserId,
      fallbackOwnerUserId: req.user?._id,
    });
    household.bankConnections[updatedIndex] = {
      ...existingAsObject,
      ...nextConnection,
      visibilityScope: resolvedVisibility.visibilityScope,
      ownerUserId: resolvedVisibility.ownerUserId,
    };
  } else {
    const resolvedVisibility = resolveConnectionVisibility({
      scope: requestedVisibility.hasValue
        ? requestedVisibility.value
        : "shared",
      ownerUserId:
        requestedVisibility.hasValue && requestedVisibility.value === "private"
          ? req.user?._id
          : null,
      fallbackOwnerUserId: req.user?._id,
    });
    household.bankConnections.push({
      ...nextConnection,
      visibilityScope: resolvedVisibility.visibilityScope,
      ownerUserId: resolvedVisibility.ownerUserId,
    });
    updatedIndex = household.bankConnections.length - 1;
  }

  await household.save();

  const savedConnection = household.bankConnections[updatedIndex];
  const sourceConnectionKey = String(savedConnection?._id || "").trim();
  const connectionCompanyId = normalizeCompanyId(savedConnection?.companyId);
  const uniqueCompanyConnectionMap = buildUniqueCompanyConnectionMap(household);
  const connectionVisibilityMap = buildHouseholdConnectionVisibilityMap(household);
  await applyConnectionExpenseVisibility({
    householdId: household._id,
    sourceConnectionKey,
    connectionCompanyId,
    uniqueCompanyConnectionMap,
    connectionVisibilityMap,
    fallbackOwnerUserId: req.user?._id,
  });
  const connectedCount = household.bankConnections.filter(hasConnectionCredentials).length;
  res.json({
    success: true,
    connected: connectedCount > 0,
    connectedCount,
    connection: {
      id: String(savedConnection?._id || ""),
      companyId: savedConnection?.companyId || "",
      connectionName: savedConnection?.connectionName || "",
      visibilityScope: normalizeVisibilityScope(savedConnection?.visibilityScope),
      accountVisibilityRules: serializeConnectionRules(
        connectionVisibilityMap.get(sourceConnectionKey),
      ),
      updatedAt: savedConnection?.updatedAt || null,
      lastBankFetchAt: savedConnection?.lastBankFetchAt || null,
      connected: hasConnectionCredentials(savedConnection),
    },
  });
}

export async function setBankConnectionAccountVisibility(req, res) {
  if (!isHouseholdManager(req.user)) {
    return res.status(403).json({
      message: "Only household managers can add or remove bank connections",
    });
  }

  const connectionId = String(req.params?.connectionId || "").trim();
  if (!connectionId) {
    return res.status(400).json({ message: "connectionId is required" });
  }

  const sourceAccountId = normalizeSourceAccountId(req.body?.sourceAccountId);
  if (!sourceAccountId) {
    return res.status(400).json({ message: "sourceAccountId is required" });
  }

  const rawVisibilityScope = String(req.body?.visibilityScope || "")
    .trim()
    .toLowerCase();
  if (rawVisibilityScope !== "shared" && rawVisibilityScope !== "private") {
    return res.status(400).json({
      message: "visibilityScope must be one of: shared, private",
    });
  }

  const household = await getHouseholdWithConnections(req, res);
  if (!household) return;

  const connectionIndex = household.bankConnections.findIndex(
    (connection) => String(connection?._id || "") === connectionId,
  );
  if (connectionIndex < 0) {
    return res.status(404).json({ message: "Bank connection not found" });
  }

  const connection = household.bankConnections[connectionIndex];
  const connectionObject =
    connection && typeof connection.toObject === "function"
      ? connection.toObject()
      : connection || {};
  const resolvedConnectionVisibility = resolveConnectionVisibility({
    scope: connectionObject.visibilityScope,
    ownerUserId: connectionObject.ownerUserId,
    fallbackOwnerUserId: req.user?._id,
  });
  const resolvedRuleVisibility = resolveConnectionVisibility({
    scope: rawVisibilityScope,
    ownerUserId: rawVisibilityScope === "private" ? req.user?._id : null,
    fallbackOwnerUserId:
      resolvedConnectionVisibility.ownerUserId || req.user?._id,
  });

  const currentRules = Array.isArray(connectionObject.accountVisibilityRules)
    ? connectionObject.accountVisibilityRules
    : [];
  const remainingRules = currentRules.filter(
    (rule) => normalizeSourceAccountId(rule?.sourceAccountId) !== sourceAccountId,
  );

  const sameAsConnectionDefault =
    resolvedRuleVisibility.visibilityScope ===
      resolvedConnectionVisibility.visibilityScope &&
    (resolvedRuleVisibility.visibilityScope !== "private" ||
      String(resolvedRuleVisibility.ownerUserId || "") ===
        String(resolvedConnectionVisibility.ownerUserId || ""));

  if (!sameAsConnectionDefault) {
    remainingRules.push({
      sourceAccountId,
      visibilityScope: resolvedRuleVisibility.visibilityScope,
      ownerUserId:
        resolvedRuleVisibility.visibilityScope === "private"
          ? resolvedRuleVisibility.ownerUserId || req.user?._id || null
          : null,
      updatedAt: new Date(),
    });
  }

  household.bankConnections[connectionIndex] = {
    ...connectionObject,
    accountVisibilityRules: remainingRules,
    updatedAt: new Date(),
  };

  await household.save();

  const connectionVisibilityMap = buildHouseholdConnectionVisibilityMap(household);
  const uniqueCompanyConnectionMap = buildUniqueCompanyConnectionMap(household);
  await applyConnectionExpenseVisibility({
    householdId: household._id,
    sourceConnectionKey: connectionId,
    connectionCompanyId: normalizeCompanyId(connectionObject.companyId),
    uniqueCompanyConnectionMap,
    sourceAccountId,
    connectionVisibilityMap,
    fallbackOwnerUserId: req.user?._id,
  });

  const finalVisibility = resolveExpenseVisibilityForConnection({
    sourceConnectionKey: connectionId,
    sourceAccountId,
    connectionVisibilityMap,
    fallbackOwnerUserId: req.user?._id,
  });

  res.json({
    success: true,
    connectionId,
    sourceAccountId,
    visibilityScope: finalVisibility.visibilityScope,
    accountVisibilityRules: serializeConnectionRules(
      connectionVisibilityMap.get(connectionId),
    ),
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
