import { describe, expect, test, mock } from "bun:test";
import { createCommandExecuteBeforeHook, type CommandExecutePluginState } from "./command-execute.js";
import { RecursionGuard } from "../recursion-guard.js";
import type { FusionConfig } from "../../types/config.js";
import type { Part } from "@opencode-ai/sdk";

function makeConfig(overrides: Partial<FusionConfig> = {}): FusionConfig {
  return {
    panel: {
      models: [
        { providerId: "openai", modelId: "gpt-4o-mini" },
        { providerId: "anthropic", modelId: "claude-3-haiku" },
      ],
      maxModels: 8,
    },
    judge: { providerId: "openai", modelId: "gpt-4o" },
    triggering: "manual",
    maxToolCalls: 8,
    temperature: 0.7,
    enabled: true,
    ...overrides,
  };
}

function makeState(overrides: Partial<CommandExecutePluginState> = {}): CommandExecutePluginState {
  return {
    config: makeConfig(),
    recursionGuard: new RecursionGuard(),
    pipeline: mock(async () => ({
      status: "ok",
      responses: [],
      cost: { totalPromptTokens: 0, totalCompletionTokens: 0, estimatedCost: 0 },
      synthesizedAnswer: "Fused answer",
    })) as unknown as CommandExecutePluginState["pipeline"],
    client: {} as CommandExecutePluginState["client"],
    ...overrides,
  };
}

describe("createCommandExecuteBeforeHook", () => {
  test("GIVEN fusion command WHEN hook runs THEN pipeline result is injected", async () => {
    const pipeline = mock(async () => ({
      status: "ok",
      responses: [],
      cost: { totalPromptTokens: 0, totalCompletionTokens: 0, estimatedCost: 0 },
      synthesizedAnswer: "Fused answer",
    }));
    const hook = createCommandExecuteBeforeHook(
      makeState({ pipeline: pipeline as unknown as CommandExecutePluginState["pipeline"] }),
    );
    const output = { parts: [] as Part[] };

    await hook(
      { command: "fusion", sessionID: "ses_1", arguments: "Compare Redis and Valkey" },
      output,
    );

    expect(pipeline).toHaveBeenCalledTimes(1);
    expect((output.parts[0] as Part & { text?: string })?.text).toBe("Fused answer");
  });

  test("GIVEN fusion command without args WHEN hook runs THEN usage message is injected", async () => {
    const pipeline = mock(async () => ({
      status: "ok",
      responses: [],
      cost: { totalPromptTokens: 0, totalCompletionTokens: 0, estimatedCost: 0 },
      synthesizedAnswer: "Fused answer",
    }));
    const hook = createCommandExecuteBeforeHook(
      makeState({ pipeline: pipeline as unknown as CommandExecutePluginState["pipeline"] }),
    );
    const output = { parts: [] as Part[] };

    await hook(
      { command: "fusion", sessionID: "ses_1", arguments: "   " },
      output,
    );

    expect(pipeline).not.toHaveBeenCalled();
    expect((output.parts[0] as Part & { text?: string })?.text).toContain("Usage: /fusion <question>");
  });

  test("GIVEN fusion config command WHEN hook runs THEN config text is injected", async () => {
    const hook = createCommandExecuteBeforeHook(makeState());
    const output = { parts: [] as Part[] };

    await hook(
      { command: "fusion:config", sessionID: "ses_1", arguments: "" },
      output,
    );

    expect((output.parts[0] as Part & { text?: string })?.text).toContain("Current Fusion Configuration");
    expect((output.parts[0] as Part & { text?: string })?.text).toContain("Panel models:");
  });

  test("GIVEN unrelated command WHEN hook runs THEN output stays unchanged", async () => {
    const pipeline = mock(async () => ({
      status: "ok",
      responses: [],
      cost: { totalPromptTokens: 0, totalCompletionTokens: 0, estimatedCost: 0 },
      synthesizedAnswer: "Fused answer",
    }));
    const hook = createCommandExecuteBeforeHook(
      makeState({ pipeline: pipeline as unknown as CommandExecutePluginState["pipeline"] }),
    );
    const output = { parts: [{ type: "text", text: "original" } as Part] };

    await hook(
      { command: "help", sessionID: "ses_1", arguments: "" },
      output,
    );

    expect(pipeline).not.toHaveBeenCalled();
    expect((output.parts[0] as Part & { text?: string })?.text).toBe("original");
  });
});
