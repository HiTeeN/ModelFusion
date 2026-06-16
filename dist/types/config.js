import { z } from "zod";
// ---------------------------------------------------------------------------
// Panel Model Schema
// ---------------------------------------------------------------------------
export const PanelModelSchema = z.object({
    providerId: z.string().min(1, "providerId is required"),
    modelId: z.string().min(1, "modelId is required"),
});
// ---------------------------------------------------------------------------
// Panel Config Schema
// ---------------------------------------------------------------------------
export const PanelConfigSchema = z.object({
    models: z
        .array(PanelModelSchema)
        .min(1, "At least one panel model is required")
        .max(8, "Maximum of 8 panel models allowed"),
    maxModels: z
        .number()
        .int()
        .min(1)
        .max(8)
        .default(8),
});
// ---------------------------------------------------------------------------
// Judge Config Schema
// ---------------------------------------------------------------------------
export const JudgeConfigSchema = z.object({
    providerId: z.string().min(1, "judge providerId is required"),
    modelId: z.string().min(1, "judge modelId is required"),
});
// ---------------------------------------------------------------------------
// Threshold Config Schema
// ---------------------------------------------------------------------------
export const ThresholdConfigSchema = z.object({
    minPromptLength: z.number().int().positive().default(200),
    keywords: z.array(z.string()).default([]),
});
// ---------------------------------------------------------------------------
// Full Fusion Config Schema
// ---------------------------------------------------------------------------
export const FusionConfigSchema = z.object({
    panel: PanelConfigSchema,
    judge: JudgeConfigSchema,
    triggering: z
        .enum(["auto", "manual", "threshold"])
        .default("manual"),
    threshold: ThresholdConfigSchema.optional(),
    maxToolCalls: z.number().int().min(1).max(16).default(8),
    temperature: z.number().min(0).max(2).default(0.7),
    enabled: z.boolean().default(true),
});
// ---------------------------------------------------------------------------
// Default Configuration
// ---------------------------------------------------------------------------
export const DEFAULT_FUSION_CONFIG = {
    panel: {
        models: [
            { providerId: "openai", modelId: "gpt-4o-mini" },
            { providerId: "anthropic", modelId: "claude-3-haiku" },
            { providerId: "google", modelId: "gemini-1.5-flash" },
        ],
        maxModels: 8,
    },
    judge: {
        providerId: "openai",
        modelId: "gpt-4o",
    },
    triggering: "manual",
    maxToolCalls: 8,
    temperature: 0.7,
    enabled: true,
};
//# sourceMappingURL=config.js.map