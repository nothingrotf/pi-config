export type LoopMode = "continuous" | "fixed";
export type LoopStatus = "active" | "complete" | "stopped" | "stalled";

export interface LoopState {
	version: 1;
	id: string;
	mode: LoopMode;
	status: LoopStatus;
	prompt: string;
	intervalMs: number | null;
	stuckAfterMs: number | null;
	startedAt: number;
	lastProgressAt: number;
	lastRunAt: number | null;
	nextRunAt: number | null;
	iterations: number;
	progressSummary: string | null;
	stopReason: string | null;
}

export type ParsedLoop =
	| { ok: true; mode: LoopMode; prompt: string; intervalMs: number | null }
	| { ok: false; error: string };

const UNIT_MS: Record<string, number> = {
	s: 1000,
	sec: 1000,
	secs: 1000,
	second: 1000,
	seconds: 1000,
	m: 60000,
	min: 60000,
	mins: 60000,
	minute: 60000,
	minutes: 60000,
	h: 3600000,
	hr: 3600000,
	hrs: 3600000,
	hour: 3600000,
	hours: 3600000,
	d: 86400000,
	day: 86400000,
	days: 86400000,
};

const DURATION_SOURCE = "(\\d+(?:\\.\\d+)?)\\s*(s|secs?|seconds?|m|mins?|minutes?|h|hrs?|hours?|d|days?)";
const LEADING_DURATION = new RegExp(`^${DURATION_SOURCE}\\s+(.+)$`, "i");
const TRAILING_DURATION = new RegExp(`^(.+?)\\s+every\\s+${DURATION_SOURCE}$`, "i");

function durationMs(value: string, unit: string): number | null {
	const number = Number(value);
	const multiplier = UNIT_MS[unit.toLowerCase()];
	if (!Number.isFinite(number) || number <= 0 || multiplier === undefined) return null;
	const result = Math.round(number * multiplier);
	return result >= 1000 ? result : null;
}

export function parseLoopInput(input: string): ParsedLoop {
	const trimmed = input.trim();
	if (trimmed.length === 0) {
		return { ok: false, error: "Usage: /loop [interval] <prompt>" };
	}

	const leading = trimmed.match(LEADING_DURATION);
	if (leading) {
		const intervalMs = durationMs(leading[1] ?? "", leading[2] ?? "");
		const prompt = leading[3]?.trim() ?? "";
		if (intervalMs === null || prompt.length === 0) {
			return { ok: false, error: "Use an interval of at least 1s and include a prompt." };
		}
		return { ok: true, mode: "fixed", prompt, intervalMs };
	}

	const trailing = trimmed.match(TRAILING_DURATION);
	if (trailing) {
		const intervalMs = durationMs(trailing[2] ?? "", trailing[3] ?? "");
		const prompt = trailing[1]?.trim() ?? "";
		if (intervalMs === null || prompt.length === 0) {
			return { ok: false, error: "Use an interval of at least 1s and include a prompt." };
		}
		return { ok: true, mode: "fixed", prompt, intervalMs };
	}

	return { ok: true, mode: "continuous", prompt: trimmed, intervalMs: null };
}

export function formatDuration(milliseconds: number): string {
	if (milliseconds % 86400000 === 0) return `${milliseconds / 86400000}d`;
	if (milliseconds % 3600000 === 0) return `${milliseconds / 3600000}h`;
	if (milliseconds % 60000 === 0) return `${milliseconds / 60000}m`;
	if (milliseconds % 1000 === 0) return `${milliseconds / 1000}s`;
	return `${milliseconds}ms`;
}

export function isLoopState(value: unknown): value is LoopState {
	if (typeof value !== "object" || value === null) return false;
	const state = value as Partial<LoopState>;
	return (
		state.version === 1 &&
		typeof state.id === "string" &&
		(state.mode === "continuous" || state.mode === "fixed") &&
		(state.status === "active" || state.status === "complete" || state.status === "stopped" || state.status === "stalled") &&
		typeof state.prompt === "string" &&
		(state.intervalMs === null || typeof state.intervalMs === "number") &&
		(state.stuckAfterMs === null || typeof state.stuckAfterMs === "number") &&
		typeof state.startedAt === "number" &&
		typeof state.lastProgressAt === "number" &&
		(state.lastRunAt === null || typeof state.lastRunAt === "number") &&
		(state.nextRunAt === null || typeof state.nextRunAt === "number") &&
		typeof state.iterations === "number" &&
		(state.progressSummary === null || typeof state.progressSummary === "string") &&
		(state.stopReason === null || typeof state.stopReason === "string")
	);
}
