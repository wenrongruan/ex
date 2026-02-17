import { z } from 'zod';
import type { SessionManager } from '../session-manager.js';
export declare const getTabsSchema: z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>;
export declare function getTabs(sessions: SessionManager): Promise<{
    content: {
        type: "text";
        text: string;
    }[];
}>;
