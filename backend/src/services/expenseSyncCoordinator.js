import mongoose from "mongoose";
import Household from "../models/Household.js";
import { syncLastMonthExpensesForUser } from "./bankSyncService.js";

const syncStateByUserId = new Map();

function toIso(value) {
  return value instanceof Date ? value.toISOString() : null;
}

function getOrCreateState(userId) {
  const existing = syncStateByUserId.get(userId);
  if (existing) return existing;

  const initial = {
    running: false,
    lastStartedAt: null,
    lastCompletedAt: null,
    lastError: null,
    lastResult: null,
    lastTriggerReason: null,
  };
  syncStateByUserId.set(userId, initial);
  return initial;
}

export function triggerExpenseSyncForUser(user, reason = "unknown") {
  const userId = String(user?._id || "");
  if (!userId) return null;

  const state = getOrCreateState(userId);

  state.lastTriggerReason = reason;
  if (state.running) return state;

  state.running = true;
  state.lastStartedAt = new Date();
  state.lastError = null;
  const fetchStartedAt = state.lastStartedAt;

  Promise.resolve()
    .then(async () => {
      const result = await syncLastMonthExpensesForUser(user);
      state.lastResult = result || null;
      const successfulConnectionKeys = Array.isArray(
        result?.successfulConnectionKeys,
      )
        ? result.successfulConnectionKeys.filter((value) =>
            mongoose.isValidObjectId(String(value || "").trim()),
          )
        : [];
      if (successfulConnectionKeys.length > 0) {
        const fetchedItemsCount = Number(result?.total || 0);
        console.log(
          `DONE FETCHING ITEMS! fetched ${fetchedItemsCount} items`,
        );
      }

      if (successfulConnectionKeys.length > 0) {
        const successfulObjectIds = successfulConnectionKeys.map(
          (value) => new mongoose.Types.ObjectId(String(value)),
        );
        const householdId = String(user?.householdId || "").trim();
        if (mongoose.isValidObjectId(householdId)) {
          await Household.findByIdAndUpdate(
            householdId,
            {
              $set: {
                "bankConnections.$[connection].lastBankFetchAt": fetchStartedAt,
              },
            },
            {
              arrayFilters: [{ "connection._id": { $in: successfulObjectIds } }],
            },
          );
        }
      }
    })
    .catch((err) => {
      state.lastError = err?.message || "Unknown sync error";
    })
    .finally(() => {
      state.running = false;
      state.lastCompletedAt = new Date();
    });

  return state;
}

export function getExpenseSyncState(userId) {
  const normalizedUserId = String(userId || "");
  if (!normalizedUserId || !syncStateByUserId.has(normalizedUserId)) {
    return {
      running: false,
      lastStartedAt: null,
      lastCompletedAt: null,
      lastError: null,
      lastResult: null,
      lastTriggerReason: null,
    };
  }

  const state = syncStateByUserId.get(normalizedUserId);
  return {
    running: Boolean(state.running),
    lastStartedAt: toIso(state.lastStartedAt),
    lastCompletedAt: toIso(state.lastCompletedAt),
    lastError: state.lastError || null,
    lastResult: state.lastResult || null,
    lastTriggerReason: state.lastTriggerReason || null,
  };
}
