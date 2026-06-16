import type { Part } from "@opencode-ai/sdk";
import type { FusionConfig } from "../../types/config.js";
import { RecursionGuard } from "../recursion-guard.js";
import { runFusionPipeline, type PipelineClient } from "../pipeline.js";
import type { OriginalModel } from "../synthesizer.js";
import {
  formatFusionConfigForDisplay,
  fusionResultToParts,
  invalidCommandMessageToParts,
  parseFusionCommand,
} from "../fusion-command.js";

export interface CommandExecutePluginState {
  config: FusionConfig;
  recursionGuard: RecursionGuard;
  pipeline: typeof runFusionPipeline;
  client: PipelineClient;
}

export interface CommandExecuteBeforeInput {
  command: string;
  sessionID: string;
  arguments: string;
}

export interface CommandExecuteBeforeOutput {
  parts: Part[];
}

export function createCommandExecuteBeforeHook(
  pluginState: CommandExecutePluginState,
): (
  input: CommandExecuteBeforeInput,
  output: CommandExecuteBeforeOutput,
) => Promise<void> {
  const { config, recursionGuard, pipeline, client } = pluginState;

  return async (
    input: CommandExecuteBeforeInput,
    output: CommandExecuteBeforeOutput,
  ): Promise<void> => {
    if (!config.enabled) {
      return;
    }

    const intent = parseFusionCommand(input.command, input.arguments);
    if (!intent) {
      return;
    }

    if (intent.kind === "config") {
      output.parts = [
        {
          type: "text",
          text: formatFusionConfigForDisplay(config),
        } as Part,
      ];
      return;
    }

    if (intent.kind === "invalid") {
      output.parts = invalidCommandMessageToParts(intent.message);
      return;
    }

    const originalModel: OriginalModel = {
      providerId: config.judge.providerId,
      modelId: config.judge.modelId,
    };

    const result = await pipeline(
      client,
      input.sessionID,
      intent.prompt,
      config,
      originalModel,
      recursionGuard,
    );

    output.parts = fusionResultToParts(result);
  };
}
