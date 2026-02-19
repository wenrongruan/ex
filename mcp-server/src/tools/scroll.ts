import { z } from 'zod';
import type { RelayClient } from '../relay-client.js';
import type { SessionManager } from '../session-manager.js';

export const scrollSchema = z.object({
  direction: z.enum(['up', 'down', 'left', 'right', 'top', 'bottom']).describe('滚动方向: up, down, left, right, top, bottom'),
  amount: z.number().optional().describe('滚动距离（像素），默认500'),
  sessionId: z.string().optional().describe('目标标签页会话ID（不填使用默认）'),
});

export async function scroll(
  relay: RelayClient,
  sessions: SessionManager,
  args: z.infer<typeof scrollSchema>,
) {
  const sessionId = sessions.resolveSessionId(args.sessionId);
  const amount = args.amount ?? 500;

  let expression: string;
  switch (args.direction) {
    case 'up':
      expression = `window.scrollBy(0, -${amount})`;
      break;
    case 'down':
      expression = `window.scrollBy(0, ${amount})`;
      break;
    case 'left':
      expression = `window.scrollBy(-${amount}, 0)`;
      break;
    case 'right':
      expression = `window.scrollBy(${amount}, 0)`;
      break;
    case 'top':
      expression = `window.scrollTo(0, 0)`;
      break;
    case 'bottom':
      expression = `window.scrollTo(0, document.body.scrollHeight)`;
      break;
  }

  await relay.sendCommand('Runtime.evaluate', {
    expression,
    returnByValue: true,
  }, sessionId);

  return {
    content: [{
      type: 'text' as const,
      text: `已向 ${args.direction} 滚动${args.direction === 'top' || args.direction === 'bottom' ? '' : ` ${amount} 像素`}`,
    }],
  };
}
