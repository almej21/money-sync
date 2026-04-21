import User from "../models/User.js";

export function toStoredEncryptedFields(bankCredentials = {}) {
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

function hasLegacyCredentials(user = {}) {
  const legacyCompanyId = String(user?.bankCredentials?.companyId || "").trim();
  const legacyEncryptedFields = toStoredEncryptedFields(user?.bankCredentials);
  return Boolean(
    legacyCompanyId && Object.keys(legacyEncryptedFields).length > 0,
  );
}

function chooseMigrationSource(users = [], preferredUserId = "") {
  const preferredId = String(preferredUserId || "").trim();
  if (preferredId) {
    const preferredUser = users.find(
      (user) => String(user?._id || "") === preferredId,
    );
    if (preferredUser && hasLegacyCredentials(preferredUser)) {
      return preferredUser;
    }
  }

  const managerWithData = users.find(
    (user) =>
      (user?.role || "manager") === "manager" &&
      hasLegacyCredentials(user),
  );
  if (managerWithData) return managerWithData;

  return users.find((user) => hasLegacyCredentials(user));
}

function migrateFromLegacyUserSnapshot(user = {}) {
  const legacyCompanyId = String(user?.bankCredentials?.companyId || "").trim();
  const legacyEncryptedFields = toStoredEncryptedFields(user?.bankCredentials);
  if (!legacyCompanyId || Object.keys(legacyEncryptedFields).length === 0) {
    return [];
  }

  return [
    {
      companyId: legacyCompanyId,
      connectionName: "",
      visibilityScope: "shared",
      ownerUserId: null,
      accountVisibilityRules: [],
      usernameEnc: user?.bankCredentials?.usernameEnc || "",
      nationalIdEnc: user?.bankCredentials?.nationalIdEnc || "",
      passwordEnc: user?.bankCredentials?.passwordEnc || "",
      encryptedFields: legacyEncryptedFields,
      updatedAt: user?.bankCredentials?.updatedAt || null,
      lastBankFetchAt: user?.expenseSyncMeta?.lastBankFetchAt || null,
    },
  ];
}

export async function ensureHouseholdBankConnections(
  household,
  { preferredUserId = "", users = null, loadUsers = false } = {},
) {
  const existingConnections = Array.isArray(household?.bankConnections)
    ? household.bankConnections
    : [];
  if (existingConnections.length > 0) {
    return { migrated: false, sourceUserId: null };
  }

  let householdUsers = Array.isArray(users) ? users : [];
  if (!householdUsers.length && loadUsers && household?._id) {
    householdUsers = await User.find(
      { householdId: household._id },
      {
        _id: 1,
        role: 1,
        bankCredentials: 1,
        expenseSyncMeta: 1,
      },
    );
  }
  if (!householdUsers.length) {
    return { migrated: false, sourceUserId: null };
  }

  const sourceUser = chooseMigrationSource(householdUsers, preferredUserId);
  if (!sourceUser) {
    return { migrated: false, sourceUserId: null };
  }

  const nextConnections = migrateFromLegacyUserSnapshot(sourceUser);

  if (!nextConnections.length) {
    return { migrated: false, sourceUserId: null };
  }

  household.bankConnections = nextConnections;
  return { migrated: true, sourceUserId: String(sourceUser._id || "") };
}
