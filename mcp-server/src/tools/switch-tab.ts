import { z } from 'zod';
import type { RelayClient } from '../relay-client.js';
import type { SessionManager } from '../session-manager.js';

export const switchTabSchema = z.object({
  sessionId: z.string().describe('Session ID of the tab to activate'),
});

export async function switchTab(
  relay: RelayClient,
  sessions: SessionManager,
  args: z.infer<typeof switchTabSchema>,
) {
  const session = sessions.getSession(args.sessionId);
  if (!session) {
    return {
      content: [{ type: 'text' as const, text: `Tab with session "${args.sessionId}" not found.` }],
    };
  }

  await relay.sendCommand('Target.activateTarget', {
    targetId: session.targetId,
  }, args.sessionId);

  return {
    content: [{
      type: 'text' as const,
      text: `Switched to tab: ${session.title || session.url || args.sessionId}`,
    }],
  };
}
