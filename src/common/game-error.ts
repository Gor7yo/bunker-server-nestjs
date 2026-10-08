/** Expected, user-facing error. Its message is sent to the client as is. */
export class GameError extends Error {}

export type WsResult<T = undefined> =
  { ok: true; data: T } | { ok: false; error: string };
