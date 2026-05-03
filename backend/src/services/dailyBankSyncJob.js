import Household from "../models/Household.js";
import User from "../models/User.js";
import { triggerExpenseSyncForUser } from "./expenseSyncCoordinator.js";

const DEFAULT_ACTIVE_WINDOW_HOURS = 24 * 5;

function toPositiveNumber(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function pickHouseholdSyncUser(users = []) {
  if (!Array.isArray(users) || users.length === 0) return null;
  const manager = users.find(
    (user) => String(user?.role || "").trim().toLowerCase() === "manager",
  );
  return manager || users[0] || null;
}

function toIso(value) {
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export async function runDailyBankSyncJob() {
  const activeWindowHours = toPositiveNumber(
    process.env.BANK_DAILY_SYNC_ACTIVE_WINDOW_HOURS,
    DEFAULT_ACTIVE_WINDOW_HOURS,
  );
  const cutoff = new Date(Date.now() - activeWindowHours * 60 * 60 * 1000);
  const startedAt = new Date();

  const activeHouseholds = await Household.find({
    lastActiveAt: { $gte: cutoff },
    bankConnections: {
      $elemMatch: {
        companyId: { $exists: true, $nin: ["", null] },
      },
    },
  })
    .select("_id lastActiveAt")
    .sort({ _id: 1 })
    .lean();

  if (!activeHouseholds.length) {
    const summary = {
      startedAt: toIso(startedAt),
      finishedAt: toIso(new Date()),
      activeWindowHours,
      cutoff: toIso(cutoff),
      scannedHouseholds: 0,
      attemptedHouseholds: 0,
      syncedHouseholds: 0,
      failedHouseholds: 0,
      skippedNoUserHouseholds: 0,
      skippedNoActiveHouseholds: true,
      details: [],
    };
    console.log(`[DAILY BANK SYNC] summary=${JSON.stringify(summary)}`);
    return summary;
  }

  const householdIds = activeHouseholds.map((household) => household._id);
  const users = await User.find({
    householdId: { $in: householdIds },
  })
    .select("_id householdId role createdAt")
    .sort({ createdAt: 1 })
    .lean();

  const usersByHouseholdId = new Map();
  for (const user of users) {
    const key = String(user?.householdId || "").trim();
    if (!key) continue;
    if (!usersByHouseholdId.has(key)) {
      usersByHouseholdId.set(key, []);
    }
    usersByHouseholdId.get(key).push(user);
  }

  const details = [];
  let attemptedHouseholds = 0;
  let syncedHouseholds = 0;
  let failedHouseholds = 0;
  let skippedNoUserHouseholds = 0;

  for (const household of activeHouseholds) {
    const householdId = String(household?._id || "").trim();
    const householdUsers = usersByHouseholdId.get(householdId) || [];
    const syncUser = pickHouseholdSyncUser(householdUsers);

    if (!syncUser) {
      skippedNoUserHouseholds += 1;
      details.push({
        householdId,
        userId: null,
        status: "skipped_no_user",
        lastActiveAt: toIso(household?.lastActiveAt),
      });
      continue;
    }

    attemptedHouseholds += 1;
    const state = await triggerExpenseSyncForUser(
      {
        _id: syncUser._id,
        householdId: syncUser.householdId,
      },
      "daily_03_00_active_households",
      { awaitCompletion: true },
    );

    const hasError = Boolean(String(state?.lastError || "").trim());
    if (hasError) {
      failedHouseholds += 1;
      details.push({
        householdId,
        userId: String(syncUser._id || ""),
        status: "failed",
        lastActiveAt: toIso(household?.lastActiveAt),
        error: String(state?.lastError || "Unknown sync error"),
      });
      continue;
    }

    syncedHouseholds += 1;
    details.push({
      householdId,
      userId: String(syncUser._id || ""),
      status: "synced",
      lastActiveAt: toIso(household?.lastActiveAt),
      lastCompletedAt: String(state?.lastCompletedAt || ""),
    });
  }

  const summary = {
    startedAt: toIso(startedAt),
    finishedAt: toIso(new Date()),
    activeWindowHours,
    cutoff: toIso(cutoff),
    scannedHouseholds: activeHouseholds.length,
    attemptedHouseholds,
    syncedHouseholds,
    failedHouseholds,
    skippedNoUserHouseholds,
    skippedNoActiveHouseholds: false,
    details,
  };

  console.log(`[DAILY BANK SYNC] summary=${JSON.stringify(summary)}`);
  return summary;
}
