import { useEffect } from "react";
import { api } from "../api";

const POLL_INTERVAL_MS = 2500;
const MAX_POLLS = 12;

export function useExpenseBackgroundRefresh(loadExpenses, onRunningChange = () => {}) {
  useEffect(() => {
    let active = true;
    let timer = null;

    async function run() {
      const initial = await api("/expenses/sync-status").catch(() => null);
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
      let polls = 0;

      const poll = async () => {
        if (!active) return;
        polls += 1;

        const status = await api("/expenses/sync-status").catch(() => null);
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

        if (polls >= MAX_POLLS) {
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
