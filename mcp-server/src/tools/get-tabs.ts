import { z } from 'zod';
import type { SessionManager } from '../session-manager.js';

export const getTabsSchema = z.object({});

export async function getTabs(sessions: SessionManager) {
  const tabList = sessions.getSessions();

  if (tabList.length === 0) {
    return {
      content: [{
        type: 'text' as const,
        text: 'No attached tabs. Click the CDPilot extension icon on a tab to attach it.',
      }],
    };
  }

  const lines = tabList.map((s, i) =>
    `${i + 1}. [${s.sessionId}] ${s.title || '(no title)'}\n   URL: ${s.url || '(unknown)'}\n   Target: ${s.targetId}`
  );

  return {
    content: [{
      type: 'text' as const,
      text: `Attached tabs (${tabList.length}):\n\n${lines.join('\n\n')}`,
    }],
  };
}
