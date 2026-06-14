import type { PanelModel, FusionConfig } from "../types/config";
import type { PanelResult, TokenCount } from "../types/results";

// ---------------------------------------------------------------------------
// Client interface — loosely typed to avoid SDK coupling
// ---------------------------------------------------------------------------

export interface OrchestratorClient {
  session: {
    prompt: (path: string, body: {
      model: { providerID: string; modelID: string };
      prompt: string;
    }) => Promise<PromptResponse>;
  };
}

export interface PromptResponse {
  choices?: Array<{
    message?: { content?: string };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}

// ---------------------------------------------------------------------------
// FanOut options
// ---------------------------------------------------------------------------

export interface FanOutOptions {
  /** Per-panelist call timeout in ms. Default: 120_000 (2 min). */
  timeoutMs?: number;
  /** Number of retries for transient failures. Default: 1. */
  retries?: number;
}

const DEFAULT_FANOUT_OPTIONS: Required<FanOutOptions> = {
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
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`fanOut timeout: ${label} exceeded ${timeoutMs}ms`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Calls a single panelist with timeout and retry logic.
 * Retries once on transient errors with a small delay.
 */
async function callPanelistWithRetry(
  client: OrchestratorClient,
  sessionID: string,
  model: PanelModel,
  sanitizedPrompt: string,
  timeoutMs: number,
  maxRetries: number,
): Promise<PromptResponse> {
  const key = `${model.providerId}/${model.modelId}`;

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const promise = client.session.prompt(sessionID, {
        model: {
          providerID: model.providerId,
          modelID: model.modelId,
        },
        prompt: sanitizedPrompt,
      });
      return await withTimeout(promise, timeoutMs, key);
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        // Brief delay before retry to avoid thundering-herd
        await new Promise((r) => setTimeout(r, 100));
      }
    }
  }
  throw lastError;
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
export async function fanOut(
  client: OrchestratorClient,
  sessionID: string,
  prompt: string,
  models: PanelModel[],
  _config: FusionConfig,
  options?: FanOutOptions,
): Promise<PanelResult[]> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_FANOUT_OPTIONS.timeoutMs;
  const maxRetries = options?.retries ?? DEFAULT_FANOUT_OPTIONS.retries;
  const sanitizedPrompt = prompt.trim();

  const startTimes = new Map<string, number>();

  const promises = models.map((model) => {
    const key = `${model.providerId}/${model.modelId}`;
    startTimes.set(key, Date.now());

    return callPanelistWithRetry(
      client,
      sessionID,
      model,
      sanitizedPrompt,
      timeoutMs,
      maxRetries,
    )
      .then((response): PanelResult => {
        const latencyMs = Date.now() - (startTimes.get(key) ?? 0);

        const content =
          response.choices?.[0]?.message?.content ?? "";

        const tokenCount: TokenCount = {
          prompt: response.usage?.prompt_tokens ?? 0,
          completion: response.usage?.completion_tokens ?? 0,
        };

        return {
          modelId: model.modelId,
          providerId: model.providerId,
          content,
          tokenCount,
          latencyMs,
        };
      })
      .catch((err: unknown): PanelResult => {
        const latencyMs = Date.now() - (startTimes.get(key) ?? 0);
        const message =
          err instanceof Error ? err.message : String(err);

        return {
          modelId: model.modelId,
          providerId: model.providerId,
          content: "",
          tokenCount: { prompt: 0, completion: 0 },
          latencyMs,
          error: message,
        };
      });
  });

  const settled = await Promise.allSettled(promises);

  // allSettled never rejects — every entry is either fulfilled or rejected.
  // But since we .catch() inside each promise, all should be fulfilled.
  return settled.map((s) => {
    if (s.status === "fulfilled") return s.value;
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
