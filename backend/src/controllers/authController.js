import bcrypt from "bcryptjs";
import User from "../models/User.js";
import Household from "../models/Household.js";
import { signToken } from "../utils/jwt.js";

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
    householdId: household._id,
  });

  household.members.push(user._id);
  await household.save();

  const token = signToken(user);
  res.status(201).json({
    token,
    user: {
      id: user._id,
      email: user.email,
      name: user.name,
      householdId: user.householdId,
    },
  });
}

export async function login(req, res) {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.status(401).json({ message: "Invalid credentials" });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ message: "Invalid credentials" });

  const token = signToken(user);
  res.json({
    token,
    user: {
      id: user._id,
      email: user.email,
      name: user.name,
      householdId: user.householdId,
    },
  });
}

export async function me(req, res) {
  res.json({
    user: {
      id: req.user._id,
      email: req.user.email,
      name: req.user.name,
      householdId: req.user.householdId,
    },
  });
}
