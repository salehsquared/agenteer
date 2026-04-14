/**
 * `SessionRecorder` — subscribes to the runtime's event stream and writes
 * a JSONL trace to `<sessionDir>/events.jsonl`.
 *
 * Design:
 *   - Every event is serialized to one JSON line, prefixed with the event
 *     name and a wall-clock timestamp. Replay / inspection consumers just
 *     `readline` the file.
 *   - Appends are serialized through a single in-flight promise — the
 *     runtime emits events synchronously, so we buffer then flush.
 *   - Recorder also mutates `session.yaml` when a `needs_user` event
 *     fires (records the pending prompt + flips status to `suspended`)
 *     or when the final status is known (engine_finish).
 */

import {
  RuntimeEvents,
  type RuntimeEventName,
  type RuntimeEventMap,
} from "../events/events.js";
import { appendLine } from "../util/fs.js";
import {
  recordPendingPrompt,
  saveSession,
  sessionEventsPath,
  updateSession,
} from "./store.js";

export interface SessionRecorderOptions {
  sessionDir: string;
  events: RuntimeEvents;
  /** Wall clock; defaults to Date. */
  clock?: () => Date;
  /** If set, each event's `type` is also reported via this callback. */
  onEvent?: (type: RuntimeEventName, payload: unknown) => void;
}

export class SessionRecorder {
  private readonly sessionDir: string;
  private readonly events: RuntimeEvents;
  private readonly clock: () => Date;
  private readonly onEvent?: (type: RuntimeEventName, payload: unknown) => void;
  /** Serializes writes so JSONL lines don't interleave. */
  private flushChain: Promise<void> = Promise.resolve();
  /** Tracks all work so callers can `await recorder.flush()`. */
  private readonly pending = new Set<Promise<void>>();
  private detached = false;

  constructor(opts: SessionRecorderOptions) {
    this.sessionDir = opts.sessionDir;
    this.events = opts.events;
    this.clock = opts.clock ?? (() => new Date());
    if (opts.onEvent) this.onEvent = opts.onEvent;

    const eventNames: RuntimeEventName[] = [
      "engine_start",
      "engine_finish",
      "node_start",
      "node_complete",
      "node_cancelled",
      "node_failed",
      "spawn",
      "replace",
      "needs_user",
      "ctx_read",
      "ctx_patched",
      "permission_denied",
      "cache_hit",
      "cache_miss",
      "evidence_emitted",
      "error",
    ];
    for (const name of eventNames) {
      this.events.on(name, ((payload: unknown) => this.onAny(name, payload)) as never);
    }
  }

  private onAny(type: RuntimeEventName, payload: unknown): void {
    if (this.detached) return;
    this.onEvent?.(type, payload);
    const line = JSON.stringify({ type, payload, recorded_at: this.clock().toISOString() });
    const writeTask = this.flushChain.then(() =>
      appendLine(sessionEventsPath(this.sessionDir), line),
    );
    this.flushChain = writeTask.catch(() => undefined);
    this.track(writeTask);

    // State-of-the-world mutations.
    if (type === "needs_user") {
      const p = payload as RuntimeEventMap["needs_user"];
      this.track(
        recordPendingPrompt(this.sessionDir, {
          resume_hint: p.resume_hint,
          prompt: p.prompt,
          node_id: p.nodeId,
          manifest_id: p.manifest,
          at: this.clock().toISOString(),
        }).then(() => undefined),
      );
    } else if (type === "engine_finish") {
      const p = payload as RuntimeEventMap["engine_finish"];
      // Runtime's `engine_finish` doesn't distinguish `suspended` — we
      // only flip to terminal status here if the runtime reported one.
      // A `needs_user` event having fired earlier leaves status =
      // "suspended" (set by recordPendingPrompt); don't overwrite.
      this.track(
        (async () => {
          await updateSession(this.sessionDir, (s) => {
            if (s.status === "suspended") return s;
            return { ...s, status: p.finalStatus };
          });
        })(),
      );
    }
  }

  async flush(): Promise<void> {
    while (this.pending.size > 0) {
      await Promise.all([...this.pending]);
    }
  }

  /** Stop listening; useful in tests. */
  detach(): void {
    this.detached = true;
    this.events.removeAll();
  }

  private track(task: Promise<void>): void {
    this.pending.add(task);
    task.catch(() => undefined).finally(() => this.pending.delete(task));
  }
}

