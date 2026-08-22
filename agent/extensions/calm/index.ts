// Pi Calm - a standalone conversation-presentation toggle for Pi.
//
// Adapted from the Firstmate project's Calm implementation.
// Copyright (c) 2026 Kun Chen. MIT License - see the LICENSE file in this directory.
//
// This local variant drops the animated working widget: Pi's stock working row
// is left entirely untouched and owned by Pi.
//
// Verified against Pi 0.82.0, which exports its shared tool-row component,
// session_start replacement reasons, ExtensionUIContext.setToolsExpanded() and
// setHiddenThinkingLabel(). ./lib/preference.ts owns the local state file. The
// collapsed-thinking presentation adapter probes the exact public API seam it
// patches and degrades independently with one clear diagnostic (see
// installCalmPresentationAdapter below) if a future Pi removes it. The shared
// tool-row adapter is limited to Pi's seven known built-in names, so generic
// custom tools and unsupported transcript classes deliberately stay visible.
//
// Calm changes presentation only. It never intercepts, transforms, reroutes,
// removes, or reorders semantic input, tool execution, model context, session
// storage, or export data; /export and /share render the complete stock
// transcript.
import { type ExtensionAPI, type ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import { getKeybindings } from "@earendil-works/pi-tui";
import { installCalmBuiltInToolShellLayout } from "./lib/built-in-tool-shells.ts";
import { installCalmCollapsedThinkingLayout } from "./lib/collapsed-thinking.ts";
import { loadCalmPreference, persistCalmPreference } from "./lib/preference.ts";
import {
  calmPresentationIsActive,
  setCalmPresentation,
  setCalmStockExportRendering,
} from "./lib/visibility.ts";

// Each presentation adapter probes the exact Pi API it patches. If a future Pi
// removes that API, only the affected adapter degrades; the rest of Calm keeps
// working.
function installCalmPresentationAdapter(name: string, install: () => void): void {
  try {
    install();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`Pi Calm: ${name} presentation adapter unavailable, skipping. ${reason}`);
  }
}

const CALM_STATUS_KEY = "calm";

// The footer badge is the persistent answer to "is Calm on right now?". It is
// present only while Calm is active, so stock Pi keeps an unchanged footer.
function applyCalmStatus(ui: ExtensionUIContext): void {
  ui.setStatus(
    CALM_STATUS_KEY,
    calmPresentationIsActive() ? ui.theme.fg("dim", "calm") : undefined,
  );
}

export default function (pi: ExtensionAPI) {
  installCalmPresentationAdapter("collapsed-thinking", installCalmCollapsedThinkingLayout);
  installCalmPresentationAdapter("built-in-tool-shells", installCalmBuiltInToolShellLayout);

  let removeTerminalInputHandler: (() => void) | undefined;

  pi.on("session_start", (_event, ctx) => {
    setCalmPresentation(loadCalmPreference());
    setCalmStockExportRendering(false);
    ctx.ui.setHiddenThinkingLabel(calmPresentationIsActive() ? "" : undefined);
    applyCalmStatus(ctx.ui);
    removeTerminalInputHandler?.();
    removeTerminalInputHandler = ctx.ui.onTerminalInput((data) => {
      if (!getKeybindings().matches(data, "tui.input.submit")) return;

      const input = ctx.ui.getEditorText().trim();
      if (
        input !== "/share" &&
        input !== "/export" &&
        !input.startsWith("/export ")
      ) {
        return;
      }

      // /export and /share render through the same tool renderers the transcript
      // uses, so force stock output for the duration of the command. Session and
      // export data are never filtered; this only concerns the visual components.
      setCalmStockExportRendering(true);
      setTimeout(() => {
        setCalmStockExportRendering(false);
        const expanded = ctx.ui.getToolsExpanded();
        ctx.ui.setToolsExpanded(!expanded);
        ctx.ui.setToolsExpanded(expanded);
      }, 0);
    });
  });

  pi.registerCommand("calm", {
    description: "Toggle Calm: hide collapsed thinking and built-in tool shells from the transcript (presentation only).",
    handler: async (_args, ctx) => {
      const active = !calmPresentationIsActive();
      // Persist first: if the state file cannot be written, the toggle fails
      // with a clear error instead of silently reverting on the next restart.
      persistCalmPreference(active);
      setCalmPresentation(active);
      ctx.ui.setHiddenThinkingLabel(active ? "" : undefined);
      applyCalmStatus(ctx.ui);
      ctx.ui.notify(active ? "Calm: on" : "Calm: off", "info");

      // Flip expansion twice to force a transcript redraw while preserving the
      // user's exact Ctrl+O tools-expanded state.
      const expanded = ctx.ui.getToolsExpanded();
      ctx.ui.setToolsExpanded(!expanded);
      ctx.ui.setToolsExpanded(expanded);
    },
  });
}
