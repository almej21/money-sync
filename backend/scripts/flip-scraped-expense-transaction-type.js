import dotenv from "dotenv";
import mongoose from "mongoose";
import { connectDB } from "../src/config/db.js";
import Expense from "../src/models/Expense.js";
import { createExpenseDedupKey } from "../src/services/expenseDedup.js";

dotenv.config();

function parseArgs(argv = []) {
  const args = new Set(argv);
  return {
    help: args.has("--help") || args.has("-h"),
    write: args.has("--write"),
    batchSize: 500,
  };
}

function printHelp() {
  console.log(
    [
      "One-time migration: flip transactionType for scraped expenses only.",
      "",
      "Scope:",
      "  source = israeli-bank-scrapers",
      "",
      "Rules:",
      "  expense -> return",
      "  return  -> expense",
      "  amount  stays absolute value",
      "",
      "Usage:",
      "  npm --prefix backend run migrate:flip-scraped-expense-transaction-type -- [flags]",
      "",
      "Flags:",
      "  --write      Persist changes (without this flag: dry run)",
      "  --help, -h   Show this help",
    ].join("\n"),
  );
}

function flipTransactionType(value) {
  return value === "return" ? "expense" : "return";
}

async function runMigration() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  await connectDB();

  const stats = {
    scanned: 0,
    changed: 0,
    dryRun: !options.write,
  };

  const cursor = Expense.find({ source: "israeli-bank-scrapers" })
    .select({
      _id: 1,
      amount: 1,
      transactionType: 1,
      dedupKey: 1,
      date: 1,
      currency: 1,
      description: 1,
      merchant: 1,
      sourceCompanyId: 1,
      sourceAccountId: 1,
      sourceAccountName: 1,
    })
    .cursor({ batchSize: options.batchSize });

  const ops = [];
  for await (const expense of cursor) {
    stats.scanned += 1;
    const currentType =
      String(expense.transactionType || "").trim().toLowerCase() === "return"
        ? "return"
        : "expense";
    const nextType = flipTransactionType(currentType);
    const nextAmount = Math.abs(Number(expense.amount || 0));
    const nextDedupKey = createExpenseDedupKey({
      date: expense.date,
      amount: nextAmount,
      transactionType: nextType,
      currency: expense.currency,
      description: expense.description,
      merchant: expense.merchant,
      sourceCompanyId: expense.sourceCompanyId,
      sourceAccountId: expense.sourceAccountId,
      sourceAccountName: expense.sourceAccountName,
    });

    if (
      nextType === currentType &&
      String(expense.dedupKey || "").trim() === nextDedupKey
    ) {
      continue;
    }

    stats.changed += 1;
    if (!options.write) continue;

    ops.push({
      updateOne: {
        filter: { _id: expense._id },
        update: {
          $set: {
            amount: nextAmount,
            transactionType: nextType,
            dedupKey: nextDedupKey,
          },
        },
      },
    });

    if (ops.length >= options.batchSize) {
      // eslint-disable-next-line no-await-in-loop
      await Expense.bulkWrite(ops, { ordered: false });
      ops.length = 0;
    }
  }

  if (options.write && ops.length) {
    await Expense.bulkWrite(ops, { ordered: false });
  }

  console.log(JSON.stringify(stats, null, 2));
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
