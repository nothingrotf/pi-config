import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const billingHeader =
  "x-anthropic-billing-header: cc_version=2.1.258.34b; cc_entrypoint=sdk-cli; cch=00000;";

export default function anthropicFableCompat(pi: ExtensionAPI): void {
  pi.on("before_agent_start", (event, ctx) => {
    if (ctx.model?.provider !== "anthropic" || ctx.model.id !== "claude-fable-5-1") {
      return;
    }

    return { systemPrompt: `${billingHeader}\n\n${event.systemPrompt}` };
  });
}
