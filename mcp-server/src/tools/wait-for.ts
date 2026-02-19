import { z } from 'zod';
import type { RelayClient } from '../relay-client.js';
import type { SessionManager } from '../session-manager.js';

export const waitForSchema = z.object({
  selector: z.string().describe('CSS选择器'),
  timeout: z.number().optional().describe('超时时间（秒），默认30秒'),
  sessionId: z.string().optional().describe('目标标签页会话ID（不填使用默认）'),
});

export async function waitFor(
  relay: RelayClient,
  sessions: SessionManager,
  args: z.infer<typeof waitForSchema>,
) {
  const sessionId = sessions.resolveSessionId(args.sessionId);
  const timeoutMs = (args.timeout ?? 30) * 1000;
  const pollInterval = 500;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const evalResult = await relay.sendCommand('Runtime.evaluate', {
      expression: `document.querySelector(${JSON.stringify(args.selector)}) !== null`,
      returnByValue: true,
    }, sessionId) as { result?: { value?: boolean } };

    if (evalResult?.result?.value === true) {
      return {
        content: [{ type: 'text' as const, text: `元素 ${args.selector} 已出现` }],
      };
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  return {
    content: [{ type: 'text' as const, text: `等待超时: 元素 ${args.selector} 未在 ${args.timeout ?? 30} 秒内出现` }],
  };
}
