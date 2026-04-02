import Household from "../models/Household.js";
import HouseholdInvitation from "../models/HouseholdInvitation.js";
import User from "../models/User.js";

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isHouseholdManager(user) {
  return (user?.role || "manager") === "manager";
}

function serializeInvitation(invitation, inviterById = {}) {
  const inviter = inviterById[String(invitation.inviterUserId || "")] || null;
  return {
    id: String(invitation._id || ""),
    householdId: String(invitation.householdId || ""),
    inviteeEmail: invitation.inviteeEmail || "",
    inviter: inviter
      ? {
          id: String(inviter._id || ""),
          name: inviter.name || "",
          email: inviter.email || "",
        }
      : null,
    status: invitation.status,
    createdAt: invitation.createdAt,
  };
}

export async function getHouseholdOverview(req, res) {
  const household = await Household.findById(req.user.householdId);
  if (!household) return res.status(404).json({ message: "Household not found" });

  const members = await User.find(
    { householdId: household._id },
    { _id: 1, email: 1, name: 1, role: 1 },
  ).sort({ createdAt: 1 });

  let pendingInvitations = [];
  if (isHouseholdManager(req.user)) {
    const invitations = await HouseholdInvitation.find({
      householdId: household._id,
      status: "pending",
    }).sort({ createdAt: -1 });

    const inviterIds = Array.from(
      new Set(invitations.map((item) => String(item.inviterUserId || ""))),
    );
    const inviters = await User.find(
      { _id: { $in: inviterIds } },
      { _id: 1, name: 1, email: 1 },
    );
    const inviterById = Object.fromEntries(
      inviters.map((user) => [String(user._id), user]),
    );
    pendingInvitations = invitations.map((item) =>
      serializeInvitation(item, inviterById),
    );
  }

  res.json({
    household: {
      id: String(household._id),
      name: household.name,
    },
    members: members.map((member) => ({
      id: String(member._id),
      name: member.name,
      email: member.email,
      role: member.role || "member",
    })),
    canManageHousehold: isHouseholdManager(req.user),
    pendingInvitations,
  });
}

export async function inviteUserToHousehold(req, res) {
  if (!isHouseholdManager(req.user)) {
    return res
      .status(403)
      .json({ message: "Only household managers can invite users" });
  }

  const inviteeEmail = normalizeEmail(req.body?.email);
  if (!inviteeEmail) {
    return res.status(400).json({ message: "Email is required" });
  }

  const [manager, invitee] = await Promise.all([
    User.findById(req.user._id),
    User.findOne({ email: inviteeEmail }),
  ]);
  if (!manager) return res.status(404).json({ message: "User not found" });
  if (!invitee) return res.status(404).json({ message: "User with this email not found" });
  if (String(invitee._id) === String(manager._id)) {
    return res.status(400).json({ message: "You cannot invite yourself" });
  }
  if (String(invitee.householdId || "") === String(manager.householdId || "")) {
    return res
      .status(409)
      .json({ message: "This user is already in your household" });
  }

  const existingInvite = await HouseholdInvitation.findOne({
    householdId: manager.householdId,
    inviteeEmail,
    status: "pending",
  });
  if (existingInvite) {
    return res.status(409).json({ message: "An invitation already exists" });
  }

  const invitation = await HouseholdInvitation.create({
    householdId: manager.householdId,
    inviterUserId: manager._id,
    inviteeUserId: invitee._id,
    inviteeEmail,
    status: "pending",
  });

  res.status(201).json({
    invitation: serializeInvitation(invitation, {
      [String(manager._id)]: manager,
    }),
  });
}

export async function listMyInvitations(req, res) {
  const inviteeEmail = normalizeEmail(req.user?.email);
  const invitations = await HouseholdInvitation.find({
    inviteeEmail,
    status: "pending",
  }).sort({ createdAt: -1 });

  const inviterIds = Array.from(
    new Set(invitations.map((item) => String(item.inviterUserId || ""))),
  );
  const inviters = await User.find(
    { _id: { $in: inviterIds } },
    { _id: 1, name: 1, email: 1 },
  );
  const inviterById = Object.fromEntries(
    inviters.map((user) => [String(user._id), user]),
  );

  res.json({
    invitations: invitations.map((item) => serializeInvitation(item, inviterById)),
  });
}

export async function acceptInvitation(req, res) {
  const invitationId = String(req.params?.invitationId || "").trim();
  if (!invitationId) {
    return res.status(400).json({ message: "Invitation id is required" });
  }

  const inviteeEmail = normalizeEmail(req.user?.email);
  const [user, invitation] = await Promise.all([
    User.findById(req.user._id),
    HouseholdInvitation.findOne({
      _id: invitationId,
      inviteeEmail,
      status: "pending",
    }),
  ]);

  if (!user) return res.status(404).json({ message: "User not found" });
  if (!invitation) return res.status(404).json({ message: "Invitation not found" });

  const [targetHousehold, currentHousehold] = await Promise.all([
    Household.findById(invitation.householdId),
    Household.findById(user.householdId),
  ]);
  if (!targetHousehold) {
    return res.status(404).json({ message: "Target household not found" });
  }

  user.householdId = targetHousehold._id;
  user.role = "member";
  await user.save();

  if (currentHousehold) {
    currentHousehold.members = (currentHousehold.members || []).filter(
      (memberId) => String(memberId) !== String(user._id),
    );
    await currentHousehold.save();
  }

  const memberIds = new Set(
    (targetHousehold.members || []).map((memberId) => String(memberId)),
  );
  if (!memberIds.has(String(user._id))) {
    targetHousehold.members.push(user._id);
    await targetHousehold.save();
  }

  invitation.status = "accepted";
  await invitation.save();

  await HouseholdInvitation.updateMany(
    {
      inviteeEmail,
      status: "pending",
      _id: { $ne: invitation._id },
    },
    { $set: { status: "declined" } },
  );

  res.json({ success: true });
}
