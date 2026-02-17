import { z } from 'zod';
import type { RelayClient } from '../relay-client.js';
import type { SessionManager } from '../session-manager.js';
export declare const clickSchema: z.ZodObject<{
    selector: z.ZodString;
    sessionId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    selector: string;
    sessionId?: string | undefined;
}, {
    selector: string;
    sessionId?: string | undefined;
}>;
export declare function click(relay: RelayClient, sessions: SessionManager, args: z.infer<typeof clickSchema>): Promise<{
    content: {
        type: "text";
        text: any;
    }[];
}>;
