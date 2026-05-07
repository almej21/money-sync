import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../src/config/db.js";
import Expense from "../src/models/Expense.js";

const DEFAULT_SOURCE = "israeli-bank-scrapers";
const DEFAULT_SINCE_DAYS = 120;
const DEFAULT_MAX_DATE_DIFF_DAYS = 10;
const MATCH_TEXT_MIN_TOKEN_LENGTH = 2;

function parseArgs(argv = []) {
  const args = {
    apply: false,
    householdId: "",
    source: DEFAULT_SOURCE,
    sinceDays: DEFAULT_SINCE_DAYS,
    maxDateDiffDays: DEFAULT_MAX_DATE_DIFF_DAYS,
    verbose: false,
  };

  for (const raw of argv) {
    const part = String(raw || "").trim();
    if (!part) continue;
    if (part === "--apply") args.apply = true;
    if (part === "--verbose") args.verbose = true;
    if (part.startsWith("--householdId=")) {
      args.householdId = part.slice("--householdId=".length).trim();
    }
    if (part.startsWith("--source=")) {
      args.source = part.slice("--source=".length).trim() || DEFAULT_SOURCE;
    }
    if (part.startsWith("--sinceDays=")) {
      const parsed = Number(part.slice("--sinceDays=".length));
      if (Number.isFinite(parsed) && parsed > 0) args.sinceDays = parsed;
    }
    if (part.startsWith("--maxDateDiffDays=")) {
      const parsed = Number(part.slice("--maxDateDiffDays=".length));
      if (Number.isFinite(parsed) && parsed > 0) args.maxDateDiffDays = parsed;
    }
  }

  return args;
}

function toDateOrNull(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function subtractUtcDays(value, days) {
  const parsed = toDateOrNull(value);
  if (!parsed) return null;
  const next = new Date(parsed);
  next.setUTCDate(next.getUTCDate() - Math.max(0, Number(days || 0)));
  return next;
}

function normalizeTextForMatch(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function tokenizeForMatch(value = "") {
  return normalizeTextForMatch(value)
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= MATCH_TEXT_MIN_TOKEN_LENGTH);
}

function hasTextAffinity(leftValue = "", rightValue = "") {
  const left = normalizeTextForMatch(leftValue);
  const right = normalizeTextForMatch(rightValue);
  if (!left || !right) return false;
  if (left === right || left.includes(right) || right.includes(left)) {
    return true;
  }

  const leftTokens = new Set(tokenizeForMatch(left));
  const rightTokens = tokenizeForMatch(right);
  if (!leftTokens.size || !rightTokens.length) return false;
  return rightTokens.some((token) => leftTokens.has(token));
}

function buildComparableTextValues(expense = {}) {
  const merchant = normalizeTextForMatch(expense.merchant);
  const description = normalizeTextForMatch(expense.description);
  return [merchant, description].filter(Boolean);
}

function hasPendingPostedTextMatch(pending = {}, candidate = {}) {
  const pendingTextValues = buildComparableTextValues(pending);
  const candidateTextValues = buildComparableTextValues(candidate);
  if (!pendingTextValues.length || !candidateTextValues.length) {
    return false;
  }
  return pendingTextValues.some((pendingText) =>
    candidateTextValues.some((candidateText) =>
      hasTextAffinity(pendingText, candidateText),
    ),
  );
}

function toMatchAmount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "0.00";
  return Math.abs(parsed).toFixed(2);
}

function buildPendingPostedSignature(expense = {}) {
  return [
    String(expense.householdId || "").trim(),
    String(expense.sourceConnectionKey || "").trim(),
    String(expense.sourceCompanyId || "").trim(),
    String(expense.sourceAccountId || "").trim(),
    String(expense.transactionType || "expense").trim().toLowerCase(),
    toMatchAmount(expense.amount),
  ].join("|");
}

function summarizePair(pending = {}, candidate = {}) {
  return {
    pendingId: String(pending._id || ""),
    postedId: String(candidate._id || ""),
    householdId: String(pending.householdId || candidate.householdId || ""),
    sourceConnectionKey: String(
      pending.sourceConnectionKey || candidate.sourceConnectionKey || "",
    ),
    sourceAccountId: String(
      pending.sourceAccountId || candidate.sourceAccountId || "",
    ),
    amount: pending.amount,
    pendingDate: pending.date,
    postedDate: candidate.date,
    pendingDescription: pending.description,
    postedDescription: candidate.description,
    pendingExternalId: pending.externalId || null,
    postedExternalId: candidate.externalId || null,
    pendingIsUserAltered: Boolean(pending.isUserAltered),
    postedIsUserAltered: Boolean(candidate.isUserAltered),
  };
}

async function runCleanup({
  apply,
  householdId,
  source,
  sinceDays,
  maxDateDiffDays,
  verbose,
}) {
  const sinceDate = subtractUtcDays(new Date(), sinceDays);
  const query = {
    source: String(source || DEFAULT_SOURCE).trim() || DEFAULT_SOURCE,
  };
  if (householdId) {
    query.householdId = householdId;
  }

  const rawRows = await Expense.find(query)
    .select({
      _id: 1,
      householdId: 1,
      sourceConnectionKey: 1,
      sourceCompanyId: 1,
      sourceAccountId: 1,
      transactionType: 1,
      amount: 1,
      status: 1,
      merchant: 1,
      description: 1,
      category: 1,
      notes: 1,
      tags: 1,
      editedBy: 1,
      createdBy: 1,
      isUserAltered: 1,
      externalId: 1,
      date: 1,
      updatedAt: 1,
    })
    .lean();
  const rows = rawRows.filter((row) => {
    if (!sinceDate) return true;
    const parsed = toDateOrNull(row?.date);
    if (!parsed) return false;
    return parsed.getTime() >= sinceDate.getTime();
  });

  const postedBySignature = new Map();
  const pendingRows = [];
  for (const row of rows) {
    const signature = buildPendingPostedSignature(row);
    if (!signature) continue;
    const status = String(row.status || "").trim().toLowerCase();
    if (status === "pending") {
      pendingRows.push({ ...row, __signature: signature });
      continue;
    }
    if (!postedBySignature.has(signature)) postedBySignature.set(signature, []);
    postedBySignature.get(signature).push(row);
  }

  const maxDateDiffMs =
    Math.max(1, Number(maxDateDiffDays || DEFAULT_MAX_DATE_DIFF_DAYS)) *
    24 *
    60 *
    60 *
    1000;
  let matchedPairs = 0;
  let mergedUserEdits = 0;
  let deletedPending = 0;
  const samples = [];

  for (const pending of pendingRows) {
    const candidates = postedBySignature.get(pending.__signature) || [];
    if (!candidates.length) continue;
    const pendingDate = toDateOrNull(pending.date);

    const match = candidates
      .map((candidate) => {
        const candidateDate = toDateOrNull(candidate.date);
        const diffMs =
          pendingDate && candidateDate
            ? Math.abs(candidateDate.getTime() - pendingDate.getTime())
            : Number.MAX_SAFE_INTEGER;
        return {
          candidate,
          diffMs,
          textMatched: hasPendingPostedTextMatch(pending, candidate),
        };
      })
      .filter((item) => {
        if (item.diffMs > maxDateDiffMs) return false;
        if (item.textMatched) return true;
        return Boolean(pending.isUserAltered);
      })
      .sort((a, b) => a.diffMs - b.diffMs)[0];

    if (!match) continue;
    matchedPairs += 1;
    if (samples.length < 25) {
      samples.push(summarizePair(pending, match.candidate));
    }

    const matchedCandidateId = String(match.candidate?._id || "").trim();
    if (matchedCandidateId) {
      const remaining = candidates.filter(
        (candidate) => String(candidate?._id || "").trim() !== matchedCandidateId,
      );
      if (remaining.length > 0) {
        postedBySignature.set(pending.__signature, remaining);
      } else {
        postedBySignature.delete(pending.__signature);
      }
    }

    if (!apply) continue;

    if (pending.isUserAltered && !match.candidate.isUserAltered) {
      const nextTags = Array.isArray(pending.tags)
        ? pending.tags.filter((tag) => String(tag || "").trim())
        : [];
      const mergeSet = {
        isUserAltered: true,
        editedBy:
          pending.editedBy || match.candidate.editedBy || match.candidate.createdBy,
        updatedAt: new Date(),
      };
      if (String(pending.description || "").trim()) {
        mergeSet.description = String(pending.description || "").trim();
      }
      if (String(pending.category || "").trim()) {
        mergeSet.category = String(pending.category || "").trim();
      }
      if (String(pending.notes || "").trim()) {
        mergeSet.notes = String(pending.notes || "").trim();
      }
      if (nextTags.length > 0) {
        mergeSet.tags = nextTags;
      }
      // eslint-disable-next-line no-await-in-loop
      const mergeResult = await Expense.updateOne(
        { _id: match.candidate._id },
        { $set: mergeSet },
      );
      mergedUserEdits += Number(mergeResult.modifiedCount || 0);
    }

    // eslint-disable-next-line no-await-in-loop
    const deleteResult = await Expense.deleteOne({ _id: pending._id });
    deletedPending += Number(deleteResult.deletedCount || 0);
  }

  const summary = {
    mode: apply ? "apply" : "dry-run",
    householdId: householdId || null,
    source,
    sinceDate: sinceDate ? sinceDate.toISOString() : null,
    maxDateDiffDays,
    scannedRows: rows.length,
    pendingRows: pendingRows.length,
    matchedPairs,
    mergedUserEdits,
    deletedPending,
    samplePairs: samples,
  };

  if (verbose || !apply) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    const compactSummary = {
      mode: summary.mode,
      householdId: summary.householdId,
      scannedRows: summary.scannedRows,
      pendingRows: summary.pendingRows,
      matchedPairs: summary.matchedPairs,
      mergedUserEdits: summary.mergedUserEdits,
      deletedPending: summary.deletedPending,
    };
    console.log(JSON.stringify(compactSummary, null, 2));
  }

  return summary;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await connectDB();
  try {
    await runCleanup(args);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(
    `[cleanup-duplicate-expenses] failed: ${error?.message || String(error)}`,
  );
  process.exitCode = 1;
});
