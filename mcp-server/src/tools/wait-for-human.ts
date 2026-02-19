import { z } from 'zod';
import type { RelayClient } from '../relay-client.js';
import type { SessionManager } from '../session-manager.js';

export const waitForHumanSchema = z.object({
  disappear_selector: z.string().optional().describe('等待此 CSS 选择器对应元素消失（验证码消失=完成）'),
  appear_selector: z.string().optional().describe('等待此 CSS 选择器对应元素出现（目标内容出现=完成）'),
  timeout: z.number().optional().describe('总等待时间（秒），默认120'),
  poll_interval: z.number().optional().describe('轮询间隔（秒），默认2'),
  sessionId: z.string().optional().describe('目标标签页会话ID（不填使用默认）'),
});

export async function waitForHuman(
  relay: RelayClient,
  sessions: SessionManager,
  args: z.infer<typeof waitForHumanSchema>,
) {
  const sessionId = sessions.resolveSessionId(args.sessionId);
  const timeoutMs = (args.timeout ?? 120) * 1000;
  const pollMs = (args.poll_interval ?? 2) * 1000;
  const deadline = Date.now() + timeoutMs;

  if (!args.disappear_selector && !args.appear_selector) {
    return {
      content: [{ type: 'text' as const, text: '请至少提供 disappear_selector 或 appear_selector 之一' }],
    };
  }

  while (Date.now() < deadline) {
    // Check disappear_selector: done when element is gone
    if (args.disappear_selector) {
      const result = await relay.sendCommand('Runtime.evaluate', {
        expression: `document.querySelector(${JSON.stringify(args.disappear_selector)}) !== null`,
        returnByValue: true,
      }, sessionId) as { result?: { value?: boolean } };

      if (result?.result?.value === false) {
        return {
          content: [{ type: 'text' as const, text: `人工操作完成：元素 ${args.disappear_selector} 已消失` }],
        };
      }
    }

    // Check appear_selector: done when element appears
    if (args.appear_selector) {
      const result = await relay.sendCommand('Runtime.evaluate', {
        expression: `document.querySelector(${JSON.stringify(args.appear_selector)}) !== null`,
        returnByValue: true,
      }, sessionId) as { result?: { value?: boolean } };

      if (result?.result?.value === true) {
        return {
          content: [{ type: 'text' as const, text: `人工操作完成：元素 ${args.appear_selector} 已出现` }],
        };
      }
    }

    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  return {
    content: [{
      type: 'text' as const,
      text: `等待人工操作超时（${args.timeout ?? 120} 秒）`,
    }],
  };
}
