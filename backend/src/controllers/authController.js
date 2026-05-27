import bcrypt from "bcryptjs";
import User from "../models/User.js";
import Household from "../models/Household.js";
import Expense from "../models/Expense.js";
import { buildExpenseVisibilityFilter } from "../services/expenseVisibility.js";
import { markHouseholdActive } from "../services/householdActivity.js";
import { signToken } from "../utils/jwt.js";

function normalizeConnectionIds(values = []) {
  if (!Array.isArray(values)) return [];
  return Array.from(
    new Set(
      values
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  );
}

function serializeUser(user) {
  return {
    id: user._id,
    email: user.email,
    name: user.name,
    role: user.role || "manager",
    householdId: user.householdId,
    defaultSelectedBankConnectionIds: normalizeConnectionIds(
      user.defaultSelectedBankConnectionIds,
    ),
  };
}

export async function register(req, res) {
  const { email, password, name, householdName } = req.body;

  const existing = await User.findOne({ email });
  if (existing)
    return res.status(409).json({ message: "Email already exists" });

  const passwordHash = await bcrypt.hash(password, 10);
  const household = await Household.create({
    name: householdName || "My Home",
    members: [],
  });

  const user = await User.create({
    email,
    passwordHash,
    name,
    role: "manager",
    householdId: household._id,
  });

  household.members.push(user._id);
  await household.save();

  const token = signToken(user);
  await markHouseholdActive(user.householdId);
  res.status(201).json({
    token,
    user: serializeUser(user),
  });
}

export async function login(req, res) {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.status(401).json({ message: "Invalid credentials" });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ message: "Invalid credentials" });

  const token = signToken(user);
  await markHouseholdActive(user.householdId);
  res.json({
    token,
    user: serializeUser(user),
  });
}

export async function me(req, res) {
  await markHouseholdActive(req.user.householdId);
  res.json({
    user: serializeUser(req.user),
  });
}

export async function updatePreferences(req, res) {
  const user = await User.findById(req.user._id);
  if (!user) return res.status(404).json({ message: "User not found" });

  if (Object.hasOwn(req.body || {}, "name")) {
    const nextName = String(req.body?.name || "").trim();
    if (!nextName) {
      return res.status(400).json({ message: "Name is required" });
    }
    user.name = nextName.slice(0, 80);
  }

  const nextDefaultIds = normalizeConnectionIds(
    req.body?.defaultSelectedBankConnectionIds,
  );
  const allowedSourceAccountIds = new Set(
    (
      await Expense.distinct("sourceAccountId", {
        householdId: user.householdId,
        ...buildExpenseVisibilityFilter(user),
      })
    )
      .map((value) => String(value || "").trim())
      .filter(Boolean),
  );

  user.defaultSelectedBankConnectionIds = nextDefaultIds.filter((id) =>
    allowedSourceAccountIds.has(id),
  );
  await user.save();

  return res.json({ user: serializeUser(user) });
}
