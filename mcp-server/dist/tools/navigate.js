import { z } from 'zod';
export const navigateSchema = z.object({
    url: z.string().describe('The URL to navigate to'),
    sessionId: z.string().optional().describe('Target tab session ID (uses default if omitted)'),
});
export async function navigate(relay, sessions, args) {
    const sessionId = sessions.resolveSessionId(args.sessionId);
    // Enable Page events to listen for load
    await relay.sendCommand('Page.enable', {}, sessionId);
    // Set up load event listener
    const loadPromise = new Promise((resolve) => {
        const timeout = setTimeout(() => {
            relay.removeListener('cdpEvent', handler);
            resolve(); // Resolve even on timeout
        }, 30000);
        const handler = (event) => {
            if (event.sessionId === sessionId && event.method === 'Page.loadEventFired') {
                clearTimeout(timeout);
                relay.removeListener('cdpEvent', handler);
                resolve();
            }
        };
        relay.on('cdpEvent', handler);
    });
    const result = await relay.sendCommand('Page.navigate', { url: args.url }, sessionId);
    if (result?.errorText) {
        return { content: [{ type: 'text', text: `Navigation error: ${result.errorText}` }] };
    }
    await loadPromise;
    return {
        content: [{
                type: 'text',
                text: `Navigated to ${args.url} successfully.`,
            }],
    };
}
//# sourceMappingURL=navigate.js.map