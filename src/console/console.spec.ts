import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ConsoleController } from './console.controller';
import { ConsoleService, topupSource } from './console.service';
import { ConsoleTokenGuard } from './console-token.guard';

const TOKEN = 'k'.repeat(48);
const ctx = (headers: Record<string, unknown>) =>
  ({ switchToHttp: () => ({ getRequest: () => ({ headers }) }) }) as any;

describe('ConsoleTokenGuard', () => {
  const guard = new ConsoleTokenGuard();
  const original = process.env.ADMIN_CONSOLE_TOKEN;
  afterEach(() => (process.env.ADMIN_CONSOLE_TOKEN = original));

  it('fails closed without a configured token', () => {
    delete process.env.ADMIN_CONSOLE_TOKEN;
    expect(() => guard.canActivate(ctx({ 'x-console-token': TOKEN }))).toThrow(ServiceUnavailableException);
  });

  it('accepts only the exact token', () => {
    process.env.ADMIN_CONSOLE_TOKEN = TOKEN;
    expect(() => guard.canActivate(ctx({}))).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(ctx({ 'x-console-token': TOKEN + 'x' }))).toThrow(UnauthorizedException);
    expect(guard.canActivate(ctx({ 'x-console-token': TOKEN }))).toBe(true);
  });

  it('guards the whole console controller', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, ConsoleController)).toEqual([ConsoleTokenGuard]);
  });
});

describe('topupSource', () => {
  it('tells Paystack, free manual and admin credits apart', () => {
    expect(topupSource('T123abc')).toBe('paystack');
    expect(topupSource('manual_1730000000000_ab12cd34')).toBe('manual');
    expect(topupSource(null)).toBe('admin');
  });
});

describe('ConsoleService.summary', () => {
  it('splits last-30-day top-ups by source', async () => {
    const prisma = {
      user: { count: jest.fn().mockResolvedValue(5) },
      lessonNote: { count: jest.fn().mockResolvedValue(9) },
      transaction: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([
          { paystackReference: 'manual_1_a', amountAdded: '100.00' },
          { paystackReference: 'manual_2_b', amountAdded: '50.00' },
          { paystackReference: 'PSK_9', amountAdded: '200.00' },
          { paystackReference: null, amountAdded: '10.00' },
        ]),
      },
    } as any;
    const s = await new ConsoleService(prisma).summary();
    expect(s.topups30d).toEqual({
      paystack: { count: 1, parats: 200 },
      manual: { count: 2, parats: 150 },
      admin: { count: 1, parats: 10 },
    });
    expect(s.failedTransactions30d).toBe(1);
  });
});

describe('ConsoleController', () => {
  it('clamps paging before querying', async () => {
    const service = { users: jest.fn().mockResolvedValue({}), transactions: jest.fn().mockResolvedValue({}) } as any;
    const c = new ConsoleController(service);
    await c.users('-3', '500', '  ada ');
    expect(service.users).toHaveBeenCalledWith(1, 50, 'ada');
    await c.transactions('2', 'x');
    expect(service.transactions).toHaveBeenCalledWith(2, 25);
  });
});
