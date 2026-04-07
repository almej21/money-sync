import dotenv from "dotenv";
import mongoose from "mongoose";
import { connectDB } from "../src/config/db.js";
import Household from "../src/models/Household.js";
import User from "../src/models/User.js";
import { ensureHouseholdBankConnections } from "../src/services/householdBankConnections.js";

dotenv.config();

function parseArgs(argv = []) {
  const args = new Set(argv);
  return {
    help: args.has("--help") || args.has("-h"),
    write: args.has("--write"),
    cleanupUserLegacy: args.has("--cleanup-user-legacy"),
    verbose: args.has("--verbose"),
  };
}

function printHelp() {
  console.log(
    [
      "One-time migration: move bank connections from users to households.",
      "",
      "Usage:",
      "  npm --prefix backend run migrate:household-bank-connections -- [flags]",
      "",
      "Flags:",
      "  --write                 Persist changes (without this flag: dry run)",
      "  --cleanup-user-legacy   After successful migration, clear legacy user bank fields",
      "  --verbose               Log each migrated household",
      "  --help, -h              Show this help",
    ].join("\n"),
  );
}

function formatResult(stats) {
  return {
    scannedHouseholds: stats.scannedHouseholds,
    householdsAlreadyMigrated: stats.householdsAlreadyMigrated,
    householdsMigrated: stats.householdsMigrated,
    householdsWithoutSourceData: stats.householdsWithoutSourceData,
    migratedFromUserIds: stats.migratedFromUserIds.size,
    userLegacyDocsCleared: stats.userLegacyDocsCleared,
    dryRun: stats.dryRun,
    cleanupUserLegacy: stats.cleanupUserLegacy,
  };
}

async function clearLegacyUserBankData(householdId) {
  const result = await User.updateMany(
    { householdId },
    {
      $set: {
        bankCredentials: {
          companyId: "",
          usernameEnc: "",
          nationalIdEnc: "",
          passwordEnc: "",
          encryptedFields: {},
          updatedAt: null,
        },
        "expenseSyncMeta.lastBankFetchAt": null,
      },
    },
  );

  return Number(result.modifiedCount || 0);
}

async function runMigration() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const stats = {
    scannedHouseholds: 0,
    householdsAlreadyMigrated: 0,
    householdsMigrated: 0,
    householdsWithoutSourceData: 0,
    migratedFromUserIds: new Set(),
    userLegacyDocsCleared: 0,
    dryRun: !options.write,
    cleanupUserLegacy: options.cleanupUserLegacy,
  };

  await connectDB();

  const cursor = Household.find({})
    .select({ _id: 1, bankConnections: 1 })
    .cursor();

  for await (const household of cursor) {
    stats.scannedHouseholds += 1;
    const existingCount = Array.isArray(household.bankConnections)
      ? household.bankConnections.length
      : 0;
    if (existingCount > 0) {
      stats.householdsAlreadyMigrated += 1;
      if (options.cleanupUserLegacy && options.write) {
        const clearedCount = await clearLegacyUserBankData(household._id);
        stats.userLegacyDocsCleared += clearedCount;
      }
      continue;
    }

    const users = await User.find(
      { householdId: household._id },
      {
        _id: 1,
        role: 1,
        bankCredentials: 1,
        expenseSyncMeta: 1,
      },
    );

    const { migrated, sourceUserId } = await ensureHouseholdBankConnections(
      household,
      { users },
    );

    if (!migrated) {
      stats.householdsWithoutSourceData += 1;
      continue;
    }

    if (options.verbose) {
      console.log(
        `[migration] household=${String(household._id)} sourceUser=${sourceUserId || "unknown"} connections=${household.bankConnections.length}`,
      );
    }

    if (options.write) {
      await household.save();
      if (options.cleanupUserLegacy) {
        const clearedCount = await clearLegacyUserBankData(household._id);
        stats.userLegacyDocsCleared += clearedCount;
      }
    }

    stats.householdsMigrated += 1;
    if (sourceUserId) {
      stats.migratedFromUserIds.add(String(sourceUserId));
    }
  }

  console.log(JSON.stringify(formatResult(stats), null, 2));
}

runMigration()
  .catch((error) => {
    console.error(
      JSON.stringify(
        {
          ok: false,
          message: error?.message || "Migration failed",
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close();
  });
