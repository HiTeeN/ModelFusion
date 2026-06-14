import { describe, expect, test } from "bun:test";
import { createSystemTransformHook } from "./system-transform";
import type { FusionConfig } from "../../types/config";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function enabledState(): { config: FusionConfig } {
  return {
    config: {
      panel: { models: [{ providerId: "openai", modelId: "gpt-4o" }], maxModels: 8 },
      judge: { providerId: "openai", modelId: "gpt-4o" },
      triggering: "manual",
      maxToolCalls: 8,
      temperature: 0.7,
      enabled: true,
    },
  };
}

function disabledState(): { config: FusionConfig } {
  return {
    config: {
      panel: { models: [{ providerId: "openai", modelId: "gpt-4o" }], maxModels: 8 },
      judge: { providerId: "openai", modelId: "gpt-4o" },
      triggering: "manual",
      maxToolCalls: 8,
      temperature: 0.7,
      enabled: false,
    },
  };
}

// ---------------------------------------------------------------------------
// createSystemTransformHook
// ---------------------------------------------------------------------------

describe("createSystemTransformHook", () => {
  // GIVEN fusion is enabled
  // WHEN the system transform hook runs
  // THEN the deliberation prompt is appended to output.system
  test("injects deliberation prompt when fusion is enabled", async () => {
    const hook = createSystemTransformHook(enabledState());
    const output = { system: ["You are a helpful assistant."] };

    await hook(
      { sessionID: "s1", model: { providerID: "openai", modelID: "gpt-4o" } },
      output,
    );

    expect(output.system).toHaveLength(2);
    expect(output.system[0]).toBe("You are a helpful assistant.");
    expect(output.system[1]).toContain("fusion:deliberate");
    expect(output.system[1]).toContain("multi-model deliberation");
  });

  // GIVEN fusion is disabled
  // WHEN the system transform hook runs
  // THEN output.system passes through unchanged
  test("passes through unchanged when fusion is disabled", async () => {
    const hook = createSystemTransformHook(disabledState());
    const output = { system: ["You are a helpful assistant."] };

    await hook(
      { sessionID: "s2", model: { providerID: "openai", modelID: "gpt-4o" } },
      output,
    );

    expect(output.system).toHaveLength(1);
    expect(output.system[0]).toBe("You are a helpful assistant.");
  });
});
