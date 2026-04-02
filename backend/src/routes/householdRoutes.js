import { Router } from "express";
import {
  acceptInvitation,
  getHouseholdOverview,
  inviteUserToHousehold,
  listMyInvitations,
} from "../controllers/householdController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);
router.get("/", getHouseholdOverview);
router.get("/invitations/mine", listMyInvitations);
router.post("/invitations", inviteUserToHousehold);
router.post("/invitations/:invitationId/accept", acceptInvitation);

export default router;
