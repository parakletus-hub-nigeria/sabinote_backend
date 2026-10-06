import { validateEnv } from './env.validation';

describe('validateEnv (ARCH-003 & ARCH-004)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should pass with development defaults', () => {
    const config = validateEnv({
      NODE_ENV: 'development',
    });
    expect(config.NODE_ENV).toBe('development');
    expect(config.PORT).toBe(8080);
    expect(config.CORS_ORIGIN).toBe('http://localhost:3000');
    expect(config.ALLOW_MANUAL_TOPUP).toBe(false);
  });

  it('should parse ALLOW_MANUAL_TOPUP correctly', () => {
    const config = validateEnv({
      NODE_ENV: 'development',
      ALLOW_MANUAL_TOPUP: 'true',
    });
    expect(config.ALLOW_MANUAL_TOPUP).toBe(true);
  });

  it('should fail closed in production if secrets are missing', () => {
    expect(() => {
      validateEnv({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://prod:secret@localhost:5432/sabinote',
        JWT_SECRET: 'super_secure_prod_secret_min_16_characters',
        JWT_REFRESH_SECRET: 'super_secure_refresh_secret_min_16_chars',
        CORS_ORIGIN: 'https://sabinote.com',
        // Missing OPENROUTER_API_KEY, Cloudinary, Paystack
      });
    }).toThrow('FATAL: Environment Configuration Validation Failed');
  });

  it('should reject wildcard CORS in production (ARCH-004)', () => {
    expect(() => {
      validateEnv({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://prod:secret@localhost:5432/sabinote',
        JWT_SECRET: 'super_secure_prod_secret_min_16_characters',
        JWT_REFRESH_SECRET: 'super_secure_refresh_secret_min_16_chars',
        CORS_ORIGIN: '*',
        OPENROUTER_API_KEY: 'sk-or-v1-test',
        CLOUDINARY_CLOUD_NAME: 'cloud',
        CLOUDINARY_API_KEY: 'key',
        CLOUDINARY_API_SECRET: 'secret',
        PAYSTACK_SECRET_KEY: 'sk_test_123',
        PAYSTACK_WEBHOOK_SECRET: 'wh_test_123',
      });
    }).toThrow('Wildcard CORS is strictly prohibited in production');
  });

  it('should reject manual top-up in production (ARCH-011)', () => {
    expect(() => {
      validateEnv({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://prod:secret@localhost:5432/sabinote',
        JWT_SECRET: 'super_secure_prod_secret_min_16_characters',
        JWT_REFRESH_SECRET: 'super_secure_refresh_secret_min_16_chars',
        CORS_ORIGIN: 'https://sabinote.com',
        OPENROUTER_API_KEY: 'sk-or-v1-test',
        CLOUDINARY_CLOUD_NAME: 'cloud',
        CLOUDINARY_API_KEY: 'key',
        CLOUDINARY_API_SECRET: 'secret',
        PAYSTACK_SECRET_KEY: 'sk_test_123',
        PAYSTACK_WEBHOOK_SECRET: 'wh_test_123',
        ALLOW_MANUAL_TOPUP: 'true',
      });
    }).toThrow('Manual top-up is strictly forbidden in production');
  });
});
