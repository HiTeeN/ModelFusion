// ---------------------------------------------------------------------------
// synthesize — produce a final answer from judge analysis
// ---------------------------------------------------------------------------
export async function synthesize(client, sessionID, judgeOutput, panelResults, config, originalModel) {
    const prompt = buildSynthesisPrompt(judgeOutput, panelResults);
    const response = await client.session.prompt({
        sessionID,
        model: {
            providerID: originalModel.providerId,
            modelID: originalModel.modelId,
        },
        parts: [{ type: "text", text: prompt }],
    });
    return (response.parts
        .filter((p) => p.type === "text" && typeof p.text === "string")
        .map((p) => p.text)
        .join("") ?? "");
}
// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------
function buildSynthesisPrompt(judgeOutput, panelResults) {
    const judgeJson = JSON.stringify(judgeOutput, null, 2);
    const panelSummary = panelResults
        .map((r) => `### ${r.providerId}/${r.modelId}\n${r.content}`)
        .join("\n\n");
    return [
        "You have received structured analysis from a judge comparing multiple AI model responses to the same prompt.",
        "",
        "## Judge Analysis",
        "```json",
        judgeJson,
        "```",
        "",
        "## Original Model Responses",
        panelSummary,
        "",
        "## Instructions",
        "Write a comprehensive final answer that incorporates the consensus, addresses contradictions, highlights unique insights, and acknowledges blind spots.",
        "Attribute claims to specific models where relevant (e.g., 'Claude noted that...', 'GPT-4o uniquely observed...').",
        "Synthesize the best elements from all responses into a single coherent answer.",
        "If the judge identified a winner, give appropriate weight to that model's response.",
        "Do not simply repeat the judge's analysis — produce a polished final answer for the end user.",
    ].join("\n");
}
//# sourceMappingURL=synthesizer.js.map