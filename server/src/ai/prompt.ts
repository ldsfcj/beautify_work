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

/**
 * Structured system prompt that wraps the preset instructions.
 * This provides the AI model with a clear role, analysis directive,
 * preservation rules, and output format — only the specific editing
 * instructions (step 2) come from the preset default_prompt.
 */
export const SYSTEM_PROMPT_PREFIX = `You are a professional medical aesthetic image editing AI. Your task is to generate a post-operative facial photo based on the provided pre-operative photo and the following detailed editing instructions. The output must be a realistic, high-resolution image that accurately reflects the specified changes while preserving all other facial features. IMPORTANT: The output image must have the exact same framing, composition, zoom level, camera angle, and field of view as the input photo — do not crop, zoom, shift, or rotate.

Instructions:
1. Analyze the pre-operative photo – identify the relevant facial anatomical structures.
2. Apply the following edits precisely: `;

export const SYSTEM_PROMPT_SUFFIX = `
3. Preserve ALL other facial features – do not alter skin texture, color, lighting, expression, or any other anatomical structures not mentioned above.
4. CRITICAL: Maintain the exact same framing, composition, zoom level, and camera angle as the original photo. Do not crop, zoom in, zoom out, shift, or rotate the image. The output must have the same field of view and subject positioning as the input.
5. Output format: generate a single image file (PNG or JPEG) with the same dimensions and resolution as the input pre-operative photo. No text or annotations should be added to the image.`;
