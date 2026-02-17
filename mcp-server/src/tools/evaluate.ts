import { z } from 'zod';
import type { RelayClient } from '../relay-client.js';
import type { SessionManager } from '../session-manager.js';

export const evaluateSchema = z.object({
  expression: z.string().describe('JavaScript expression to evaluate in the page context'),
  awaitPromise: z.boolean().optional().default(false).describe('Whether to await the result if it is a Promise'),
  sessionId: z.string().optional().describe('Target tab session ID (uses default if omitted)'),
});

export async function evaluate(
  relay: RelayClient,
  sessions: SessionManager,
  args: z.infer<typeof evaluateSchema>,
) {
  const sessionId = sessions.resolveSessionId(args.sessionId);

  const result = await relay.sendCommand('Runtime.evaluate', {
    expression: args.expression,
    returnByValue: true,
    awaitPromise: args.awaitPromise,
  }, sessionId) as {
    result?: { type?: string; value?: unknown; description?: string; subtype?: string };
    exceptionDetails?: { text?: string; exception?: { description?: string } };
  };

  if (result?.exceptionDetails) {
    const errMsg = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? 'Unknown error';
    return { content: [{ type: 'text' as const, text: `JavaScript error: ${errMsg}` }] };
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
