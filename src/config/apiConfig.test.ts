import { describe, it, expect, vi, afterEach } from 'vitest';

// apiConfig computes API_BASE_URL once at import time, so each case sets its environment and re-imports the module.
const load = async (opts: { hostname: string; env?: string }) => {
  vi.resetModules();
  vi.unstubAllEnvs();
  if (opts.env !== undefined) vi.stubEnv('VITE_API_BASE_URL', opts.env);
  Object.defineProperty(window, 'location', { value: { hostname: opts.hostname }, writable: true, configurable: true });
  return (await import('./apiConfig')).API_BASE_URL;
};

afterEach(() => { vi.unstubAllEnvs(); });

describe('API_BASE_URL', () => {
  it('unchanged default: localhost talks to the local backend', async () => {
    expect(await load({ hostname: 'localhost' })).toBe('http://localhost:8000');
    expect(await load({ hostname: '127.0.0.1' })).toBe('http://localhost:8000');
  });

  it('unchanged default: any deployed host talks to production', async () => {
    expect(await load({ hostname: 'transporter-signup.netlify.app' })).toBe('https://api.freightcompare.ai');
  });

  it('VITE_API_BASE_URL points a deployed portal (e.g. staging) at another backend', async () => {
    expect(await load({ hostname: 'deploy-preview-3--x.netlify.app', env: 'https://freight-compare-backend-staging.up.railway.app' }))
      .toBe('https://freight-compare-backend-staging.up.railway.app');
  });

  it('tolerates a trailing slash and surrounding spaces', async () => {
    expect(await load({ hostname: 'x.netlify.app', env: '  https://staging.example.com/  ' })).toBe('https://staging.example.com');
  });

  it('an empty value is ignored (same as unset)', async () => {
    expect(await load({ hostname: 'x.netlify.app', env: '' })).toBe('https://api.freightcompare.ai');
    expect(await load({ hostname: 'localhost', env: '   ' })).toBe('http://localhost:8000');
  });
});
