import { Router } from "express";
import {
  createManualExpense,
  createExpense,
  deleteManualExpense,
  deleteExpense,
  importExpenses,
  listManualExpenses,
  listExpenseChanges,
  listExpenses,
  syncStatus,
  summary,
  updateManualExpense,
  updateExpense,
} from "../controllers/expenseController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);
router.get("/", listExpenses);
router.get("/changes", listExpenseChanges);
router.get("/sync-status", syncStatus);
router.get("/summary", summary);
router.post("/", createExpense);
router.get("/manual", listManualExpenses);
router.post("/manual", createManualExpense);
router.put("/manual/:id", updateManualExpense);
router.delete("/manual/:id", deleteManualExpense);
router.post("/import", importExpenses);
router.put("/:id", updateExpense);
router.delete("/:id", deleteExpense);

export default router;
