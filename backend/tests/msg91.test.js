import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// The provider reads its settings from env at import time
process.env.MSG91_AUTH_KEY = 'test-auth-key';
process.env.MSG91_OTP_TEMPLATE_ID = 'tmpl-123';

let msg91Provider;
beforeAll(async () => {
  ({ msg91Provider } = await import('../src/services/sms/msg91.provider.js'));
});

afterEach(() => vi.unstubAllGlobals());

const reply = (status, body) =>
  vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => body });

describe('MSG91 SMS provider', () => {
  it('sends our own code through SendOTP', async () => {
    const fetch = reply(200, { type: 'success', request_id: 'abc' });
    vi.stubGlobal('fetch', fetch);

    await msg91Provider.sendOtp('+919876543210', '482913', { expiresInSeconds: 300 });

    const [url, init] = fetch.mock.calls[0];
    expect(url.origin + url.pathname).toBe('https://control.msg91.com/api/v5/otp');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      template_id: 'tmpl-123',
      mobile: '919876543210',
      otp: '482913',
      otp_length: '6',
      otp_expiry: '5',
    });
    expect(init.method).toBe('POST');
    expect(init.headers.authkey).toBe('test-auth-key');
    expect(JSON.parse(init.body)).toEqual({ minutes: '5' });
  });

  it('treats { type: "error" } with HTTP 200 as a failure', async () => {
    vi.stubGlobal('fetch', reply(200, { type: 'error', message: 'The provided flow ID or template ID is invalid.' }));
    await expect(msg91Provider.sendOtp('+919876543210', '482913', { expiresInSeconds: 300 })).rejects.toMatchObject({
      statusCode: 503,
    });
  });

  it('fails cleanly on HTTP errors and network errors', async () => {
    vi.stubGlobal('fetch', reply(401, { type: 'error', message: 'Auth Key missing' }));
    await expect(msg91Provider.sendOtp('+919876543210', '1', { expiresInSeconds: 60 })).rejects.toMatchObject({ statusCode: 503 });

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')));
    await expect(msg91Provider.sendOtp('+919876543210', '1', { expiresInSeconds: 60 })).rejects.toMatchObject({ statusCode: 503 });
  });
});
