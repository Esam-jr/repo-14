class AppError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

function errorResponse(err, _req, res, _next) {
  if (err && err.statusCode && err.code) {
    return res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message
      }
    });
  }

  return res.status(500).json({
    error: {
      code: "internal_server_error",
      message: "An unexpected error occurred."
    }
  });
}

module.exports = {
  AppError,
  errorResponse
};
