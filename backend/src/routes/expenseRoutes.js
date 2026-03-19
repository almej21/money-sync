import { Router } from "express";
import {
  createExpense,
  deleteExpense,
  importExpenses,
  listExpenses,
  summary,
  updateExpense,
} from "../controllers/expenseController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);
router.get("/", listExpenses);
router.get("/summary", summary);
router.post("/", createExpense);
router.post("/import", importExpenses);
router.put("/:id", updateExpense);
router.delete("/:id", deleteExpense);

export default router;
