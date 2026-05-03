import { connectDB } from "./config/db.js";
import { runDailyBankSyncJob } from "./services/dailyBankSyncJob.js";

export async function handler() {
  await connectDB();
  const result = await runDailyBankSyncJob();
  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: true,
      ...result,
    }),
  };
}
