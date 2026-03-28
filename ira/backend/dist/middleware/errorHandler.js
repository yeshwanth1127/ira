export function errorHandler(err, req, res, _next) {
    const requestId = req.requestId;
    const status = typeof err?.statusCode === "number" ? err.statusCode : 500;
    const message = err?.message || "Internal server error";
    res.status(status).json({
        error: message,
        request_id: requestId ?? null,
    });
}
//# sourceMappingURL=errorHandler.js.map