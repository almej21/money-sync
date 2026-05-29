import bcrypt from "bcryptjs";
import crypto from "crypto";
import User from "../models/User.js";
import Household from "../models/Household.js";
import Expense from "../models/Expense.js";
import { buildExpenseVisibilityFilter } from "../services/expenseVisibility.js";
import { markHouseholdActive } from "../services/householdActivity.js";
import { sendPasswordResetEmail } from "../services/emailService.js";
import { signToken } from "../utils/jwt.js";

const DEFAULT_RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 8;

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

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function hashToken(rawToken) {
  return crypto.createHash("sha256").update(String(rawToken || "")).digest("hex");
}

function resolvePasswordResetTtlMs() {
  const configured = Number(process.env.PASSWORD_RESET_TOKEN_TTL_MS);
  if (!Number.isFinite(configured) || configured <= 0) {
    return DEFAULT_RESET_TOKEN_TTL_MS;
  }
  return configured;
}

function resolveClientUrlBase() {
  const explicitBase = String(process.env.PASSWORD_RESET_URL_BASE || "")
    .trim()
    .replace(/\/+$/, "");
  if (explicitBase) return explicitBase;

  const fromCorsList = String(process.env.CLIENT_URL || "")
    .split(",")
    .map((value) => value.trim().replace(/\/+$/, ""))
    .find(Boolean);
  return fromCorsList || "";
}

function buildPasswordResetUrl(rawToken) {
  const base = resolveClientUrlBase();
  if (!base) {
    if (String(process.env.NODE_ENV || "").trim().toLowerCase() === "production") {
      throw new Error(
        "Missing PASSWORD_RESET_URL_BASE (or CLIENT_URL) for production password reset emails",
      );
    }
    return `http://localhost:5173/reset-password/${encodeURIComponent(rawToken)}`;
  }
  return `${base}/reset-password/${encodeURIComponent(rawToken)}`;
}

function validateNewPassword(password) {
  const value = String(password || "");
  if (value.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  return "";
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
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || "");
  const name = String(req.body?.name || "").trim();
  const householdName = req.body?.householdName;

  if (!email || !password || !name) {
    return res.status(400).json({ message: "Email, password and name are required" });
  }

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
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || "");
  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

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

export async function requestPasswordReset(req, res) {
  const email = normalizeEmail(req.body?.email);
  if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }

  const genericMessage =
    "If an account with that email exists, a password reset link has been sent.";
  const user = await User.findOne({ email });
  if (!user) {
    return res.json({ message: genericMessage });
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  user.passwordResetTokenHash = hashToken(rawToken);
  user.passwordResetTokenExpiresAt = new Date(
    Date.now() + resolvePasswordResetTtlMs(),
  );
  await user.save();

  const resetUrl = buildPasswordResetUrl(rawToken);

  try {
    await sendPasswordResetEmail({
      to: user.email,
      name: user.name,
      resetUrl,
    });
  } catch (error) {
    console.error(
      `[AUTH] Failed sending password reset email to ${email}: ${error?.message || String(error)}`,
    );
    return res.status(500).json({ message: "Failed to send password reset email" });
  }

  return res.json({ message: genericMessage });
}

export async function resetPassword(req, res) {
  const rawToken = String(req.params?.token || "").trim();
  const nextPassword = String(req.body?.password || "");
  const passwordConfirm = String(req.body?.passwordConfirm || "");

  if (!rawToken) {
    return res.status(400).json({ message: "Reset token is required" });
  }

  const validationError = validateNewPassword(nextPassword);
  if (validationError) {
    return res.status(400).json({ message: validationError });
  }

  if (nextPassword !== passwordConfirm) {
    return res.status(400).json({ message: "Passwords do not match" });
  }

  const tokenHash = hashToken(rawToken);
  const user = await User.findOne({
    passwordResetTokenHash: tokenHash,
    passwordResetTokenExpiresAt: { $gt: new Date() },
  });
  if (!user) {
    return res.status(400).json({ message: "Reset link is invalid or expired" });
  }

  user.passwordHash = await bcrypt.hash(nextPassword, 10);
  user.passwordResetTokenHash = "";
  user.passwordResetTokenExpiresAt = null;
  await user.save();

  return res.json({ message: "Password has been reset successfully" });
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
