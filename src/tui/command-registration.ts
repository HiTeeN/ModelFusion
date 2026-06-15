import type { TuiCommand, TuiDialogStack, TuiPluginApi } from "@opencode-ai/plugin/tui";

type KeymapLayerCommand = {
  name: string;
  title: string;
  desc?: string;
  category?: string;
  suggested?: boolean;
  hidden?: boolean;
  enabled?: boolean;
  namespace: "palette";
  slashName?: string;
  slashAliases?: string[];
  run: () => void | Promise<void>;
};

function toKeymapLayerCommand(
  command: TuiCommand,
  dialog: TuiDialogStack,
): KeymapLayerCommand {
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

export function registerTuiCommands(
  api: TuiPluginApi,
  commands: TuiCommand[],
): void {
  if (api.command?.register) {
    api.command.register(() => commands);
    return;
  }

  api.keymap.registerLayer({
    commands: commands.map((command) =>
      toKeymapLayerCommand(command, api.ui.dialog),
    ),
    bindings: [],
  });
}
