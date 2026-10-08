import { z } from 'zod';

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Email is required.')
  .max(254, 'Email is too long.')
  .email('Email must be valid.');

const passwordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters.')
  .max(128, 'Password must be at most 128 characters.')
  .refine((s) => /[a-z]/.test(s) && /[A-Z]/.test(s) && /\d/.test(s), {
    message: 'Password must include lowercase, uppercase, and a digit.',
  });

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  // Login accepts any non-empty password — policy is enforced at register.
  password: z.string().min(1, 'Password is required.').max(128),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
