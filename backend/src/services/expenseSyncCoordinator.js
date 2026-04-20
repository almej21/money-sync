import mongoose from "mongoose";
import Household from "../models/Household.js";
import { syncLastMonthExpensesForUser } from "./bankSyncService.js";

const syncStateByUserId = new Map();
const runningSyncPromiseByUserId = new Map();
const DEFAULT_SYNC_TIMEOUT_MS = 25_000;
const DEFAULT_SYNC_MIN_INTERVAL_MS = 2 * 60 * 1000;
const DEFAULT_SCRAPE_ATTEMPT_TIMEOUT_MS = 15_000;
const DEFAULT_SCRAPE_RETRY_DELAY_MS = 1_500;
const DEFAULT_SYNC_TIMEOUT_BUFFER_MS = 5_000;
const DEFAULT_SYNC_LOCK_BUFFER_MS = 10_000;

function parseBoolean(value) {
  return String(value).trim().toLowerCase() === "true";
}

function toPositiveNumber(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function summarizeError(error) {
  const message = String(error?.message || "Unknown error");
  const code = String(error?.code || "-");
  const stack = String(error?.stack || "")
    .split("\n")
    .slice(0, 2)
    .join(" | ")
    .trim();
  return { message, code, stack: stack || "-" };
}

function resolveEffectiveSyncTimeoutMs() {
  const configuredTimeoutMs = toPositiveNumber(
    process.env.BANK_SYNC_TIMEOUT_MS,
    DEFAULT_SYNC_TIMEOUT_MS,
  );
  const scrapeAttemptTimeoutMs = toPositiveNumber(
    process.env.BANK_SCRAPE_ATTEMPT_TIMEOUT_MS,
    DEFAULT_SCRAPE_ATTEMPT_TIMEOUT_MS,
  );
  const scrapeRetryDelayMs = toPositiveNumber(
    process.env.BANK_SCRAPER_RETRY_DELAY_MS,
    DEFAULT_SCRAPE_RETRY_DELAY_MS,
  );
  const isLambdaRuntime = Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);
  const expectedAttempts = parseBoolean(process.env.BANK_SCRAPER_SHOW_BROWSER)
    ? 2
    : isLambdaRuntime
      ? 2
      : 3;
  const minimumReasonableTimeoutMs =
    expectedAttempts * scrapeAttemptTimeoutMs +
    Math.max(0, expectedAttempts - 1) * scrapeRetryDelayMs +
    DEFAULT_SYNC_TIMEOUT_BUFFER_MS;

  return Math.max(configuredTimeoutMs, minimumReasonableTimeoutMs);
}

function resolveDistributedLockMs(syncTimeoutMs) {
  const configuredLockMs = toPositiveNumber(process.env.BANK_SYNC_LOCK_MS, 0);
  if (configuredLockMs > 0) return configuredLockMs;
  return syncTimeoutMs + DEFAULT_SYNC_LOCK_BUFFER_MS;
}

async function acquireDistributedSyncLock({
  householdId,
  lockOwner,
  reason,
  lockMs,
}) {
  if (!mongoose.isValidObjectId(householdId)) {
    return {
      acquired: true,
      lockOwner: "-",
      lockUntil: null,
      state: "skipped_invalid_household",
    };
  }
  const now = new Date();
  const lockUntil = new Date(now.getTime() + lockMs);
  const claimed = await Household.findOneAndUpdate(
    {
      _id: householdId,
      $or: [
        { "bankSync.lockUntil": { $exists: false } },
        { "bankSync.lockUntil": null },
        { "bankSync.lockUntil": { $lte: now } },
        { "bankSync.lockOwner": lockOwner },
      ],
    },
    {
      $set: {
        "bankSync.lockUntil": lockUntil,
        "bankSync.lockOwner": lockOwner,
        "bankSync.lastStartedAt": now,
        "bankSync.lastReason": reason,
        "bankSync.updatedAt": now,
      },
    },
    { new: true },
  );
  if (claimed) {
    return {
      acquired: true,
      lockOwner,
      lockUntil,
      state: "acquired",
    };
  }
  const existing = await Household.findById(householdId)
    .select("bankSync.lockUntil bankSync.lockOwner")
    .lean();
  return {
    acquired: false,
    lockOwner: String(existing?.bankSync?.lockOwner || ""),
    lockUntil: existing?.bankSync?.lockUntil || null,
    state: "lock_held",
  };
}

async function releaseDistributedSyncLock({ householdId, lockOwner, reason }) {
  if (!mongoose.isValidObjectId(householdId)) {
    return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
  }
  const completedAt = new Date();
  const releaseResult = await Household.updateOne(
    {
      _id: householdId,
      "bankSync.lockOwner": lockOwner,
    },
    {
      $set: {
        "bankSync.lockUntil": new Date(0),
        "bankSync.lockOwner": "",
        "bankSync.lastCompletedAt": completedAt,
        "bankSync.lastReason": reason,
        "bankSync.updatedAt": completedAt,
      },
    },
  );
  return releaseResult;
}

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
  const householdId = String(user?.householdId || "").trim();
  if (!userId) return null;

  const isLambdaRuntime = Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);
  const awaitCompletion = Boolean(options?.awaitCompletion);
  const timeoutMs = Number(options?.timeoutMs || 0);
  const syncTimeoutMs = resolveEffectiveSyncTimeoutMs();
  const waitTimeoutMs = awaitCompletion
    ? isLambdaRuntime
      ? Math.max(timeoutMs, syncTimeoutMs)
      : timeoutMs
    : timeoutMs;
  const state = getOrCreateState(userId);
  const now = Date.now();
  const minIntervalMs = Number(
    process.env.BANK_SYNC_MIN_INTERVAL_MS || DEFAULT_SYNC_MIN_INTERVAL_MS,
  );

  state.lastTriggerReason = reason;
  if (isLambdaRuntime && !awaitCompletion) {
    console.log(
      `[BANK SYNC COORD] skipped userId=${userId} reason=${reason} state=nonblocking_lambda`,
    );
    return state;
  }
  if (state.running) {
    if (awaitCompletion) {
      const runningPromise = runningSyncPromiseByUserId.get(userId);
      if (runningPromise) {
        const waitResult = await waitForPromiseWithTimeout(
          runningPromise,
          waitTimeoutMs,
        );
        if (waitResult === "timeout") {
          console.warn(
            `[BANK SYNC COORD] wait_timeout userId=${userId} reason=${reason} state=running timeoutMs=${waitTimeoutMs}`,
          );
        }
      }
    }
    return state;
  }
  const lastStartedMs =
    state.lastStartedAt instanceof Date ? state.lastStartedAt.getTime() : null;
  const isWithinThrottleWindow =
    Number.isFinite(minIntervalMs) &&
    minIntervalMs > 0 &&
    Number.isFinite(lastStartedMs) &&
    now - lastStartedMs < minIntervalMs;
  if (isWithinThrottleWindow && !awaitCompletion) {
    return state;
  }

  const lockMs = resolveDistributedLockMs(syncTimeoutMs);
  const lockOwner = `${userId}:${new mongoose.Types.ObjectId().toString()}`;
  const lockResult = await acquireDistributedSyncLock({
    householdId,
    lockOwner,
    reason,
    lockMs,
  });

  if (!lockResult.acquired) {
    console.log(
      `[BANK SYNC COORD] skipped userId=${userId} reason=${reason} state=${lockResult.state} lockOwner=${String(lockResult.lockOwner || "-")} lockUntil=${lockResult.lockUntil ? new Date(lockResult.lockUntil).toISOString() : "-"}`,
    );
    return state;
  }
  console.log(
    `[BANK SYNC COORD] lock_acquired userId=${userId} householdId=${householdId || "-"} reason=${reason} lockOwner=${lockOwner} lockUntil=${lockResult.lockUntil ? new Date(lockResult.lockUntil).toISOString() : "-"} lockMs=${lockMs}`,
  );

  state.running = true;
  state.lastStartedAt = new Date(now);
  state.lastError = null;
  const fetchStartedAt = state.lastStartedAt;
  const runStartedAtMs = Date.now();

  const syncPromise = Promise.resolve()
    .then(async () => {
      console.log(
        `[BANK SYNC COORD] started userId=${userId} householdId=${householdId || "-"} reason=${reason} timeoutMs=${syncTimeoutMs} lockMs=${lockMs} lockOwner=${lockOwner}`,
      );
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
        console.log(`DONE FETCHING ITEMS! fetched ${fetchedItemsCount} items`);
      }

      if (successfulConnectionKeys.length > 0) {
        const successfulObjectIds = successfulConnectionKeys.map(
          (value) => new mongoose.Types.ObjectId(String(value)),
        );
        if (mongoose.isValidObjectId(householdId)) {
          await Household.findByIdAndUpdate(
            householdId,
            {
              $set: {
                "bankConnections.$[connection].lastBankFetchAt": fetchStartedAt,
              },
            },
            {
              arrayFilters: [
                { "connection._id": { $in: successfulObjectIds } },
              ],
            },
          );
        }
      }
    })
    .catch((err) => {
      const errSummary = summarizeError(err);
      state.lastError = errSummary.message;
      console.warn(
        `[BANK SYNC COORD] failed userId=${userId} householdId=${householdId || "-"} reason=${reason} error="${state.lastError}" code=${errSummary.code} stack="${errSummary.stack}"`,
      );
    })
    .finally(async () => {
      state.running = false;
      state.lastCompletedAt = new Date();
      runningSyncPromiseByUserId.delete(userId);
      try {
        const releaseResult = await releaseDistributedSyncLock({
          householdId,
          lockOwner,
          reason,
        });
        console.log(
          `[BANK SYNC COORD] lock_released userId=${userId} reason=${reason} lockOwner=${lockOwner} matched=${Number(releaseResult?.matchedCount || 0)} modified=${Number(releaseResult?.modifiedCount || 0)} durationMs=${Date.now() - runStartedAtMs}`,
        );
      } catch (error) {
        console.warn(
          `[BANK SYNC COORD] failed to release lock userId=${userId} reason=${reason} error="${error?.message || "Unknown lock release error"}"`,
        );
      }
    });

  runningSyncPromiseByUserId.set(userId, syncPromise);
  if (awaitCompletion) {
    const waitResult = await waitForPromiseWithTimeout(syncPromise, waitTimeoutMs);
    if (waitResult === "timeout") {
      console.warn(
        `[BANK SYNC COORD] wait_timeout userId=${userId} reason=${reason} state=await_completion timeoutMs=${waitTimeoutMs}`,
      );
    }
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
