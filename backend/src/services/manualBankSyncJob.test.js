import test from "node:test";
import assert from "node:assert/strict";
import { LambdaClient } from "@aws-sdk/client-lambda";
import Household from "../models/Household.js";
import { enqueueManualBankSync, runManualBankSyncJob } from "./manualBankSyncJob.js";

test("reserves a job and invokes the same Lambda asynchronously", async (t) => {
  const previousName = process.env.AWS_LAMBDA_FUNCTION_NAME;
  process.env.AWS_LAMBDA_FUNCTION_NAME = "api-function";
  t.after(() => {
    if (previousName === undefined) delete process.env.AWS_LAMBDA_FUNCTION_NAME;
    else process.env.AWS_LAMBDA_FUNCTION_NAME = previousName;
  });
  let reservation;
  t.mock.method(Household, "findOneAndUpdate", async (filter, update) => {
    reservation = { filter, update };
    return {};
  });
  let invocation;
  t.mock.method(LambdaClient.prototype, "send", async (command) => { invocation = command.input; });
  const jobId = await enqueueManualBankSync({ _id: "user", householdId: "household" }, "connection");
  assert.equal(reservation.update.$set.manualBankSync.jobId, jobId);
  assert.equal(invocation.FunctionName, "api-function");
  assert.equal(invocation.InvocationType, "Event");
  assert.deepEqual(JSON.parse(Buffer.from(invocation.Payload).toString()), {
    type: "manualBankSync", jobId, householdId: "household", userId: "user", connectionId: "connection",
  });
});

test("does not invoke when another job holds the reservation", async (t) => {
  t.mock.method(Household, "findOneAndUpdate", async () => null);
  const send = t.mock.method(LambdaClient.prototype, "send", async () => {});
  assert.equal(await enqueueManualBankSync({ _id: "user", householdId: "household" }, "connection"), null);
  assert.equal(send.mock.callCount(), 0);
});

test("ignores a duplicate or expired worker invocation", async (t) => {
  t.mock.method(Household, "findOneAndUpdate", async () => null);
  const update = t.mock.method(Household, "updateOne", async () => {});
  await runManualBankSyncJob({ jobId: "job", householdId: "household", userId: "user", connectionId: "connection" });
  assert.equal(update.mock.callCount(), 0);
});
