# pi-config

Personal configuration for the pi coding agent.

## Layout

- `agent/settings.json` - main pi settings (theme, packages, models, subagents)
- `agent/models.json` - provider model overrides
- `agent/AGENTS.md` - global agent instructions
- `agent/APPEND_SYSTEM.md` - appended system prompt (STE-100 writing rules)
- `agent/npm/` - extension package manifest and lockfile
- `agent/extensions/` - local extensions (calm, context-window-guard, image-guard, terminal-status-title)
- `agent/profiles/` - pi-subagents profiles and provider model lists
- `skills/` - agent skills from `~/.agents/skills/`
- `fusiontui.json` - fusiontui settings

## Restore

1. Copy `agent/` contents to `~/.pi/agent/`.
2. Copy `skills/` to `~/.agents/skills/`.
3. Copy `fusiontui.json` to `~/.pi/fusiontui.json`.
4. Run `npm install` in `~/.pi/agent/npm/`.
5. Authenticate providers again. Credential files are not in this repo.

## Excluded

Secrets and runtime state are not in this repo: `auth.json`, `models-store.json`, `mcp-oauth/`, `sessions/`, `run-history.jsonl`, caches, and logs.
