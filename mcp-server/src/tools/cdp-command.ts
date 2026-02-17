import { z } from 'zod';
import type { RelayClient } from '../relay-client.js';
import type { SessionManager } from '../session-manager.js';

export const cdpCommandSchema = z.object({
  method: z.string().describe('CDP method name (e.g. "Runtime.evaluate", "DOM.getDocument")'),
  params: z.record(z.unknown()).optional().describe('CDP method parameters'),
  sessionId: z.string().optional().describe('Target tab session ID (uses default if omitted)'),
});

export async function cdpCommand(
  relay: RelayClient,
  sessions: SessionManager,
  args: z.infer<typeof cdpCommandSchema>,
) {
  const sessionId = sessions.resolveSessionId(args.sessionId);

  const result = await relay.sendCommand(args.method, args.params, sessionId);

  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify(result, null, 2) ?? 'null',
    }],
  };
}
