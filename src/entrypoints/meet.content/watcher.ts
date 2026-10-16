import { CaptionTracker } from '@/lib/captions/tracker';
import { send } from '@/lib/messages';
import {
  captionsAreOn,
  findCaptionsRegion,
  getMeetingCode,
  isInCall,
  readCaptionBlocks,
} from '@/lib/meet/dom';

export interface MeetState {
  inCall: boolean;
  captionsOn: boolean;
  meetingCode: string | null;
}

const POLL_MS = 500;
/** Meet briefly drops its controls during layout changes; don't end the session on a blip. */
const LEFT_GRACE_MS = 4000;

/**
 * Watches the Meet page: whether we're in a call, whether captions are on,
 * and every caption change. Caption updates go to the background worker.
 */
export class MeetWatcher {
  private state: MeetState = { inCall: false, captionsOn: false, meetingCode: null };
  private listeners = new Set<() => void>();
  private region: HTMLElement | null = null;
  private observer: MutationObserver | null = null;
  private timer: ReturnType<typeof setInterval> | undefined;
  private lastInCallAt = 0;
  private reportedLeave = true;
  private tracker = new CaptionTracker((event) => {
    const code = this.state.meetingCode;
    if (!code) return;
    if (event.type === 'upsert') {
      void send({ type: 'caption:upsert', meetingCode: code, utterance: event.utterance });
    } else {
      void send({ type: 'caption:settled', id: event.id });
    }
  });

  start(): void {
    this.poll();
    this.timer = setInterval(() => this.poll(), POLL_MS);
  }

  stop(): void {
    clearInterval(this.timer);
    this.observer?.disconnect();
  }

  getState = (): MeetState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private poll(): void {
    const now = Date.now();
    const inCall = isInCall();
    const region = inCall ? findCaptionsRegion() : null;

    if (region !== this.region) this.observe(region);
    this.tracker.tick(now);

    if (inCall) {
      this.lastInCallAt = now;
      this.reportedLeave = false;
    } else if (!this.reportedLeave && now - this.lastInCallAt > LEFT_GRACE_MS) {
      this.reportedLeave = true;
      void send({ type: 'meet:left' });
    }

    this.setState({
      inCall,
      captionsOn: inCall && captionsAreOn(),
      meetingCode: getMeetingCode(),
    });
  }

  private observe(region: HTMLElement | null): void {
    this.observer?.disconnect();
    this.region = region;
    if (!region) return;

    this.observer = new MutationObserver(() => this.read());
    this.observer.observe(region, { childList: true, subtree: true, characterData: true });
    this.read();
  }

  private read(): void {
    if (this.region) this.tracker.update(readCaptionBlocks(this.region), Date.now());
  }

  private setState(next: MeetState): void {
    const prev = this.state;
    if (
      prev.inCall === next.inCall &&
      prev.captionsOn === next.captionsOn &&
      prev.meetingCode === next.meetingCode
    ) {
      return;
    }
    this.state = next;
    this.listeners.forEach((listener) => listener());
  }
}
