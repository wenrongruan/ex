import { z } from 'zod';
import type { RelayClient } from '../relay-client.js';
import type { SessionManager } from '../session-manager.js';
export declare const typeSchema: z.ZodObject<{
    text: z.ZodString;
    selector: z.ZodOptional<z.ZodString>;
    sessionId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    text: string;
    sessionId?: string | undefined;
    selector?: string | undefined;
}, {
    text: string;
    sessionId?: string | undefined;
    selector?: string | undefined;
}>;
export declare function type(relay: RelayClient, sessions: SessionManager, args: z.infer<typeof typeSchema>): Promise<{
    content: {
        type: "text";
        text: string;
    }[];
}>;
