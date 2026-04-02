import { Router } from "express";
import {
  login,
  me,
  register,
  updatePreferences,
} from "../controllers/authController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.get("/me", requireAuth, me);
router.put("/preferences", requireAuth, updatePreferences);

export default router;
