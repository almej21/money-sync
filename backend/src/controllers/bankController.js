import User from "../models/User.js";
import { encryptValue } from "../services/credentialCrypto.js";

function requiresNationalId(companyId = "") {
  return String(companyId).trim() === "yahav";
}

function hasCredentials(user) {
  const companyId = user?.bankCredentials?.companyId || "";
  const hasBaseCreds = Boolean(
    companyId &&
      user?.bankCredentials?.usernameEnc &&
      user?.bankCredentials?.passwordEnc,
  );
  if (!hasBaseCreds) return false;
  if (!requiresNationalId(companyId)) return true;

  return Boolean(
    user?.bankCredentials?.nationalIdEnc,
  );
}

export async function getBankCredentialStatus(req, res) {
  const user = await User.findById(req.user._id);
  if (!user) return res.status(404).json({ message: "User not found" });

  res.json({
    connected: hasCredentials(user),
    companyId: user.bankCredentials?.companyId || "",
    updatedAt: user.bankCredentials?.updatedAt || null,
  });
}

export async function setBankCredentials(req, res) {
  const { companyId, username, nationalID, password } = req.body;
  const normalizedCompanyId = String(companyId || "").trim();
  const normalizedUsername = String(username || "").trim();
  const normalizedNationalId = String(nationalID || "").trim();
  const normalizedPassword = String(password || "").trim();

  if (!normalizedCompanyId || !normalizedUsername || !normalizedPassword) {
    return res.status(400).json({
      message: "companyId, username and password are required",
    });
  }

  if (requiresNationalId(normalizedCompanyId) && !normalizedNationalId) {
    return res.status(400).json({
      message: "nationalID is required for yahav",
    });
  }

  const user = await User.findById(req.user._id);
  if (!user) return res.status(404).json({ message: "User not found" });

  user.bankCredentials = {
    companyId: normalizedCompanyId,
    usernameEnc: encryptValue(normalizedUsername),
    nationalIdEnc: normalizedNationalId ? encryptValue(normalizedNationalId) : "",
    passwordEnc: encryptValue(normalizedPassword),
    updatedAt: new Date(),
  };
  await user.save();

  res.json({ success: true, connected: true });
}

export async function deleteBankCredentials(req, res) {
  const user = await User.findById(req.user._id);
  if (!user) return res.status(404).json({ message: "User not found" });

  user.bankCredentials = {
    companyId: "",
    usernameEnc: "",
    nationalIdEnc: "",
    passwordEnc: "",
    updatedAt: null,
  };
  await user.save();

  res.json({ success: true, connected: false });
}
