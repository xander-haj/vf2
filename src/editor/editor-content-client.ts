/** Provides the authenticated browser side of the loopback-only content bridge. */

import type { EditorDiagnostic, JsonValue, LoadedContentSnapshot } from "./editor-state";

interface SaveResult {
  readonly revision: number;
  readonly hash: string;
  readonly diagnostics: readonly EditorDiagnostic[];
  readonly writtenFiles: readonly string[];
}

interface ValidationResult { readonly diagnostics: readonly EditorDiagnostic[]; }

/** Converts bridge failures into concise messages without exposing local absolute paths. */
async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({ error: "The editor bridge returned invalid JSON." })) as {
    error?: string;
  } & T;
  if (!response.ok) throw new Error(body.error ?? `Editor bridge request failed (${response.status}).`);
  return body;
}

/** The token is injected into editor.html by the local Vite plugin and never stored in source. */
function getSessionToken(): string {
  const token = document.querySelector<HTMLMetaElement>('meta[name="vf-editor-token"]')?.content;
  if (token === undefined || token.length < 32) {
    throw new Error("Open the editor with the local editor command; its secure bridge token is missing.");
  }
  return token;
}

export class EditorContentClient {
  private readonly token = getSessionToken();
  private readonly endpoint = "/__vf_editor";

  /** Loads the current canonical content, compiler diagnostics, and concurrency identity. */
  load(): Promise<LoadedContentSnapshot> {
    return this.request<LoadedContentSnapshot>("/content", { method: "GET" });
  }

  /** Validates a complete unsaved snapshot without allowing the bridge to mutate source. */
  validate(files: Readonly<Record<string, JsonValue>>): Promise<ValidationResult> {
    return this.request<ValidationResult>("/validate", {
      method: "POST",
      body: JSON.stringify({ files }),
    });
  }

  /** Commits content only when the browser still owns the loaded revision and hash. */
  save(
    files: Readonly<Record<string, JsonValue>>,
    expectedRevision: number,
    expectedHash: string,
    generationDecision: "migrate" | null,
  ): Promise<SaveResult> {
    return this.request<SaveResult>("/save", {
      method: "POST",
      body: JSON.stringify({ files, expectedRevision, expectedHash, generationDecision }),
    });
  }

  /** Adds the per-process capability token and enforces structured responses for every request. */
  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await fetch(`${this.endpoint}${path}`, {
      ...init,
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "X-VF-Editor-Token": this.token,
      },
    });
    return readResponse<T>(response);
  }
}
