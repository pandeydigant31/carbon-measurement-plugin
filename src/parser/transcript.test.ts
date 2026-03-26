/**
 * Transcript parser tests.
 *
 * Tests parsing of Claude Code JSONL transcripts into token usage data.
 */

import { describe, test, expect } from "bun:test";
import { parseTranscript, aggregateTokens } from "./transcript.ts";

describe("parseTranscript", () => {
  test("parses valid assistant messages with usage", () => {
    const jsonl = [
      '{"type":"assistant","model":"claude-sonnet-4-20250514","usage":{"input_tokens":1000,"output_tokens":500,"cache_creation_input_tokens":100,"cache_read_input_tokens":200}}',
      '{"type":"assistant","model":"claude-haiku-4.5-20251001","usage":{"input_tokens":500,"output_tokens":200}}',
    ].join("\n");

    const result = parseTranscript(jsonl);
    expect(result).toHaveLength(2);

    expect(result[0]!.model).toBe("claude-sonnet-4-20250514");
    expect(result[0]!.modelFamily).toBe("sonnet");
    expect(result[0]!.inputTokens).toBe(1000);
    expect(result[0]!.outputTokens).toBe(500);
    expect(result[0]!.cacheCreationTokens).toBe(100);
    expect(result[0]!.cacheReadTokens).toBe(200);

    expect(result[1]!.model).toBe("claude-haiku-4.5-20251001");
    expect(result[1]!.modelFamily).toBe("haiku");
    expect(result[1]!.cacheCreationTokens).toBe(0); // defaults to 0
  });

  test("skips non-assistant messages", () => {
    const jsonl = [
      '{"type":"user","content":"hello"}',
      '{"type":"assistant","model":"claude-sonnet-4-20250514","usage":{"input_tokens":100,"output_tokens":50}}',
      '{"type":"system","content":"instructions"}',
    ].join("\n");

    const result = parseTranscript(jsonl);
    expect(result).toHaveLength(1);
    expect(result[0]!.inputTokens).toBe(100);
  });

  test("skips empty lines and malformed JSON", () => {
    const jsonl = [
      "",
      '{"type":"assistant","model":"claude-sonnet-4-20250514","usage":{"input_tokens":100,"output_tokens":50}}',
      "not json at all",
      "",
      '{"type":"assistant","model":"claude-sonnet-4-20250514","usage":{"input_tokens":200,"output_tokens":100}}',
    ].join("\n");

    const result = parseTranscript(jsonl);
    expect(result).toHaveLength(2);
  });

  test("empty input returns empty array", () => {
    expect(parseTranscript("")).toHaveLength(0);
    expect(parseTranscript("\n\n")).toHaveLength(0);
  });

  test("parses real Claude Code nested format (message.usage, message.model)", () => {
    const jsonl = [
      '{"type":"assistant","message":{"type":"message","role":"assistant","model":"claude-opus-4-6","usage":{"input_tokens":3,"cache_creation_input_tokens":45317,"cache_read_input_tokens":0,"output_tokens":2,"service_tier":"standard"}}}',
      '{"type":"assistant","message":{"type":"message","role":"assistant","model":"claude-sonnet-4-6","usage":{"input_tokens":1500,"output_tokens":800,"cache_creation_input_tokens":0,"cache_read_input_tokens":12000}}}',
    ].join("\n");

    const result = parseTranscript(jsonl);
    expect(result).toHaveLength(2);

    expect(result[0]!.model).toBe("claude-opus-4-6");
    expect(result[0]!.modelFamily).toBe("opus");
    expect(result[0]!.inputTokens).toBe(3);
    expect(result[0]!.outputTokens).toBe(2);
    expect(result[0]!.cacheCreationTokens).toBe(45317);

    expect(result[1]!.model).toBe("claude-sonnet-4-6");
    expect(result[1]!.cacheReadTokens).toBe(12000);
  });

  test("handles mixed flat and nested formats", () => {
    const jsonl = [
      '{"type":"assistant","model":"claude-sonnet-4-20250514","usage":{"input_tokens":100,"output_tokens":50}}',
      '{"type":"assistant","message":{"model":"claude-opus-4-6","usage":{"input_tokens":200,"output_tokens":100}}}',
    ].join("\n");

    const result = parseTranscript(jsonl);
    expect(result).toHaveLength(2);
    expect(result[0]!.model).toBe("claude-sonnet-4-20250514");
    expect(result[1]!.model).toBe("claude-opus-4-6");
  });
});

describe("aggregateTokens", () => {
  test("sums token counts across requests", () => {
    const usages = [
      { model: "claude-sonnet-4-20250514", modelFamily: "sonnet" as const, inputTokens: 1000, outputTokens: 500, cacheCreationTokens: 100, cacheReadTokens: 200 },
      { model: "claude-sonnet-4-20250514", modelFamily: "sonnet" as const, inputTokens: 2000, outputTokens: 300, cacheCreationTokens: 0, cacheReadTokens: 500 },
    ];

    const result = aggregateTokens(usages);
    expect(result.totalInputTokens).toBe(3000);
    expect(result.totalOutputTokens).toBe(800);
    expect(result.totalCacheCreationTokens).toBe(100);
    expect(result.totalCacheReadTokens).toBe(700);
    expect(result.numRequests).toBe(2);
  });

  test("determines primary model by request count", () => {
    const usages = [
      { model: "claude-sonnet-4-20250514", modelFamily: "sonnet" as const, inputTokens: 1000, outputTokens: 100, cacheCreationTokens: 0, cacheReadTokens: 0 },
      { model: "claude-haiku-4.5-20251001", modelFamily: "haiku" as const, inputTokens: 500, outputTokens: 50, cacheCreationTokens: 0, cacheReadTokens: 0 },
      { model: "claude-haiku-4.5-20251001", modelFamily: "haiku" as const, inputTokens: 500, outputTokens: 50, cacheCreationTokens: 0, cacheReadTokens: 0 },
    ];

    const result = aggregateTokens(usages);
    expect(result.primaryModel).toBe("claude-haiku-4.5-20251001");
  });

  test("empty array returns zeroes", () => {
    const result = aggregateTokens([]);
    expect(result.totalInputTokens).toBe(0);
    expect(result.numRequests).toBe(0);
    expect(result.primaryModel).toBe("unknown");
  });
});
