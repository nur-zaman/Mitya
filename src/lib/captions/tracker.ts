import { mergeCaptionText } from './merge';

/** One caption block as it currently appears on screen. */
export interface CaptionBlock {
  /** Any object that stays the same for the lifetime of the block (its DOM node). */
  key: object;
  speaker: string;
  text: string;
}

export interface TrackedUtterance {
  id: string;
  speaker: string;
  text: string;
  startedAt: number;
  updatedAt: number;
}

export type TrackerEvent =
  { type: 'upsert'; utterance: TrackedUtterance } | { type: 'settled'; id: string };

interface Entry extends TrackedUtterance {
  settled: boolean;
  seen: boolean;
}

/**
 * Turns a stream of caption snapshots into utterances with stable ids.
 *
 * An utterance is "settled" once the speaker seems done: either someone else
 * started talking, the block left the screen, or nothing changed for
 * `settleAfterMs`.
 */
export class CaptionTracker {
  private ids = new WeakMap<object, string>();
  private entries = new Map<string, Entry>();
  private counter = 0;

  constructor(
    private readonly emit: (event: TrackerEvent) => void,
    private readonly settleAfterMs = 1500,
    private readonly idPrefix = Date.now().toString(36),
  ) {}

  update(blocks: CaptionBlock[], now: number): void {
    for (const entry of this.entries.values()) entry.seen = false;

    blocks.forEach((block, index) => {
      const text = block.text.trim();
      if (!text) return;

      const id = this.idFor(block.key);
      const entry = this.entries.get(id);
      const isNewest = index === blocks.length - 1;

      if (!entry) {
        const created: Entry = {
          id,
          speaker: block.speaker,
          text,
          startedAt: now,
          updatedAt: now,
          settled: false,
          seen: true,
        };
        this.entries.set(id, created);
        this.emit({ type: 'upsert', utterance: snapshot(created) });
      } else {
        entry.seen = true;
        const merged = mergeCaptionText(entry.text, text);
        if (merged !== entry.text || block.speaker !== entry.speaker) {
          entry.text = merged;
          entry.speaker = block.speaker;
          entry.updatedAt = now;
          entry.settled = false;
          this.emit({ type: 'upsert', utterance: snapshot(entry) });
        }
      }

      if (!isNewest) this.settle(id);
    });

    // Blocks that scrolled off are finished.
    for (const entry of [...this.entries.values()]) {
      if (!entry.seen) {
        this.settle(entry.id);
        this.entries.delete(entry.id);
      }
    }
  }

  /** Call periodically so quiet speakers still get their turn settled. */
  tick(now: number): void {
    for (const entry of this.entries.values()) {
      if (!entry.settled && now - entry.updatedAt >= this.settleAfterMs) this.settle(entry.id);
    }
  }

  private settle(id: string): void {
    const entry = this.entries.get(id);
    if (!entry || entry.settled) return;
    entry.settled = true;
    this.emit({ type: 'settled', id });
  }

  private idFor(key: object): string {
    let id = this.ids.get(key);
    if (!id) {
      id = `${this.idPrefix}-${++this.counter}`;
      this.ids.set(key, id);
    }
    return id;
  }
}

function snapshot(entry: Entry): TrackedUtterance {
  const { id, speaker, text, startedAt, updatedAt } = entry;
  return { id, speaker, text, startedAt, updatedAt };
}
