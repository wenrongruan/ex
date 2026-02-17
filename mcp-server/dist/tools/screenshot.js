import { z } from 'zod';
export const screenshotSchema = z.object({
    format: z.enum(['png', 'jpeg', 'webp']).optional().default('png').describe('Image format'),
    quality: z.number().min(0).max(100).optional().describe('Image quality (jpeg/webp only)'),
    fullPage: z.boolean().optional().default(false).describe('Capture full scrollable page'),
    sessionId: z.string().optional().describe('Target tab session ID (uses default if omitted)'),
});
export async function screenshot(relay, sessions, args) {
    const sessionId = sessions.resolveSessionId(args.sessionId);
    const captureParams = {
        format: args.format,
    };
    if (args.quality !== undefined && args.format !== 'png') {
        captureParams.quality = args.quality;
    }
    if (args.fullPage) {
        // Get full page dimensions
        const metrics = await relay.sendCommand('Page.getLayoutMetrics', {}, sessionId);
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
    const result = await relay.sendCommand('Page.captureScreenshot', captureParams, sessionId);
    if (!result?.data) {
        return { content: [{ type: 'text', text: 'Screenshot capture failed - no data returned.' }] };
    }
    const mimeType = args.format === 'jpeg' ? 'image/jpeg' : args.format === 'webp' ? 'image/webp' : 'image/png';
    return {
        content: [{
                type: 'image',
                data: result.data,
                mimeType,
            }],
    };
}
//# sourceMappingURL=screenshot.js.map