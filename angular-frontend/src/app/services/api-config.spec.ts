import { describe, expect, it } from 'vitest';
import { isSecureApiTransport } from './api-config';

describe('isSecureApiTransport', () => {
  it('accepts relative same-origin APIs only on HTTPS pages', () => {
    expect(isSecureApiTransport('https://portal.example.org/login', '/FreightCodeApi/api'))
      .toBe(true);
    expect(isSecureApiTransport('http://portal.example.org/login', '/FreightCodeApi/api'))
      .toBe(false);
  });

  it('rejects absolute HTTP API URLs from HTTPS pages', () => {
    expect(isSecureApiTransport('https://portal.example.org/login', 'http://api.example.org/api'))
      .toBe(false);
  });
});
