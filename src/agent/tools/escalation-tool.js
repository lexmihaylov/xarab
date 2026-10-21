export function createEscalationTool({ activeTier, escalationCount = 0 } = {}) {
  const targetTier = Number.isInteger(activeTier) ? activeTier + 1 : null;

  if (!Number.isInteger(activeTier) || activeTier >= 3 || escalationCount >= 1) return null;

  return {
    description:
      "Request a handoff to the next worker tier only after investigation produces concrete evidence that this task exceeds the current tier. Escalate when findings reveal broader codebase or multi-system complexity, significant unknowns requiring deeper investigation, cross-cutting architectural impact, high-risk or consequential changes, or substantial external research beyond the current tier. Do not escalate because the request is long, because tools are needed, or merely to avoid continuing work. Include specific evidence in findings. This ends the current run.",
    params: {
      type: "object",
      additionalProperties: false,
      required: ["target_tier", "reason", "findings"],
      properties: {
        target_tier: {
          type: "integer",
          enum: [targetTier],
          description: `The next tier only: ${targetTier}.`,
        },
        reason: {
          type: "string",
          minLength: 1,
          maxLength: 300,
          description:
            "Why the discovered scope exceeds this tier, such as cross-system complexity, high consequence, unresolved uncertainty, or research needs.",
        },
        findings: {
          type: "string",
          minLength: 1,
          maxLength: 2000,
          description:
            "Specific investigation evidence for the next worker: affected files or systems, dependencies, risks, unknowns, and research performed or still required.",
        },
      },
    },
    async handler(params = {}) {
      const reason = typeof params.reason === "string" ? params.reason.trim() : "";
      const findings = typeof params.findings === "string" ? params.findings.trim() : "";
      if (params.target_tier !== targetTier || !reason || !findings) {
        return {
          ok: false,
          output: `Escalation denied: Tier ${activeTier} may only request Tier ${targetTier} with a reason and findings.`,
        };
      }
      return {
        ok: true,
        output: `Escalation accepted: handing off from Tier ${activeTier} to Tier ${targetTier}.`,
        stop: true,
        handoff: { fromTier: activeTier, targetTier, reason, findings },
      };
    },
  };
}
