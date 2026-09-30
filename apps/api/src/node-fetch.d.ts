/** Node 22 built-in fetch surface used for the LRS health probe (no DOM lib). */
declare class URL {
  constructor(input: string);
}

declare const AbortSignal: {
  timeout(milliseconds: number): unknown;
};

declare function fetch(input: URL, init: { readonly signal: unknown; readonly headers?: Readonly<Record<string, string>> }): Promise<{
  readonly ok: boolean;
  readonly status: number;
}>;
