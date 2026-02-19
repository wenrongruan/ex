import { z } from 'zod';
import type { RelayClient } from '../relay-client.js';
import type { SessionManager } from '../session-manager.js';

export const captchaScreenshotSchema = z.object({
  selector: z.string().optional().describe('可选，CSS选择器，截取特定验证码元素；不填则自动定位'),
  sessionId: z.string().optional().describe('目标标签页会话ID（不填使用默认）'),
});

// Auto-detect captcha element selectors in priority order
const AUTO_SELECTORS = [
  'iframe[src*="recaptcha"]',
  '.g-recaptcha',
  'iframe[src*="hcaptcha"]',
  '.h-captcha',
  '.cf-turnstile',
  '#challenge-form',
  '.geetest_panel',
  '.slide-verify',
  'img[src*="captcha"]',
  'img[src*="vcode"]',
  'canvas',
  '[class*="captcha"]',
  '[id*="captcha"]',
];

export async function captchaScreenshot(
  relay: RelayClient,
  sessions: SessionManager,
  args: z.infer<typeof captchaScreenshotSchema>,
) {
  const sessionId = sessions.resolveSessionId(args.sessionId);

  let targetSelector = args.selector;

  // Auto-detect if no selector provided
  if (!targetSelector) {
    const detectExpr = `
      (function() {
        const selectors = ${JSON.stringify(AUTO_SELECTORS)};
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el) return sel;
        }
        return null;
      })()
    `;
    const detectResult = await relay.sendCommand('Runtime.evaluate', {
      expression: detectExpr,
      returnByValue: true,
    }, sessionId) as { result?: { value?: string | null } };

    targetSelector = detectResult?.result?.value ?? undefined;
    if (!targetSelector) {
      return {
        content: [{ type: 'text' as const, text: '未在页面上检测到验证码元素' }],
      };
    }
  }

  // Get element bounds
  const boundsResult = await relay.sendCommand('Runtime.evaluate', {
    expression: `
      (function() {
        const el = document.querySelector(${JSON.stringify(targetSelector)});
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        // Add small padding
        return JSON.stringify({
          x: Math.max(0, rect.x - 8),
          y: Math.max(0, rect.y - 8),
          width: rect.width + 16,
          height: rect.height + 16,
        });
      })()
    `,
    returnByValue: true,
  }, sessionId) as { result?: { value?: string } };

  const rectStr = boundsResult?.result?.value;
  if (!rectStr) {
    return { content: [{ type: 'text' as const, text: `未找到元素: ${targetSelector}` }] };
  }

  let rect: { x: number; y: number; width: number; height: number };
  try {
    rect = JSON.parse(rectStr) as { x: number; y: number; width: number; height: number };
  } catch {
    return { content: [{ type: 'text' as const, text: `获取元素位置失败: ${targetSelector}` }] };
  }

  const result = await relay.sendCommand('Page.captureScreenshot', {
    format: 'png',
    clip: {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      scale: 1,
    },
  }, sessionId) as { data?: string };

  if (!result?.data) {
    return { content: [{ type: 'text' as const, text: '截图失败' }] };
  }

  return {
    content: [{
      type: 'image' as const,
      data: result.data,
      mimeType: 'image/png',
    }],
  };
}
