export interface FusionCommandDefinition {
    template: string;
    description: string;
    agent?: string;
    model?: string;
    subtask?: boolean;
}
export type FusionCommandDefinitions = Record<string, FusionCommandDefinition>;
export declare function createFusionCommandDefinitions(): FusionCommandDefinitions;
//# sourceMappingURL=command-definitions.d.ts.map