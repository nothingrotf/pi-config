import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	buildGuardedMessages,
	estimateFixedContextTokens,
	estimateGuardMessageTokenUpperBound,
	estimateGuardMessagesTokens,
	type GuardMessage,
} from "./policy.js";

const HARD_CONTEXT_LIMIT = 272000;
const REQUEST_INPUT_LIMIT = 240000;
const POST_GUARD_TARGET = 232000;
const REQUEST_SAFETY_TOKENS = 8000;
const MINIMUM_OUTPUT_BUDGET = 24000;
const MINIMUM_MESSAGE_BUDGET = 12000;
const STATUS_KEY = "context-window-guard";

function isGuardedCodexModel(model: { provider: string; id: string } | undefined): boolean {
	if (!model || model.provider !== "openai-codex") return false;
	return /^gpt-5[._-]6(?:[._-]|$)/i.test(model.id);
}

function formatTokens(tokens: number): string {
	return `${Math.round(tokens / 1000)}k`;
}

function activeToolContext(pi: ExtensionAPI): unknown[] {
	const active = new Set(pi.getActiveTools());
	return pi
		.getAllTools()
		.filter((tool) => active.has(tool.name))
		.map((tool) => ({
			name: tool.name,
			description: tool.description,
			parameters: tool.parameters,
			promptGuidelines: tool.promptGuidelines,
		}));
}

export default function (pi: ExtensionAPI) {
	let needsPersistentCompaction = false;
	let compactionStarted = false;
	let warningVisible = false;
	let guardActive = false;
	let activePromptTokens: number | undefined;
	let outputAbortIssued = false;
	let lastGuard:
		| {
				before: number;
				after: number;
				dropped: number;
				mode: string;
		  }
		| undefined;

	const resetStatus = (ctx: { ui: { setStatus(key: string, value: string | undefined): void } }) => {
		ctx.ui.setStatus(STATUS_KEY, "context ≤272k");
	};

	pi.on("session_start", (_event, ctx) => {
		needsPersistentCompaction = false;
		compactionStarted = false;
		warningVisible = false;
		guardActive = false;
		activePromptTokens = undefined;
		outputAbortIssued = false;
		lastGuard = undefined;
		if (isGuardedCodexModel(ctx.model)) resetStatus(ctx);
	});

	pi.on("model_select", (event, ctx) => {
		guardActive = false;
		activePromptTokens = undefined;
		outputAbortIssued = false;
		if (isGuardedCodexModel(event.model)) resetStatus(ctx);
		else ctx.ui.setStatus(STATUS_KEY, undefined);
	});

	pi.on("context", (event, ctx) => {
		if (!isGuardedCodexModel(ctx.model)) return;
		const configuredWindow = ctx.model?.contextWindow ?? HARD_CONTEXT_LIMIT;
		const hardLimit = Math.min(configuredWindow, HARD_CONTEXT_LIMIT);
		const requestInputLimit = Math.min(REQUEST_INPUT_LIMIT, hardLimit - MINIMUM_OUTPUT_BUDGET - REQUEST_SAFETY_TOKENS);
		const postGuardTarget = Math.min(POST_GUARD_TARGET, requestInputLimit - REQUEST_SAFETY_TOKENS);
		const messages = event.messages as unknown as GuardMessage[];
		const fixedTokens = estimateFixedContextTokens(ctx.getSystemPrompt(), activeToolContext(pi));
		const estimatedFullTokens = fixedTokens + estimateGuardMessagesTokens(messages);
		const usage = ctx.getContextUsage();
		const observedTokens = usage?.tokens ?? undefined;
		const currentTokens = guardActive
			? Math.max(estimatedFullTokens, observedTokens ?? 0)
			: (observedTokens ?? estimatedFullTokens);
		if (!guardActive && currentTokens <= requestInputLimit) {
			activePromptTokens = currentTokens;
			outputAbortIssued = false;
			ctx.ui.setStatus(STATUS_KEY, `context ${formatTokens(currentTokens)}/${formatTokens(hardLimit)}`);
			return;
		}
		guardActive = true;
		const messageBudget = Math.max(MINIMUM_MESSAGE_BUDGET, postGuardTarget - fixedTokens);
		const guarded = buildGuardedMessages(messages, messageBudget);
		const afterTokens = fixedTokens + guarded.estimatedMessageTokens;
		activePromptTokens = afterTokens;
		outputAbortIssued = false;
		needsPersistentCompaction = true;
		lastGuard = {
			before: currentTokens,
			after: afterTokens,
			dropped: guarded.droppedMessages,
			mode: guarded.mode,
		};
		ctx.ui.setStatus(STATUS_KEY, `guard ${formatTokens(currentTokens)}→${formatTokens(afterTokens)}`);
		if (!warningVisible) {
			warningVisible = true;
			ctx.ui.notify(
				`Context guard reduced the next Codex request from about ${formatTokens(currentTokens)} to ${formatTokens(afterTokens)}.`,
				"warning",
			);
		}
		return { messages: guarded.messages as unknown as typeof event.messages };
	});

	pi.on("message_update", (event, ctx) => {
		if (!isGuardedCodexModel(ctx.model) || activePromptTokens === undefined || outputAbortIssued) return;
		if (event.message.role !== "assistant") return;
		const outputTokens = estimateGuardMessageTokenUpperBound(event.message as unknown as GuardMessage);
		if (activePromptTokens + outputTokens < HARD_CONTEXT_LIMIT - REQUEST_SAFETY_TOKENS) return;
		outputAbortIssued = true;
		ctx.ui.setStatus(STATUS_KEY, "context output stopped ≤272k");
		ctx.ui.notify("Context guard stopped the response before the 272k hard limit.", "warning");
		ctx.abort();
	});

	pi.on("session_compact", (_event, ctx) => {
		needsPersistentCompaction = false;
		compactionStarted = false;
		warningVisible = false;
		guardActive = false;
		activePromptTokens = undefined;
		outputAbortIssued = false;
		lastGuard = undefined;
		if (isGuardedCodexModel(ctx.model)) resetStatus(ctx);
	});

	pi.on("agent_settled", (_event, ctx) => {
		if (!isGuardedCodexModel(ctx.model) || !needsPersistentCompaction || compactionStarted || !ctx.isIdle()) return;
		compactionStarted = true;
		needsPersistentCompaction = false;
		const ui = ctx.ui;
		ui.setStatus(STATUS_KEY, "context compaction");
		ctx.compact({
			customInstructions: "Preserve the active objective, completed work, exact paths, verification results, blockers, and next steps.",
			onComplete: () => {
				compactionStarted = false;
				warningVisible = false;
				lastGuard = undefined;
			},
			onError: (error) => {
				compactionStarted = false;
				needsPersistentCompaction = true;
				ui.setStatus(STATUS_KEY, "compaction failed");
				ui.notify(`Context guard compaction failed: ${error.message}`, "error");
			},
		});
	});

	pi.registerCommand("context-guard", {
		description: "Show the Codex context guard state",
		handler: async (_args, ctx) => {
			if (!isGuardedCodexModel(ctx.model)) {
				ctx.ui.notify("The context guard only applies to OpenAI Codex GPT-5.6 models.", "info");
				return;
			}
			const usage = ctx.getContextUsage();
			const current = usage?.tokens === null || usage?.tokens === undefined ? "unknown" : formatTokens(usage.tokens);
			const detail = lastGuard
				? ` Last guard: ${formatTokens(lastGuard.before)} to ${formatTokens(lastGuard.after)}, ${lastGuard.dropped} messages removed, ${lastGuard.mode} mode.`
				: " No emergency reduction occurred in this session.";
			ctx.ui.notify(`Current context: ${current}/${formatTokens(HARD_CONTEXT_LIMIT)}.${detail}`, "info");
		},
	});
}
