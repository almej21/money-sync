import dotenv from "dotenv";
import mongoose from "mongoose";
import { connectDB } from "../src/config/db.js";
import Expense from "../src/models/Expense.js";

dotenv.config();

function parseArgs(argv = []) {
  const args = new Set(argv);
  return {
    help: args.has("--help") || args.has("-h"),
    write: args.has("--write"),
    includeManual: args.has("--include-manual"),
    byVisibleFields: args.has("--by-visible-fields"),
  };
}

function printHelp() {
  console.log(
    [
      "One-time cleanup: remove likely duplicate expenses.",
      "",
      "Default scope:",
      "  source = israeli-bank-scrapers",
      "",
      "Duplicate grouping key:",
      "  householdId, source, sourceConnectionKey, sourceCompanyId, sourceAccountId,",
      "  date, amount, transactionType, currency, merchant",
      "",
      "Keep rule inside each duplicate group:",
      "  1) prefer isUserAltered=true",
      "  2) then newest updatedAt",
      "  3) then newest createdAt",
      "  4) then lowest _id",
      "",
      "Usage:",
      "  npm --prefix backend run cleanup:duplicate-expenses -- [flags]",
      "",
      "Flags:",
      "  --write           Persist deletions (without this flag: dry run)",
      "  --include-manual  Include non-scraped sources as well",
      "  --by-visible-fields Group by UI-visible identity (date-day/amount/description/account) instead of strict source identity",
      "  --help, -h        Show this help",
    ].join("\n"),
  );
}

async function runCleanup() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  await connectDB();

  const matchStage = options.includeManual
    ? {}
    : { source: "israeli-bank-scrapers" };

  const strictGroupId = {
    householdId: "$householdId",
    source: "$source",
    sourceConnectionKey: "$sourceConnectionKey",
    sourceCompanyId: "$sourceCompanyId",
    sourceAccountId: "$sourceAccountId",
    date: "$date",
    amount: "$amount",
    transactionType: "$transactionType",
    currency: "$currency",
    merchant: "$merchant",
  };
  const visibleFieldsGroupId = {
    householdId: "$householdId",
    source: "$source",
    sourceAccountId: "$sourceAccountId",
    dateDay: {
      $dateToString: {
        format: "%Y-%m-%d",
        date: {
          $convert: {
            input: "$date",
            to: "date",
            onError: null,
            onNull: null,
          },
        },
        timezone: "Asia/Jerusalem",
      },
    },
    amount: "$amount",
    description: "$description",
    merchant: "$merchant",
  };

  const duplicateGroups = await Expense.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: options.byVisibleFields ? visibleFieldsGroupId : strictGroupId,
        ids: { $push: "$_id" },
        count: { $sum: 1 },
      },
    },
    { $match: { count: { $gt: 1 } } },
  ]);

  const stats = {
    scannedGroups: duplicateGroups.length,
    duplicateDocuments: 0,
    docsKept: 0,
    docsDeleted: 0,
    dryRun: !options.write,
    includeManual: options.includeManual,
    byVisibleFields: options.byVisibleFields,
    sample: [],
  };

  for (const group of duplicateGroups) {
    const docs = await Expense.find({ _id: { $in: group.ids } })
      .select({
        _id: 1,
        description: 1,
        category: 1,
        isUserAltered: 1,
        updatedAt: 1,
        createdAt: 1,
      })
      .sort({
        isUserAltered: -1,
        updatedAt: -1,
        createdAt: -1,
        _id: 1,
      });

    if (docs.length <= 1) continue;

    const keepDoc = docs[0];
    const deleteDocs = docs.slice(1);

    stats.duplicateDocuments += docs.length;
    stats.docsKept += 1;
    stats.docsDeleted += deleteDocs.length;

    if (stats.sample.length < 10) {
      stats.sample.push({
        keepId: String(keepDoc._id),
        keepIsUserAltered: Boolean(keepDoc.isUserAltered),
        deleteIds: deleteDocs.map((doc) => String(doc._id)),
      });
    }

    if (!options.write) continue;

    const deleteIds = deleteDocs.map((doc) => doc._id);
    // eslint-disable-next-line no-await-in-loop
    await Expense.deleteMany({ _id: { $in: deleteIds } });
  }

  console.log(JSON.stringify(stats, null, 2));
}

runCleanup()
  .catch((error) => {
    console.error(
      JSON.stringify(
        {
          ok: false,
          message: error?.message || "Cleanup failed",
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
