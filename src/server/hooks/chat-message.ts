import type { FusionConfig } from "../../types/config.js";
import type { FusionResult } from "../../types/results.js";
import { RecursionGuard } from "../recursion-guard.js";
import { runFusionPipeline, type PipelineClient } from "../pipeline.js";
import type { OriginalModel } from "../synthesizer.js";
import type { UserMessage, Part } from "@opencode-ai/sdk";

const FUSION_MANUAL_VARIANT = "fusion:manual";

// ---------------------------------------------------------------------------
// PluginState — the dependencies injected into the hook factory
// ---------------------------------------------------------------------------

export interface ChatMessagePluginState {
  config: FusionConfig;
  recursionGuard: RecursionGuard;
  pipeline: typeof runFusionPipeline;
  client: PipelineClient;
}

// ---------------------------------------------------------------------------
// Hook input/output types (mirrors @opencode-ai/plugin Hooks["chat.message"])
// ---------------------------------------------------------------------------

export interface ChatMessageInput {
  sessionID: string;
  agent?: string;
  model?: {
    providerID: string;
    modelID: string;
  };
  messageID?: string;
  variant?: string;
}

export interface ChatMessageOutput {
  message: UserMessage;
  parts: Part[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the full prompt text from output parts.
 * Concatenates text from all TextPart items.
 */
function extractPrompt(parts: ChatMessageOutput["parts"]): string {
  return parts
    .filter((p): p is Part & { text: string } => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text)
    .join("\n");
}

/**
 * Check whether the prompt meets the threshold criteria for triggering fusion.
 * Returns true if prompt length exceeds minPromptLength OR contains any keyword.
 */
function meetsThreshold(
  prompt: string,
  minPromptLength: number,
  keywords: string[],
): boolean {
  if (prompt.length > minPromptLength) return true;
  if (keywords.length === 0) return false;
  const lower = prompt.toLowerCase();
  return keywords.some((kw) => lower.includes(kw.toLowerCase()));
}

/**
 * Build a TextPart from a string for injection into output.parts.
 */
function textPart(text: string): Part {
  return { type: "text", text } as Part;
}

// ---------------------------------------------------------------------------
// createChatMessageHook — factory that returns the chat.message hook
// ---------------------------------------------------------------------------

/**
 * Creates a `chat.message` hook that intercepts incoming user messages and
 * decides whether to trigger the fusion pipeline based on the configured
 * triggering mode.
 *
 * Modes:
 * - **manual**: Messages pass through unchanged. Fusion is only triggered
 *   via the `fusion:deliberate` tool.
 * - **auto**: Every incoming message triggers fusion.
 * - **threshold**: Fusion triggers when the prompt exceeds `minPromptLength`
 *   or contains any of the configured `keywords`.
 *
 * A recursion guard prevents nested fusion calls within the same session.
 */
export function createChatMessageHook(
  pluginState: ChatMessagePluginState,
): (input: ChatMessageInput, output: ChatMessageOutput) => Promise<void> {
  const { config, recursionGuard, pipeline, client } = pluginState;

  return async (input: ChatMessageInput, output: ChatMessageOutput): Promise<void> => {
    // -----------------------------------------------------------------------
    // Step 1: Extract the prompt text from incoming parts
    // -----------------------------------------------------------------------
    const prompt = extractPrompt(output.parts);

    // -----------------------------------------------------------------------
    // Step 2: Decide whether to trigger based on triggering mode
    // -----------------------------------------------------------------------
    let shouldTrigger = false;

    if (input.variant === FUSION_MANUAL_VARIANT) {
      shouldTrigger = true;
    } else {
      switch (config.triggering) {
        case "manual":
          // Manual mode — never auto-trigger; pass through unchanged
          shouldTrigger = false;
          break;

        case "auto":
          // Auto mode — always trigger
          shouldTrigger = true;
          break;

        case "threshold": {
          // Threshold mode — check length and keywords
          const threshold = config.threshold ?? { minPromptLength: 200, keywords: [] };
          shouldTrigger = meetsThreshold(
            prompt,
            threshold.minPromptLength,
            threshold.keywords,
          );
          break;
        }
      }
    }

    // -----------------------------------------------------------------------
    // Step 3: If not triggering, pass through unchanged
    // -----------------------------------------------------------------------
    if (!shouldTrigger) {
      return;
    }

    // -----------------------------------------------------------------------
    // Step 4: Recursion guard — skip if fusion already active for this session
    // -----------------------------------------------------------------------
    if (recursionGuard.isFusionActive(input.sessionID)) {
      return;
    }

    // -----------------------------------------------------------------------
    // Step 5: Build original model info from input
    // -----------------------------------------------------------------------
    const originalModel: OriginalModel = input.model
      ? { providerId: input.model.providerID, modelId: input.model.modelID }
      : { providerId: "unknown", modelId: "unknown" };

    // -----------------------------------------------------------------------
    // Step 6: Run the fusion pipeline
    // -----------------------------------------------------------------------
    const result: FusionResult = await pipeline(
      client,
      input.sessionID,
      prompt,
      config,
      originalModel,
      recursionGuard,
    );

    // -----------------------------------------------------------------------
    // Step 7: Inject fusion results into the output
    // -----------------------------------------------------------------------
    if (result.status === "ok" && result.synthesizedAnswer) {
      // Happy path — replace parts with the synthesized answer
      output.parts = [textPart(result.synthesizedAnswer)];
    } else if (result.status === "degraded" && result.responses.length > 0) {
      // Degraded — show raw panel responses with a note
      const rawResponses = result.responses
        .map((r) => `**[${r.providerId}/${r.modelId}]**\n${r.content}`)
        .join("\n\n---\n\n");
      output.parts = [
        textPart(
          "⚠️ Fusion panel completed but judge analysis failed. " +
            "Raw panel responses below:\n\n" +
            rawResponses,
        ),
      ];
    } else {
      // Error — inject failure message, keep original prompt visible
      const reason = result.failureReason ?? "unknown error";
      output.parts = [
        textPart(`⚠️ Fusion pipeline failed: ${reason}`),
        ...output.parts,
      ];
    }
  };
}
