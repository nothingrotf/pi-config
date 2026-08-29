import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { formatDuration, isLoopState, parseLoopInput, type LoopState } from "./policy.js";

const ENTRY_TYPE = "pi-loop-state";
const STATUS_KEY = "pi-loop";
const DEFAULT_STUCK_AFTER_MS = 3 * 60 * 60 * 1000;

function copyState(state: LoopState): LoopState {
	return { ...state };
}

function describeState(state: LoopState | null): string {
	if (!state) return "No loop exists in this session.";
	const cadence = state.mode === "fixed" && state.intervalMs !== null ? `every ${formatDuration(state.intervalMs)}` : "continuous";
	const progress = state.progressSummary ? ` Last progress: ${state.progressSummary}` : "";
	const reason = state.stopReason ? ` Reason: ${state.stopReason}` : "";
	return `Loop ${state.status}. Cadence: ${cadence}. Iterations: ${state.iterations}. Prompt: ${state.prompt}.${progress}${reason}`;
}

function activeInstructions(state: LoopState): string {
	const common = [
		"A Pi loop is active in this session.",
		`Loop prompt: ${JSON.stringify(state.prompt)}`,
		`Loop iteration: ${state.iterations}`,
		"Continue the loop work in this turn.",
		"Call loop_progress after each concrete, verified milestone.",
		"Call loop_stop only when no productive route remains.",
		"After loop_stop, write a concise report with attempts, evidence, blockers, and required next action.",
	];
	if (state.mode === "continuous") {
		common.push("Call loop_done only after all requirements are complete and verified.");
		common.push("Do not end the loop only because one response ends.");
	} else {
		common.push("Complete one scheduled check in this turn.");
		common.push("Call loop_done only when the recurring monitor itself must end.");
	}
	return common.join("\n");
}

export default function (pi: ExtensionAPI) {
	let state: LoopState | null = null;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let timeoutDue = false;

	const clearTimer = () => {
		if (timer !== undefined) clearTimeout(timer);
		timer = undefined;
	};

	const refreshStatus = (ctx: ExtensionContext) => {
		if (!state || state.status !== "active") {
			ctx.ui.setStatus(STATUS_KEY, undefined);
			return;
		}
		const cadence = state.mode === "fixed" && state.intervalMs !== null ? formatDuration(state.intervalMs) : "now";
		ctx.ui.setStatus(STATUS_KEY, `loop ${state.iterations} ${cadence}`);
	};

	const persist = (ctx: ExtensionContext) => {
		if (!state) return;
		pi.appendEntry(ENTRY_TYPE, copyState(state));
		refreshStatus(ctx);
	};

	const restore = (ctx: ExtensionContext) => {
		clearTimer();
		timeoutDue = false;
		state = null;
		for (const entry of ctx.sessionManager.getBranch()) {
			if (entry.type === "custom" && entry.customType === ENTRY_TYPE && isLoopState(entry.data)) {
				state = copyState(entry.data);
			}
		}
		refreshStatus(ctx);
	};

	const finish = (status: "complete" | "stopped" | "stalled", reason: string, ctx: ExtensionContext) => {
		if (!state || state.status !== "active") return false;
		clearTimer();
		timeoutDue = false;
		state.status = status;
		state.stopReason = reason;
		state.nextRunAt = null;
		persist(ctx);
		return true;
	};

	const sendStalledReportRequest = (ctx: ExtensionContext) => {
		if (!state || state.status !== "active") return;
		const originalPrompt = state.prompt;
		const progressSummary = state.progressSummary ?? "No verified milestone was recorded.";
		const duration = formatDuration(state.stuckAfterMs ?? DEFAULT_STUCK_AFTER_MS);
		if (!finish("stalled", `No verified progress for ${duration}.`, ctx)) return;
		ctx.ui.notify(`Loop stopped after ${duration} without verified progress.`, "warning");
		pi.sendUserMessage(
			`The loop stopped after ${duration} without verified progress. Write a concise blocker report now. Include the objective, attempts, evidence, blockers, and the required next action. Original loop prompt: ${JSON.stringify(originalPrompt)}. Last progress: ${progressSummary}`,
			{ deliverAs: "followUp" },
		);
	};

	const queueIteration = (ctx: ExtensionContext) => {
		if (!state || state.status !== "active") return;
		if (ctx.hasPendingMessages()) return;
		const now = Date.now();
		if (state.stuckAfterMs !== null && now - state.lastProgressAt >= state.stuckAfterMs) {
			sendStalledReportRequest(ctx);
			return;
		}
		state.iterations += 1;
		state.lastRunAt = now;
		state.nextRunAt = null;
		persist(ctx);
		pi.sendUserMessage(state.prompt, { deliverAs: "followUp" });
	};

	const arm = (ctx: ExtensionContext) => {
		clearTimer();
		if (!state || state.status !== "active") return;
		const now = Date.now();
		const runAt = state.nextRunAt ?? now;
		const deadline = state.stuckAfterMs === null ? Number.POSITIVE_INFINITY : state.lastProgressAt + state.stuckAfterMs;
		const target = Math.min(runAt, deadline);
		timer = setTimeout(() => {
			timer = undefined;
			if (!state || state.status !== "active") return;
			if (Date.now() >= deadline) {
				if (!ctx.hasPendingMessages()) sendStalledReportRequest(ctx);
				else timeoutDue = true;
				return;
			}
			if (!ctx.hasPendingMessages()) {
				queueIteration(ctx);
			} else {
				state.nextRunAt = Date.now();
				timer = setTimeout(() => arm(ctx), 100);
			}
		}, Math.max(0, target - now));
	};

	const stopFromCommand = (reason: string, ctx: ExtensionContext) => {
		if (!finish("stopped", reason, ctx)) {
			ctx.ui.notify("No active loop exists.", "warning");
			return;
		}
		ctx.ui.notify(`Loop stopped. ${reason}`, "info");
	};

	const start = async (args: string, ctx: ExtensionContext) => {
		const parsed = parseLoopInput(args);
		if (!parsed.ok) {
			ctx.ui.notify(parsed.error, "warning");
			return;
		}
		if (state?.status === "active") {
			if (!ctx.hasUI) {
				ctx.ui.notify("Stop the active loop before a new loop starts.", "error");
				return;
			}
			const replace = await ctx.ui.confirm("Replace the active loop?", `Current: ${state.prompt}\n\nNew: ${parsed.prompt}`);
			if (!replace) return;
			finish("stopped", "Replaced by a new loop.", ctx);
		}
		const now = Date.now();
		state = {
			version: 1,
			id: crypto.randomUUID(),
			mode: parsed.mode,
			status: "active",
			prompt: parsed.prompt,
			intervalMs: parsed.intervalMs,
			stuckAfterMs: parsed.mode === "continuous" ? DEFAULT_STUCK_AFTER_MS : null,
			startedAt: now,
			lastProgressAt: now,
			lastRunAt: null,
			nextRunAt: now,
			iterations: 0,
			progressSummary: null,
			stopReason: null,
		};
		persist(ctx);
		ctx.ui.notify(
			parsed.mode === "continuous"
				? "Continuous loop started. It stops after 3h without verified progress."
				: `Recurring loop started every ${formatDuration(parsed.intervalMs ?? 0)}.`,
			"info",
		);
		arm(ctx);
	};

	pi.on("session_start", (_event, ctx) => {
		restore(ctx);
		if (state?.status === "active") arm(ctx);
	});

	pi.on("session_tree", (_event, ctx) => {
		restore(ctx);
		if (state?.status === "active") arm(ctx);
	});

	pi.on("session_shutdown", () => {
		clearTimer();
	});

	pi.on("before_agent_start", (event) => {
		if (!state || state.status !== "active") return;
		return { systemPrompt: `${event.systemPrompt}\n\n${activeInstructions(state)}` };
	});

	pi.on("agent_settled", (_event, ctx) => {
		if (!state || state.status !== "active" || !ctx.isIdle()) return;
		if (timeoutDue || (state.stuckAfterMs !== null && Date.now() - state.lastProgressAt >= state.stuckAfterMs)) {
			sendStalledReportRequest(ctx);
			return;
		}
		timeoutDue = false;
		state.nextRunAt = state.mode === "fixed" ? Date.now() + (state.intervalMs ?? 0) : Date.now();
		persist(ctx);
		arm(ctx);
	});

	pi.registerTool({
		name: "loop_progress",
		label: "Loop progress",
		description: "Record a concrete, verified milestone for the active continuous loop.",
		promptSnippet: "Record verified progress for the active loop",
		parameters: Type.Object({ summary: Type.String({ minLength: 1 }) }),
		executionMode: "sequential",
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			if (!state || state.status !== "active") {
				return { content: [{ type: "text", text: "No active loop exists." }], details: { recorded: false } };
			}
			state.lastProgressAt = Date.now();
			state.progressSummary = params.summary.trim();
			persist(ctx);
			return { content: [{ type: "text", text: "Loop progress recorded." }], details: { recorded: true } };
		},
	});

	pi.registerTool({
		name: "loop_done",
		label: "Loop done",
		description: "Complete the active loop only after its requirements are verified.",
		promptSnippet: "Complete a verified active loop",
		parameters: Type.Object({ summary: Type.String({ minLength: 1 }) }),
		executionMode: "sequential",
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			if (!state || state.status !== "active") {
				return { content: [{ type: "text", text: "No active loop exists." }], details: { completed: false } };
			}
			state.progressSummary = params.summary.trim();
			finish("complete", params.summary.trim(), ctx);
			ctx.ui.notify("Loop complete.", "info");
			return { content: [{ type: "text", text: "Loop completed. Give the final result to the user." }], details: { completed: true } };
		},
	});

	pi.registerTool({
		name: "loop_stop",
		label: "Loop stop",
		description: "Stop the active loop when no productive route remains.",
		promptSnippet: "Stop a blocked active loop",
		parameters: Type.Object({ reason: Type.String({ minLength: 1 }) }),
		executionMode: "sequential",
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			if (!state || state.status !== "active") {
				return { content: [{ type: "text", text: "No active loop exists." }], details: { stopped: false } };
			}
			finish("stopped", params.reason.trim(), ctx);
			ctx.ui.notify("Loop stopped by the agent.", "warning");
			return {
				content: [{ type: "text", text: "Loop stopped. Write the blocker report before this response ends." }],
				details: { stopped: true },
			};
		},
	});

	pi.registerCommand("loop", {
		description: "Run a prompt continuously or at a fixed interval in this session",
		async handler(args, ctx) {
			const trimmed = args.trim();
			if (trimmed === "status" || trimmed === "list") {
				ctx.ui.notify(describeState(state), "info");
				return;
			}
			if (trimmed === "stop" || trimmed.startsWith("stop ")) {
				stopFromCommand(trimmed.slice(4).trim() || "Stopped by the user.", ctx);
				return;
			}
			await start(args, ctx);
		},
	});

	pi.registerCommand("loop-list", {
		description: "Show the loop state for this session",
		async handler(_args, ctx) {
			ctx.ui.notify(describeState(state), "info");
		},
	});

	pi.registerCommand("loop-stop", {
		description: "Stop the active loop in this session",
		async handler(args, ctx) {
			stopFromCommand(args.trim() || "Stopped by the user.", ctx);
		},
	});
}
