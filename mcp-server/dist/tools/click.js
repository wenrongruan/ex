import { z } from 'zod';
export const clickSchema = z.object({
    selector: z.string().describe('CSS selector of the element to click'),
    sessionId: z.string().optional().describe('Target tab session ID (uses default if omitted)'),
});
export async function click(relay, sessions, args) {
    const sessionId = sessions.resolveSessionId(args.sessionId);
    // Get element coordinates via Runtime.evaluate
    const evalResult = await relay.sendCommand('Runtime.evaluate', {
        expression: `
      (function() {
        const el = document.querySelector(${JSON.stringify(args.selector)});
        if (!el) return JSON.stringify({ error: 'Element not found: ${args.selector.replace(/'/g, "\\'")}' });
        const rect = el.getBoundingClientRect();
        return JSON.stringify({
          x: rect.x + rect.width / 2,
          y: rect.y + rect.height / 2,
          width: rect.width,
          height: rect.height,
        });
      })()
    `,
        returnByValue: true,
    }, sessionId);
    const coordStr = evalResult?.result?.value;
    if (!coordStr) {
        return { content: [{ type: 'text', text: 'Failed to evaluate selector coordinates.' }] };
    }
    const coord = JSON.parse(coordStr);
    if (coord.error) {
        return { content: [{ type: 'text', text: coord.error }] };
    }
    const { x, y } = coord;
    // Human-like mouse move to the target
    await relay.sendCommand('Input.humanMouseMove', {
        startX: 0,
        startY: 0,
        endX: Math.round(x),
        endY: Math.round(y),
        dispatch: true,
    }, sessionId);
    // Click
    await relay.sendCommand('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: Math.round(x),
        y: Math.round(y),
        button: 'left',
        clickCount: 1,
    }, sessionId);
    await relay.sendCommand('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: Math.round(x),
        y: Math.round(y),
        button: 'left',
        clickCount: 1,
    }, sessionId);
    return {
        content: [{
                type: 'text',
                text: `Clicked element "${args.selector}" at (${Math.round(x)}, ${Math.round(y)}).`,
            }],
    };
}
//# sourceMappingURL=click.js.map