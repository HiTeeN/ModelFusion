/**
 * Core result and output types for the ModelFusion plugin.
 * These types mirror OpenRouter's Fusion response format.
 */

export interface TokenCount {
  prompt: number;
  completion: number;
}

export interface PanelResult {
  modelId: string;
  providerId: string;
  content: string;
  tokenCount: TokenCount;
  latencyMs: number;
  error?: string;
}

export interface ConsensusPoint {
  point: string;
  supportingModels: string[];
}

export interface ContradictionStance {
  modelId: string;
  stance: string;
}

export interface Contradiction {
  topic: string;
  stances: ContradictionStance[];
}

export interface PartialCoverage {
  point: string;
  models: string[];
}

export interface UniqueInsight {
  modelId: string;
  insight: string;
}

export interface ModelScores {
  completeness: number;
  accuracy: number;
  novelty: number;
  clarity: number;
}

export interface Scoring {
  modelId: string;
  scores: ModelScores;
  total: number;
}

export interface JudgeOutput {
  consensus: ConsensusPoint[];
  contradictions: Contradiction[];
  partial_coverage: PartialCoverage[];
  unique_insights: UniqueInsight[];
  blind_spots: string[];
  scoring: Scoring[];
  winner: string | null;
}

export type FusionResultStatus = "ok" | "degraded" | "error";

export interface FailedModel {
  modelId: string;
  reason: string;
}

export interface FusionCost {
  totalPromptTokens: number;
  totalCompletionTokens: number;
  estimatedCost: number;
}

export interface FusionResult {
  status: FusionResultStatus;
  analysis?: JudgeOutput;
  responses: PanelResult[];
  failedModels?: FailedModel[];
  synthesizedAnswer?: string;
  cost: FusionCost;
  failureReason?: string;
}