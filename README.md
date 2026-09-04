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
9. Install Bun 1.4.0 or later.
10. Start Pi to install the configured GitHub and npm packages.
11. Authenticate each provider again.

## GitHub packages

Pi clones these repositories into `~/.pi/agent/git/github.com/nothingrotf/`:

- `nothingrotf/pi-extensions` supplies eight extensions and the `loop` and `pstack` skills.
- `nothingrotf/pi-anthropic-auth` supplies the authentication extension.

The monorepo does not declare Pi resources at its root. Explicit resource paths select modules and skills from the clone that Pi manages.

The settings use Bun for package installation because the monorepo requires Bun workspace catalogs. No package depends on a local `Workspaces` checkout.

Run `pi update --extensions` to update the GitHub packages.

The shared skills in `skills/` do not include package skills. This repository excludes downloaded packages and installed dependencies.

## Excluded data

The repository excludes credentials, OAuth data, sessions, caches, generated databases, logs, and other runtime state.
