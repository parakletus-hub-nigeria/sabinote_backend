import { CorrelationIdMiddleware, CORRELATION_ID_HEADER } from './correlation-id.middleware';
import { Request, Response } from 'express';

describe('CorrelationIdMiddleware (ARCH-014 / v2.0.0)', () => {
  let middleware: CorrelationIdMiddleware;

  beforeEach(() => {
    middleware = new CorrelationIdMiddleware();
  });

  it('should generate a new correlation ID if none is supplied', () => {
    const req = { headers: {} } as Request;
    const res = {
      setHeader: jest.fn(),
    } as unknown as Response;
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(req.correlationId).toBeDefined();
    expect(typeof req.correlationId).toBe('string');
    expect(res.setHeader).toHaveBeenCalledWith(CORRELATION_ID_HEADER, req.correlationId);
    expect(next).toHaveBeenCalled();
  });

  it('should preserve and reuse incoming x-correlation-id header', () => {
    const incomingId = 'test-corr-id-12345';
    const req = {
      headers: {
        'x-correlation-id': incomingId,
      },
    } as unknown as Request;
    const res = {
      setHeader: jest.fn(),
    } as unknown as Response;
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(req.correlationId).toBe(incomingId);
    expect(res.setHeader).toHaveBeenCalledWith(CORRELATION_ID_HEADER, incomingId);
    expect(next).toHaveBeenCalled();
  });
});
