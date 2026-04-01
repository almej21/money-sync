import dotenv from "dotenv";
dotenv.config();

import cors from "cors";
import express from "express";
import serverless from "serverless-http";
import { connectDB } from "./config/db.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { requestLogger } from "./middleware/requestLogger.js";
import authRoutes from "./routes/authRoutes.js";
import expenseRoutes from "./routes/expenseRoutes.js";
import shoppingListRoutes from "./routes/shoppingListRoutes.js";
const app = express();
function normalizeOrigin(value) {
  return (value ?? "").trim().replace(/\/+$/, "").toLowerCase();
}
//
const allowedOrigins = (process.env.CLIENT_URL ?? "")
  .split(",")
  .map((origin) => normalizeOrigin(origin))
  .filter(Boolean);

const corsOptions = {
  origin(origin, callback) {
    const normalizedOrigin = normalizeOrigin(origin);

    // Allow non-browser tools (curl/Postman) and same-origin requests.
    if (!origin) return callback(null, true);

    // When no allow-list is configured, keep permissive behavior.
    if (!allowedOrigins.length) return callback(null, true);

    if (allowedOrigins.includes("*")) return callback(null, true);
    if (allowedOrigins.includes(normalizedOrigin)) return callback(null, true);
    return callback(new Error("Origin not allowed by CORS"));
  },
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json());
app.use(requestLogger);

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    next(err);
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/expenses", expenseRoutes);
app.use("/api/shopping-lists", shoppingListRoutes);

let bankRoutesPromise;
async function getBankRoutes() {
  if (!bankRoutesPromise) {
    bankRoutesPromise = import("./routes/bankRoutes.js").then(
      (module) => module.default,
    );
  }
  return bankRoutesPromise;
}

app.use("/api/bank", async (req, res, next) => {
  try {
    const bankRoutes = await getBankRoutes();
    return bankRoutes(req, res, next);
  } catch (err) {
    return next(err);
  }
});

app.use(errorHandler);

const port = process.env.PORT || 4000;

const isRunningInLambda = Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);

if (!isRunningInLambda) {
  app.listen(port, () => console.log(`API listening on ${port}`));
}

export default app;
export const handler = serverless(app);
