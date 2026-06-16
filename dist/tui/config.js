import { registerTuiCommands } from "./command-registration.js";
import { FusionConfigSchema, DEFAULT_FUSION_CONFIG, PanelModelSchema, } from "../types/config.js";
// ---------------------------------------------------------------------------
// Config persistence helpers
// ---------------------------------------------------------------------------
const KV_KEY = "fusion.config";
function loadConfig(kv) {
    const stored = kv.get(KV_KEY);
    if (stored && typeof stored === "object") {
        const parsed = FusionConfigSchema.safeParse(stored);
        if (parsed.success)
            return parsed.data;
    }
    const defaults = structuredClone(DEFAULT_FUSION_CONFIG);
    kv.set(KV_KEY, defaults);
    return defaults;
}
export function saveConfig(kv, config) {
    kv.set(KV_KEY, config);
}
// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------
export function formatConfigForDisplay(config) {
    const modelLines = config.panel.models
        .map((m) => `  ${m.providerId} / ${m.modelId}`)
        .join("\n");
    return [
        "Current Fusion Configuration",
        "",
        "Panel models:",
        modelLines,
        "",
        `Judge:          ${config.judge.providerId} / ${config.judge.modelId}`,
        `Trigger mode:   ${config.triggering}`,
        `Max tool calls: ${config.maxToolCalls}`,
        `Temperature:    ${config.temperature}`,
        `Enabled:        ${config.enabled ? "yes" : "no"}`,
    ].join("\n");
}
export function formatConfigPrompt(_config) {
    return [
        "Enter a config subcommand:",
        "",
        "  panel add <providerId> <modelId>  — add a panel model",
        "  panel remove <modelId>            — remove a panel model",
        "  judge <providerId> <modelId>      — set judge model",
        "  mode <auto|manual|threshold>      — change trigger mode",
        "",
        "Leave empty to view current configuration.",
    ].join("\n");
}
export function handlePanelAdd(config, args) {
    const [providerId, modelId] = args;
    if (!providerId || !modelId) {
        return { ok: false, error: "Usage: panel add <providerId> <modelId>" };
    }
    const parsed = PanelModelSchema.safeParse({ providerId, modelId });
    if (!parsed.success) {
        return {
            ok: false,
            error: parsed.error.issues.map((i) => i.message).join("; "),
        };
    }
    const newModel = parsed.data;
    if (config.panel.models.length >= config.panel.maxModels) {
        return {
            ok: false,
            error: `Cannot add model: maximum of ${config.panel.maxModels} panel models reached`,
        };
    }
    const isDuplicate = config.panel.models.some((m) => m.modelId === newModel.modelId &&
        m.providerId === newModel.providerId);
    if (isDuplicate) {
        return {
            ok: false,
            error: `Model "${providerId}/${modelId}" is already in the panel`,
        };
    }
    const updated = {
        ...config,
        panel: {
            ...config.panel,
            models: [...config.panel.models, newModel],
        },
    };
    const validated = FusionConfigSchema.safeParse(updated);
    if (!validated.success) {
        return {
            ok: false,
            error: validated.error.issues.map((i) => i.message).join("; "),
        };
    }
    return { ok: true, config: validated.data };
}
export function handlePanelRemove(config, args) {
    const [modelId] = args;
    if (!modelId) {
        return { ok: false, error: "Usage: panel remove <modelId>" };
    }
    const remaining = config.panel.models.filter((m) => m.modelId !== modelId);
    if (remaining.length === config.panel.models.length) {
        return {
            ok: false,
            error: `Model "${modelId}" not found in panel`,
        };
    }
    if (remaining.length === 0) {
        return {
            ok: false,
            error: "Cannot remove last panel model. At least one model is required.",
        };
    }
    const newConfig = {
        ...config,
        panel: {
            ...config.panel,
            models: remaining,
        },
    };
    const validated = FusionConfigSchema.safeParse(newConfig);
    if (!validated.success) {
        return {
            ok: false,
            error: validated.error.issues.map((i) => i.message).join("; "),
        };
    }
    return { ok: true, config: validated.data };
}
export function handleSetJudge(config, args) {
    const [providerId, modelId] = args;
    if (!providerId || !modelId) {
        return {
            ok: false,
            error: "Usage: judge <providerId> <modelId>",
        };
    }
    const newConfig = {
        ...config,
        judge: { providerId, modelId },
    };
    const validated = FusionConfigSchema.safeParse(newConfig);
    if (!validated.success) {
        return {
            ok: false,
            error: validated.error.issues.map((i) => i.message).join("; "),
        };
    }
    return { ok: true, config: validated.data };
}
export function handleSetMode(config, args) {
    const [mode] = args;
    if (!mode) {
        return {
            ok: false,
            error: "Usage: mode <auto|manual|threshold>",
        };
    }
    const newConfig = {
        ...config,
        triggering: mode,
    };
    const validated = FusionConfigSchema.safeParse(newConfig);
    if (!validated.success) {
        return {
            ok: false,
            error: validated.error.issues.map((i) => i.message).join("; "),
        };
    }
    return { ok: true, config: validated.data };
}
// ---------------------------------------------------------------------------
// Input parsing and dispatch
// ---------------------------------------------------------------------------
export function handleConfigInput(api, input) {
    // GIVEN user input, WHEN parsed, THEN dispatch to appropriate handler
    if (!input) {
        // Show current config
        const config = loadConfig(api.kv);
        api.ui.toast({
            variant: "info",
            title: "Fusion Configuration",
            message: formatConfigForDisplay(config),
        });
        return;
    }
    const parts = input.trim().split(/\s+/);
    const subcommand = parts[0]?.toLowerCase();
    const rest = parts.slice(1);
    const config = loadConfig(api.kv);
    let result;
    switch (subcommand) {
        case "panel": {
            const action = rest[0]?.toLowerCase();
            const actionArgs = rest.slice(1);
            if (action === "add") {
                result = handlePanelAdd(config, actionArgs);
            }
            else if (action === "remove") {
                result = handlePanelRemove(config, actionArgs);
            }
            else {
                api.ui.toast({
                    variant: "error",
                    title: "Fusion Config Error",
                    message: 'Unknown panel action. Use "panel add" or "panel remove".',
                });
                return;
            }
            break;
        }
        case "judge":
            result = handleSetJudge(config, rest);
            break;
        case "mode":
            result = handleSetMode(config, rest);
            break;
        default: {
            api.ui.toast({
                variant: "error",
                title: "Fusion Config Error",
                message: `Unknown subcommand "${subcommand}". Available: panel, judge, mode.`,
            });
            return;
        }
    }
    if (result.ok) {
        saveConfig(api.kv, result.config);
        api.ui.toast({
            variant: "success",
            title: "Fusion Config Updated",
            message: formatConfigForDisplay(result.config),
        });
    }
    else {
        api.ui.toast({
            variant: "error",
            title: "Fusion Config Error",
            message: result.error,
        });
    }
}
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export function createConfigUI(api) {
    const configCommand = {
        title: "Fusion: Configuration",
        value: "fusion:config",
        description: "View and edit multi-model fusion configuration — manage " +
            "panel models, judge, and triggering mode.",
        category: "fusion",
        slash: {
            name: "fusion:config",
            aliases: ["config", "fusion-config"],
        },
        onSelect: async () => {
            const currentConfig = loadConfig(api.kv);
            const dialog = api.ui.dialog;
            dialog.replace(() => api.ui.DialogPrompt({
                title: "Fusion Configuration",
                description: () => formatConfigPrompt(currentConfig),
                placeholder: "panel add openai gpt-4o-mini",
                onConfirm: (value) => {
                    dialog.clear();
                    handleConfigInput(api, value.trim());
                },
                onCancel: () => {
                    dialog.clear();
                },
            }));
        },
    };
    registerTuiCommands(api, [configCommand]);
}
//# sourceMappingURL=config.js.map