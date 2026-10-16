import type { CaptionBlock } from '../captions/tracker';

/*
 * Everything that depends on Meet's markup lives here. Meet ships obfuscated
 * class names that change without notice, so each lookup prefers stable
 * attributes (roles, jsname) and falls back to structure. When captions stop
 * working after a Meet update, this is the file to fix.
 */

const SELECTORS = {
  captionsRegion: '[role="region"][aria-label="Captions"]',
  captionsRegionFallback: '.vNKgIf',
  captionBlock: '.nMcdL',
  speakerName: '.NWpY1d',
  captionText: '.ygicle',
  captionsButton: 'button[jsname="RrG0hf"]',
  /** Class Meet adds to the captions button while captions are on. */
  captionsButtonActive: 'HlOR8e',
  leaveButton: 'button[jsname="CQylAd"]',
};

const MEETING_CODE = /^\/([a-z]{3,4}-[a-z]{4}-[a-z]{3,4})(?:$|[/?#])/;

export function getMeetingCode(location: Location = window.location): string | null {
  return MEETING_CODE.exec(location.pathname)?.[1] ?? null;
}

/** True while the user is inside a call (not the lobby, not the "you left" screen). */
export function isInCall(): boolean {
  return document.querySelector(SELECTORS.leaveButton) !== null;
}

export function findCaptionsRegion(): HTMLElement | null {
  return (
    document.querySelector<HTMLElement>(SELECTORS.captionsRegion) ??
    document.querySelector<HTMLElement>(SELECTORS.captionsRegionFallback)
  );
}

export function readCaptionBlocks(region: HTMLElement): CaptionBlock[] {
  let blocks = Array.from(region.querySelectorAll<HTMLElement>(SELECTORS.captionBlock));

  // Structural fallback: each block starts with the speaker's avatar.
  if (blocks.length === 0) {
    blocks = Array.from(region.children).filter(
      (el): el is HTMLElement => el instanceof HTMLElement && el.querySelector('img') !== null,
    );
  }

  return blocks.map((block) => ({
    key: block,
    speaker: readSpeaker(block),
    text: readText(block),
  }));
}

function readSpeaker(block: HTMLElement): string {
  const named = block.querySelector(SELECTORS.speakerName)?.textContent;
  if (named) return named.trim();
  const header = block.querySelector('img')?.parentElement;
  return header?.textContent?.trim() || 'Unknown';
}

function readText(block: HTMLElement): string {
  const text = block.querySelector(SELECTORS.captionText)?.textContent;
  if (text != null) return text;
  return block.lastElementChild?.textContent ?? '';
}

/**
 * Meet only renders the captions region once someone speaks, so also check
 * whether the captions button is in its "on" state.
 */
export function captionsAreOn(): boolean {
  if (findCaptionsRegion()) return true;
  const button = document.querySelector(SELECTORS.captionsButton);
  return button?.classList.contains(SELECTORS.captionsButtonActive) ?? false;
}

/** Clicks Meet's own captions toggle. Falls back to Meet's "c" shortcut. */
export function turnOnCaptions(): void {
  if (captionsAreOn()) return;
  const button = document.querySelector<HTMLButtonElement>(SELECTORS.captionsButton);
  if (button) {
    button.click();
    return;
  }
  document.body.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'c', code: 'KeyC', keyCode: 67, bubbles: true }),
  );
}
