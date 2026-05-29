import nodemailer from "nodemailer";

let transporter;

function normalize(value) {
  return String(value || "").trim();
}

function parseBoolean(value, fallback = false) {
  const normalized = normalize(value).toLowerCase();
  if (!normalized) return fallback;
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

function resolveMailerConfig() {
  const service = normalize(process.env.SMTP_SERVICE);
  const host = normalize(process.env.SMTP_HOST);
  const portRaw = Number(process.env.SMTP_PORT);
  const port = Number.isFinite(portRaw) ? portRaw : undefined;
  const user = normalize(process.env.SMTP_USER);
  const pass = normalize(process.env.SMTP_PASS);
  const secure =
    process.env.SMTP_SECURE == null
      ? port === 465
      : parseBoolean(process.env.SMTP_SECURE, false);

  if (!service && !host) return null;

  const config = {};
  if (service) config.service = service;
  if (host) config.host = host;
  if (port) config.port = port;
  config.secure = secure;

  if (user || pass) {
    config.auth = { user, pass };
  }

  return config;
}

function getTransporter() {
  if (transporter !== undefined) return transporter;
  const config = resolveMailerConfig();
  if (!config) {
    const isProduction =
      String(process.env.NODE_ENV || "").trim().toLowerCase() === "production";
    if (isProduction) {
      throw new Error(
        "SMTP is not configured in production. Set SMTP_SERVICE or SMTP_HOST and related SMTP_* variables.",
      );
    }
  }
  transporter = config ? nodemailer.createTransport(config) : null;
  return transporter;
}

function getFromAddress() {
  return (
    normalize(process.env.SMTP_FROM) ||
    normalize(process.env.SMTP_USER) ||
    "no-reply@money-sync.local"
  );
}

export async function sendPasswordResetEmail({ to, name, resetUrl }) {
  const emailTo = normalize(to);
  if (!emailTo) {
    throw new Error("Missing recipient email address");
  }

  const userName = normalize(name) || "there";
  const subject = "Reset your password";
  const text = [
    `Hi ${userName},`,
    "",
    "We received a request to reset your password.",
    "Use the link below to set a new password:",
    resetUrl,
    "",
    "If you did not request this, you can ignore this email.",
  ].join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
      <p>Hi ${userName},</p>
      <p>We received a request to reset your password.</p>
      <p>
        <a href="${resetUrl}" style="display:inline-block;padding:10px 16px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;">
          Reset password
        </a>
      </p>
      <p>If the button does not work, use this link:</p>
      <p><a href="${resetUrl}">${resetUrl}</a></p>
      <p>If you did not request this, you can ignore this email.</p>
    </div>
  `;

  const mailer = getTransporter();
  if (!mailer) {
    console.log(
      `[EMAIL] SMTP not configured. Password reset link for ${emailTo}: ${resetUrl}`,
    );
    return;
  }

  await mailer.sendMail({
    from: getFromAddress(),
    to: emailTo,
    subject,
    text,
    html,
  });
}
