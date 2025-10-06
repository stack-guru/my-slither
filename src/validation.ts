import { z } from "zod";

export const HelloSchema = z.object({
  type: z.literal("hello"),
  name: z.string().trim().min(1).max(24).optional(),
});

export const InputSchema = z.object({
  type: z.literal("input"),
  angle: z.number().finite().min(-Math.PI).max(Math.PI),
  boost: z.boolean().optional(),
});

export const ClientToServerSchema = z.union([HelloSchema, InputSchema]);

export type HelloMsg = z.infer<typeof HelloSchema>;
export type InputMsg = z.infer<typeof InputSchema>;
export type ClientToServerValidated = z.infer<typeof ClientToServerSchema>;


