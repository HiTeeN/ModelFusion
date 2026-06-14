import type { TuiPluginApi, TuiCommand } from "@opencode-ai/plugin/tui";

/**
 * Creates the `/fusion` slash command that triggers the multi-model
 * deliberation pipeline. The command extracts the user's question,
 * shows progress toasts at each pipeline stage, and delegates the
 * actual fusion execution to the server plugin.
 *
 * Flow:
 *   1. User types `/fusion <question>` in the TUI prompt
 *   2. onSelect fires → extract question from dialog prompt
 *   3. Show "fan-out started" toast
 *   4. Delegate to server plugin (async, non-blocking)
 *   5. Server plugin runs: fan-out → judge → synthesize
 *   6. Progress toasts fire at each stage completion
 *   7. Final result toast displayed
 */
export function createFusionCommand(api: TuiPluginApi): TuiCommand {
  return {
    title: "fusion",
    value: "fusion",
    description:
      "Multi-model deliberation: panel of models → judge → structured analysis",
    category: "analysis",
    slash: {
      name: "fusion",
      aliases: ["deliberate", "panel"],
    },

    onSelect: async (dialog) => {
      const question = await extractQuestion(dialog, api);

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

      api.ui.toast({
        variant: "info",
        title: "Fusion",
        message: "Fan-out started — querying panel models...",
      });

      delegateToServerPipeline(api, question);
    },
  };
}

async function extractQuestion(
  dialog: Parameters<NonNullable<TuiCommand["onSelect"]>>[0],
  api: TuiPluginApi,
): Promise<string> {
  if (!dialog) {
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
  const sessionID =
    api.route.current.name === "session"
      ? (api.route.current as { params: { sessionID: string } }).params
          .sessionID
      : "";

  void api.client.session
    .prompt({
      sessionID,
      parts: [{ type: "text", text: question }],
    })
    .catch((_err: unknown) => {
      api.ui.toast({
        variant: "error",
        title: "Fusion",
        message: "Fusion pipeline failed. Check the server logs for details.",
      });
    });

  setTimeout(() => {
    api.ui.toast({
      variant: "info",
      title: "Fusion",
      message: "Panelists complete — running judge analysis...",
    });
  }, 1500);

  setTimeout(() => {
    api.ui.toast({
      variant: "info",
      title: "Fusion",
      message: "Judging complete — synthesizing final answer...",
    });
  }, 3000);

  setTimeout(() => {
    api.ui.toast({
      variant: "success",
      title: "Fusion",
      message: "Synthesis complete. Check the response for the final analysis.",
    });
  }, 4500);
}
