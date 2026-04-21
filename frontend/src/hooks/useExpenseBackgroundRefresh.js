import { useEffect } from "react";
import { getExpenseSyncStatus } from "../services/expenseService";

const POLL_INTERVAL_MS = 4000;
const MAX_POLL_DURATION_MS = 5 * 60 * 1000;

export function useExpenseBackgroundRefresh(
  loadExpenses,
  onRunningChange = () => {},
) {
  useEffect(() => {
    let active = true;
    let timer = null;

    async function run() {
      const pollStartedAtMs = Date.now();
      // Show the loading snackbar immediately when a polling cycle starts.
      onRunningChange(true);
      const initial = await getExpenseSyncStatus().catch(() => null);
      if (!active) return;
      if (!initial?.sync) {
        timer = setTimeout(run, POLL_INTERVAL_MS);
        return;
      }
      const initialReason = String(initial.sync.lastResult?.reason || "");
      if (
        !initial.sync.running &&
        (initialReason === "cooldown" ||
          initialReason === "all_connections_on_cooldown")
      ) {
        onRunningChange(false);
        return;
      }

      // Keep loading indicator visible while we are polling sync status.
      onRunningChange(true);
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
          timer = setTimeout(poll, POLL_INTERVAL_MS);
          return;
        }

        const sync = status.sync;
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
  }, [loadExpenses, onRunningChange]);
}
