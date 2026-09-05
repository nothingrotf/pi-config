# pi-config

This repository stores the current personal configuration for Pi, agent skills, Zed, Ghostty, and FusionTUI.

## Layout

- `agent/settings.json` stores the main Pi settings, packages, models, and interface options.
- `agent/models.json` stores provider model overrides.
- `agent/pi-vcc-config.json` stores VCC compaction preferences.
- `home/AGENTS.md` stores the global agent instructions from `~/AGENTS.md`.
- `agent/AGENTS.md` tells Pi to load `~/AGENTS.md` when it is absent from the context.
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

1. Copy `home/AGENTS.md` to `~/AGENTS.md`.
2. Copy the contents of `agent/` to `~/.pi/agent/`.
3. Copy the contents of `skills/` to `~/.agents/skills/`.
4. Copy the contents of `commands/` to `~/.agents/commands/`.
5. Copy the contents of `rules/` to `~/.agents/rules/`.
6. Copy `skill-lock.json` to `~/.agents/.skill-lock.json`.
7. Copy the contents of `zed/` to `~/.config/zed/`.
8. Copy the contents of `ghostty/` to `~/.config/ghostty/`.
9. Copy `fusiontui.json` to `~/.pi/fusiontui.json`.
10. Install Bun 1.4.0 or later.
11. Start Pi to install the configured GitHub and npm packages.
12. Authenticate each provider again.

## GitHub packages

Pi clones these repositories into `~/.pi/agent/git/github.com/nothingrotf/`:

- `nothingrotf/pi-extensions` supplies ten extensions and the `loop` and `pstack` skills.
- `nothingrotf/pi-anthropic-auth` supplies the authentication extension.

The monorepo does not declare Pi resources at its root. Explicit resource paths select modules and skills from the clone that Pi manages.

The settings use Bun for package installation because the monorepo requires Bun workspace catalogs. No package depends on a local `Workspaces` checkout.

Run `pi update --extensions` to update the GitHub packages.

The shared skills in `skills/` do not include package skills. This repository excludes downloaded packages and installed dependencies.

## Excluded data

The repository excludes credentials, OAuth data, sessions, caches, generated databases, logs, and other runtime state.
