import { z } from 'zod';
import type { RelayClient } from '../relay-client.js';
import type { SessionManager } from '../session-manager.js';

export const newTabSchema = z.object({
  url: z.string().optional().describe('可选，要导航到的URL'),
  sessionId: z.string().optional().describe('用于发送命令的会话ID（不填使用默认）'),
});

export async function newTab(
  relay: RelayClient,
  sessions: SessionManager,
  args: z.infer<typeof newTabSchema>,
) {
  const sessionId = sessions.resolveSessionId(args.sessionId);

  const result = await relay.sendCommand('Target.createTarget', {
    url: args.url ?? 'about:blank',
    newWindow: false,
  }, sessionId) as { targetId?: string };

  const targetId = result?.targetId ?? 'unknown';

  return {
    content: [{
      type: 'text' as const,
      text: `已创建新标签页: ${targetId}${args.url ? `\n已导航到: ${args.url}` : ''}`,
    }],
  };
}
