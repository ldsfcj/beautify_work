/**
 * Pure prompt-assembly helper. The v1 design (D6) froze this
 * composition rule; everything from the AI adapter (Task 22)
 * outward depends on the exact shape, so this file is the contract
 * and the unit tests are the spec.
 *
 * Composition:
 *   <prefix><preset1> AND <preset2> AND ... [,<user_text>]<suffix>
 *
 *   - presets are joined with the literal `' AND '`
 *   - a single preset is emitted without any joiner
 *   - user_text (when present and non-empty) is appended after a
 *     comma + single space
 *   - empty string user_text is treated as "absent" — no trailing
 *     comma, no extra whitespace
 *   - user text is NOT escaped; commas / quotes inside the
 *     consultant's free-form note pass through verbatim because
 *     the model is tolerant and the v1 trust boundary is the
 *     consultant (logged-in user), not the customer
 *
 * The function is intentionally pure: no DB lookups, no async.
 * The caller (Task 25 submit handler) is responsible for resolving
 * preset `key`s to `defaultPrompt` strings via PresetService before
 * calling this.
 */
export function buildPrompt(
  prefix: string,
  presets: string[],
  userText: string | null,
  suffix: string,
): string {
  const presetPart = presets.join(' AND ');
  const text = userText && userText.length > 0 ? userText : null;
  const middle = text ? `${presetPart}, ${text}` : presetPart;
  return `${prefix}${middle}${suffix}`;
}
