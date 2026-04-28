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
  };
}

function printHelp() {
  console.log(
    [
      "One-time cleanup: remove legacy pending rows when matching posted rows exist.",
      "",
      "Match criteria:",
      "  - same householdId/source/sourceCompanyId/sourceAccountId/transactionType",
      "  - same amount",
      "  - same merchant OR same description",
      "  - same UTC day (works even when date is stored as string)",
      "",
      "Safety rules:",
      "  1) keep posted row",
      "  2) if pending row has user edits and posted row does not, copy those edits to posted row",
      "  3) delete only the matching pending row",
      "",
      "Usage:",
      "  npm --prefix backend run cleanup:legacy-pending-expenses -- [flags]",
      "",
      "Flags:",
      "  --write      Persist updates/deletions (default: dry run)",
      "  --help, -h   Show this help",
    ].join("\n"),
  );
}

function toText(value) {
  return String(value || "").trim();
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDate(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getUtcDayRange(value) {
  const parsed = toDate(value);
  if (!parsed) return null;
  const start = new Date(parsed);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(parsed);
  end.setUTCHours(23, 59, 59, 999);
  return { start, end };
}

function addUtcDays(value, days) {
  const parsed = toDate(value);
  if (!parsed) return null;
  const next = new Date(parsed);
  next.setUTCDate(next.getUTCDate() + Number(days || 0));
  return next;
}

function normalizeStatus(value) {
  return toText(value).toLowerCase() === "pending" ? "pending" : "posted";
}

function buildMergeSet(pendingDoc, postedDoc) {
  if (!pendingDoc?.isUserAltered || postedDoc?.isUserAltered) return null;

  const merged = {
    isUserAltered: true,
    editedBy: pendingDoc.editedBy || postedDoc.editedBy || postedDoc.createdBy,
    updatedAt: new Date(),
  };

  const description = toText(pendingDoc.description);
  const category = toText(pendingDoc.category);
  const notes = toText(pendingDoc.notes);
  const tags = Array.isArray(pendingDoc.tags)
    ? pendingDoc.tags.filter((tag) => toText(tag))
    : [];

  if (description) merged.description = description;
  if (category) merged.category = category;
  if (notes) merged.notes = notes;
  if (tags.length > 0) merged.tags = tags;

  return merged;
}

function sortPostedCandidates(rows = []) {
  return [...rows].sort((a, b) => {
    const aAltered = a?.isUserAltered ? 1 : 0;
    const bAltered = b?.isUserAltered ? 1 : 0;
    if (aAltered !== bAltered) return bAltered - aAltered;

    const aUpdated = toDate(a?.updatedAt)?.getTime() || 0;
    const bUpdated = toDate(b?.updatedAt)?.getTime() || 0;
    if (aUpdated !== bUpdated) return bUpdated - aUpdated;

    const aCreated = toDate(a?.createdAt)?.getTime() || 0;
    const bCreated = toDate(b?.createdAt)?.getTime() || 0;
    if (aCreated !== bCreated) return bCreated - aCreated;

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

  const pendingRows = await Expense.find({
    source: "israeli-bank-scrapers",
    status: "pending",
  })
    .select({
      _id: 1,
      householdId: 1,
      source: 1,
      sourceCompanyId: 1,
      sourceAccountId: 1,
      sourceConnectionKey: 1,
      transactionType: 1,
      amount: 1,
      merchant: 1,
      description: 1,
      date: 1,
      category: 1,
      notes: 1,
      tags: 1,
      isUserAltered: 1,
      editedBy: 1,
      createdBy: 1,
      updatedAt: 1,
      createdAt: 1,
    })
    .lean();

  const stats = {
    dryRun: !options.write,
    scannedPendingRows: pendingRows.length,
    matchedPairs: 0,
    rowsToDelete: 0,
    rowsDeleted: 0,
    rowsToMerge: 0,
    rowsMerged: 0,
    sample: [],
  };

  for (const pendingRow of pendingRows) {
    const dayRange = getUtcDayRange(pendingRow.date);
    if (!dayRange) continue;
    const matchStart = addUtcDays(dayRange.start, -1);
    const matchEnd = addUtcDays(dayRange.end, 2);
    if (!matchStart || !matchEnd) continue;

    const merchant = toText(pendingRow.merchant);
    const description = toText(pendingRow.description);
    const textClauses = [];
    if (merchant) textClauses.push({ merchant });
    if (description) textClauses.push({ description });
    if (!textClauses.length) continue;

    const postedCandidates = await Expense.find({
      _id: { $ne: pendingRow._id },
      householdId: pendingRow.householdId,
      source: pendingRow.source,
      sourceCompanyId: toText(pendingRow.sourceCompanyId),
      sourceAccountId: toText(pendingRow.sourceAccountId),
      transactionType:
        toText(pendingRow.transactionType).toLowerCase() === "return"
          ? "return"
          : "expense",
      amount: toNumber(pendingRow.amount),
      status: { $ne: "pending" },
      $or: textClauses,
      $expr: {
        $and: [
          { $gte: [{ $toDate: "$date" }, matchStart] },
          { $lte: [{ $toDate: "$date" }, matchEnd] },
        ],
      },
    })
      .select({
        _id: 1,
        status: 1,
        isUserAltered: 1,
        editedBy: 1,
        createdBy: 1,
        updatedAt: 1,
        createdAt: 1,
      })
      .lean();

    if (!postedCandidates.length) continue;
    const keepPosted = sortPostedCandidates(postedCandidates)[0];
    const mergeSet = buildMergeSet(pendingRow, keepPosted);

    stats.matchedPairs += 1;
    stats.rowsToDelete += 1;
    if (mergeSet) stats.rowsToMerge += 1;
    if (stats.sample.length < 20) {
      stats.sample.push({
        pendingId: String(pendingRow._id),
        keepPostedId: String(keepPosted._id),
        mergedUserEdits: Boolean(mergeSet),
      });
    }

    if (!options.write) continue;

    if (mergeSet) {
      // eslint-disable-next-line no-await-in-loop
      const mergeResult = await Expense.updateOne(
        { _id: keepPosted._id },
        { $set: mergeSet },
      );
      stats.rowsMerged += Number(mergeResult.modifiedCount || 0);
    }

    // eslint-disable-next-line no-await-in-loop
    const deleteResult = await Expense.deleteOne({ _id: pendingRow._id });
    stats.rowsDeleted += Number(deleteResult.deletedCount || 0);
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
