import { z } from 'zod';
export declare const waitSchema: z.ZodObject<{
    ms: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    ms: number;
}, {
    ms: number;
}>;
export declare function wait(args: z.infer<typeof waitSchema>): Promise<{
    content: {
        type: "text";
        text: string;
    }[];
}>;
