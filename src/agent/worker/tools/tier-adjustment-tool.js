const DIRECTIONS = new Set(["up", "down"]);

export function createTierAdjustmentTool({ activeTier, requestAdjustment } = {}) {
  return {
    description:
      "Request reassignment to a stronger or weaker worker tier when investigation shows the current tier is unsuitable. " +
      "Use only with concrete evidence. You cannot select a model or tier. If the request is not applied, continue at the current tier and do not repeat it for the same reason.",
    params: {
      type: "object",
      additionalProperties: false,
      required: ["direction", "reason", "findings", "requested_capability"],
      properties: {
        direction: {
          type: "string",
          enum: ["up", "down"],
          description: "Use up for more capability or down for a simpler remaining task.",
        },
        reason: {
          type: "string",
          minLength: 1,
          maxLength: 300,
          description: "Concrete evidence that the current tier is insufficient or unnecessary.",
        },
        findings: {
          type: "string",
          minLength: 1,
          maxLength: 2000,
          description: "Concise handoff: work completed, relevant findings, and the next step.",
        },
        requested_capability: {
          type: "string",
          minLength: 1,
          maxLength: 100,
          description: "Capability needed for the remaining work, not a tier or model name.",
        },
      },
    },
    async handler(params = {}) {
      const direction = typeof params.direction === "string" ? params.direction : "";
      const reason = typeof params.reason === "string" ? params.reason.trim() : "";
      const findings = typeof params.findings === "string" ? params.findings.trim() : "";
      const requestedCapability =
        typeof params.requested_capability === "string" ? params.requested_capability.trim() : "";
      if (
        !Number.isInteger(activeTier) ||
        !DIRECTIONS.has(direction) ||
        !reason ||
        !findings ||
        !requestedCapability
      ) {
        return unchanged(
          activeTier,
          "The tier-adjustment request requires direction, reason, findings, and requested capability.",
        );
      }
      if (typeof requestAdjustment !== "function")
        return unchanged(
          activeTier,
          "Tier adjustment is unavailable; continue with the current tier.",
        );

      const decision = await requestAdjustment({
        currentTier: activeTier,
        direction,
        reason,
        findings,
        requestedCapability,
      });
      if (!decision || decision.status !== "adjusted" || !Number.isInteger(decision.selectedTier))
        return unchanged(
          activeTier,
          decision?.reason ?? "No suitable alternative tier is available.",
        );
      return {
        ok: true,
        output: `Tier adjustment approved: handing off from Tier ${activeTier} to Tier ${decision.selectedTier}.`,
        handoff: {
          previousTier: activeTier,
          selectedTier: decision.selectedTier,
          reason: decision.reason ?? reason,
          findings,
          requestedCapability,
        },
      };
    },
  };
}

function unchanged(currentTier, reason) {
  return {
    ok: true,
    status: "unchanged",
    output: `Tier adjustment was not applied: ${reason} Continue with Tier ${currentTier} and do not repeat this request for the same reason.`,
  };
}
