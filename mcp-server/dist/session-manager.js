export class SessionManager {
    relay;
    sessions = new Map();
    constructor(relay) {
        this.relay = relay;
        relay.on('cdpEvent', (event) => this.handleEvent(event));
    }
    handleEvent(event) {
        if (event.method === 'Target.attachedToTarget') {
            const params = event.params;
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
            const params = event.params;
            const sessionId = params.sessionId ?? event.sessionId;
            if (sessionId) {
                this.sessions.delete(sessionId);
            }
        }
        // Update URL/title on navigation
        if (event.method === 'Page.frameNavigated') {
            const session = this.sessions.get(event.sessionId);
            if (session) {
                const frame = event.params.frame;
                if (frame?.url) {
                    session.url = frame.url;
                }
            }
        }
    }
    getSessions() {
        return Array.from(this.sessions.values());
    }
    getSession(sessionId) {
        return this.sessions.get(sessionId);
    }
    /** Get the default session (first available) */
    getDefaultSession() {
        const sessions = this.getSessions();
        return sessions[0];
    }
    /** Resolve sessionId — use provided one or fall back to default */
    resolveSessionId(sessionId) {
        if (sessionId)
            return sessionId;
        const defaultSession = this.getDefaultSession();
        if (!defaultSession)
            throw new Error('No attached tabs. Please attach a tab in the CDPilot extension first.');
        return defaultSession.sessionId;
    }
}
//# sourceMappingURL=session-manager.js.map