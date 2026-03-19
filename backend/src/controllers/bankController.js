import User from "../models/User.js";
import { encryptValue } from "../services/credentialCrypto.js";

function hasCredentials(user) {
  return Boolean(
    user?.bankCredentials?.companyId &&
      user?.bankCredentials?.usernameEnc &&
      user?.bankCredentials?.nationalIdEnc &&
      user?.bankCredentials?.passwordEnc,
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
  if (!companyId || !username || !nationalID || !password) {
    return res.status(400).json({
      message: "companyId, username, nationalID and password are required",
    });
  }

  const user = await User.findById(req.user._id);
  if (!user) return res.status(404).json({ message: "User not found" });

  user.bankCredentials = {
    companyId: String(companyId),
    usernameEnc: encryptValue(String(username)),
    nationalIdEnc: encryptValue(String(nationalID)),
    passwordEnc: encryptValue(String(password)),
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
