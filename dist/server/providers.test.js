import { describe, expect, test } from "bun:test";
import { discoverAvailableModels, resolveModel, } from "./providers.js";
import { validatePanelModels } from "./providers.js";
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function mockClient(providers) {
    return {
        config: {
            providers: async () => providers,
        },
    };
}
const mockProviders = {
    openai: { models: { "gpt-4": {} } },
    anthropic: { models: { "claude-opus": {} } },
};
// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("discoverAvailableModels", () => {
    test("returns flattened list of providerId and modelId pairs", async () => {
        // GIVEN a mock client with two providers
        const client = mockClient(mockProviders);
        // WHEN discovering available models
        const models = await discoverAvailableModels(client);
        // THEN it returns expected pairs
        expect(models).toEqual([
            { providerId: "openai", modelId: "gpt-4" },
            { providerId: "anthropic", modelId: "claude-opus" },
        ]);
    });
});
describe("validatePanelModels", () => {
    const available = [
        { providerId: "openai", modelId: "gpt-4" },
        { providerId: "anthropic", modelId: "claude-opus" },
    ];
    test("all configured models exist in available", () => {
        // GIVEN configured models that all exist in the available set
        const configured = [
            { providerId: "openai", modelId: "gpt-4" },
            { providerId: "anthropic", modelId: "claude-opus" },
        ];
        // WHEN validating panel models
        const result = validatePanelModels(available, configured);
        // THEN all are valid, none are invalid
        expect(result.valid).toHaveLength(2);
        expect(result.invalid).toHaveLength(0);
    });
    test("some configured models are not available", () => {
        // GIVEN one valid and one invalid configured model
        const configured = [
            { providerId: "openai", modelId: "gpt-4" },
            { providerId: "google", modelId: "gemini-pro" },
        ];
        // WHEN validating panel models
        const result = validatePanelModels(available, configured);
        // THEN only the valid model is in valid, the other is in invalid
        expect(result.valid).toEqual([{ providerId: "openai", modelId: "gpt-4" }]);
        expect(result.invalid).toEqual([{ providerId: "google", modelId: "gemini-pro" }]);
    });
});
describe("resolveModel", () => {
    test("returns opencode-format model reference", () => {
        // GIVEN a providerId and modelId
        // WHEN resolving the model
        const result = resolveModel("openai", "gpt-4");
        // THEN it returns object with capital-D keys
        expect(result).toEqual({ providerID: "openai", modelID: "gpt-4" });
    });
});
//# sourceMappingURL=providers.test.js.map