import { z } from 'zod';
import type { RelayClient } from '../relay-client.js';
import type { SessionManager } from '../session-manager.js';
export declare const evaluateSchema: z.ZodObject<{
    expression: z.ZodString;
    awaitPromise: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    sessionId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    expression: string;
    awaitPromise: boolean;
    sessionId?: string | undefined;
}, {
    expression: string;
    sessionId?: string | undefined;
    awaitPromise?: boolean | undefined;
}>;
export declare function evaluate(relay: RelayClient, sessions: SessionManager, args: z.infer<typeof evaluateSchema>): Promise<{
    content: {
        type: "text";
        text: string;
    }[];
}>;
