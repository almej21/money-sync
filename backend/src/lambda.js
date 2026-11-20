import { handler as apiHandler } from "./app.js";
import { connectDB } from "./config/db.js";
import { runManualBankSyncJob } from "./services/manualBankSyncJob.js";

export async function handler(event, context) {
  if (event?.type === "manualBankSync") {
    await connectDB();
    return runManualBankSyncJob(event);
  }
  return apiHandler(event, context);
}
