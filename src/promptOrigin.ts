import { FrameworkOverheadKind } from './types';

export type PromptTextOrigin = 'user-authored' | FrameworkOverheadKind;

export interface PromptOriginInput {
  text: string;
  isMeta?: boolean;
  isSidechain?: boolean;
  isSubagentFile?: boolean;
}

/**
 * Classify a user-role text block without retaining it. This deliberately uses
 * structural markers only; it does not attempt semantic topic or writing-
 * quality analysis.
 */
export function classifyPromptTextOrigin(input: PromptOriginInput): PromptTextOrigin {
  if (input.isSubagentFile) return 'subagent-dispatch';
  if (input.isMeta) return 'meta';
  if (input.isSidechain) return 'sidechain';

  const text = input.text.trim();
  if (
    /^\[Request interrupted/i.test(text) ||
    /^This session is being continued from a previous conversation/i.test(text) ||
    /<system-reminder(?:\s|>)/i.test(text)
  ) {
    return 'system-reminder';
  }
  if (
    /<command-(?:name|message)>/i.test(text) ||
    /<local-command-(?:stdout|caveat)>/i.test(text)
  ) {
    return 'command-echo';
  }
  // Do not classify arbitrary kebab-case custom elements as framework text.
  // Only the reviewed Claude Code markers above are accepted; unknown markup
  // such as <my-component> may be content the user intentionally pasted.
  return 'user-authored';
}
