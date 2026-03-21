import { useEffect } from "react";
import { api } from "../api";

const POLL_INTERVAL_MS = 2500;
const MAX_POLLS = 12;

export function useExpenseBackgroundRefresh(loadExpenses) {
  useEffect(() => {
    let active = true;
    let timer = null;

    async function run() {
      const initial = await api("/expenses/sync-status").catch(() => null);
      if (!active || !initial?.sync) return;
      if (!initial.sync.running && initial.sync.lastResult?.reason === "cooldown") return;

      const startedAt = initial.sync.lastStartedAt;
      let polls = 0;

      const poll = async () => {
        if (!active) return;
        polls += 1;

        const status = await api("/expenses/sync-status").catch(() => null);
        if (!active || !status?.sync) return;

        const sync = status.sync;
        const hasCompletedAfterStart =
          Boolean(sync.lastCompletedAt) &&
          (!startedAt ||
            new Date(sync.lastCompletedAt).getTime() >=
              new Date(startedAt).getTime());

        if (!sync.running && hasCompletedAfterStart) {
          await loadExpenses();
          return;
        }

        if (polls >= MAX_POLLS) return;
        timer = setTimeout(poll, POLL_INTERVAL_MS);
      };

      timer = setTimeout(poll, POLL_INTERVAL_MS);
    }

    run();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [loadExpenses]);
}
