import { z } from 'zod';

export const waitSchema = z.object({
  ms: z.number().min(0).max(30000).describe('Milliseconds to wait (max 30000)'),
});

export async function wait(args: z.infer<typeof waitSchema>) {
  await new Promise((resolve) => setTimeout(resolve, args.ms));
  return { content: [{ type: 'text' as const, text: `Waited ${args.ms}ms.` }] };
}
