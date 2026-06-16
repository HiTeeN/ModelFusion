function toKeymapLayerCommand(command, dialog) {
    return {
        name: command.value,
        title: command.title,
        desc: command.description,
        category: command.category,
        suggested: command.suggested,
        hidden: command.hidden,
        enabled: command.enabled,
        namespace: "palette",
        slashName: command.slash?.name,
        slashAliases: command.slash?.aliases,
        run: () => command.onSelect?.(dialog),
    };
}
export function registerTuiCommands(api, commands) {
    if (api.command?.register) {
        api.command.register(() => commands);
        return;
    }
    api.keymap.registerLayer({
        commands: commands.map((command) => toKeymapLayerCommand(command, api.ui.dialog)),
        bindings: [],
    });
}
//# sourceMappingURL=command-registration.js.map