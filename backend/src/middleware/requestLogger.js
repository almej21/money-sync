export function requestLogger(req, res, next) {
  const start = Date.now();

  res.on("finish", () => {
    const durationMs = Date.now() - start;
    const level = res.statusCode >= 400 ? "ERROR" : "SUCCESS";

    console.log(
      `[${level}] ${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs}ms`,
    );
  });

  next();
}
