import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  deleteBankCredentials,
  getBankCredentialStatus,
  getBankProviders,
  setBankCredentials,
} from "../controllers/bankController.js";

const router = Router();

router.use(requireAuth);
router.get("/providers", getBankProviders);
router.get("/credentials", getBankCredentialStatus);
router.put("/credentials", setBankCredentials);
router.delete("/credentials", deleteBankCredentials);

export default router;
