import User from "../models/User.js";
import { syncLastMonthExpensesForUser } from "./bankSyncService.js";

const syncStateByUserId = new Map();
const FETCH_COOLDOWN_MS = 60 * 60 * 1000;

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
  const lastBankFetchAt = user?.expenseSyncMeta?.lastBankFetchAt
    ? new Date(user.expenseSyncMeta.lastBankFetchAt)
    : null;
  const now = Date.now();
  const withinCooldown =
    lastBankFetchAt instanceof Date &&
    !Number.isNaN(lastBankFetchAt.getTime()) &&
    now - lastBankFetchAt.getTime() < FETCH_COOLDOWN_MS;

  state.lastTriggerReason = reason;
  if (withinCooldown) {
    state.lastResult = {
      reason: "cooldown",
      nextFetchAt: new Date(lastBankFetchAt.getTime() + FETCH_COOLDOWN_MS).toISOString(),
    };
    return state;
  }
  if (state.running) return state;

  state.running = true;
  state.lastStartedAt = new Date();
  state.lastError = null;
  const fetchStartedAt = state.lastStartedAt;
  if (!user.expenseSyncMeta) {
    user.expenseSyncMeta = {};
  }
  user.expenseSyncMeta.lastBankFetchAt = fetchStartedAt;

  Promise.resolve()
    .then(async () => {
      await User.findByIdAndUpdate(userId, {
        $set: { "expenseSyncMeta.lastBankFetchAt": fetchStartedAt },
      });
      const result = await syncLastMonthExpensesForUser(user);
      state.lastResult = result || null;
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
