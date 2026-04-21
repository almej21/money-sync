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
    byExternalId: args.has("--by-external-id"),
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
      "  --by-external-id  Group by externalId identity (best for dedup/backfill transitions)",
      "  --help, -h        Show this help",
    ].join("\n"),
  );
}

function sortDocsByKeepPriority(docs = []) {
  return [...docs].sort((a, b) => {
    const aIsUserAltered = Boolean(a?.isUserAltered) ? 1 : 0;
    const bIsUserAltered = Boolean(b?.isUserAltered) ? 1 : 0;
    if (aIsUserAltered !== bIsUserAltered) return bIsUserAltered - aIsUserAltered;

    const aIsInstallments =
      String(a?.sourceTransactionType || "")
        .trim()
        .toLowerCase() === "installments"
        ? 1
        : 0;
    const bIsInstallments =
      String(b?.sourceTransactionType || "")
        .trim()
        .toLowerCase() === "installments"
        ? 1
        : 0;
    if (aIsInstallments !== bIsInstallments) return bIsInstallments - aIsInstallments;

    const aHasInstallmentPlan =
      Number.isFinite(Number(a?.installmentNumber)) &&
      Number(a?.installmentNumber) > 0 &&
      Number.isFinite(Number(a?.installmentTotal)) &&
      Number(a?.installmentTotal) > 0
        ? 1
        : 0;
    const bHasInstallmentPlan =
      Number.isFinite(Number(b?.installmentNumber)) &&
      Number(b?.installmentNumber) > 0 &&
      Number.isFinite(Number(b?.installmentTotal)) &&
      Number(b?.installmentTotal) > 0
        ? 1
        : 0;
    if (aHasInstallmentPlan !== bHasInstallmentPlan) {
      return bHasInstallmentPlan - aHasInstallmentPlan;
    }

    const aIsCharged = a?.isInstallmentCharged === true ? 1 : 0;
    const bIsCharged = b?.isInstallmentCharged === true ? 1 : 0;
    if (aIsCharged !== bIsCharged) return bIsCharged - aIsCharged;

    const aUpdatedAt = new Date(a?.updatedAt || 0).getTime();
    const bUpdatedAt = new Date(b?.updatedAt || 0).getTime();
    if (aUpdatedAt !== bUpdatedAt) return bUpdatedAt - aUpdatedAt;

    const aCreatedAt = new Date(a?.createdAt || 0).getTime();
    const bCreatedAt = new Date(b?.createdAt || 0).getTime();
    if (aCreatedAt !== bCreatedAt) return bCreatedAt - aCreatedAt;

    return String(a?._id || "").localeCompare(String(b?._id || ""));
  });
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
  const externalIdGroupId = {
    householdId: "$householdId",
    source: "$source",
    sourceConnectionKey: "$sourceConnectionKey",
    sourceCompanyId: "$sourceCompanyId",
    sourceAccountId: "$sourceAccountId",
    externalId: "$externalId",
    transactionType: "$transactionType",
  };

  let groupId = strictGroupId;
  if (options.byExternalId) {
    groupId = externalIdGroupId;
  } else if (options.byVisibleFields) {
    groupId = visibleFieldsGroupId;
  }

  const groupMatchStage = options.byExternalId
    ? { externalId: { $nin: ["", null] } }
    : {};

  const duplicateGroups = await Expense.aggregate([
    { $match: matchStage },
    { $match: groupMatchStage },
    {
      $group: {
        _id: groupId,
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
    byExternalId: options.byExternalId,
    sample: [],
  };

  for (const group of duplicateGroups) {
    const docs = await Expense.find({ _id: { $in: group.ids } })
      .select({
        _id: 1,
        description: 1,
        category: 1,
        isUserAltered: 1,
        sourceTransactionType: 1,
        installmentNumber: 1,
        installmentTotal: 1,
        isInstallmentCharged: 1,
        updatedAt: 1,
        createdAt: 1,
      });

    if (docs.length <= 1) continue;

    const sortedDocs = sortDocsByKeepPriority(docs);
    const keepDoc = sortedDocs[0];
    const deleteDocs = sortedDocs.slice(1);

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
