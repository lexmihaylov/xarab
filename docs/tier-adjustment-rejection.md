# Upward tier adjustment rejection

**Type:** `issue`
**Status:** `deferred`

An upward tier-adjustment request can be rejected with the message "The router found no suitable tier in the requested direction." This wording may suggest that no suitable worker model is configured, but the controller emits it earlier when the classifier does not select a tier in the requested direction. In that path, the selected worker's configuration has not yet been checked.

For example, an upward request from Tier 2 requires the classifier to select Tier 3. If it selects Tier 1 or Tier 2, the request is rejected before checking whether Tier 3 has a configured worker. The message therefore does not establish that a suitable Tier 3 worker is unavailable.

The exact classifier result and configuration involved in the reported incident were not captured here, so this is a documented possible explanation based on the controller's current decision path, not a confirmed root cause. No routing behavior is changed by this issue record.

## Follow-up

- Capture the classifier's selected tier and rationale alongside adjustment outcomes.
- Use distinct messages for classifier direction mismatch, missing worker configuration, and same-model assignment.
- Add coverage for upward adjustment from Tier 2 to Tier 3 and relevant rejection paths.
- Review the reassessment prompt to ensure remaining-work context is clear without forcing the requested direction.
