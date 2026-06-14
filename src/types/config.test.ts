import { describe, expect, test } from "bun:test";
import { FusionConfigSchema, DEFAULT_FUSION_CONFIG } from "./config";

describe("FusionConfigSchema", () => {
  test("valid minimal config — panel with 1 model, judge, manual triggering", () => {
    // GIVEN a minimal config with one panel model, a judge, and manual triggering
    const config = {
      panel: {
        models: [{ providerId: "openai", modelId: "gpt-4o-mini" }],
      },
      judge: {
        providerId: "openai",
        modelId: "gpt-4o",
      },
      triggering: "manual",
    };

    // WHEN parsing with FusionConfigSchema
    const result = FusionConfigSchema.parse(config);

    // THEN it succeeds with defaults applied
    expect(result.panel.models).toHaveLength(1);
    expect(result.judge.providerId).toBe("openai");
    expect(result.triggering).toBe("manual");
    expect(result.enabled).toBe(true);
    expect(result.temperature).toBe(0.7);
    expect(result.maxToolCalls).toBe(8);
  });

  test("valid full config — 3 panel models, auto triggering, threshold, temperature 0.5", () => {
    // GIVEN a full config with 3 panel models, auto triggering, threshold, and custom temperature
    const config = {
      panel: {
        models: [
          { providerId: "openai", modelId: "gpt-4o-mini" },
          { providerId: "anthropic", modelId: "claude-3-haiku" },
          { providerId: "google", modelId: "gemini-1.5-flash" },
        ],
        maxModels: 3,
      },
      judge: {
        providerId: "anthropic",
        modelId: "claude-3-opus",
      },
      triggering: "auto",
      threshold: {
        minPromptLength: 500,
        keywords: ["fusion", "merge"],
      },
      maxToolCalls: 12,
      temperature: 0.5,
      enabled: true,
    };

    // WHEN parsing with FusionConfigSchema
    const result = FusionConfigSchema.parse(config);

    // THEN it succeeds with all values preserved
    expect(result.panel.models).toHaveLength(3);
    expect(result.panel.maxModels).toBe(3);
    expect(result.judge.modelId).toBe("claude-3-opus");
    expect(result.triggering).toBe("auto");
    expect(result.threshold?.minPromptLength).toBe(500);
    expect(result.threshold?.keywords).toEqual(["fusion", "merge"]);
    expect(result.maxToolCalls).toBe(12);
    expect(result.temperature).toBe(0.5);
    expect(result.enabled).toBe(true);
  });

  test("empty panel — models: [] should fail", () => {
    // GIVEN a config with an empty panel models array
    const config = {
      panel: {
        models: [],
      },
      judge: {
        providerId: "openai",
        modelId: "gpt-4o",
      },
      triggering: "manual",
    };

    // WHEN parsing with FusionConfigSchema
    const result = FusionConfigSchema.safeParse(config);

    // THEN it fails because at least one panel model is required
    expect(result.success).toBe(false);
  });

  test(">8 models — 9 models should fail", () => {
    // GIVEN a config with 9 panel models (exceeds max of 8)
    const config = {
      panel: {
        models: Array.from({ length: 9 }, (_, i) => ({
          providerId: "provider-" + i,
          modelId: "model-" + i,
        })),
      },
      judge: {
        providerId: "openai",
        modelId: "gpt-4o",
      },
      triggering: "manual",
    };

    // WHEN parsing with FusionConfigSchema
    const result = FusionConfigSchema.safeParse(config);

    // THEN it fails because maximum of 8 panel models allowed
    expect(result.success).toBe(false);
  });

  test("invalid triggering — 'invalid_mode' should fail", () => {
    // GIVEN a config with an invalid triggering mode
    const config = {
      panel: {
        models: [{ providerId: "openai", modelId: "gpt-4o-mini" }],
      },
      judge: {
        providerId: "openai",
        modelId: "gpt-4o",
      },
      triggering: "invalid_mode",
    };

    // WHEN parsing with FusionConfigSchema
    const result = FusionConfigSchema.safeParse(config);

    // THEN it fails because triggering must be one of "auto", "manual", or "threshold"
    expect(result.success).toBe(false);
  });

  test("temperature > 2 — 3.0 should fail", () => {
    // GIVEN a config with temperature 3.0 (exceeds max of 2)
    const config = {
      panel: {
        models: [{ providerId: "openai", modelId: "gpt-4o-mini" }],
      },
      judge: {
        providerId: "openai",
        modelId: "gpt-4o",
      },
      triggering: "manual",
      temperature: 3.0,
    };

    // WHEN parsing with FusionConfigSchema
    const result = FusionConfigSchema.safeParse(config);

    // THEN it fails because temperature must be between 0 and 2
    expect(result.success).toBe(false);
  });

  test("maxToolCalls > 16 — 20 should fail", () => {
    // GIVEN a config with maxToolCalls 20 (exceeds max of 16)
    const config = {
      panel: {
        models: [{ providerId: "openai", modelId: "gpt-4o-mini" }],
      },
      judge: {
        providerId: "openai",
        modelId: "gpt-4o",
      },
      triggering: "manual",
      maxToolCalls: 20,
    };

    // WHEN parsing with FusionConfigSchema
    const result = FusionConfigSchema.safeParse(config);

    // THEN it fails because maxToolCalls must be between 1 and 16
    expect(result.success).toBe(false);
  });

  test("DEFAULT_FUSION_CONFIG is valid", () => {
    // GIVEN the default fusion config

    // WHEN parsing with FusionConfigSchema
    const result = FusionConfigSchema.parse(DEFAULT_FUSION_CONFIG);

    // THEN it succeeds
    expect(result.panel.models).toHaveLength(3);
    expect(result.judge.providerId).toBe("openai");
    expect(result.triggering).toBe("manual");
    expect(result.maxToolCalls).toBe(8);
    expect(result.temperature).toBe(0.7);
    expect(result.enabled).toBe(true);
  });
});