export function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  console.error(
    `[ERROR] ${req.method} ${req.originalUrl} ${status} ${err.message || "Server error"}`,
  );

  if (err.stack) {
    console.error(err.stack);
  }

  res.status(status).json({
    message: err.message || "Server error",
  });
}
