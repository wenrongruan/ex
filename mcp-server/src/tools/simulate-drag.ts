import { z } from 'zod';
import type { RelayClient } from '../relay-client.js';
import type { SessionManager } from '../session-manager.js';

export const simulateDragSchema = z.object({
  selector: z.string().describe('拖动起始元素的 CSS 选择器（如滑块手柄）'),
  offset_x: z.number().describe('水平拖动偏移量（像素），正数向右'),
  offset_y: z.number().optional().describe('垂直拖动偏移量（像素），默认0'),
  steps: z.number().optional().describe('拖动步数，越多越像人类（默认30，建议20-50）'),
  sessionId: z.string().optional().describe('目标标签页会话ID（不填使用默认）'),
});

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

export async function simulateDrag(
  relay: RelayClient,
  sessions: SessionManager,
  args: z.infer<typeof simulateDragSchema>,
) {
  const sessionId = sessions.resolveSessionId(args.sessionId);
  const steps = args.steps ?? 30;
  const offsetY = args.offset_y ?? 0;

  // Get element center coordinates
  const posResult = await relay.sendCommand('Runtime.evaluate', {
    expression: `
      (function() {
        const el = document.querySelector(${JSON.stringify(args.selector)});
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
      })()
    `,
    returnByValue: true,
  }, sessionId) as { result?: { value?: string } };

  const posStr = posResult?.result?.value;
  if (!posStr) {
    return { content: [{ type: 'text' as const, text: `未找到元素: ${args.selector}` }] };
  }

  const pos = JSON.parse(posStr) as { x: number; y: number };
  const startX = pos.x;
  const startY = pos.y;
  const endX = startX + args.offset_x;
  const endY = startY + offsetY;

  // Mouse down
  await relay.sendCommand('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: Math.round(startX),
    y: Math.round(startY),
    button: 'left',
    clickCount: 1,
  }, sessionId);

  // Step-by-step mouse move with smoothstep easing + random jitter
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const ease = smoothstep(t);
    const jitterX = (Math.random() - 0.5) * 2;
    const jitterY = (Math.random() - 0.5) * 2;
    const x = Math.round(startX + args.offset_x * ease + jitterX);
    const y = Math.round(startY + offsetY * ease + jitterY);

    await relay.sendCommand('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x,
      y,
      button: 'left',
    }, sessionId);

    // ~16ms per step to simulate 60fps
    await new Promise((resolve) => setTimeout(resolve, 16));
  }

  // Mouse up
  await relay.sendCommand('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: Math.round(endX),
    y: Math.round(endY),
    button: 'left',
    clickCount: 1,
  }, sessionId);

  return {
    content: [{
      type: 'text' as const,
      text: `已拖动元素 "${args.selector}"：向右 ${args.offset_x}px${offsetY !== 0 ? `，向下 ${offsetY}px` : ''}（${steps} 步）`,
    }],
  };
}
