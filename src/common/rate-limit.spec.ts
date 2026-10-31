import { RateLimiter, clientIp } from './rate-limit';

describe('RateLimiter', () => {
  it('allows a burst up to the capacity, then refuses', () => {
    const limiter = new RateLimiter(3, 1);
    const now = 1_000_000;
    expect([1, 2, 3, 4].map(() => limiter.take('a', now))).toEqual([
      true,
      true,
      true,
      false,
    ]);
  });

  it('refills over time', () => {
    const limiter = new RateLimiter(2, 1);
    const now = 1_000_000;
    limiter.take('a', now);
    limiter.take('a', now);
    expect(limiter.take('a', now + 500)).toBe(false);
    expect(limiter.take('a', now + 1500)).toBe(true);
  });

  it('keeps keys apart', () => {
    const limiter = new RateLimiter(1, 0.01);
    expect(limiter.take('a', 0)).toBe(true);
    expect(limiter.take('a', 0)).toBe(false);
    expect(limiter.take('b', 0)).toBe(true);
  });
});

describe('clientIp', () => {
  it('takes the address appended by the proxy, not a forged one', () => {
    expect(
      clientIp({ 'x-forwarded-for': '6.6.6.6, 1.2.3.4' }, '10.0.0.1'),
    ).toBe('1.2.3.4');
  });

  it('falls back to the socket address', () => {
    expect(clientIp({}, '10.0.0.1')).toBe('10.0.0.1');
  });
});
