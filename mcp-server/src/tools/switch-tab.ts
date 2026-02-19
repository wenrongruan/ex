import { z } from 'zod';
import type { RelayClient } from '../relay-client.js';
import type { SessionManager } from '../session-manager.js';

export const switchTabSchema = z.object({
  tab_id: z.string().describe('标签页ID（从 get_tabs 获取）'),
});

export async function switchTab(
  relay: RelayClient,
  sessions: SessionManager,
  args: z.infer<typeof switchTabSchema>,
) {
  const session = sessions.getSession(args.tab_id);
  if (!session) {
    return {
      content: [{ type: 'text' as const, text: `未找到标签页: ${args.tab_id}` }],
    };
  }

  await relay.sendCommand('Target.activateTarget', {
    targetId: session.targetId,
  }, args.tab_id);

  return {
    content: [{
      type: 'text' as const,
      text: `已切换到标签页: ${session.title || session.url || args.tab_id}`,
    }],
  };
}
