const DEFAULT_FANOUT_OPTIONS = {
    timeoutMs: 120_000,
    retries: 1,
};
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/**
 * Wraps a promise with a timeout. If the promise doesn't settle within
 * `timeoutMs`, rejects with a descriptive timeout error.
 */
async function withTimeout(promise, timeoutMs, label) {
    let timer;
    const timeoutPromise = new Promise((_resolve, reject) => {
        timer = setTimeout(() => {
            reject(new Error(`fanOut timeout: ${label} exceeded ${timeoutMs}ms`));
        }, timeoutMs);
    });
    try {
        return await Promise.race([promise, timeoutPromise]);
    }
    finally {
        if (timer !== undefined)
            clearTimeout(timer);
    }
}
/**
 * Calls a single panelist with timeout and retry logic.
 * Retries once on transient errors with a small delay.
 */
async function callPanelistWithRetry(client, sessionID, model, sanitizedPrompt, timeoutMs, maxRetries) {
    const key = `${model.providerId}/${model.modelId}`;
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const promise = client.session.prompt({
                sessionID,
                model: {
                    providerID: model.providerId,
                    modelID: model.modelId,
                },
                parts: [{ type: "text", text: sanitizedPrompt }],
            });
            return await withTimeout(promise, timeoutMs, key);
        }
        catch (err) {
            lastError = err;
            if (attempt < maxRetries) {
                // Brief delay before retry to avoid thundering-herd
                await new Promise((r) => setTimeout(r, 100));
            }
        }
    }
    throw lastError;
}
function notifyPanelistDone(onPanelistDone, result) {
    try {
        onPanelistDone?.(result);
    }
    catch {
        // Progress reporting must never change the underlying panel result.
    }
}
// ---------------------------------------------------------------------------
// fanOut — parallel panelist execution
// ---------------------------------------------------------------------------
/**
 * Spawns parallel model calls for each panelist.
 *
 * - Input prompt is sanitized (trimmed) before dispatch.
 * - Each panelist receives the **verbatim** prompt (no lenses/personas/roles).
 * - Calls execute concurrently via Promise.allSettled.
 * - Per-call timeout (default 120s) prevents infinite hangs.
 * - Transient errors are retried once before being captured as failures.
 * - Individual failures are captured as PanelResult with an `error` field.
 * - Token counts and latency are captured from response metadata.
 */
export async function fanOut(client, sessionID, prompt, models, _config, options) {
    const timeoutMs = options?.timeoutMs ?? DEFAULT_FANOUT_OPTIONS.timeoutMs;
    const maxRetries = options?.retries ?? DEFAULT_FANOUT_OPTIONS.retries;
    const onPanelistDone = options?.onPanelistDone;
    const sanitizedPrompt = prompt.trim();
    const startTimes = new Map();
    const promises = models.map((model) => {
        const key = `${model.providerId}/${model.modelId}`;
        startTimes.set(key, Date.now());
        return callPanelistWithRetry(client, sessionID, model, sanitizedPrompt, timeoutMs, maxRetries)
            .then((response) => {
            const latencyMs = Date.now() - (startTimes.get(key) ?? 0);
            const content = response.parts
                .filter((p) => p.type === "text" && typeof p.text === "string")
                .map((p) => p.text)
                .join("") ?? "";
            const tokenCount = {
                prompt: response.info.tokens.input,
                completion: response.info.tokens.output,
            };
            const result = {
                modelId: model.modelId,
                providerId: model.providerId,
                content,
                tokenCount,
                latencyMs,
            };
            notifyPanelistDone(onPanelistDone, result);
            return result;
        })
            .catch((err) => {
            const latencyMs = Date.now() - (startTimes.get(key) ?? 0);
            const message = err instanceof Error ? err.message : String(err);
            const result = {
                modelId: model.modelId,
                providerId: model.providerId,
                content: "",
                tokenCount: { prompt: 0, completion: 0 },
                latencyMs,
                error: message,
            };
            notifyPanelistDone(onPanelistDone, result);
            return result;
        });
    });
    const settled = await Promise.allSettled(promises);
    // allSettled never rejects — every entry is either fulfilled or rejected.
    // But since we .catch() inside each promise, all should be fulfilled.
    return settled.map((s) => {
        if (s.status === "fulfilled")
            return s.value;
        // Defensive: if a promise somehow still rejected, wrap as error result.
        // We don't have the modelId here, so use a generic fallback.
        return {
            modelId: "unknown",
            providerId: "unknown",
            content: "",
            tokenCount: { prompt: 0, completion: 0 },
            latencyMs: 0,
            error: s.reason instanceof Error ? s.reason.message : String(s.reason),
        };
    });
}
//# sourceMappingURL=orchestrator.js.map