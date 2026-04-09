import "./load-env.js";
import express from "express";
import cors from "cors";
import chatRoute from "./routes/chat.js";
import authRoute from "./routes/auth.js";
import licensesRoute from "./routes/licenses.js";
import meRoute from "./routes/me.js";
import billingRoute from "./routes/billing.js";
import billingWebhookRoute from "./routes/billingWebhook.js";
import { assertConfig, config } from "./config.js";
import { requestId } from "./middleware/requestId.js";
import { errorHandler } from "./middleware/errorHandler.js";
const app = express();
assertConfig();
app.use(cors());
// Razorpay requires raw body for signature verification.
app.post("/billing/razorpay/webhook", express.raw({ type: "application/json" }), billingWebhookRoute);
app.use(express.json());
app.use(requestId);
app.use("/chat", chatRoute);
app.use("/auth", authRoute);
app.use("/licenses", licensesRoute);
app.use("/me", meRoute);
app.use("/billing", billingRoute);
// Health check endpoint
app.get("/health", (req, res) => {
    res.send("OK");
});
app.use(errorHandler);
const port = Number(process.env.PORT || "5000");
app.listen(port, () => {
    console.log(`IRA brain running on port ${port}`);
    if (!config.internalApiKey) {
        console.warn("[ira] INTERNAL_API_KEY is empty — license minting (POST /licenses/internal/issue) will return 403. " +
            "Add INTERNAL_API_KEY to ira/backend/.env (same value as admin-api INTERNAL_API_KEY) and restart.");
    }
    const dbg = process.env.DEBUG_IRA_INTERNAL === "1" || process.env.DEBUG_IRA === "1";
    if (dbg) {
        console.log(`[ira-debug] INTERNAL_API_KEY ${config.internalApiKey ? `set (${config.internalApiKey.length} chars)` : "NOT SET"}`);
    }
});
//# sourceMappingURL=index.js.map