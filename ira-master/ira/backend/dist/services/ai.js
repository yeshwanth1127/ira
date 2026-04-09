import fetch from "node-fetch";
export async function chatWithAI(input) {
    const apiKey = (process.env.OPENROUTER_API_KEY || "").trim();
    if (!apiKey) {
        throw new Error("OPENROUTER_API_KEY is missing from environment variables");
    }
    const model = (input.model || "openai/gpt-4o-mini").trim() || "openai/gpt-4o-mini";
    const messages = Array.isArray(input.messages) && input.messages.length > 0
        ? input.messages
        : input.message
            ? [{ role: "user", content: input.message }]
            : [];
    if (messages.length === 0) {
        throw new Error("No messages provided");
    }
    const headers = {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
    };
    console.log("[AI DEBUG] Model:", model);
    console.log("[AI DEBUG] API key present:", !!apiKey);
    console.log("[AI DEBUG] Messages count:", messages.length);
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers,
        body: JSON.stringify({
            model,
            messages,
        }),
    });
    console.log("[AI DEBUG] OpenRouter Status:", res.status, res.statusText);
    if (!res.ok) {
        const errorText = await res.text();
        console.log("[AI DEBUG] Raw error response:", errorText);
        throw new Error(`OpenRouter error: ${res.status} ${res.statusText} - ${errorText}`);
    }
    const data = await res.json();
    return {
        reply: data?.choices?.[0]?.message?.content ?? "",
        usage: data?.usage ?? null,
        model: data?.model ?? model,
    };
}
//# sourceMappingURL=ai.js.map