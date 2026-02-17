import { z } from 'zod';
import type { RelayClient } from '../relay-client.js';
import type { SessionManager } from '../session-manager.js';
export declare const cdpCommandSchema: z.ZodObject<{
    method: z.ZodString;
    params: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    sessionId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    method: string;
    params?: Record<string, unknown> | undefined;
    sessionId?: string | undefined;
}, {
    method: string;
    params?: Record<string, unknown> | undefined;
    sessionId?: string | undefined;
}>;
export declare function cdpCommand(relay: RelayClient, sessions: SessionManager, args: z.infer<typeof cdpCommandSchema>): Promise<{
    content: {
        type: "text";
        text: string;
    }[];
}>;
