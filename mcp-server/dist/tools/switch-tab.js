import { z } from 'zod';
export const switchTabSchema = z.object({
    sessionId: z.string().describe('Session ID of the tab to activate'),
});
export async function switchTab(relay, sessions, args) {
    const session = sessions.getSession(args.sessionId);
    if (!session) {
        return {
            content: [{ type: 'text', text: `Tab with session "${args.sessionId}" not found.` }],
        };
    }
    await relay.sendCommand('Target.activateTarget', {
        targetId: session.targetId,
    }, args.sessionId);
    return {
        content: [{
                type: 'text',
                text: `Switched to tab: ${session.title || session.url || args.sessionId}`,
            }],
    };
}
//# sourceMappingURL=switch-tab.js.map