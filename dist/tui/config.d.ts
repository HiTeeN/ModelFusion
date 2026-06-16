import type { TuiPluginApi } from "@opencode-ai/plugin/tui";
import { type FusionConfig } from "../types/config.js";
export declare function saveConfig(kv: TuiPluginApi["kv"], config: FusionConfig): void;
export declare function formatConfigForDisplay(config: FusionConfig): string;
export declare function formatConfigPrompt(_config: FusionConfig): string;
export type ConfigResult = {
    ok: true;
    config: FusionConfig;
} | {
    ok: false;
    error: string;
};
export declare function handlePanelAdd(config: FusionConfig, args: string[]): ConfigResult;
export declare function handlePanelRemove(config: FusionConfig, args: string[]): ConfigResult;
export declare function handleSetJudge(config: FusionConfig, args: string[]): ConfigResult;
export declare function handleSetMode(config: FusionConfig, args: string[]): ConfigResult;
export declare function handleConfigInput(api: TuiPluginApi, input: string): void;
export declare function createConfigUI(api: TuiPluginApi): void;
//# sourceMappingURL=config.d.ts.map