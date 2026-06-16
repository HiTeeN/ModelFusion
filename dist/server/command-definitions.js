export function createFusionCommandDefinitions() {
    return {
        fusion: {
            description: "Run ModelFusion multi-model deliberation for the provided question",
            template: "/fusion $ARGUMENTS",
        },
        deliberate: {
            description: "Alias for /fusion",
            template: "/fusion $ARGUMENTS",
        },
        panel: {
            description: "Alias for /fusion",
            template: "/fusion $ARGUMENTS",
        },
        "fusion:config": {
            description: "Show the current ModelFusion configuration",
            template: "/fusion:config",
        },
        config: {
            description: "Alias for /fusion:config",
            template: "/fusion:config",
        },
        "fusion-config": {
            description: "Alias for /fusion:config",
            template: "/fusion:config",
        },
    };
}
//# sourceMappingURL=command-definitions.js.map