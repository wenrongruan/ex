import { z } from 'zod';
import type { RelayClient } from '../relay-client.js';
import type { SessionManager } from '../session-manager.js';

export const closeTabSchema = z.object({
  tab_id: z.string().optional().describe('可选，标签页ID。不指定则关闭当前标签页'),
  sessionId: z.string().optional().describe('目标标签页会话ID（与 tab_id 二选一）'),
});

export async function closeTab(
  relay: RelayClient,
  sessions: SessionManager,
  args: z.infer<typeof closeTabSchema>,
) {
  const effectiveId = args.tab_id ?? args.sessionId;
  const sessionId = sessions.resolveSessionId(effectiveId);
  const session = sessions.getSession(sessionId);

  if (!session) {
    return {
      content: [{ type: 'text' as const, text: `未找到标签页: ${effectiveId ?? '默认'}` }],
    };
  }

  await relay.sendCommand('Target.closeTarget', {
    targetId: session.targetId,
  }, sessionId);

  const label = args.tab_id ?? sessionId;
  return {
    content: [{
      type: 'text' as const,
      text: args.tab_id ? `已关闭标签页: ${label}` : '已关闭当前标签页',
    }],
  };
}
