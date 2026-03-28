import "./load-env.js";
import express from "express";
import cors from "cors";
import chatRoute from "./routes/chat.js";
import authRoute from "./routes/auth.js";
import licensesRoute from "./routes/licenses.js";
import meRoute from "./routes/me.js";
import billingRoute from "./routes/billing.js";
import billingWebhookRoute from "./routes/billingWebhook.js";
import { assertConfig } from "./config.js";
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
});
//# sourceMappingURL=index.js.map