import { z } from 'zod';
import type { RelayClient } from '../relay-client.js';
import type { SessionManager } from '../session-manager.js';

export const getContentSchema = z.object({
  selector: z.string().optional().describe('可选，CSS选择器。不提供则获取整个页面文本'),
  sessionId: z.string().optional().describe('目标标签页会话ID（不填使用默认）'),
});

export async function getContent(
  relay: RelayClient,
  sessions: SessionManager,
  args: z.infer<typeof getContentSchema>,
) {
  const sessionId = sessions.resolveSessionId(args.sessionId);

  const expression = args.selector
    ? `
      (function() {
        const el = document.querySelector(${JSON.stringify(args.selector)});
        return el ? el.innerText || el.textContent || '' : '未找到元素: ${args.selector.replace(/'/g, "\\'")}';
      })()
    `
    : `document.body ? document.body.innerText : ''`;

  const evalResult = await relay.sendCommand('Runtime.evaluate', {
    expression,
    returnByValue: true,
  }, sessionId) as { result?: { value?: string } };

  const content = evalResult?.result?.value ?? '';

  return { content: [{ type: 'text' as const, text: content }] };
}
