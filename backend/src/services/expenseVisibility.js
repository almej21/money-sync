import mongoose from "mongoose";

export const EXPENSE_VISIBILITY_SHARED = "shared";
export const EXPENSE_VISIBILITY_PRIVATE = "private";

function normalizeObjectIdString(value) {
  const normalized = String(value || "").trim();
  if (!normalized || !mongoose.isValidObjectId(normalized)) return "";
  return normalized;
}

function normalizeSourceAccountId(value) {
  return String(value || "").trim();
}

export function normalizeVisibilityScope(
  value,
  fallback = EXPENSE_VISIBILITY_SHARED,
) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (normalized === EXPENSE_VISIBILITY_PRIVATE) {
    return EXPENSE_VISIBILITY_PRIVATE;
  }
  if (normalized === EXPENSE_VISIBILITY_SHARED) {
    return EXPENSE_VISIBILITY_SHARED;
  }
  return fallback;
}

export function resolveConnectionVisibility({
  scope,
  ownerUserId,
  fallbackOwnerUserId = "",
}) {
  const visibilityScope = normalizeVisibilityScope(scope);
  if (visibilityScope === EXPENSE_VISIBILITY_SHARED) {
    return {
      visibilityScope: EXPENSE_VISIBILITY_SHARED,
      ownerUserId: null,
    };
  }

  const ownerCandidate =
    normalizeObjectIdString(ownerUserId) ||
    normalizeObjectIdString(fallbackOwnerUserId);

  return {
    visibilityScope: EXPENSE_VISIBILITY_PRIVATE,
    ownerUserId: ownerCandidate || null,
  };
}

export function buildExpenseVisibilityFilter(userOrUserId) {
  const userId = normalizeObjectIdString(
    typeof userOrUserId === "string" ? userOrUserId : userOrUserId?._id,
  );
  const orClauses = [
    { visibilityScope: { $exists: false } },
    { visibilityScope: EXPENSE_VISIBILITY_SHARED },
  ];

  if (userId) {
    orClauses.push({
      visibilityScope: EXPENSE_VISIBILITY_PRIVATE,
      $or: [
        { visibleToUserId: new mongoose.Types.ObjectId(userId) },
        { $expr: { $eq: [{ $toString: "$visibleToUserId" }, userId] } },
      ],
    });
  }

  return { $or: orClauses };
}

export function buildHouseholdConnectionVisibilityMap(household) {
  const map = new Map();
  const connections = Array.isArray(household?.bankConnections)
    ? household.bankConnections
    : [];

  for (const connection of connections) {
    const connectionKey = String(connection?._id || "").trim();
    if (!connectionKey) continue;
    const resolved = resolveConnectionVisibility({
      scope: connection?.visibilityScope,
      ownerUserId: connection?.ownerUserId,
    });
    const accountVisibilityRules = Array.isArray(
      connection?.accountVisibilityRules,
    )
      ? connection.accountVisibilityRules
          .map((rule) => {
            const sourceAccountId = normalizeSourceAccountId(
              rule?.sourceAccountId,
            );
            if (!sourceAccountId) return null;
            const resolvedRule = resolveConnectionVisibility({
              scope: rule?.visibilityScope,
              ownerUserId: rule?.ownerUserId,
              fallbackOwnerUserId: resolved.ownerUserId,
            });
            return {
              sourceAccountId,
              visibilityScope: resolvedRule.visibilityScope,
              ownerUserId: resolvedRule.ownerUserId,
            };
          })
          .filter(Boolean)
      : [];
    map.set(connectionKey, {
      ...resolved,
      accountVisibilityRules,
    });
  }

  return map;
}

export function resolveExpenseVisibilityForConnection({
  sourceConnectionKey = "",
  sourceAccountId = "",
  connectionVisibilityMap = new Map(),
  fallbackOwnerUserId = "",
}) {
  const connectionKey = String(sourceConnectionKey || "").trim();
  if (!connectionKey) {
    return {
      visibilityScope: EXPENSE_VISIBILITY_SHARED,
      visibleToUserId: null,
    };
  }

  const connectionVisibility = connectionVisibilityMap.get(connectionKey);
  if (!connectionVisibility) {
    return {
      visibilityScope: EXPENSE_VISIBILITY_SHARED,
      visibleToUserId: null,
    };
  }

  const normalizedSourceAccountId = normalizeSourceAccountId(sourceAccountId);
  if (normalizedSourceAccountId) {
    const rules = Array.isArray(connectionVisibility.accountVisibilityRules)
      ? connectionVisibility.accountVisibilityRules
      : [];
    const matchedRule = rules.find(
      (rule) => rule.sourceAccountId === normalizedSourceAccountId,
    );
    if (matchedRule) {
      const resolvedRule = resolveConnectionVisibility({
        scope: matchedRule.visibilityScope,
        ownerUserId: matchedRule.ownerUserId,
        fallbackOwnerUserId:
          connectionVisibility.ownerUserId || fallbackOwnerUserId,
      });
      return {
        visibilityScope: resolvedRule.visibilityScope,
        visibleToUserId:
          resolvedRule.visibilityScope === EXPENSE_VISIBILITY_PRIVATE
            ? resolvedRule.ownerUserId || null
            : null,
      };
    }
  }

  const resolved = resolveConnectionVisibility({
    scope: connectionVisibility.visibilityScope,
    ownerUserId: connectionVisibility.ownerUserId,
    fallbackOwnerUserId,
  });

  return {
    visibilityScope: resolved.visibilityScope,
    visibleToUserId:
      resolved.visibilityScope === EXPENSE_VISIBILITY_PRIVATE
        ? resolved.ownerUserId || null
        : null,
  };
}
