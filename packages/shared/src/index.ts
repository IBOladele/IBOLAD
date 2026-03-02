import { z } from 'zod';

export const createUserSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  email: z.string().email(),
});

export const healthSchema = z.object({
  status: z.literal('ok'),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type HealthResponse = z.infer<typeof healthSchema>;
