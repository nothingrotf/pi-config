# pi-config

This repository stores the current personal configuration for Pi, agent skills, Zed, Ghostty, and FusionTUI.

## Layout

- `agent/settings.json` stores the main Pi settings, packages, models, and interface options.
- `agent/models.json` stores provider model overrides.
- `agent/AGENTS.md` stores the global agent instructions.
- `agent/APPEND_SYSTEM.md` stores the appended system prompt.
- `agent/extensions/` stores local Pi extensions.
- `agent/themes/` stores Pi themes.
- `skills/` stores shared agent skills from `~/.agents/skills/`.
- `commands/` stores shared agent commands from `~/.agents/commands/`.
- `rules/` stores shared agent rules from `~/.agents/rules/`.
- `skill-lock.json` stores the shared skill installation state.
- `zed/` stores Zed settings, key bindings, and themes.
- `ghostty/` stores the Ghostty configuration and themes.
- `fusiontui.json` stores the FusionTUI settings.

## Restore

1. Copy the contents of `agent/` to `~/.pi/agent/`.
2. Copy the contents of `skills/` to `~/.agents/skills/`.
3. Copy the contents of `commands/` to `~/.agents/commands/`.
4. Copy the contents of `rules/` to `~/.agents/rules/`.
5. Copy `skill-lock.json` to `~/.agents/.skill-lock.json`.
6. Copy the contents of `zed/` to `~/.config/zed/`.
7. Copy the contents of `ghostty/` to `~/.config/ghostty/`.
8. Copy `fusiontui.json` to `~/.pi/fusiontui.json`.
9. Restore the local package repositories before you start Pi.
10. Adjust local package paths in `~/.pi/agent/settings.json` to match their locations.
11. Authenticate each provider again.

## Local packages

The settings reference local repositories that this backup does not include:

- `nothingrotf/pi-extensions` supplies extensions and package skills, including `loop` and `pstack`.
- `nothingrotf/pi-anthropic-auth` supplies the local authentication extension.

The snapshot preserves the original package paths. The shared skills in `skills/` do not include skills from these packages.

Pi installs the configured npm packages at startup. This repository excludes the local npm installation.

## Excluded data

The repository excludes credentials, OAuth data, sessions, caches, generated databases, logs, and other runtime state.
