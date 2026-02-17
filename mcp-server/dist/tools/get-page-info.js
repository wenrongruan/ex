import { z } from 'zod';
export const getPageInfoSchema = z.object({
    includeAccessibilityTree: z.boolean().optional().default(false).describe('Include the accessibility tree (can be large)'),
    sessionId: z.string().optional().describe('Target tab session ID (uses default if omitted)'),
});
export async function getPageInfo(relay, sessions, args) {
    const sessionId = sessions.resolveSessionId(args.sessionId);
    // Get basic page info
    const evalResult = await relay.sendCommand('Runtime.evaluate', {
        expression: `JSON.stringify({ url: location.href, title: document.title, readyState: document.readyState })`,
        returnByValue: true,
    }, sessionId);
    const pageInfo = evalResult?.result?.value ? JSON.parse(evalResult.result.value) : {};
    const parts = [
        `URL: ${pageInfo.url ?? 'unknown'}`,
        `Title: ${pageInfo.title ?? 'unknown'}`,
        `Ready State: ${pageInfo.readyState ?? 'unknown'}`,
    ];
    if (args.includeAccessibilityTree) {
        try {
            await relay.sendCommand('Accessibility.enable', {}, sessionId);
            const axTree = await relay.sendCommand('Accessibility.getFullAXTree', {}, sessionId);
            if (axTree?.nodes) {
                parts.push('');
                parts.push('--- Accessibility Tree ---');
                // Summarize the tree (limit to avoid overly large output)
                const nodes = axTree.nodes.slice(0, 200);
                for (const node of nodes) {
                    const role = node.role?.value ?? '';
                    const name = node.name?.value ?? '';
                    if (role && role !== 'none' && role !== 'generic') {
                        parts.push(`[${role}] ${name}`);
                    }
                }
                if (axTree.nodes.length > 200) {
                    parts.push(`... and ${axTree.nodes.length - 200} more nodes`);
                }
            }
        }
        catch {
            parts.push('');
            parts.push('Accessibility tree: failed to retrieve');
        }
    }
    return { content: [{ type: 'text', text: parts.join('\n') }] };
}
//# sourceMappingURL=get-page-info.js.map