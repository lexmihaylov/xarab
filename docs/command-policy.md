# Workspace command and file policy

**Type:** `decision`
**Status:** `in-progress`

Place JSON at `<workspace>/.xarab/command-policy.json`. Only that exact workspace root is consulted. The file must be a regular file, not resolve through symlinks, and be at most 16 KiB.

```json
{
  "version": 1,
  "commands": {
    "git": "allow",
    "rm": "deny",
    "npm": "verify"
  },
  "files": {
    ".env": "deny",
    "package.json": "verify"
  },
  "folders": {
    "secrets": "deny",
    "generated": "allow"
  }
}
```

## Rules

Sections are optional maps. Commands match exact bare executable names, not subcommands or executable paths. File rules match exact workspace-relative paths; folder rules include all descendants. Paths use `/`, with no glob syntax, `..`, or absolute paths. Use `.` to match the workspace folder. Strictest wins: **deny > verify > allow**. An allow exception cannot override a denied parent folder.

An explicit command allow bypasses model assessment for a simple command. Groups of simple commands retain assessment for unmatched members and all members must be authorized before the group executes. A bounded quote-aware tokenizer preserves quoted separators. Expansions, comments, redirections and unsupported shell constructs retain assessment of the original command rather than qualifying for automatic approval. Command path tokens and simple redirection targets also contribute matching path rules. Verification requests explicit consent; unavailable or cancelled verification prevents the action. Existing tool workspace and symlink protections still apply even to allowed paths.

## Activation

Before an agent action uses a new policy or changed contents, Xarab asks whether to activate it. Decisions are cached in process memory by workspace and exact contents, shared across parent and delegated tool registries. Cancelled or temporarily unavailable activation is not cached and can be retried; explicit decisions are cached. Cancelled callers stop waiting independently of other callers. Denied or unavailable activation **ignores the policy and retains existing behavior**, rather than enforcing its deny rules. Missing policies use existing behavior. Invalid policies are ignored with a console warning. No approval decisions are persisted to disk.

## Native tool coverage

- `read_file`, `write`, `edit`, `insert_before`, `insert_after`: requested file.
- `list_files`, `search_files`, `search_content`: requested target and rules for descendants.
- `analyze_image`: input image.
- `edit_image`: input image and output folder.
- `generate_image`: output folder.
- `run_command`: command rules and best-effort explicit path-token matching.

Directory operations conservatively apply the strictest descendant rule to the **whole operation**, including listings, searches and image destination folders. For example, searching `.` is denied if a descendant file is denied, even when that search would not read it. Native checks consider both lexical paths and resolved paths (including existing parents of new files).

Direct user `!` commands, MCP/external tools, skills, and web tools are outside this policy. Delegated agents use the same native-tool integration.

## Limitations and remaining work

This is an authorization convenience, **not a sandbox**. Shell parsing is best effort: quoting, redirection, generated paths, symlinks, scripts, executable arguments and child processes can conceal effects. The model assessment does not return a structured inventory of accessed paths. A permitted executable can access denied files indirectly. Time-of-check filesystem changes also remain possible. Do not use this mechanism to isolate untrusted code or protect secrets from arbitrary commands.

Policy prompts are serialized with other policy prompts using the same question callback. An unrelated open question dialog can make activation unavailable (which falls back as specified) or deny verification. Full cross-dialog scheduling and traversal-level filtering instead of conservative whole-operation checks remain improvements.
