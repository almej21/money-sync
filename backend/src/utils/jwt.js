import jwt from "jsonwebtoken";

export function signToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), householdId: user.householdId?.toString() },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" },
  );
}
