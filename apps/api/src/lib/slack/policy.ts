export type SlackWriteKind = "comment" | "description";

/** Whether this write should create or post to the issue's Slack channel. */
export function shouldSyncSlackWrite(opts: {
  source?: "app" | "slack";
  kind: SlackWriteKind;
  hasChannel: boolean;
  newMentionCount: number;
  resolvedCount: number;
}): boolean {
  if ((opts.source ?? "app") === "slack") return false;
  if (opts.kind === "description") {
    if (opts.newMentionCount === 0) return false;
    return opts.hasChannel || opts.resolvedCount > 0;
  }
  if (opts.hasChannel) return true;
  return opts.newMentionCount > 0 && opts.resolvedCount > 0;
}
