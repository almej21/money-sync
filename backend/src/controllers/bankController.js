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

function hasCredentials(user) {
  const companyId = String(user?.bankCredentials?.companyId || "").trim();
  if (!companyId) return false;

  const requiredFields = getApiLoginFields(companyId)
    .filter((field) => field.required)
    .map((field) => field.name);
  const storedFields = toStoredEncryptedFields(user?.bankCredentials);

  return requiredFields.every((fieldName) => Boolean(storedFields[fieldName]));
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

  res.json({
    connected: hasCredentials(user),
    companyId: user.bankCredentials?.companyId || "",
    updatedAt: user.bankCredentials?.updatedAt || null,
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

  const encryptedFields = {};
  for (const [key, value] of Object.entries(credentials)) {
    if (!value) continue;
    encryptedFields[key] = encryptValue(value);
  }

  user.bankCredentials = {
    companyId: normalizedCompanyId,
    usernameEnc: encryptedFields.username || "",
    nationalIdEnc: encryptedFields.nationalID || "",
    passwordEnc: encryptedFields.password || "",
    encryptedFields,
    updatedAt: new Date(),
  };
  await user.save();

  res.json({ success: true, connected: true });
}

export async function deleteBankCredentials(req, res) {
  const user = await User.findById(req.user._id);
  if (!user) return res.status(404).json({ message: "User not found" });

  user.bankCredentials = {
    companyId: "",
    usernameEnc: "",
    nationalIdEnc: "",
    passwordEnc: "",
    encryptedFields: {},
    updatedAt: null,
  };
  await user.save();

  res.json({ success: true, connected: false });
}
