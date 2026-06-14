import type { PanelModel } from "../types/config";

export interface ProviderClient {
  config: {
    providers: () => Promise<Record<string, { models?: Record<string, unknown> }>>;
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

export async function discoverAvailableModels(
  client: ProviderClient,
): Promise<AvailableModel[]> {
  const providers = await client.config.providers();
  const models: AvailableModel[] = [];

  for (const [providerId, providerConfig] of Object.entries(providers)) {
    if (providerConfig.models) {
      for (const modelId of Object.keys(providerConfig.models)) {
        models.push({ providerId, modelId });
      }
    }
  }

  return models;
}

export function validatePanelModels(
  available: AvailableModel[],
  configured: PanelModel[],
): ValidationResult {
  const availableSet = new Set(
    available.map((m) => `${m.providerId}::${m.modelId}`),
  );

  const valid: PanelModel[] = [];
  const invalid: PanelModel[] = [];

  for (const model of configured) {
    const key = `${model.providerId}::${model.modelId}`;
    if (availableSet.has(key)) {
      valid.push(model);
    } else {
      invalid.push(model);
    }
  }

  return { valid, invalid };
}

export function resolveModel(
  providerId: string,
  modelId: string,
): { providerID: string; modelID: string } {
  return { providerID: providerId, modelID: modelId };
}