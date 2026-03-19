import dotenv from "dotenv";
dotenv.config();

import cors from "cors";
import express from "express";
import serverless from "serverless-http";
import { connectDB } from "./config/db.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { requestLogger } from "./middleware/requestLogger.js";
import authRoutes from "./routes/authRoutes.js";
import bankRoutes from "./routes/bankRoutes.js";
import expenseRoutes from "./routes/expenseRoutes.js";
import shoppingListRoutes from "./routes/shoppingListRoutes.js";

const app = express();

app.use(
  cors({
    origin: process.env.CLIENT_URL?.split(",") || "*",
  }),
);
app.use(express.json());
app.use(requestLogger);

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.use(async (req, res, next) => {
  await connectDB();
  next();
});

app.use("/api/auth", authRoutes);
app.use("/api/expenses", expenseRoutes);
app.use("/api/shopping-lists", shoppingListRoutes);
app.use("/api/bank", bankRoutes);

app.use(errorHandler);

const port = process.env.PORT || 4000;

if (process.env.NODE_ENV !== "production") {
  app.listen(port, () => console.log(`API listening on ${port}`));
}

export default app;
export const handler = serverless(app);
