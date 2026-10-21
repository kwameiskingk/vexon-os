import { z } from "zod";

// Email validation schema
export const emailSchema = z
  .string()
  .trim()
  .min(1, "Email is required")
  .email("Please enter a valid email address")
  .max(255, "Email must be less than 255 characters");

// Password validation schema
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password must be less than 72 characters")
  .regex(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
    "Password must contain at least one uppercase letter, one lowercase letter, and one number"
  );

// Simple password for login (less strict - just validate length)
export const loginPasswordSchema = z
  .string()
  .min(1, "Password is required")
  .max(72, "Password must be less than 72 characters");

// Display name validation schema
export const displayNameSchema = z
  .string()
  .trim()
  .max(100, "Name must be less than 100 characters")
  .optional()
  .or(z.literal(""));

// Full name validation schema (required)
export const fullNameSchema = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(100, "Name must be less than 100 characters");

// Login form schema
export const loginFormSchema = z.object({
  email: emailSchema,
  password: loginPasswordSchema,
});

// Signup form schema
export const signupFormSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  fullName: fullNameSchema,
});

// Create user form schema
export const createUserFormSchema = z.object({
  email: emailSchema,
  displayName: displayNameSchema,
  // Must cover every role the CreateUserModal dropdown offers — a role
  // missing here fails validation invisibly (the 2026-08-24 TA-creation
  // bug: talent_acquisition was in the dropdown but not in this enum).
  role: z.enum([
    "dev",
    "admin",
    "ops",
    "finance",
    "csm",
    "account_executive",
    "setter",
    "client",
    "hr",
    "accounting",
    "sdr_manager",
    "partner",
    "talent_acquisition"
  ]),
  department: z.enum(["fulfilment", "acquisition"]).optional(),
});

// Password reset form schema
export const passwordResetSchema = z
  .object({
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type LoginFormData = z.infer<typeof loginFormSchema>;
export type SignupFormData = z.infer<typeof signupFormSchema>;
export type CreateUserFormData = z.infer<typeof createUserFormSchema>;
export type PasswordResetFormData = z.infer<typeof passwordResetSchema>;
