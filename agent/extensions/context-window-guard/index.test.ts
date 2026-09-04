import { afterAll, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ContextEvent } from "@earendil-works/pi-coding-agent";
import {
	discoverAndLoadExtensions,
	ExtensionRunner,
	ModelRegistry,
	ModelRuntime,
	SessionManager,
} from "/Users/nothing/.bun/install/global/node_modules/@earendil-works/pi-coding-agent/dist/index.js";
import { isRecoverableLength } from "/Users/nothing/.bun/install/global/node_modules/@earendil-works/pi-ai/dist/utils/overflow.js";

const extensionPath = fileURLToPath(new URL("./index.ts", import.meta.url));
const cwd = dirname(extensionPath);
const agentDir = await mkdtemp(join(tmpdir(), "context-window-guard-"));
const modelRuntime = await ModelRuntime.create({ modelsPath: null, refreshOnCreate: false });
const model = modelRuntime.getModel("openai-codex", "gpt-5.6-sol");
if (!model) throw new Error("The GPT-5.6 Sol test model is unavailable.");

afterAll(async () => {
	await rm(agentDir, { recursive: true, force: true });
});

type AgentMessage = ContextEvent["messages"][number];
type AssistantMessage = Extract<AgentMessage, { role: "assistant" }>;
type UserMessage = Extract<AgentMessage, { role: "user" }>;

function user(text: string): UserMessage {
	return {
		role: "user",
		content: [{ type: "text", text }],
		timestamp: 1,
	};
}

function assistant(options: {
	text?: string;
	thinking?: string;
	thinkingSignature?: string;
	stopReason?: AssistantMessage["stopReason"];
}): AssistantMessage {
	const content: AssistantMessage["content"] = [];
	if (options.thinking !== undefined || options.thinkingSignature !== undefined) {
		content.push({
			type: "thinking",
			thinking: options.thinking ?? "",
			thinkingSignature: options.thinkingSignature,
		});
	}
	if (options.text !== undefined) content.push({ type: "text", text: options.text });
	const stopReason = options.stopReason ?? "pending";
	return {
		role: "assistant",
		content,
		api: "openai-codex-responses",
		provider: model.provider,
		model: model.id,
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason,
		errorMessage: stopReason === "aborted" ? "Operation aborted" : undefined,
		timestamp: 2,
	};
}

async function createHarness(contextTokens: number) {
	const loaded = await discoverAndLoadExtensions([extensionPath], cwd, agentDir);
	if (loaded.errors.length > 0) throw new Error(loaded.errors.map((error) => error.error).join("\n"));
	const runner = new ExtensionRunner(
		loaded.extensions,
		loaded.runtime,
		cwd,
		SessionManager.inMemory(cwd),
		new ModelRegistry(modelRuntime),
	);
	const observed = {
		abortCount: 0,
		compactCount: 0,
		contextTokens,
	};
	runner.bindCore(
		{
			sendMessage: () => {},
			sendUserMessage: () => {},
			appendEntry: () => {},
			setSessionName: () => {},
			getSessionName: () => undefined,
			setLabel: () => {},
			getActiveTools: () => [],
			getAllTools: () => [],
			setActiveTools: () => {},
			refreshTools: () => {},
			getCommands: () => [],
			setModel: async () => true,
			getThinkingLevel: () => "medium",
			setThinkingLevel: () => {},
		},
		{
			getModel: () => model,
			getScopedModels: () => [],
			isIdle: () => true,
			isProjectTrusted: () => true,
			getSignal: () => undefined,
			abort: () => {
				observed.abortCount += 1;
			},
			hasPendingMessages: () => false,
			shutdown: () => {},
			getContextUsage: () => ({
				tokens: observed.contextTokens,
				contextWindow: model.contextWindow,
				percent: (observed.contextTokens / model.contextWindow) * 100,
			}),
			compact: () => {
				observed.compactCount += 1;
			},
			getSystemPrompt: () => "",
		},
	);
	await runner.emit({ type: "session_start", reason: "startup" });
	return { observed, runner };
}

async function startRequest(runner: ExtensionRunner): Promise<void> {
	await runner.emitContext([user("Continue the active task.")]);
}

async function updateAssistant(runner: ExtensionRunner, message: AssistantMessage): Promise<void> {
	await runner.emit({
		type: "message_update",
		message,
		assistantMessageEvent: { type: "start", partial: message },
	});
}

describe("context window guard lifecycle", () => {
	it("does not abort for a large encrypted reasoning signature", async () => {
		const harness = await createHarness(238241);
		await startRequest(harness.runner);
		await updateAssistant(
			harness.runner,
			assistant({ thinking: "r".repeat(859), thinkingSignature: "s".repeat(28989) }),
		);
		expect(harness.observed.abortCount).toBe(0);
	});

	it("marks a guard abort as recoverable and consumes the marker once", async () => {
		const harness = await createHarness(238241);
		await startRequest(harness.runner);
		const partial = assistant({ text: "x".repeat(105000) });
		await updateAssistant(harness.runner, partial);
		expect(harness.observed.abortCount).toBe(1);

		const aborted = assistant({ text: "x".repeat(105000), stopReason: "aborted" });
		const replacement = await harness.runner.emitMessageEnd({ type: "message_end", message: aborted });
		if (!replacement || replacement.role !== "assistant") throw new Error("The guard abort was not replaced.");
		expect(replacement.stopReason).toBe("length");
		expect(replacement.errorMessage).toBeUndefined();
		expect(isRecoverableLength(replacement, model.maxTokens)).toBe(true);

		const secondReplacement = await harness.runner.emitMessageEnd({ type: "message_end", message: aborted });
		expect(secondReplacement).toBeUndefined();
	});

	it("leaves a user abort unchanged", async () => {
		const harness = await createHarness(238241);
		await startRequest(harness.runner);
		const replacement = await harness.runner.emitMessageEnd({
			type: "message_end",
			message: assistant({ stopReason: "aborted" }),
		});
		expect(replacement).toBeUndefined();
	});

	it("keeps manual compaction for a completed guarded request", async () => {
		const harness = await createHarness(245000);
		await startRequest(harness.runner);
		await harness.runner.emit({ type: "agent_settled" });
		expect(harness.observed.compactCount).toBe(1);
	});
});
