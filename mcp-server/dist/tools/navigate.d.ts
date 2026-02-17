import { z } from 'zod';
import type { RelayClient } from '../relay-client.js';
import type { SessionManager } from '../session-manager.js';
export declare const navigateSchema: z.ZodObject<{
    url: z.ZodString;
    sessionId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    url: string;
    sessionId?: string | undefined;
}, {
    url: string;
    sessionId?: string | undefined;
}>;
export declare function navigate(relay: RelayClient, sessions: SessionManager, args: z.infer<typeof navigateSchema>): Promise<{
    content: {
        type: "text";
        text: string;
    }[];
}>;
