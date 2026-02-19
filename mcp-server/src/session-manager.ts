import type { RelayClient, CDPEvent } from './relay-client.js';

export interface SessionInfo {
  sessionId: string;
  targetId: string;
  url: string;
  title: string;
  type: string;
}

export class SessionManager {
  private sessions = new Map<string, SessionInfo>();

  constructor(private relay: RelayClient) {
    relay.on('cdpEvent', (event: CDPEvent) => this.handleEvent(event));
  }

  private handleEvent(event: CDPEvent): void {
    if (event.method === 'Target.attachedToTarget') {
      const params = event.params as {
        sessionId?: string;
        targetInfo?: { targetId?: string; url?: string; title?: string; type?: string };
      };
      const sessionId = params.sessionId ?? event.sessionId;
      const targetInfo = params.targetInfo;
      if (sessionId && targetInfo) {
        this.sessions.set(sessionId, {
          sessionId,
          targetId: targetInfo.targetId ?? '',
          url: targetInfo.url ?? '',
          title: targetInfo.title ?? '',
          type: targetInfo.type ?? 'page',
        });
      }
    }

    if (event.method === 'Target.detachedFromTarget') {
      const params = event.params as { sessionId?: string };
      const sessionId = params.sessionId ?? event.sessionId;
      if (sessionId) {
        this.sessions.delete(sessionId);
      }
    }

    // Update URL on navigation
    if (event.method === 'Page.frameNavigated') {
      const session = this.sessions.get(event.sessionId);
      if (session) {
        const frame = (event.params as { frame?: { url?: string } }).frame;
        if (frame?.url) session.url = frame.url;
      }
    }

    // Update title when page title changes
    if (event.method === 'Page.titleUpdated') {
      const session = this.sessions.get(event.sessionId);
      if (session) {
        const title = (event.params as { title?: string }).title;
        if (title !== undefined) session.title = title;
      }
    }

    // Update URL/title via target info changes (covers navigations not caught above)
    if (event.method === 'Target.targetInfoChanged') {
      const info = (event.params as { targetInfo?: { targetId?: string; url?: string; title?: string } }).targetInfo;
      if (info?.targetId) {
        for (const session of this.sessions.values()) {
          if (session.targetId === info.targetId) {
            if (info.url) session.url = info.url;
            if (info.title !== undefined) session.title = info.title;
            break;
          }
        }
      }
    }
  }

  getSessions(): SessionInfo[] {
    return Array.from(this.sessions.values());
  }

  getSession(sessionId: string): SessionInfo | undefined {
    return this.sessions.get(sessionId);
  }

  /** Get the default session (first available) */
  getDefaultSession(): SessionInfo | undefined {
    const sessions = this.getSessions();
    return sessions[0];
  }

  /** Resolve sessionId — use provided one or fall back to default */
  resolveSessionId(sessionId?: string): string {
    if (sessionId) return sessionId;
    const defaultSession = this.getDefaultSession();
    if (!defaultSession) throw new Error('No attached tabs. Please attach a tab in the CDPilot extension first.');
    return defaultSession.sessionId;
  }
}
