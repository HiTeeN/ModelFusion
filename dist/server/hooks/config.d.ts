export interface ConfigHookInput {
    command?: Record<string, unknown>;
    [key: string]: unknown;
}
export declare function createConfigHook(): (input: ConfigHookInput) => Promise<void>;
//# sourceMappingURL=config.d.ts.map