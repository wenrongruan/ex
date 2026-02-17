import { z } from 'zod';
export const cdpCommandSchema = z.object({
    method: z.string().describe('CDP method name (e.g. "Runtime.evaluate", "DOM.getDocument")'),
    params: z.record(z.unknown()).optional().describe('CDP method parameters'),
    sessionId: z.string().optional().describe('Target tab session ID (uses default if omitted)'),
});
export async function cdpCommand(relay, sessions, args) {
    const sessionId = sessions.resolveSessionId(args.sessionId);
    const result = await relay.sendCommand(args.method, args.params, sessionId);
    return {
        content: [{
                type: 'text',
                text: JSON.stringify(result, null, 2) ?? 'null',
            }],
    };
}
//# sourceMappingURL=cdp-command.js.map