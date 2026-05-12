import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { connectDB } from "../src/config/db.js";
import Expense from "../src/models/Expense.js";
import { normalizeExpenseCategory } from "../src/utils/categoryNormalization.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

function parseArgs(argv = []) {
  const args = {
    apply: false,
    householdId: "",
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
  }

  return args;
}

async function runMigration({ apply = false, householdId = "", verbose = false }) {
  const baseFilter = {};
  if (householdId) baseFilter.householdId = householdId;

  const docs = await Expense.find(baseFilter)
    .select({ _id: 1, householdId: 1, category: 1 })
    .lean();

  const updates = [];
  for (const doc of docs) {
    const currentCategory = String(doc?.category || "").trim();
    const normalizedCategory = normalizeExpenseCategory(currentCategory);
    if (!normalizedCategory || normalizedCategory === currentCategory) continue;
    updates.push({
      _id: doc._id,
      householdId: String(doc?.householdId || "").trim(),
      from: currentCategory,
      to: normalizedCategory,
    });
  }

  const summaryByPair = updates.reduce((acc, item) => {
    const key = `${item.from} -> ${item.to}`;
    acc[key] = Number(acc[key] || 0) + 1;
    return acc;
  }, {});

  if (!apply) {
    console.log(
      `[CATEGORY MIGRATION] Dry run complete. Candidates=${updates.length}`,
    );
    console.log(
      `[CATEGORY MIGRATION] Pairs=${JSON.stringify(summaryByPair, null, 2)}`,
    );
    if (verbose && updates.length) {
      console.log(
        `[CATEGORY MIGRATION] Sample=${JSON.stringify(
          updates.slice(0, 50),
          null,
          2,
        )}`,
      );
    }
    return { matched: updates.length, modified: 0 };
  }

  if (!updates.length) {
    console.log("[CATEGORY MIGRATION] No documents needed updates.");
    return { matched: 0, modified: 0 };
  }

  const ops = updates.map((item) => ({
    updateOne: {
      filter: { _id: item._id },
      update: { $set: { category: item.to } },
    },
  }));

  const result = await Expense.bulkWrite(ops, { ordered: false });
  const modified = Number(result?.modifiedCount || 0);
  console.log(
    `[CATEGORY MIGRATION] Applied updates. Matched=${updates.length} Modified=${modified}`,
  );
  console.log(
    `[CATEGORY MIGRATION] Pairs=${JSON.stringify(summaryByPair, null, 2)}`,
  );

  return { matched: updates.length, modified };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await connectDB();
  const result = await runMigration(args);
  console.log(`[CATEGORY MIGRATION] Done: ${JSON.stringify(result)}`);
}

main()
  .catch((error) => {
    console.error(
      `[CATEGORY MIGRATION] Failed: ${error?.stack || error?.message || error}`,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.connection.close();
    } catch {
      // noop
    }
  });
