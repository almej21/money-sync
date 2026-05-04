import { useEffect } from "react";
import { getExpenseSyncStatus } from "../services/expenseService";

const POLL_INTERVAL_MS = 4000;
const MAX_POLL_DURATION_MS = 5 * 60 * 1000;
const SYNC_STATUS_COOLDOWN_MS = 60 * 60 * 1000;
const LAST_TRIGGER_STORAGE_PREFIX = "expense_sync_status_last_trigger_at";

function buildLastTriggerKey(syncScopeKey = "global") {
  const normalizedScope = String(syncScopeKey || "").trim() || "global";
  return `${LAST_TRIGGER_STORAGE_PREFIX}:${normalizedScope}`;
}

function getLastTriggerAtMs(syncScopeKey) {
  if (typeof window === "undefined") return 0;
  try {
    const key = buildLastTriggerKey(syncScopeKey);
    const rawValue = window.localStorage.getItem(key);
    const parsed = Number(rawValue);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

function setLastTriggerAtMs(syncScopeKey, timestampMs) {
  if (typeof window === "undefined") return;
  try {
    const key = buildLastTriggerKey(syncScopeKey);
    window.localStorage.setItem(key, String(Math.max(0, Number(timestampMs || 0))));
  } catch {
    // Ignore storage errors and continue without cooldown persistence.
  }
}

export function useExpenseBackgroundRefresh(
  loadExpenses,
  onRunningChange = () => {},
  { syncScopeKey = "global" } = {},
) {
  useEffect(() => {
    let active = true;
    let timer = null;

    async function run() {
      const nowMs = Date.now();
      const lastTriggerAtMs = getLastTriggerAtMs(syncScopeKey);
      if (
        lastTriggerAtMs > 0 &&
        nowMs - lastTriggerAtMs < SYNC_STATUS_COOLDOWN_MS
      ) {
        onRunningChange(false);
        return;
      }

      setLastTriggerAtMs(syncScopeKey, nowMs);
      const pollStartedAtMs = Date.now();
      const initial = await getExpenseSyncStatus().catch(() => null);
      if (!active) return;
      if (!initial?.sync) {
        onRunningChange(false);
        timer = setTimeout(run, POLL_INTERVAL_MS);
        return;
      }
      onRunningChange(Boolean(initial.sync.running));
      const initialReason = String(initial.sync.lastResult?.reason || "");
      if (
        !initial.sync.running &&
        (initialReason === "cooldown" ||
          initialReason === "all_connections_on_cooldown")
      ) {
        onRunningChange(false);
        return;
      }

      const startedAt = initial.sync.lastStartedAt;

      const poll = async () => {
        if (!active) return;
        if (Date.now() - pollStartedAtMs >= MAX_POLL_DURATION_MS) {
          onRunningChange(false);
          return;
        }

        const status = await getExpenseSyncStatus().catch(() => null);
        if (!active) return;
        if (!status?.sync) {
          onRunningChange(false);
          timer = setTimeout(poll, POLL_INTERVAL_MS);
          return;
        }

        const sync = status.sync;
        onRunningChange(Boolean(sync.running));
        const hasCompletedAfterStart =
          Boolean(sync.lastCompletedAt) &&
          (!startedAt ||
            new Date(sync.lastCompletedAt).getTime() >=
              new Date(startedAt).getTime());

        if (!sync.running && hasCompletedAfterStart) {
          await loadExpenses();
          onRunningChange(false);
          return;
        }

        timer = setTimeout(poll, POLL_INTERVAL_MS);
      };

      timer = setTimeout(poll, POLL_INTERVAL_MS);
    }

    run();
    return () => {
      active = false;
      onRunningChange(false);
      if (timer) clearTimeout(timer);
    };
  }, [loadExpenses, onRunningChange, syncScopeKey]);
}
