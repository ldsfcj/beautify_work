/**
 * Vendor-neutral contract every AI image-editing adapter must
 * implement. The AIService (Task 23) treats adapters as black
 * boxes selected by the `name` discriminator, which makes adding
 * a new provider (e.g. Tencent Hunyuan) a single-file change.
 *
 * editImage contract:
 *   - input: a signed URL the vendor can fetch (we do not stream
 *     the user upload through our server) plus the composed prompt
 *     from `buildPrompt()` (Task 21)
 *   - output: the result image as a Buffer (so the worker can
 *     upload it to OSS once, regardless of vendor), the model id
 *     that produced it (for the AI call log + admin display), the
 *     cost in cents (for ledger reconciliation), and the wall-clock
 *     latency in ms (for the same log)
 *
 * The `name` field is a const-string union so AIService can pick
 * an adapter from the system_configs `ai_models` table at boot
 * without a runtime registry lookup.
 */
export type AiAdapterName = 'mock' | 'tongyi' | 'hunyuan';

export interface AiEditInput {
  imageSignedUrl: string;
  prompt: string;
}

export interface AiEditResult {
  resultBuffer: Buffer;
  modelUsed: string;
  costCents: number;
  latencyMs: number;
}

export interface AiAdapter {
  readonly name: AiAdapterName;
  editImage(input: AiEditInput): Promise<AiEditResult>;
}
