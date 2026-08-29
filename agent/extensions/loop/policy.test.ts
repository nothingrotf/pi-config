import { describe, expect, it } from "bun:test";
import { formatDuration, isLoopState, parseLoopInput, type LoopState } from "./policy.js";

function state(): LoopState {
	return {
		version: 1,
		id: "loop-1",
		mode: "continuous",
		status: "active",
		prompt: "finish the task",
		intervalMs: null,
		stuckAfterMs: 10800000,
		startedAt: 1,
		lastProgressAt: 1,
		lastRunAt: null,
		nextRunAt: 1,
		iterations: 0,
		progressSummary: null,
		stopReason: null,
	};
}

describe("loop input", () => {
	it("parses a prompt without an interval as continuous", () => {
		expect(parseLoopInput("until done. if stuck, stop and write why.")).toEqual({
			ok: true,
			mode: "continuous",
			prompt: "until done. if stuck, stop and write why.",
			intervalMs: null,
		});
	});

	it("parses a leading compact interval", () => {
		expect(parseLoopInput("5m check CI")).toEqual({
			ok: true,
			mode: "fixed",
			prompt: "check CI",
			intervalMs: 300000,
		});
	});

	it("parses a trailing word interval", () => {
		expect(parseLoopInput("check deployment every 10 minutes")).toEqual({
			ok: true,
			mode: "fixed",
			prompt: "check deployment",
			intervalMs: 600000,
		});
	});

	it("rejects an empty prompt", () => {
		expect(parseLoopInput(" ")).toEqual({ ok: false, error: "Usage: /loop [interval] <prompt>" });
	});

	it("rejects intervals shorter than one second", () => {
		expect(parseLoopInput("0.5s check")).toEqual({
			ok: false,
			error: "Use an interval of at least 1s and include a prompt.",
		});
	});
});

describe("loop state", () => {
	it("accepts a valid persisted state", () => {
		expect(isLoopState(state())).toBe(true);
	});

	it("rejects an incomplete persisted state", () => {
		const invalid = state() as unknown as Record<string, unknown>;
		delete invalid.prompt;
		expect(isLoopState(invalid)).toBe(false);
	});

	it("formats exact durations with the largest exact unit", () => {
		expect(formatDuration(1000)).toBe("1s");
		expect(formatDuration(300000)).toBe("5m");
		expect(formatDuration(10800000)).toBe("3h");
		expect(formatDuration(86400000)).toBe("1d");
	});
});
