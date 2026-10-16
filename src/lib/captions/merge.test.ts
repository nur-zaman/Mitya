import { describe, expect, it } from 'vitest';
import { countWords, mergeCaptionText } from './merge';

describe('mergeCaptionText', () => {
  it('takes the new text when the caption grows', () => {
    expect(mergeCaptionText('Hello! How?', "Hello! How's it going?")).toBe(
      "Hello! How's it going?",
    );
  });

  it('accepts corrections near the end', () => {
    expect(mergeCaptionText("I'm talking to you, right?", "I'm talking to you right now.")).toBe(
      "I'm talking to you right now.",
    );
  });

  it('stitches text back together when Meet trims the start of a long block', () => {
    const before =
      'So I spent three years on the payments team where we rebuilt the ledger from scratch and moved it to Postgres';
    const after =
      'where we rebuilt the ledger from scratch and moved it to Postgres, which cut reconciliation time in half';
    expect(mergeCaptionText(before, after)).toBe(
      'So I spent three years on the payments team ' + after,
    );
  });

  it('falls back to what is on screen when the texts are unrelated', () => {
    expect(mergeCaptionText('Completely different words here', 'Nothing in common at all')).toBe(
      'Nothing in common at all',
    );
  });

  it('ignores empty input on either side', () => {
    expect(mergeCaptionText('', 'Hi')).toBe('Hi');
    expect(mergeCaptionText('Hi', '   ')).toBe('Hi');
  });
});

describe('countWords', () => {
  it('counts whitespace separated words', () => {
    expect(countWords('  one two\nthree ')).toBe(3);
    expect(countWords('')).toBe(0);
  });
});
