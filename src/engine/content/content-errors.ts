/**
 * Provides structured content failures for runtime lookups and validation boundaries.
 * User-facing layers can report a stable code without exposing filesystem paths or stack traces.
 */

/** ContentError carries a machine-readable code and safe context for one content operation. */
export class ContentError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
    public readonly contentId?: string,
  ) {
    super(message);
    this.name = "ContentError";
  }
}
