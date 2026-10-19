import { describe, expect, it } from 'vitest';
import { describeMode, MAX_CUSTOM_GUIDANCE, MODES } from './modes';

describe('describeMode', () => {
  it('returns the built-in definition', () => {
    expect(describeMode({ mode: 'interview', custom: null })).toBe(MODES.interview);
  });

  it('uses the name and instructions of a custom kind', () => {
    const mode = describeMode({
      mode: 'custom',
      custom: { id: 'k1', label: ' Board update ', guidance: 'Flag numbers that changed.' },
    });
    expect(mode.label).toBe('Board update');
    expect(mode.guidance).toContain('"Board update"');
    expect(mode.guidance).toContain('Flag numbers that changed.');
  });

  it('falls back to general guidance when a custom kind has none', () => {
    const mode = describeMode({ mode: 'custom', custom: { id: 'k1', label: '', guidance: ' ' } });
    expect(mode.label).toBe('Custom');
    expect(mode.guidance).toBe(MODES.general.guidance);
  });

  it('caps long instructions', () => {
    const guidance = 'x'.repeat(MAX_CUSTOM_GUIDANCE + 100);
    const mode = describeMode({ mode: 'custom', custom: { id: 'k1', label: 'Long', guidance } });
    expect(mode.guidance).not.toContain('x'.repeat(MAX_CUSTOM_GUIDANCE + 1));
  });
});
