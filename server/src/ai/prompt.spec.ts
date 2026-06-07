import { buildPrompt } from './prompt';

/**
 * Tests for the prompt builder pure function. The behaviour was
 * frozen in v1 (`web-app runbook §0.4 D6`) and the unit tests are
 * the contract — Task 22 adapters and Task 25 worker all consume
 * whatever this function returns, so the wording below is copied
 * verbatim from the runbook.
 *
 * Invariants:
 *   - presets join with ' AND '
 *   - single preset → no AND
 *   - user_text, when present and non-empty, is appended after a
 *     comma and a single space
 *   - empty string user_text is treated as "absent"
 *   - user text is NOT escaped; v1 design trusts the consultant
 *     input and the model tolerates commas / quotes
 *   - prefix / suffix wrap the whole composition unchanged
 */
describe('buildPrompt', () => {
  it('joins multiple presets with AND', () => {
    expect(buildPrompt('p_', ['a', 'b', 'c'], null, '_s')).toBe(
      'p_a AND b AND c_s',
    );
  });

  it('inserts user_text with comma when present', () => {
    expect(buildPrompt('p_', ['a'], 'make brighter', '_s')).toBe(
      'p_a, make brighter_s',
    );
  });

  it('handles a single preset without AND', () => {
    expect(buildPrompt('p_', ['a'], null, '_s')).toBe('p_a_s');
  });

  it('treats empty user_text as no insertion', () => {
    expect(buildPrompt('p_', ['a', 'b'], '', '_s')).toBe('p_a AND b_s');
  });

  it('preserves commas inside user_text verbatim (no escaping)', () => {
    expect(buildPrompt('p_', ['a'], 'thin, sharp nose', '_s')).toBe(
      'p_a, thin, sharp nose_s',
    );
  });

  it('handles multi-preset + user_text together', () => {
    expect(buildPrompt('p_', ['a', 'b'], 'subtle', '_s')).toBe(
      'p_a AND b, subtle_s',
    );
  });
});
