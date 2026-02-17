import { z } from 'zod';
export const getTabsSchema = z.object({});
export async function getTabs(sessions) {
    const tabList = sessions.getSessions();
    if (tabList.length === 0) {
        return {
            content: [{
                    type: 'text',
                    text: 'No attached tabs. Click the CDPilot extension icon on a tab to attach it.',
                }],
        };
    }
    const lines = tabList.map((s, i) => `${i + 1}. [${s.sessionId}] ${s.title || '(no title)'}\n   URL: ${s.url || '(unknown)'}\n   Target: ${s.targetId}`);
    return {
        content: [{
                type: 'text',
                text: `Attached tabs (${tabList.length}):\n\n${lines.join('\n\n')}`,
            }],
    };
}
//# sourceMappingURL=get-tabs.js.map