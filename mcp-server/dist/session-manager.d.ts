import type { RelayClient } from './relay-client.js';
export interface SessionInfo {
    sessionId: string;
    targetId: string;
    url: string;
    title: string;
    type: string;
}
export declare class SessionManager {
    private relay;
    private sessions;
    constructor(relay: RelayClient);
    private handleEvent;
    getSessions(): SessionInfo[];
    getSession(sessionId: string): SessionInfo | undefined;
    /** Get the default session (first available) */
    getDefaultSession(): SessionInfo | undefined;
    /** Resolve sessionId — use provided one or fall back to default */
    resolveSessionId(sessionId?: string): string;
}
