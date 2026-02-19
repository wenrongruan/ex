import { z } from 'zod';
import type { RelayClient } from '../relay-client.js';
import type { SessionManager } from '../session-manager.js';

export const typeSchema = z.object({
  selector: z.string().describe('CSS选择器'),
  text: z.string().describe('要输入的文本'),
  sessionId: z.string().optional().describe('目标标签页会话ID（不填使用默认）'),
});

// Physical key info: maps each typeable character to its underlying key's code + keyCode.
// keyCode follows Windows Virtual Key codes (what browsers expect).
// Shifted variants (e.g. '@' for '2') share the same physical key as their base character.
const KEY_MAP: Record<string, { code: string; keyCode: number }> = {
  ' ': { code: 'Space',        keyCode: 32  },
  '0': { code: 'Digit0',       keyCode: 48  }, ')': { code: 'Digit0',       keyCode: 48  },
  '1': { code: 'Digit1',       keyCode: 49  }, '!': { code: 'Digit1',       keyCode: 49  },
  '2': { code: 'Digit2',       keyCode: 50  }, '@': { code: 'Digit2',       keyCode: 50  },
  '3': { code: 'Digit3',       keyCode: 51  }, '#': { code: 'Digit3',       keyCode: 51  },
  '4': { code: 'Digit4',       keyCode: 52  }, '$': { code: 'Digit4',       keyCode: 52  },
  '5': { code: 'Digit5',       keyCode: 53  }, '%': { code: 'Digit5',       keyCode: 53  },
  '6': { code: 'Digit6',       keyCode: 54  }, '^': { code: 'Digit6',       keyCode: 54  },
  '7': { code: 'Digit7',       keyCode: 55  }, '&': { code: 'Digit7',       keyCode: 55  },
  '8': { code: 'Digit8',       keyCode: 56  }, '*': { code: 'Digit8',       keyCode: 56  },
  '9': { code: 'Digit9',       keyCode: 57  }, '(': { code: 'Digit9',       keyCode: 57  },
  '-': { code: 'Minus',        keyCode: 189 }, '_': { code: 'Minus',        keyCode: 189 },
  '=': { code: 'Equal',        keyCode: 187 }, '+': { code: 'Equal',        keyCode: 187 },
  '[': { code: 'BracketLeft',  keyCode: 219 }, '{': { code: 'BracketLeft',  keyCode: 219 },
  ']': { code: 'BracketRight', keyCode: 221 }, '}': { code: 'BracketRight', keyCode: 221 },
  '\\':{ code: 'Backslash',    keyCode: 220 }, '|': { code: 'Backslash',    keyCode: 220 },
  ';': { code: 'Semicolon',    keyCode: 186 }, ':': { code: 'Semicolon',    keyCode: 186 },
  "'": { code: 'Quote',        keyCode: 222 }, '"': { code: 'Quote',        keyCode: 222 },
  '`': { code: 'Backquote',    keyCode: 192 }, '~': { code: 'Backquote',    keyCode: 192 },
  ',': { code: 'Comma',        keyCode: 188 }, '<': { code: 'Comma',        keyCode: 188 },
  '.': { code: 'Period',       keyCode: 190 }, '>': { code: 'Period',       keyCode: 190 },
  '/': { code: 'Slash',        keyCode: 191 }, '?': { code: 'Slash',        keyCode: 191 },
};

function getKeyInfo(char: string): { key: string; code: string; keyCode: number } {
  if (char.length === 1) {
    const upper = char.toUpperCase();
    if (upper >= 'A' && upper <= 'Z') {
      // keyCode for letter keys uses the uppercase char code (physical key position)
      return { key: char, code: `Key${upper}`, keyCode: upper.charCodeAt(0) };
    }
    const mapped = KEY_MAP[char];
    if (mapped) return { key: char, ...mapped };
  }
  // Non-ASCII or unmapped: key is sufficient for the char event's text field
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
