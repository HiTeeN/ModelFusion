import { EventEmitter } from "node:events";

export type FusionProgressStage =
  | "fan-out"
  | "panelist"
  | "judging"
  | "synthesis"
  | "complete"
  | "degraded"
  | "error";

export type FusionProgressEvent = {
  sessionID: string;
  stage: FusionProgressStage;
  detail?: string;
};

const emitter = new EventEmitter();

export function emitFusionProgress(event: FusionProgressEvent): void {
  emitter.emit("progress", event);
}

export function subscribeToFusionProgress(
  listener: (event: FusionProgressEvent) => void,
): () => void {
  emitter.on("progress", listener);
  return () => emitter.off("progress", listener);
}

export function getFusionProgressListenerCount(): number {
  return emitter.listenerCount("progress");
}
