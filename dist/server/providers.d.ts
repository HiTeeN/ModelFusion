import type { PanelModel } from "../types/config.js";
export interface ProviderClient {
    config: {
        providers: () => Promise<Record<string, {
            models?: Record<string, unknown>;
        }>>;
    };
}
export interface AvailableModel {
    providerId: string;
    modelId: string;
}
export interface ValidationResult {
    valid: PanelModel[];
    invalid: PanelModel[];
}
export declare function discoverAvailableModels(client: ProviderClient): Promise<AvailableModel[]>;
export declare function validatePanelModels(available: AvailableModel[], configured: PanelModel[]): ValidationResult;
export declare function resolveModel(providerId: string, modelId: string): {
    providerID: string;
    modelID: string;
};
//# sourceMappingURL=providers.d.ts.map