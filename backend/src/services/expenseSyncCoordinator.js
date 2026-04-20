import mongoose from "mongoose";
import Household from "../models/Household.js";
import { syncLastMonthExpensesForUser } from "./bankSyncService.js";

const syncStateByUserId = new Map();
const runningSyncPromiseByUserId = new Map();
const DEFAULT_SYNC_TIMEOUT_MS = 25_000;
const DEFAULT_SYNC_MIN_INTERVAL_MS = 2 * 60 * 1000;

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

function waitForPromiseWithTimeout(promise, timeoutMs) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
  return Promise.race([
    promise,
    new Promise((resolve) => {
      setTimeout(() => resolve("timeout"), timeoutMs);
    }),
  ]);
}

async function runWithTimeout(promise, timeoutMs, errorMessage) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const timeoutError = new Error(errorMessage);
          timeoutError.code = "SYNC_TIMEOUT";
          reject(timeoutError);
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function triggerExpenseSyncForUser(
  user,
  reason = "unknown",
  options = {},
) {
  const userId = String(user?._id || "");
  if (!userId) return null;

  const awaitCompletion = Boolean(options?.awaitCompletion);
  const timeoutMs = Number(options?.timeoutMs || 0);
  const state = getOrCreateState(userId);
  const now = Date.now();
  const minIntervalMs = Number(
    process.env.BANK_SYNC_MIN_INTERVAL_MS || DEFAULT_SYNC_MIN_INTERVAL_MS,
  );

  state.lastTriggerReason = reason;
  if (state.running) {
    if (awaitCompletion) {
      const runningPromise = runningSyncPromiseByUserId.get(userId);
      if (runningPromise) {
        await waitForPromiseWithTimeout(runningPromise, timeoutMs);
      }
    }
    return state;
  }
  const lastStartedMs = state.lastStartedAt instanceof Date
    ? state.lastStartedAt.getTime()
    : null;
  const isWithinThrottleWindow =
    Number.isFinite(minIntervalMs) &&
    minIntervalMs > 0 &&
    Number.isFinite(lastStartedMs) &&
    now - lastStartedMs < minIntervalMs;
  if (isWithinThrottleWindow && !awaitCompletion) {
    return state;
  }

  state.running = true;
  state.lastStartedAt = new Date(now);
  state.lastError = null;
  const fetchStartedAt = state.lastStartedAt;
  const syncTimeoutMs = Number(
    process.env.BANK_SYNC_TIMEOUT_MS || DEFAULT_SYNC_TIMEOUT_MS,
  );

  const syncPromise = Promise.resolve()
    .then(async () => {
      console.log(`[BANK SYNC COORD] started userId=${userId} reason=${reason}`);
      const result = await runWithTimeout(
        syncLastMonthExpensesForUser(user),
        syncTimeoutMs,
        `Bank sync timed out after ${syncTimeoutMs}ms`,
      );
      state.lastResult = result || null;
      console.log(
        `[BANK SYNC COORD] completed userId=${userId} reason=${reason} imported=${Number(
          result?.imported || 0,
        )} total=${Number(result?.total || 0)} resultReason=${String(
          result?.reason || "-",
        )}`,
      );
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
      console.warn(
        `[BANK SYNC COORD] failed userId=${userId} reason=${reason} error="${state.lastError}"`,
      );
    })
    .finally(() => {
      state.running = false;
      state.lastCompletedAt = new Date();
      runningSyncPromiseByUserId.delete(userId);
    });

  runningSyncPromiseByUserId.set(userId, syncPromise);
  if (awaitCompletion) {
    await waitForPromiseWithTimeout(syncPromise, timeoutMs);
  }

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
