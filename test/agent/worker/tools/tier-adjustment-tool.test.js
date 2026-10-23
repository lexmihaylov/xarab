import test from "node:test";
import assert from "node:assert/strict";
import { createTierAdjustmentTool } from "../../../../src/agent/worker/tools/tier-adjustment-tool.js";

const request = {
  direction: "up",
  reason: "The change spans several independently configured systems.",
  findings: "Inspected the controller and worker boundaries; a coordinated handoff is needed.",
  requested_capability: "cross-system reasoning",
};

test("tier adjustment returns a handoff only when the router approves it", async () => {
  const tool = createTierAdjustmentTool({
    activeTier: 1,
    requestAdjustment: async (value) => {
      assert.deepEqual(value, {
        currentTier: 1,
        direction: "up",
        reason: request.reason,
        findings: request.findings,
        requestedCapability: "cross-system reasoning",
      });
      return { status: "adjusted", selectedTier: 2, reason: "Requires coordinated reasoning." };
    },
  });

  const result = await tool.handler(request);
  assert.equal(result.ok, true);
  assert.equal(result.handoff.selectedTier, 2);
  assert.equal(result.handoff.previousTier, 1);
});

test("tier adjustment returns regular tool output when no alternative is available", async () => {
  const tool = createTierAdjustmentTool({
    activeTier: 3,
    requestAdjustment: async () => ({
      status: "unchanged",
      reason: "No stronger worker is configured.",
    }),
  });

  const result = await tool.handler(request);
  assert.equal(result.ok, true);
  assert.equal(result.status, "unchanged");
  assert.equal(result.handoff, undefined);
  assert.match(result.output, /continue with Tier 3/i);
});
