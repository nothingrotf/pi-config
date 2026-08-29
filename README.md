# pi-config

This repository stores the current personal configuration for Pi, agent skills, Zed, Ghostty, and FusionTUI.

## Layout

- `agent/settings.json` stores the main Pi settings, packages, models, and interface options.
- `agent/models.json` stores provider model overrides.
- `agent/AGENTS.md` stores the global agent instructions.
- `agent/APPEND_SYSTEM.md` stores the appended system prompt.
- `agent/npm/` stores the extension package manifest, lockfile, and patches.
- `agent/extensions/` stores local Pi extensions.
- `agent/profiles/` stores the profiles for Pi subagents.
- `agent/themes/` stores Pi themes.
- `agent/skills/` stores local Pi skills.
- `skills/` stores shared agent skills from `~/.agents/skills/`.
- `commands/` stores shared agent commands from `~/.agents/commands/`.
- `skill-lock.json` stores the shared skill installation state.
- `zed/` stores Zed settings, key bindings, and themes.
- `ghostty/` stores the Ghostty configuration and themes.
- `fusiontui.json` stores the FusionTUI settings.

## Restore

1. Copy the contents of `agent/` to `~/.pi/agent/`.
2. Copy the contents of `skills/` to `~/.agents/skills/`.
3. Copy the contents of `commands/` to `~/.agents/commands/`.
4. Copy `skill-lock.json` to `~/.agents/.skill-lock.json`.
5. Copy the contents of `zed/` to `~/.config/zed/`.
6. Copy the contents of `ghostty/` to `~/.config/ghostty/`.
7. Copy `fusiontui.json` to `~/.pi/fusiontui.json`.
8. Run `npm install` in `~/.pi/agent/npm/`.
9. Authenticate each provider again.

## Excluded data

The repository excludes credentials, OAuth data, sessions, caches, generated databases, logs, and other runtime state.
