import { randomUUID } from "node:crypto";
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import Household from "../models/Household.js";
import { triggerExpenseSyncForUser } from "./expenseSyncCoordinator.js";

const JOB_LIFETIME_MS = 15 * 60 * 1000;
const lambda = new LambdaClient({});

export async function enqueueManualBankSync(user, connectionId) {
  const jobId = randomUUID();
  const now = new Date();
  const householdId = String(user.householdId);
  const reserved = await Household.findOneAndUpdate(
    { _id: householdId, $or: [
      { "manualBankSync.status": { $nin: ["queued", "running"] } },
      { "manualBankSync.expiresAt": { $lte: now } },
    ] },
    { $set: { manualBankSync: { jobId, connectionId, status: "queued", expiresAt: new Date(now.getTime() + JOB_LIFETIME_MS), error: "" } } },
    { new: true },
  );
  if (!reserved) return null;
  try {
    await lambda.send(new InvokeCommand({
      FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
      InvocationType: "Event",
      Payload: Buffer.from(JSON.stringify({ type: "manualBankSync", jobId, householdId, userId: String(user._id), connectionId })),
    }));
  } catch (error) {
    await Household.updateOne({ _id: householdId, "manualBankSync.jobId": jobId }, { $set: { "manualBankSync.status": "failed", "manualBankSync.error": "Unable to start bank sync" } });
    throw error;
  }
  return jobId;
}

export async function runManualBankSyncJob({ jobId, householdId, userId, connectionId }) {
  const job = await Household.findOneAndUpdate(
    { _id: householdId, "manualBankSync.jobId": jobId, "manualBankSync.status": "queued", "manualBankSync.expiresAt": { $gt: new Date() } },
    { $set: { "manualBankSync.status": "running" } },
    { new: true },
  );
  if (!job) return;
  try {
    const state = await triggerExpenseSyncForUser(
      { _id: userId, householdId }, `manual_connection_sync:${connectionId}`,
      { awaitCompletion: true, connectionId },
    );
    const result = state?.lastResult;
    const failure = state?.lastError || (state?.running ? "Bank sync did not finish in time" : "") ||
      (result?.skipped ? "Bank sync is already running. Please try again shortly." : "") ||
      (!result?.successfulConnectionKeys?.includes(connectionId) ? (result?.connections?.[0]?.reason || "Bank sync failed") : "");
    await Household.updateOne({ _id: householdId, "manualBankSync.jobId": jobId }, { $set: { "manualBankSync.status": failure ? "failed" : "completed", "manualBankSync.error": failure || "" } });
  } catch (error) {
    console.error("Manual bank sync job failed", error);
    await Household.updateOne({ _id: householdId, "manualBankSync.jobId": jobId }, { $set: { "manualBankSync.status": "failed", "manualBankSync.error": "Bank sync failed" } });
  }
}
