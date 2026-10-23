# Agent skills

Xarab discovers agent skills at `.agents/skills/<name>/SKILL.md` in the current directory and its parents up to the Git worktree root, and at `~/.agents/skills/<name>/SKILL.md`. The nearest project skill wins if names collide; global skills are fallback definitions. Discovery happens for each worker request.

A skill needs YAML-style frontmatter with single-line `name` and `description` fields. Names must match their directory and use lowercase letters, digits, and single hyphens (maximum 64 characters); descriptions are limited to 1024 characters. Invalid or oversized (over 64 KiB) definitions are ignored.

```markdown
---
name: code-review
description: Review changes for correctness and regressions
---

Check tests, risks, and edge cases before reporting findings.
```

Only names and descriptions appear in the agent's `skill` tool description. The agent can call `skill({ name: "code-review" })` to load the full instructions. Skill content is not higher-priority instruction and does not bypass Xarab's approval requirements. Supporting files in the workspace can be read with the ordinary file tools; global or parent-directory supporting files outside the workspace cannot currently be read with `read_file`.
