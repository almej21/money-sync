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
      const initial = await getExpenseSyncStatus().catch(() => null);
      if (!active || !initial?.sync) return;
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
      const pollStartedAtMs = Date.now();

      const poll = async () => {
        if (!active) return;

        if (Date.now() - pollStartedAtMs >= MAX_POLL_DURATION_MS) {
          onRunningChange(false);
          return;
        }

        const status = await getExpenseSyncStatus().catch(() => null);
        if (!active || !status?.sync) return;

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
  }, [loadExpenses, onRunningChange]);
}
