import { describe, expect, it } from "bun:test";
import type { GuardMessage } from "./policy.js";
import {
	buildGuardedMessages,
	estimateFixedContextTokens,
	estimateGuardMessageTokenUpperBound,
	estimateGuardMessagesTokens,
} from "./policy.js";

function user(text: string): GuardMessage {
	return {
		role: "user",
		content: [{ type: "text", text }],
		timestamp: 1,
	} as GuardMessage;
}

function assistantWithTool(id: string, argument: string): GuardMessage {
	return {
		role: "assistant",
		content: [
			{ type: "thinking", thinking: "private reasoning", thinkingSignature: "x".repeat(10000) },
			{ type: "toolCall", id, name: "read", arguments: { path: argument } },
		],
		api: "openai-codex-responses",
		provider: "openai-codex",
		model: "gpt-5.6-sol",
		usage: {
			input: 1,
			output: 1,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 2,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "toolUse",
		timestamp: 2,
	} as GuardMessage;
}

function toolResult(id: string, text: string): GuardMessage {
	return {
		role: "toolResult",
		toolCallId: id,
		toolName: "read",
		content: [{ type: "text", text }],
		isError: false,
		timestamp: 3,
	} as GuardMessage;
}

describe("context window guard policy", () => {
	it("keeps a bounded conversation usable", () => {
		const messages = [user("request"), assistantWithTool("call-1", "file.ts"), toolResult("call-1", "ok")];
		const result = buildGuardedMessages(messages, 100000);
		expect(result.droppedMessages).toBe(0);
		expect(result.messages[0]?.role).toBe("user");
		expect((result.messages[1] as Record<string, unknown>).usage).toBeDefined();
		expect(result.estimatedMessageTokens).toBeLessThanOrEqual(100000);
	});

	it("cuts only at a message that is not a tool result", () => {
		const oldResult = toolResult("call-old", "unused") as unknown as Record<string, unknown>;
		oldResult.content = Array.from({ length: 10 }, () => ({ type: "text", text: "z".repeat(30000) }));
		const messages = [
			user("old request"),
			assistantWithTool("call-old", "old.ts"),
			oldResult as GuardMessage,
			user("new request"),
			assistantWithTool("call-new", "new.ts"),
			toolResult("call-new", "done"),
		];
		const result = buildGuardedMessages(messages, 8000);
		expect(result.droppedMessages).toBeGreaterThan(0);
		expect(result.messages[0]?.role).toBe("custom");
		expect(result.messages[1]?.role).not.toBe("toolResult");
		expect(result.mode).toBe("suffix");
		expect(JSON.stringify(result.messages)).toContain("private reasoning");
		expect(JSON.stringify(result.messages)).toContain("call-new");
		expect(result.estimatedMessageTokens).toBeLessThanOrEqual(8000);
	});

	it("removes reasoning payloads and bounds large tool output", () => {
		const messages = [
			user("request"),
			assistantWithTool("call-1", "x".repeat(20000)),
			toolResult("call-1", "y".repeat(50000)),
		];
		const result = buildGuardedMessages(messages, 16000);
		const serialized = JSON.stringify(result.messages);
		expect(serialized).not.toContain("private reasoning");
		expect(serialized).not.toContain("x".repeat(10000));
		expect(serialized).toContain("characters removed by the context window guard");
		expect(result.estimatedMessageTokens).toBeLessThanOrEqual(16000);
	});

	it("falls back to a marker when no retained unit fits", () => {
		const oversized = assistantWithTool("call-1", "file.ts") as unknown as Record<string, unknown>;
		oversized.content = Array.from({ length: 100 }, (_, index) => ({
			type: "toolCall",
			id: `call-${index}`,
			name: "bash",
			arguments: { command: "x".repeat(5000) },
		}));
		const messages = [oversized as GuardMessage];
		const result = buildGuardedMessages(messages, 4096);
		expect(result.messages).toHaveLength(1);
		expect(result.messages[0]?.role).toBe("custom");
		expect(result.mode).toBe("marker-only");
	});

	it("estimates ordinary text near one token per four bytes", () => {
		const message = user("x".repeat(4000));
		const estimate = estimateGuardMessagesTokens([message]);
		expect(estimate).toBeGreaterThanOrEqual(1000);
		expect(estimate).toBeLessThan(1100);
		expect(estimateGuardMessageTokenUpperBound(message)).toBeGreaterThanOrEqual(4000);
	});

	it("accounts for system prompts, tools, and images", () => {
		const imageMessage = {
			role: "user",
			content: [
				{ type: "text", text: "image" },
				{ type: "image", data: "a".repeat(1000000), mimeType: "image/png" },
			],
			timestamp: 1,
		} as GuardMessage;
		expect(estimateGuardMessagesTokens([imageMessage])).toBeGreaterThanOrEqual(8000);
		expect(estimateFixedContextTokens("system", [{ name: "read" }])).toBeGreaterThan(4096);
	});
});
