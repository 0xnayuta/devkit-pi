/**
 * Bounded child stdout collection for subagent execution.
 *
 * Responsibilities:
 * - keep stdout line buffering local to the child process boundary;
 * - persist only JSONL events that the final collector needs;
 * - enforce persisted stdout byte limits;
 * - enforce separate persisted vs transient JSONL line limits;
 * - bound unterminated stdout so abnormal non-JSON output cannot grow forever.
 */

import { type ChildEventPersistence, classifyChildJsonlEvent } from "./child-event-filter.ts";

export type ChildOutputLimitExceeded = "stdout" | "jsonlLines" | "transientJsonlLines";

export interface LimitedOutputBuffer {
  chunks: Buffer[];
  bytes: number;
  truncated: boolean;
}

export interface ChildStdoutCollectorOptions {
  maxStdoutBytes: number;
  /** Maximum persisted JSONL lines retained for final collection. */
  maxJsonlLines: number;
  /** Maximum non-persisted transient/drop JSONL lines accepted before terminating. */
  maxTransientJsonlLines: number;
  /** Maximum bytes to buffer for a newline-delimited JSONL candidate before terminating. */
  maxUnterminatedJsonlBytes: number;
}

export interface ChildStdoutJsonEvent {
  line: string;
  event: Record<string, unknown>;
  persistence: ChildEventPersistence;
}

export interface ChildStdoutCounts {
  persistedJsonlLines: number;
  transientJsonlLines: number;
}

export class ChildStdoutCollector {
  private readonly buffer: LimitedOutputBuffer = createLimitedOutputBuffer();
  private readonly maxStdoutBytes: number;
  private readonly maxJsonlLines: number;
  private readonly maxTransientJsonlLines: number;
  private readonly maxUnterminatedJsonlBytes: number;
  private lineBuffer = "";
  private persistedJsonlLines = 0;
  private transientJsonlLines = 0;
  private exceeded: ChildOutputLimitExceeded | undefined;

  constructor(options: ChildStdoutCollectorOptions) {
    this.maxStdoutBytes = options.maxStdoutBytes;
    this.maxJsonlLines = options.maxJsonlLines;
    this.maxTransientJsonlLines = options.maxTransientJsonlLines;
    this.maxUnterminatedJsonlBytes = options.maxUnterminatedJsonlBytes;
  }

  get limitExceeded(): ChildOutputLimitExceeded | undefined {
    return this.exceeded;
  }

  get counts(): ChildStdoutCounts {
    return {
      persistedJsonlLines: this.persistedJsonlLines,
      transientJsonlLines: this.transientJsonlLines,
    };
  }

  push(data: Buffer): ChildStdoutJsonEvent[] {
    if (this.exceeded) return [];

    this.lineBuffer += data.toString("utf-8");
    const lines = this.lineBuffer.split("\n");
    this.lineBuffer = lines.pop() || "";

    const events: ChildStdoutJsonEvent[] = [];
    for (const line of lines) {
      const event = this.processLine(line);
      if (event) events.push(event);
      if (this.exceeded) break;
    }

    this.boundUnterminatedLine();
    return events;
  }

  flush(): ChildStdoutJsonEvent[] {
    if (this.exceeded || !this.lineBuffer.trim()) {
      this.lineBuffer = "";
      return [];
    }

    const line = this.lineBuffer;
    this.lineBuffer = "";
    const event = this.processLine(line);
    return event ? [event] : [];
  }

  decode(): string {
    return decodeLimitedOutput(this.buffer);
  }

  private processLine(line: string): ChildStdoutJsonEvent | undefined {
    const trimmed = line.trim();
    if (!trimmed) return undefined;

    let event: unknown;
    try {
      event = JSON.parse(trimmed);
    } catch {
      this.appendPersistedLine(line);
      return undefined;
    }

    const persistence = classifyChildJsonlEvent(event);
    if (persistence === "persist") {
      this.persistedJsonlLines++;
      if (this.persistedJsonlLines > this.maxJsonlLines) {
        this.markExceeded("jsonlLines");
        return undefined;
      }
      this.appendPersistedLine(line);
    } else {
      this.transientJsonlLines++;
      if (this.transientJsonlLines > this.maxTransientJsonlLines) {
        this.markExceeded("transientJsonlLines");
        return undefined;
      }
    }

    if (!isRecord(event)) return undefined;
    return { line, event, persistence };
  }

  private appendPersistedLine(line: string): void {
    const wasTruncated = this.buffer.truncated;
    appendLimitedOutput(this.buffer, Buffer.from(`${line}\n`, "utf8"), this.maxStdoutBytes);
    if (!wasTruncated && this.buffer.truncated) {
      this.markExceeded("stdout");
    }
  }

  private boundUnterminatedLine(): void {
    if (this.exceeded || !this.lineBuffer) return;

    const limit = looksLikeJsonlCandidate(this.lineBuffer)
      ? this.maxUnterminatedJsonlBytes
      : this.maxStdoutBytes;
    if (Buffer.byteLength(this.lineBuffer, "utf8") <= limit) return;

    appendLimitedOutput(this.buffer, Buffer.from(this.lineBuffer, "utf8"), this.maxStdoutBytes);
    this.lineBuffer = "";
    this.markExceeded("stdout");
  }

  private markExceeded(limit: ChildOutputLimitExceeded): void {
    if (!this.exceeded) this.exceeded = limit;
  }
}

export function createLimitedOutputBuffer(): LimitedOutputBuffer {
  return { chunks: [], bytes: 0, truncated: false };
}

export function appendLimitedOutput(
  buffer: LimitedOutputBuffer,
  chunk: Buffer,
  maxBytes: number
): Buffer {
  if (buffer.truncated) return Buffer.alloc(0);

  const remaining = maxBytes - buffer.bytes;
  if (remaining <= 0) {
    buffer.truncated = true;
    return Buffer.alloc(0);
  }

  if (chunk.byteLength > remaining) {
    const kept = chunk.subarray(0, remaining);
    buffer.chunks.push(kept);
    buffer.bytes += kept.byteLength;
    buffer.truncated = true;
    return kept;
  }

  buffer.chunks.push(chunk);
  buffer.bytes += chunk.byteLength;
  return chunk;
}

export function decodeLimitedOutput(buffer: LimitedOutputBuffer): string {
  return Buffer.concat(buffer.chunks, buffer.bytes).toString("utf8");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function looksLikeJsonlCandidate(lineBuffer: string): boolean {
  const trimmedStart = lineBuffer.trimStart();
  return trimmedStart.startsWith("{") || trimmedStart.startsWith("[");
}
