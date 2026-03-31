import mongoose from "mongoose";
import User from "../models/User.js";
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
      const attemptedConnectionKeys = Array.isArray(
        result?.attemptedConnectionKeys,
      )
        ? result.attemptedConnectionKeys.filter((value) =>
            mongoose.isValidObjectId(String(value || "").trim()),
          )
        : [];
      if (attemptedConnectionKeys.length > 0) {
        const fetchedItemsCount = Number(result?.total || 0);
        console.log(
          `DONE FETCHING ITEMS! fetched ${fetchedItemsCount} items`,
        );
      }

      if (attemptedConnectionKeys.length > 0) {
        const attemptedObjectIds = attemptedConnectionKeys.map(
          (value) => new mongoose.Types.ObjectId(String(value)),
        );
        await User.findByIdAndUpdate(
          userId,
          {
            $set: {
              "bankConnections.$[connection].lastBankFetchAt": fetchStartedAt,
            },
          },
          {
            arrayFilters: [{ "connection._id": { $in: attemptedObjectIds } }],
          },
        );

        if (Array.isArray(user?.bankConnections)) {
          for (const connection of user.bankConnections) {
            const key = String(connection?._id || "");
            if (!attemptedConnectionKeys.includes(key)) continue;
            connection.lastBankFetchAt = fetchStartedAt;
          }
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
