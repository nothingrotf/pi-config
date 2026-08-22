export type GuardMessage = Record<string, unknown> & { role: string };

export interface GuardResult {
	messages: GuardMessage[];
	droppedMessages: number;
	estimatedMessageTokens: number;
	mode: "suffix" | "standard" | "aggressive" | "marker-only";
}

interface SanitizeLimits {
	text: number;
	toolText: number;
	argumentText: number;
	summary: number;
	bashOutput: number;
}

const STANDARD_LIMITS: SanitizeLimits = {
	text: 12000,
	toolText: 8000,
	argumentText: 6000,
	summary: 20000,
	bashOutput: 8000,
};

const AGGRESSIVE_LIMITS: SanitizeLimits = {
	text: 2000,
	toolText: 1500,
	argumentText: 1200,
	summary: 4000,
	bashOutput: 1500,
};

const IMAGE_TOKEN_UPPER_BOUND = 32000;
const TOKEN_BYTE_RATIO = 4;
const MARKER_TYPE = "context-window-guard";

function truncateMiddle(value: string, limit: number): string {
	if (value.length <= limit) return value;
	const marker = `\n[${value.length - limit} characters removed by the context window guard]\n`;
	const available = Math.max(0, limit - marker.length);
	const head = Math.ceil(available * 0.6);
	const tail = available - head;
	return `${value.slice(0, head)}${marker}${value.slice(value.length - tail)}`;
}

function truncateUnknown(value: unknown, limit: number, depth = 0): unknown {
	if (typeof value === "string") return truncateMiddle(value, limit);
	if (depth >= 6 || value === null || typeof value !== "object") return value;
	if (Array.isArray(value)) return value.map((item) => truncateUnknown(item, limit, depth + 1));
	return Object.fromEntries(
		Object.entries(value).map(([key, item]) => [key, truncateUnknown(item, limit, depth + 1)]),
	);
}

function sanitizeContent(
	content: unknown,
	limits: SanitizeLimits,
	toolResult: boolean,
	preserveImages: boolean,
): unknown {
	if (typeof content === "string") {
		return truncateMiddle(content, toolResult ? limits.toolText : limits.text);
	}
	if (!Array.isArray(content)) return content;
	const next: unknown[] = [];
	for (const rawBlock of content) {
		if (!rawBlock || typeof rawBlock !== "object") {
			next.push(rawBlock);
			continue;
		}
		const block = rawBlock as Record<string, unknown>;
		if (block.type === "thinking") continue;
		if (block.type === "image" && !preserveImages) {
			next.push({ type: "text", text: "[Earlier image removed by the context window guard]" });
			continue;
		}
		if (block.type === "text" && typeof block.text === "string") {
			next.push({
				...block,
				text: truncateMiddle(block.text, toolResult ? limits.toolText : limits.text),
			});
			continue;
		}
		if (block.type === "toolCall") {
			next.push({
				...block,
				arguments: truncateUnknown(block.arguments, limits.argumentText),
			});
			continue;
		}
		next.push(block);
	}
	return next;
}

function sanitizeMessage(
	message: GuardMessage,
	limits: SanitizeLimits,
	preserveImages: boolean,
): GuardMessage {
	const cloned = structuredClone(message) as GuardMessage;
	const record = cloned as unknown as Record<string, unknown>;
	const role = record.role;
	if (role === "assistant") {
		record.content = sanitizeContent(record.content, limits, false, false);
		delete record.errorMessage;
		delete record.rawStopReason;
		return cloned;
	}
	if (role === "toolResult") {
		record.content = sanitizeContent(record.content, limits, true, false);
		return cloned;
	}
	if (role === "user" || role === "custom") {
		record.content = sanitizeContent(record.content, limits, false, preserveImages);
		return cloned;
	}
	if (role === "bashExecution") {
		if (typeof record.command === "string") record.command = truncateMiddle(record.command, limits.argumentText);
		if (typeof record.output === "string") record.output = truncateMiddle(record.output, limits.bashOutput);
		return cloned;
	}
	if ((role === "branchSummary" || role === "compactionSummary") && typeof record.summary === "string") {
		record.summary = truncateMiddle(record.summary, limits.summary);
	}
	return cloned;
}

function countImages(value: unknown): number {
	if (!Array.isArray(value)) return 0;
	return value.reduce((count, block) => {
		if (!block || typeof block !== "object") return count;
		return count + ((block as Record<string, unknown>).type === "image" ? 1 : 0);
	}, 0);
}

function messageProjection(message: GuardMessage): Record<string, unknown> {
	const source = message as unknown as Record<string, unknown>;
	const projection: Record<string, unknown> = { role: source.role };
	for (const key of [
		"content",
		"command",
		"output",
		"summary",
		"toolCallId",
		"toolName",
		"customType",
		"fromId",
		"tokensBefore",
	]) {
		if (source[key] !== undefined) projection[key] = source[key];
	}
	if (Array.isArray(projection.content)) {
		projection.content = projection.content.map((rawBlock) => {
			if (!rawBlock || typeof rawBlock !== "object") return rawBlock;
			const block = rawBlock as Record<string, unknown>;
			if (block.type !== "image") return block;
			return { type: "image", mediaType: "bounded-image" };
		});
	}
	return projection;
}

function utf8Bytes(value: string): number {
	return new TextEncoder().encode(value).byteLength;
}

export function estimateGuardMessageTokenUpperBound(message: GuardMessage): number {
	const source = message as unknown as Record<string, unknown>;
	const projectedBytes = utf8Bytes(JSON.stringify(messageProjection(message)));
	const images = countImages(source.content);
	return projectedBytes + images * IMAGE_TOKEN_UPPER_BOUND;
}

export function estimateGuardMessageTokens(message: GuardMessage): number {
	return Math.ceil(estimateGuardMessageTokenUpperBound(message) / TOKEN_BYTE_RATIO);
}

export function estimateGuardMessagesTokens(messages: readonly GuardMessage[]): number {
	return messages.reduce((total, message) => total + estimateGuardMessageTokens(message), 0);
}

export function estimateFixedContextTokens(systemPrompt: string, tools: readonly unknown[]): number {
	const systemBytes = utf8Bytes(systemPrompt);
	const toolBytes = utf8Bytes(JSON.stringify(tools));
	return Math.ceil((systemBytes + toolBytes) / TOKEN_BYTE_RATIO) + 4096;
}

function canStartAt(message: GuardMessage): boolean {
	return (message as unknown as { role?: string }).role !== "toolResult";
}

function markerMessage(droppedMessages: number): GuardMessage {
	return {
		role: "custom",
		customType: MARKER_TYPE,
		content: `The context window guard removed ${droppedMessages} earlier messages before this model call. Continue from the retained recent context. The full session history remains available for normal compaction.`,
		display: false,
		timestamp: Date.now(),
	} as GuardMessage;
}

function findBoundedSuffix(messages: GuardMessage[], budget: number, mode: GuardResult["mode"]): GuardResult | null {
	for (let start = 0; start < messages.length; start += 1) {
		if (!canStartAt(messages[start])) continue;
		const droppedMessages = start;
		const candidate = droppedMessages > 0 ? [markerMessage(droppedMessages), ...messages.slice(start)] : messages;
		const estimatedMessageTokens = estimateGuardMessagesTokens(candidate);
		if (estimatedMessageTokens <= budget) {
			return { messages: candidate, droppedMessages, estimatedMessageTokens, mode };
		}
	}
	return null;
}

function sanitizeMessages(messages: readonly GuardMessage[], limits: SanitizeLimits): GuardMessage[] {
	const lastUserIndex = messages.findLastIndex(
		(message) => (message as unknown as { role?: string }).role === "user",
	);
	return messages.map((message, index) => sanitizeMessage(message, limits, index === lastUserIndex));
}

export function buildGuardedMessages(messages: readonly GuardMessage[], budget: number): GuardResult {
	const normalizedBudget = Math.max(4096, Math.floor(budget));
	const suffix = findBoundedSuffix(structuredClone(messages) as GuardMessage[], normalizedBudget, "suffix");
	if (suffix) return suffix;
	const standard = sanitizeMessages(messages, STANDARD_LIMITS);
	const standardResult = findBoundedSuffix(standard, normalizedBudget, "standard");
	if (standardResult) return standardResult;
	const aggressive = sanitizeMessages(messages, AGGRESSIVE_LIMITS);
	const aggressiveResult = findBoundedSuffix(aggressive, normalizedBudget, "aggressive");
	if (aggressiveResult) return aggressiveResult;
	const marker = markerMessage(messages.length);
	return {
		messages: [marker],
		droppedMessages: messages.length,
		estimatedMessageTokens: estimateGuardMessageTokens(marker),
		mode: "marker-only",
	};
}
