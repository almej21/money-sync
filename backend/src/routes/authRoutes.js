import { Router } from "express";
import {
  login,
  me,
  requestPasswordReset,
  register,
  resetPassword,
  updatePreferences,
} from "../controllers/authController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.post("/forgot-password", requestPasswordReset);
router.post("/reset-password/:token", resetPassword);
router.get("/me", requireAuth, me);
router.put("/preferences", requireAuth, updatePreferences);

export default router;
