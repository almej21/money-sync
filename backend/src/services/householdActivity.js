import mongoose from "mongoose";
import Household from "../models/Household.js";

export async function markHouseholdActive(householdId, activeAt = new Date()) {
  const normalizedHouseholdId = String(householdId || "").trim();
  if (!mongoose.isValidObjectId(normalizedHouseholdId)) return false;

  await Household.updateOne(
    { _id: normalizedHouseholdId },
    { $set: { lastActiveAt: activeAt } },
  );
  return true;
}
