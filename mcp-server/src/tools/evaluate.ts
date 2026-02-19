import { z } from 'zod';
import type { RelayClient } from '../relay-client.js';
import type { SessionManager } from '../session-manager.js';

export const evaluateSchema = z.object({
  script: z.string().describe('要执行的 JavaScript 代码'),
  sessionId: z.string().optional().describe('目标标签页会话ID（不填使用默认）'),
});

export async function evaluate(
  relay: RelayClient,
  sessions: SessionManager,
  args: z.infer<typeof evaluateSchema>,
) {
  const sessionId = sessions.resolveSessionId(args.sessionId);

  const result = await relay.sendCommand('Runtime.evaluate', {
    expression: args.script,
    returnByValue: true,
    awaitPromise: false,
  }, sessionId) as {
    result?: { type?: string; value?: unknown; description?: string; subtype?: string };
    exceptionDetails?: { text?: string; exception?: { description?: string } };
  };

  if (result?.exceptionDetails) {
    const errMsg = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? 'Unknown error';
    return { content: [{ type: 'text' as const, text: `JavaScript 错误: ${errMsg}` }] };
  }

  const value = result?.result;
  let text: string;

  if (value?.type === 'undefined') {
    text = 'undefined';
  } else if (value?.subtype === 'null') {
    text = 'null';
  } else if (value?.value !== undefined) {
    text = typeof value.value === 'string' ? value.value : JSON.stringify(value.value, null, 2);
  } else {
    text = value?.description ?? String(value);
  }

  return { content: [{ type: 'text' as const, text }] };
}
