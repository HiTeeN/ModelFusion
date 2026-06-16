import { z } from "zod";
export declare const PanelModelSchema: z.ZodObject<{
    providerId: z.ZodString;
    modelId: z.ZodString;
}, z.core.$strip>;
export type PanelModel = z.infer<typeof PanelModelSchema>;
export declare const PanelConfigSchema: z.ZodObject<{
    models: z.ZodArray<z.ZodObject<{
        providerId: z.ZodString;
        modelId: z.ZodString;
    }, z.core.$strip>>;
    maxModels: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
export declare const JudgeConfigSchema: z.ZodObject<{
    providerId: z.ZodString;
    modelId: z.ZodString;
}, z.core.$strip>;
export declare const ThresholdConfigSchema: z.ZodObject<{
    minPromptLength: z.ZodDefault<z.ZodNumber>;
    keywords: z.ZodDefault<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export declare const FusionConfigSchema: z.ZodObject<{
    panel: z.ZodObject<{
        models: z.ZodArray<z.ZodObject<{
            providerId: z.ZodString;
            modelId: z.ZodString;
        }, z.core.$strip>>;
        maxModels: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>;
    judge: z.ZodObject<{
        providerId: z.ZodString;
        modelId: z.ZodString;
    }, z.core.$strip>;
    triggering: z.ZodDefault<z.ZodEnum<{
        auto: "auto";
        manual: "manual";
        threshold: "threshold";
    }>>;
    threshold: z.ZodOptional<z.ZodObject<{
        minPromptLength: z.ZodDefault<z.ZodNumber>;
        keywords: z.ZodDefault<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>>;
    maxToolCalls: z.ZodDefault<z.ZodNumber>;
    temperature: z.ZodDefault<z.ZodNumber>;
    enabled: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>;
export type FusionConfig = z.infer<typeof FusionConfigSchema>;
export declare const DEFAULT_FUSION_CONFIG: FusionConfig;
//# sourceMappingURL=config.d.ts.map