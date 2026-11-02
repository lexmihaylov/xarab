import { buildSystemPrompt } from "./instructions.js";

export function systemPromptFor({
  workspace,
  instructionFiles,
  tier,
  tierAdjustmentTool,
  definitions,
}) {
  const toolDescriptions = Object.entries(definitions).map(([name, definition]) => ({
    name,
    description: definition.description,
  }));
  const prompt = buildSystemPrompt({
    workspace,
    instructionFiles,
    availableTools: [
      ...toolDescriptions,
      ...(tierAdjustmentTool
        ? [{ name: "tier_adjustment", description: tierAdjustmentTool.description }]
        : []),
    ],
  });
  if (!tierAdjustmentTool) return prompt;
  return `${prompt}\n\n## Tier adjustment\nYour active tier is ${tier}. Tier 1 follows a known approach with clear local verification. Tier 2 discovers a bounded approach using established techniques. Tier 3 resolves competing explanations, novel reasoning, or coupled correctness constraints where errors are costly or hard to detect.\nAdjustment is normal routing maintenance, not an admission of failure. After investigation, request up when evidence shows the remaining work exceeds your tier: for example, subtle interleavings, competing root causes, or coupled security and recovery invariants. Do not wait for repeated failures. Request down when investigation has established a precise approach and substantial remaining work fits a lower tier. Avoid handoffs for tiny amounts of work.\nUse concrete findings, preserve acceptance criteria and approval requirements, and describe the remaining work rather than repeating the original project scope. Do not adjust merely because work is long or tools are needed. Request a capability, never a model or tier. At most one approved handoff is allowed per request. If not applied, continue at the current tier and do not repeat it for the same reason.`;
}
