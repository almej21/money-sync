import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  deleteBankCredentials,
  getBankCredentialStatus,
  getBankProviders,
  setBankConnectionAccountVisibility,
  setBankCredentials,
  triggerBankConnectionSync,
} from "../controllers/bankController.js";

const router = Router();

router.use(requireAuth);
router.get("/providers", getBankProviders);
router.get("/credentials", getBankCredentialStatus);
router.put("/credentials", setBankCredentials);
router.patch(
  "/credentials/:connectionId/account-visibility",
  setBankConnectionAccountVisibility,
);
router.post("/credentials/:connectionId/sync", triggerBankConnectionSync);
router.delete("/credentials/:connectionId", deleteBankCredentials);
router.delete("/credentials", deleteBankCredentials);

export default router;
