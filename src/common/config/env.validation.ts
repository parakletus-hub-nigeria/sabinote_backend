import { z } from 'zod';

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().default(8080),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    CORS_ORIGIN: z.string().optional().default('http://localhost:3000'),

    JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
    JWT_EXPIRES_IN: z.string().default('15m'),
    JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 characters'),
    JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

    OPENROUTER_API_KEY: z.string().min(1, 'OPENROUTER_API_KEY is required'),
    OPENROUTER_MODEL: z
      .string()
      .default('google/gemini-2.5-flash')
      .transform((m) => {
        if (m === 'google/gemini-flash-1.5' || m === 'google/gemini-1.5-flash') {
          return 'google/gemini-2.5-flash';
        }
        return m;
      }),
    PLAN_COST_PARATS: z.coerce.number().default(8),
    NOTE_COST_PARATS: z.coerce.number().default(12),
    REGENERATE_COST_PARATS: z.coerce.number().default(5),
    PLAN_MAX_TOKENS: z.coerce.number().default(3000),
    NOTE_MAX_TOKENS: z.coerce.number().default(5000),

    CLOUDINARY_CLOUD_NAME: z.string().min(1, 'CLOUDINARY_CLOUD_NAME is required'),
    CLOUDINARY_API_KEY: z.string().min(1, 'CLOUDINARY_API_KEY is required'),
    CLOUDINARY_API_SECRET: z.string().min(1, 'CLOUDINARY_API_SECRET is required'),

    PAYSTACK_SECRET_KEY: z.string().min(1, 'PAYSTACK_SECRET_KEY is required'),
    PAYSTACK_WEBHOOK_SECRET: z.string().min(1, 'PAYSTACK_WEBHOOK_SECRET is required'),

    ALLOW_MANUAL_TOPUP: z
      .union([z.boolean(), z.string()])
      .transform((val) => val === true || val === 'true')
      .default(false),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === 'production') {
      // Production fail-closed rules (ARCH-003 & ARCH-004)
      if (!data.CORS_ORIGIN || data.CORS_ORIGIN.trim() === '*' || data.CORS_ORIGIN.includes('*')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['CORS_ORIGIN'],
          message: 'Wildcard CORS is strictly prohibited in production when credentials are true (ARCH-004)',
        });
      }

      if (data.OPENROUTER_API_KEY.startsWith('dev_')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['OPENROUTER_API_KEY'],
          message: 'Real OPENROUTER_API_KEY is required in production',
        });
      }

      if (
        data.CLOUDINARY_CLOUD_NAME.startsWith('dev_') ||
        data.CLOUDINARY_API_KEY.startsWith('dev_') ||
        data.CLOUDINARY_API_SECRET.startsWith('dev_')
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['CLOUDINARY_CLOUD_NAME'],
          message: 'Real Cloudinary credentials are required in production',
        });
      }

      if (
        data.PAYSTACK_SECRET_KEY.startsWith('dev_') ||
        data.PAYSTACK_WEBHOOK_SECRET.startsWith('dev_')
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['PAYSTACK_SECRET_KEY'],
          message: 'Real Paystack credentials are required in production',
        });
      }

      if (data.ALLOW_MANUAL_TOPUP) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ALLOW_MANUAL_TOPUP'],
          message: 'Manual top-up is strictly forbidden in production (ARCH-011)',
        });
      }
    }
  });

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const env = (config.NODE_ENV ?? process.env.NODE_ENV ?? 'development') as string;
  const isDevOrTest = env === 'development' || env === 'test';

  const effectiveConfig = {
    ...config,
    NODE_ENV: env,
    DATABASE_URL:
      config.DATABASE_URL ||
      process.env.DATABASE_URL ||
      (isDevOrTest ? 'postgresql://postgres:postgres@localhost:5432/sabinote' : undefined),
    JWT_SECRET:
      config.JWT_SECRET ||
      process.env.JWT_SECRET ||
      (isDevOrTest ? 'dev_jwt_secret_key_minimum_16_chars_long' : undefined),
    JWT_REFRESH_SECRET:
      config.JWT_REFRESH_SECRET ||
      process.env.JWT_REFRESH_SECRET ||
      (isDevOrTest ? 'dev_jwt_refresh_secret_minimum_16_chars_long' : undefined),
    OPENROUTER_API_KEY:
      config.OPENROUTER_API_KEY ||
      process.env.OPENROUTER_API_KEY ||
      (isDevOrTest ? 'dev_openrouter_key' : undefined),
    CLOUDINARY_CLOUD_NAME:
      config.CLOUDINARY_CLOUD_NAME ||
      process.env.CLOUDINARY_CLOUD_NAME ||
      (isDevOrTest ? 'dev_cloud_name' : undefined),
    CLOUDINARY_API_KEY:
      config.CLOUDINARY_API_KEY ||
      process.env.CLOUDINARY_API_KEY ||
      (isDevOrTest ? 'dev_cloud_key' : undefined),
    CLOUDINARY_API_SECRET:
      config.CLOUDINARY_API_SECRET ||
      process.env.CLOUDINARY_API_SECRET ||
      (isDevOrTest ? 'dev_cloud_secret' : undefined),
    PAYSTACK_SECRET_KEY:
      config.PAYSTACK_SECRET_KEY ||
      process.env.PAYSTACK_SECRET_KEY ||
      (isDevOrTest ? 'dev_paystack_secret_key' : undefined),
    PAYSTACK_WEBHOOK_SECRET:
      config.PAYSTACK_WEBHOOK_SECRET ||
      process.env.PAYSTACK_WEBHOOK_SECRET ||
      (isDevOrTest ? 'dev_paystack_webhook_secret' : undefined),
  };

  const result = envSchema.safeParse(effectiveConfig);

  if (!result.success) {
    const formattedErrors = result.error.issues
      .map((issue) => `  - [${issue.path.join('.') || 'root'}]: ${issue.message}`)
      .join('\n');
    throw new Error(
      `\n=======================================================\n` +
      `❌ FATAL: Environment Configuration Validation Failed (ARCH-003)\n` +
      `=======================================================\n` +
      formattedErrors +
      `\n=======================================================\n`,
    );
  }

  return result.data;
}
