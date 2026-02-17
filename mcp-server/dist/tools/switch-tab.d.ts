import { z } from 'zod';
import type { RelayClient } from '../relay-client.js';
import type { SessionManager } from '../session-manager.js';
export declare const switchTabSchema: z.ZodObject<{
    sessionId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    sessionId: string;
}, {
    sessionId: string;
}>;
export declare function switchTab(relay: RelayClient, sessions: SessionManager, args: z.infer<typeof switchTabSchema>): Promise<{
    content: {
        type: "text";
        text: string;
    }[];
}>;
