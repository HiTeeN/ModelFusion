export type FusionProgressStage = "fan-out" | "panelist" | "judging" | "synthesis" | "complete" | "degraded" | "error";
export type FusionProgressEvent = {
    sessionID: string;
    stage: FusionProgressStage;
    detail?: string;
};
export declare function emitFusionProgress(event: FusionProgressEvent): void;
export declare function subscribeToFusionProgress(listener: (event: FusionProgressEvent) => void): () => void;
export declare function getFusionProgressListenerCount(): number;
//# sourceMappingURL=progress-bus.d.ts.map