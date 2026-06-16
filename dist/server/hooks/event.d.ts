import type { RecursionGuard } from "../recursion-guard.js";
import type { CostTracker } from "../cost-tracker.js";
export interface EventHookInput {
    event: {
        type: string;
        sessionID?: string;
        error?: unknown;
        [key: string]: unknown;
    };
}
export interface PluginState {
    recursionGuard: RecursionGuard;
    costTracker: CostTracker;
}
export declare function createEventHook(pluginState: PluginState): (input: EventHookInput) => Promise<void>;
//# sourceMappingURL=event.d.ts.map