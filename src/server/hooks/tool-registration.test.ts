import { describe, expect, test } from "bun:test";
import { createFusionTool } from "./tool-registration";
import type { FusionResult } from "../../types/results";
import type { PipelineClient } from "../pipeline";
import type { FusionConfig } from "../../types/config";
import { RecursionGuard } from "../recursion-guard";
import type { OriginalModel } from "../synthesizer";
import type { ToolContext } from "@opencode-ai/plugin/tool";

describe("createFusionTool", () => {
  const mockClient = {} as PipelineClient;
  const mockConfig = {
    panel: { models: [], maxModels: 8 },
    judge: { providerId: "openai", modelId: "gpt-4o" },
    triggering: "manual" as const,
    maxToolCalls: 8,
    temperature: 0.7,
    enabled: true,
  } satisfies FusionConfig;
  const mockRecursionGuard = new RecursionGuard();
  const mockOriginalModel: OriginalModel = {
    providerId: "openai",
    modelId: "gpt-4o",
  };

  test("returns a tool definition with description, args, and execute", () => {
    const mockPipeline = async () =>
      ({ status: "ok", responses: [], cost: { totalPromptTokens: 0, totalCompletionTokens: 0, estimatedCost: 0 } }) as FusionResult;

    const fusionTool = createFusionTool({
      pipelineFn: mockPipeline,
      client: mockClient,
      config: mockConfig,
      recursionGuard: mockRecursionGuard,
      originalModel: mockOriginalModel,
    });

    expect(fusionTool).toHaveProperty("description");
    expect(typeof fusionTool.description).toBe("string");
    expect(fusionTool.description).toContain("multi-model deliberation");
    expect(fusionTool).toHaveProperty("args");
    expect(fusionTool).toHaveProperty("execute");
    expect(typeof fusionTool.execute).toBe("function");
  });

  test("args.prompt is a Zod string schema", () => {
    const mockPipeline = async () =>
      ({ status: "ok", responses: [], cost: { totalPromptTokens: 0, totalCompletionTokens: 0, estimatedCost: 0 } }) as FusionResult;
    const fusionTool = createFusionTool({
      pipelineFn: mockPipeline,
      client: mockClient,
      config: mockConfig,
      recursionGuard: mockRecursionGuard,
      originalModel: mockOriginalModel,
    });

    const promptSchema = fusionTool.args.prompt;

    expect(promptSchema).toBeDefined();
    expect(typeof promptSchema._zod).toBe("object");
  });

  test("execute calls pipelineFn with the correct prompt", async () => {
    const capturedPrompts: string[] = [];
    const mockPipeline = async (
      _client: PipelineClient,
      _sessionID: string,
      prompt: string,
    ) => {
      capturedPrompts.push(prompt);
      return { status: "ok", responses: [], cost: { totalPromptTokens: 0, totalCompletionTokens: 0, estimatedCost: 0 } } as FusionResult;
    };
    const fusionTool = createFusionTool({
      pipelineFn: mockPipeline,
      client: mockClient,
      config: mockConfig,
      recursionGuard: mockRecursionGuard,
      originalModel: mockOriginalModel,
    });

    const result = await fusionTool.execute(
      { prompt: "What is the meaning of life?" },
      {
        sessionID: "test-session",
        messageID: "test-message",
        agent: "test-agent",
        directory: "/tmp",
        worktree: "/tmp",
        abort: new AbortController().signal,
        metadata: () => ({}),
        ask: async () => {},
      } as ToolContext,
    );

    expect(capturedPrompts).toHaveLength(1);
    expect(capturedPrompts[0]).toBe("What is the meaning of life?");
    expect(typeof result).toBe("string");
    const parsed = JSON.parse(result as string);
    expect(parsed.status).toBe("ok");
  });
});
