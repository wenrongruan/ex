import { z } from 'zod';
import type { RelayClient } from '../relay-client.js';
import type { SessionManager } from '../session-manager.js';
export declare const screenshotSchema: z.ZodObject<{
    format: z.ZodDefault<z.ZodOptional<z.ZodEnum<["png", "jpeg", "webp"]>>>;
    quality: z.ZodOptional<z.ZodNumber>;
    fullPage: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    sessionId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    format: "png" | "jpeg" | "webp";
    fullPage: boolean;
    sessionId?: string | undefined;
    quality?: number | undefined;
}, {
    sessionId?: string | undefined;
    format?: "png" | "jpeg" | "webp" | undefined;
    quality?: number | undefined;
    fullPage?: boolean | undefined;
}>;
export declare function screenshot(relay: RelayClient, sessions: SessionManager, args: z.infer<typeof screenshotSchema>): Promise<{
    content: {
        type: "text";
        text: string;
    }[];
} | {
    content: {
        type: "image";
        data: string;
        mimeType: string;
    }[];
}>;
