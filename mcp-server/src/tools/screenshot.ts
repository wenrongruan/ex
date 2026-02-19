import { z } from 'zod';
import type { RelayClient } from '../relay-client.js';
import type { SessionManager } from '../session-manager.js';

export const screenshotSchema = z.object({
  selector: z.string().optional().describe('可选，CSS选择器，截取特定元素'),
  full_page: z.boolean().optional().default(false).describe('是否截取整个页面（默认false）'),
  sessionId: z.string().optional().describe('目标标签页会话ID（不填使用默认）'),
});

export async function screenshot(
  relay: RelayClient,
  sessions: SessionManager,
  args: z.infer<typeof screenshotSchema>,
) {
  const sessionId = sessions.resolveSessionId(args.sessionId);

  const captureParams: Record<string, unknown> = {
    format: 'png',
  };

  if (args.selector) {
    // Get element bounds for clipping
    const evalResult = await relay.sendCommand('Runtime.evaluate', {
      expression: `
        (function() {
          const el = document.querySelector(${JSON.stringify(args.selector)});
          if (!el) return null;
          const rect = el.getBoundingClientRect();
          return JSON.stringify({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
        })()
      `,
      returnByValue: true,
    }, sessionId) as { result?: { value?: string } };

    const rectStr = evalResult?.result?.value;
    if (!rectStr) {
      return { content: [{ type: 'text' as const, text: `未找到元素: ${args.selector}` }] };
    }
    const rect = JSON.parse(rectStr) as { x: number; y: number; width: number; height: number };
    captureParams.clip = {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      scale: 1,
    };
  } else if (args.full_page) {
    const metrics = await relay.sendCommand('Page.getLayoutMetrics', {}, sessionId) as {
      contentSize?: { width?: number; height?: number };
    };
    if (metrics?.contentSize) {
      captureParams.clip = {
        x: 0,
        y: 0,
        width: metrics.contentSize.width,
        height: metrics.contentSize.height,
        scale: 1,
      };
    }
  }

  const result = await relay.sendCommand('Page.captureScreenshot', captureParams, sessionId) as {
    data?: string;
  };

  if (!result?.data) {
    return { content: [{ type: 'text' as const, text: '截图失败 - 未返回数据' }] };
  }

  return {
    content: [{
      type: 'image' as const,
      data: result.data,
      mimeType: 'image/png',
    }],
  };
}
