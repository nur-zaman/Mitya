import { describe, expect, it } from 'vitest';
import { CaptionTracker, type TrackerEvent } from './tracker';

function setup(settleAfterMs = 1500) {
  const events: TrackerEvent[] = [];
  const tracker = new CaptionTracker((e) => events.push(e), settleAfterMs, 't');
  return { tracker, events };
}

describe('CaptionTracker', () => {
  it('gives a block a stable id while its text changes', () => {
    const { tracker, events } = setup();
    const node = {};
    tracker.update([{ key: node, speaker: 'Sam', text: 'Hello' }], 0);
    tracker.update([{ key: node, speaker: 'Sam', text: 'Hello there' }], 100);

    const upserts = events.filter((e) => e.type === 'upsert');
    expect(upserts).toHaveLength(2);
    expect(upserts.map((e) => e.utterance.id)).toEqual(['t-1', 't-1']);
    expect(upserts[1]?.utterance).toMatchObject({
      text: 'Hello there',
      startedAt: 0,
      updatedAt: 100,
    });
  });

  it('does not emit when nothing changed', () => {
    const { tracker, events } = setup();
    const node = {};
    tracker.update([{ key: node, speaker: 'Sam', text: 'Hello' }], 0);
    tracker.update([{ key: node, speaker: 'Sam', text: 'Hello' }], 50);
    expect(events).toHaveLength(1);
  });

  it('settles the previous speaker when someone else starts talking', () => {
    const { tracker, events } = setup();
    const sam = {};
    const you = {};
    tracker.update([{ key: sam, speaker: 'Sam', text: 'I led the migration.' }], 0);
    tracker.update(
      [
        { key: sam, speaker: 'Sam', text: 'I led the migration.' },
        { key: you, speaker: 'You', text: 'What broke?' },
      ],
      500,
    );
    expect(events).toContainEqual({ type: 'settled', id: 't-1' });
    expect(events).not.toContainEqual({ type: 'settled', id: 't-2' });
  });

  it('settles after a quiet period', () => {
    const { tracker, events } = setup(1000);
    tracker.update([{ key: {}, speaker: 'Sam', text: 'Let me think' }], 0);
    tracker.tick(900);
    expect(events.some((e) => e.type === 'settled')).toBe(false);
    tracker.tick(1000);
    expect(events).toContainEqual({ type: 'settled', id: 't-1' });
  });

  it('settles blocks that leave the screen, once', () => {
    const { tracker, events } = setup();
    tracker.update([{ key: {}, speaker: 'Sam', text: 'Bye' }], 0);
    tracker.update([], 100);
    tracker.update([], 200);
    expect(events.filter((e) => e.type === 'settled')).toHaveLength(1);
  });

  it('reopens a settled utterance if it keeps changing', () => {
    const { tracker, events } = setup(100);
    const node = {};
    tracker.update([{ key: node, speaker: 'Sam', text: 'One' }], 0);
    tracker.tick(200);
    tracker.update([{ key: node, speaker: 'Sam', text: 'One two' }], 300);
    tracker.tick(500);
    expect(events.filter((e) => e.type === 'settled')).toHaveLength(2);
  });
});
