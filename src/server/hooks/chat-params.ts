import type { FusionConfig } from "../../types/config.js";
import type { RecursionGuard } from "../recursion-guard.js";
import type { Model, UserMessage } from "@opencode-ai/sdk";
import type { ProviderContext } from "@opencode-ai/plugin";

// ---------------------------------------------------------------------------
// Plugin state passed to the hook factory
// ---------------------------------------------------------------------------

export interface ChatParamsPluginState {
  config: FusionConfig;
  recursionGuard: RecursionGuard;
}

// ---------------------------------------------------------------------------
// Hook input / output types (matching @opencode-ai/plugin Hooks["chat.params"])
// ---------------------------------------------------------------------------

export interface ChatParamsInput {
  sessionID: string;
  agent: string;
  model: Model;
  provider: ProviderContext;
  message: UserMessage;
}

export interface ChatParamsOutput {
  temperature: number;
  topP: number;
  topK: number;
  maxOutputTokens: number | undefined;
  options: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// createChatParamsHook — factory returning a chat.params hook
// ---------------------------------------------------------------------------

/**
 * Creates a `chat.params` hook that adjusts LLM parameters when fusion is
 * active for a session.
 *
 * - Fusion active: sets temperature and maxOutputTokens from config.
 * - Fusion inactive: passes through unchanged (no modifications).
 */
export function createChatParamsHook(
  pluginState: ChatParamsPluginState,
): (input: ChatParamsInput, output: ChatParamsOutput) => Promise<void> {
  const { config, recursionGuard } = pluginState;

  return async (_input: ChatParamsInput, output: ChatParamsOutput): Promise<void> => {
    // -------------------------------------------------------------------
    // Fusion inactive — pass through unchanged
    // -------------------------------------------------------------------
    if (!recursionGuard.isFusionActive(_input.sessionID)) {
      return;
    }

    // -------------------------------------------------------------------
    // Fusion active — route params for panelist calls
    // -------------------------------------------------------------------
    output.temperature = config.temperature;
    output.maxOutputTokens = config.maxToolCalls * 1000;
  };
}
