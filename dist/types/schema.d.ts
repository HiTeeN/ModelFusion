import type { JudgeOutput } from "./results.js";
/**
 * JSON Schema (draft-07) for the judge model's structured output.
 * Validates that the judge returns all required analysis sections.
 */
export declare const JUDGE_OUTPUT_SCHEMA: {
    readonly $schema: "http://json-schema.org/draft-07/schema#";
    readonly type: "object";
    readonly additionalProperties: false;
    readonly required: readonly ["consensus", "contradictions", "partial_coverage", "unique_insights", "blind_spots", "scoring"];
    readonly properties: {
        readonly consensus: {
            readonly type: "array";
            readonly description: "Points where multiple models agree on the same conclusion";
            readonly items: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly required: readonly ["point", "supporting_models"];
                readonly properties: {
                    readonly point: {
                        readonly type: "string";
                        readonly description: "The agreed-upon point or conclusion";
                    };
                    readonly supporting_models: {
                        readonly type: "array";
                        readonly description: "Models that expressed this point";
                        readonly items: {
                            readonly type: "string";
                        };
                    };
                };
            };
        };
        readonly contradictions: {
            readonly type: "array";
            readonly description: "Topics where models gave conflicting answers";
            readonly items: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly required: readonly ["topic", "stances"];
                readonly properties: {
                    readonly topic: {
                        readonly type: "string";
                        readonly description: "The topic where disagreement exists";
                    };
                    readonly stances: {
                        readonly type: "array";
                        readonly description: "Each model's stance on the topic";
                        readonly items: {
                            readonly type: "object";
                            readonly additionalProperties: false;
                            readonly required: readonly ["model_id", "stance"];
                            readonly properties: {
                                readonly model_id: {
                                    readonly type: "string";
                                    readonly description: "ID of the model that took this stance";
                                };
                                readonly stance: {
                                    readonly type: "string";
                                    readonly description: "The stance or position taken by this model";
                                };
                            };
                        };
                    };
                };
            };
        };
        readonly partial_coverage: {
            readonly type: "array";
            readonly description: "Topics or subtopics that only some models addressed";
            readonly items: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly required: readonly ["point", "models"];
                readonly properties: {
                    readonly point: {
                        readonly type: "string";
                        readonly description: "The topic with partial coverage";
                    };
                    readonly models: {
                        readonly type: "array";
                        readonly description: "Models that addressed this topic";
                        readonly items: {
                            readonly type: "string";
                        };
                    };
                };
            };
        };
        readonly unique_insights: {
            readonly type: "array";
            readonly description: "Valuable contributions made by only a single model";
            readonly items: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly required: readonly ["model_id", "insight"];
                readonly properties: {
                    readonly model_id: {
                        readonly type: "string";
                        readonly description: "The model that provided this unique insight";
                    };
                    readonly insight: {
                        readonly type: "string";
                        readonly description: "The unique contribution or perspective";
                    };
                };
            };
        };
        readonly blind_spots: {
            readonly type: "array";
            readonly description: "Important aspects of the query that no model addressed";
            readonly items: {
                readonly type: "string";
            };
        };
        readonly scoring: {
            readonly type: "array";
            readonly description: "Quality scores for each model's response";
            readonly items: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly required: readonly ["model_id", "scores", "total"];
                readonly properties: {
                    readonly model_id: {
                        readonly type: "string";
                        readonly description: "The model being scored";
                    };
                    readonly scores: {
                        readonly type: "object";
                        readonly additionalProperties: false;
                        readonly required: readonly ["completeness", "accuracy", "novelty", "clarity"];
                        readonly properties: {
                            readonly completeness: {
                                readonly type: "number";
                                readonly minimum: 0;
                                readonly maximum: 10;
                                readonly description: "How thoroughly the model addressed the query";
                            };
                            readonly accuracy: {
                                readonly type: "number";
                                readonly minimum: 0;
                                readonly maximum: 10;
                                readonly description: "Factual correctness of the response";
                            };
                            readonly novelty: {
                                readonly type: "number";
                                readonly minimum: 0;
                                readonly maximum: 10;
                                readonly description: "Unique or original insights provided";
                            };
                            readonly clarity: {
                                readonly type: "number";
                                readonly minimum: 0;
                                readonly maximum: 10;
                                readonly description: "How well-structured and clear the response is";
                            };
                        };
                    };
                    readonly total: {
                        readonly type: "number";
                        readonly minimum: 0;
                        readonly maximum: 40;
                        readonly description: "Sum of all score dimensions";
                    };
                };
            };
        };
        readonly winner: {
            readonly type: "string";
            readonly description: "The model ID judged to have provided the best overall response, or null if no clear winner";
        };
    };
};
/**
 * Type helper to extract the inferred shape from the JSON schema.
 */
export type JudgeOutputSchemaType = typeof JUDGE_OUTPUT_SCHEMA;
export type { JudgeOutput };
//# sourceMappingURL=schema.d.ts.map