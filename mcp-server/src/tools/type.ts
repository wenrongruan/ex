import { z } from 'zod';
import type { RelayClient } from '../relay-client.js';
import type { SessionManager } from '../session-manager.js';

export const typeSchema = z.object({
  selector: z.string().describe('CSS选择器'),
  text: z.string().describe('要输入的文本'),
  sessionId: z.string().optional().describe('目标标签页会话ID（不填使用默认）'),
});

// Common key-to-code/keyCode mappings
function getKeyInfo(char: string): { key: string; code: string; keyCode: number } {
  if (char.length === 1) {
    const upper = char.toUpperCase();
    const code = upper >= 'A' && upper <= 'Z' ? `Key${upper}` :
      char >= '0' && char <= '9' ? `Digit${char}` :
        char === ' ' ? 'Space' :
          char === '.' ? 'Period' :
            char === ',' ? 'Comma' :
              char === '/' ? 'Slash' :
                char === ';' ? 'Semicolon' :
                  char === "'" ? 'Quote' :
                    char === '[' ? 'BracketLeft' :
                      char === ']' ? 'BracketRight' :
                        char === '-' ? 'Minus' :
                          char === '=' ? 'Equal' :
                            char === '\\' ? 'Backslash' :
                              char === '`' ? 'Backquote' :
                                `Key${upper}`;
    const keyCode = char === ' ' ? 32 : char.charCodeAt(0);
    return { key: char, code, keyCode };
  }
  return { key: char, code: '', keyCode: 0 };
}

export async function type(
  relay: RelayClient,
  sessions: SessionManager,
  args: z.infer<typeof typeSchema>,
) {
  const sessionId = sessions.resolveSessionId(args.sessionId);

  // Clear existing content and focus element
  await relay.sendCommand('Runtime.evaluate', {
    expression: `
      (function() {
        const el = document.querySelector(${JSON.stringify(args.selector)});
        if (el) {
          el.focus();
          if ('value' in el) el.value = '';
        }
      })()
    `,
    returnByValue: true,
  }, sessionId);

  // Type each character using dispatchRealKey for human-like input
  for (const char of args.text) {
    const { key, code, keyCode } = getKeyInfo(char);
    await relay.sendCommand('Input.dispatchRealKey', {
      key,
      code,
      keyCode,
    }, sessionId);
  }

  return {
    content: [{
      type: 'text' as const,
      text: `已在元素 ${args.selector} 中输入文本`,
    }],
  };
}
