import type { TuiPluginApi, TuiDialogStack } from "@opencode-ai/plugin/tui";
import {
  subscribeToFusionProgress,
  type FusionProgressEvent,
} from "../progress-bus";
import { FusionProgressNotifier } from "./progress";

const FUSION_MANUAL_VARIANT = "fusion:manual";

/**
 * New keymap-layer command shape used by `api.keymap.registerLayer`.
 * Matches the shape registered by `index.ts` and `config.ts`.
 */
export type FusionKeymapCommand = {
  name: string;
  title: string;
  desc: string;
  category: string;
  namespace: string;
  slashName: string;
  slashAliases: string[];
  run: () => Promise<void> | void;
};

/**
 * Creates the `/fusion` slash command that triggers the multi-model
 * deliberation pipeline. The command extracts the user's question,
 * shows progress toasts at each pipeline stage, and delegates the
 * actual fusion execution to the server plugin.
 *
 * Flow:
 *   1. User types `/fusion <question>` in the TUI prompt
 *   2. run() fires → extract question from dialog prompt
 *   3. Subscribe to real pipeline progress events
 *   4. Delegate to server plugin (async, non-blocking)
 *   5. Server plugin runs: fan-out → judge → synthesize
 *   6. Progress toasts fire from real stage events
 *   7. Final result toast displayed
 */
export function createFusionCommand(api: TuiPluginApi): FusionKeymapCommand {
  return {
    name: "fusion:deliberate",
    title: "Fusion: Deliberate",
    desc:
      "Multi-model deliberation: panel of models → judge → structured analysis. " +
      "Invoke from the TUI palette or via the /fusion slash command.",
    category: "fusion",
    namespace: "palette",
    slashName: "fusion",
    slashAliases: ["deliberate", "panel"],
    run: async () => {
      const question = await extractQuestion(api);

      if (!question || !question.trim()) {
        api.ui.toast({
          variant: "warning",
          title: "Fusion",
          message:
            "No question provided. Type your question after /fusion, " +
            'e.g. "/fusion What are the trade-offs between monoliths and microservices?"',
        });
        return;
      }
      delegateToServerPipeline(api, question);
    },
  };
}

async function extractQuestion(api: TuiPluginApi): Promise<string> {
  const dialog: TuiDialogStack = api.ui.dialog;

  if (!dialog || !dialog.open) {
    return "";
  }

  return new Promise<string>((resolve) => {
    dialog.replace(() =>
      api.ui.DialogPrompt({
        title: "Fusion Deliberation",
        description: () =>
          "Enter your question for multi-model analysis. " +
          "A panel of AI models will deliberate, a judge will compare " +
          "their responses, and a synthesizer will produce a final answer.",
        placeholder:
          "e.g., What are the trade-offs between monoliths and microservices?",
        onConfirm: (value: string) => {
          dialog.clear();
          resolve(value);
        },
        onCancel: () => {
          dialog.clear();
          resolve("");
        },
      }),
    );
  });
}

function delegateToServerPipeline(
  api: TuiPluginApi,
  question: string,
): void {
  const notifier = new FusionProgressNotifier(api);
  const sessionID =
    api.route.current.name === "session"
      ? (api.route.current as { params: { sessionID: string } }).params
          .sessionID
      : "";

  const unsubscribe = subscribeToFusionProgress((event: FusionProgressEvent) => {
    if (event.sessionID !== sessionID) {
      return;
    }

    notifier.notifyStage(event.stage, event.detail);

    if (
      event.stage === "complete" ||
      event.stage === "degraded" ||
      event.stage === "error"
    ) {
      unsubscribe();
      clearTimeout(safetyTimeout);
    }
  });

  const safetyTimeout = setTimeout(() => {
    unsubscribe();
  }, 300_000);

  void api.client.session
    .prompt({
      sessionID,
      variant: FUSION_MANUAL_VARIANT,
      parts: [{ type: "text", text: question }],
    })
    .catch((_err: unknown) => {
      unsubscribe();
      clearTimeout(safetyTimeout);
      api.ui.toast({
        variant: "error",
        title: "Fusion",
        message: "Fusion pipeline failed. Check the server logs for details.",
      });
    });
}
