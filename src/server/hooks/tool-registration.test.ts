import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { createFusionTool } from "./tool-registration";
import type { FusionResult } from "../../types/results";

// ---------------------------------------------------------------------------
// createFusionTool
// ---------------------------------------------------------------------------

describe("createFusionTool", () => {
  // GIVEN a mock pipeline function
  // WHEN createFusionTool is called
  // THEN the returned tool has description, args, and execute
  test("returns a ToolDefinition with description, args, and execute", () => {
    // GIVEN
    const mockPipeline = async () =>
      ({ status: "ok", responses: [], cost: { totalPromptTokens: 0, totalCompletionTokens: 0, estimatedCost: 0 } }) as FusionResult;

    // WHEN
    const tool = createFusionTool(mockPipeline);

    // THEN
    expect(tool).toHaveProperty("description");
    expect(typeof tool.description).toBe("string");
    expect(tool.description).toContain("multi-model deliberation");
    expect(tool).toHaveProperty("args");
    expect(tool).toHaveProperty("execute");
    expect(typeof tool.execute).toBe("function");
  });

  // GIVEN a tool created with createFusionTool
  // WHEN inspecting args
  // THEN args.prompt is a Zod string schema
  test("args.prompt is a Zod string schema", () => {
    // GIVEN
    const mockPipeline = async () =>
      ({ status: "ok", responses: [], cost: { totalPromptTokens: 0, totalCompletionTokens: 0, estimatedCost: 0 } }) as FusionResult;
    const tool = createFusionTool(mockPipeline);

    // WHEN
    const promptSchema = tool.args.prompt;

    // THEN
    expect(promptSchema).toBeInstanceOf(z.ZodString);
    expect(promptSchema.description).toBe("The question or task for the panel to analyze");
  });

  // GIVEN a tool created with createFusionTool
  // WHEN execute is called with a prompt
  // THEN it delegates to the pipeline function with the correct prompt
  test("execute calls pipelineFn with the correct prompt", async () => {
    // GIVEN
    const capturedPrompts: string[] = [];
    const mockPipeline = async (
      _client: unknown,
      _sessionID: string,
      prompt: string,
    ) => {
      capturedPrompts.push(prompt);
      return { status: "ok", responses: [], cost: { totalPromptTokens: 0, totalCompletionTokens: 0, estimatedCost: 0 } } as FusionResult;
    };
    const tool = createFusionTool(mockPipeline);

    // WHEN
    const result = await tool.execute({ prompt: "What is the meaning of life?" }, {});

    // THEN
    expect(capturedPrompts).toHaveLength(1);
    expect(capturedPrompts[0]).toBe("What is the meaning of life?");
    expect(typeof result).toBe("string");
    const parsed = JSON.parse(result);
    expect(parsed.status).toBe("ok");
  });
});
