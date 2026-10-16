import { browser } from 'wxt/browser';
import type { TrackedUtterance } from './captions/tracker';

/** Messages sent from the Meet tab or the side panel to the background worker. */
export type Message =
  | { type: 'caption:upsert'; meetingCode: string; utterance: TrackedUtterance }
  | { type: 'caption:settled'; id: string }
  | { type: 'meet:left' }
  | { type: 'session:analyze' }
  | { type: 'session:pause' }
  | { type: 'session:resume' }
  | { type: 'session:end' }
  | { type: 'session:recap'; id: string }
  | { type: 'session:delete'; id: string }
  | { type: 'nudge:dismiss'; id: string }
  | { type: 'agenda:toggle'; id: string }
  | { type: 'chatgpt:sign-in' }
  | { type: 'chatgpt:sign-out' }
  | { type: 'panel:open' };

export function send(message: Message): Promise<unknown> {
  return browser.runtime.sendMessage(message).catch((error: unknown) => {
    // The worker may be restarting. Losing one message is fine; crashing the caller isn't.
    console.debug('[mitya] message not delivered', message.type, error);
  });
}
