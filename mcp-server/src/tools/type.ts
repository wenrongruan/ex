import { z } from 'zod';
import type { RelayClient } from '../relay-client.js';
import type { SessionManager } from '../session-manager.js';

export const typeSchema = z.object({
  text: z.string().describe('The text to type'),
  selector: z.string().optional().describe('CSS selector to focus before typing (optional)'),
  sessionId: z.string().optional().describe('Target tab session ID (uses default if omitted)'),
});

// Common key-to-code/keyCode mappings
function getKeyInfo(char: string): { key: string; code: string; keyCode: number } {
  // For printable characters, use the character itself
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

  // Focus the element if selector is provided
  if (args.selector) {
    await relay.sendCommand('Runtime.evaluate', {
      expression: `document.querySelector(${JSON.stringify(args.selector)})?.focus()`,
      returnByValue: true,
    }, sessionId);
  }

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
      text: `Typed "${args.text.length > 50 ? args.text.slice(0, 50) + '...' : args.text}" (${args.text.length} characters).`,
    }],
  };
}
