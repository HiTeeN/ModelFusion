export async function discoverAvailableModels(client) {
    const providers = await client.config.providers();
    const models = [];
    for (const [providerId, providerConfig] of Object.entries(providers)) {
        if (providerConfig.models) {
            for (const modelId of Object.keys(providerConfig.models)) {
                models.push({ providerId, modelId });
            }
        }
    }
    return models;
}
export function validatePanelModels(available, configured) {
    const availableSet = new Set(available.map((m) => `${m.providerId}::${m.modelId}`));
    const valid = [];
    const invalid = [];
    for (const model of configured) {
        const key = `${model.providerId}::${model.modelId}`;
        if (availableSet.has(key)) {
            valid.push(model);
        }
        else {
            invalid.push(model);
        }
    }
    return { valid, invalid };
}
export function resolveModel(providerId, modelId) {
    return { providerID: providerId, modelID: modelId };
}
//# sourceMappingURL=providers.js.map