import { z } from 'zod';
import type { RelayClient } from '../relay-client.js';
import type { SessionManager } from '../session-manager.js';
export declare const getPageInfoSchema: z.ZodObject<{
    includeAccessibilityTree: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    sessionId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    includeAccessibilityTree: boolean;
    sessionId?: string | undefined;
}, {
    sessionId?: string | undefined;
    includeAccessibilityTree?: boolean | undefined;
}>;
export declare function getPageInfo(relay: RelayClient, sessions: SessionManager, args: z.infer<typeof getPageInfoSchema>): Promise<{
    content: {
        type: "text";
        text: string;
    }[];
}>;
