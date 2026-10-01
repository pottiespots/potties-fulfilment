import { describe, it, expect, vi } from 'vitest';
import crypto from 'node:crypto';

vi.mock('./db', () => ({ db: {}, schema: {} }));
vi.mock('./data', () => ({ logEvent: vi.fn() }));

describe('Shopify webhook signature', async () => {
  const { verifyWebhook } = await import('./shopify');
  const body = JSON.stringify({ id: 1, admin_graphql_api_id: 'gid://shopify/Order/1' });
  it('accepts a correctly signed body', () => {
    process.env.SHOPIFY_WEBHOOK_SECRET = 'test-secret';
    const sig = crypto.createHmac('sha256', 'test-secret').update(body, 'utf8').digest('base64');
    expect(verifyWebhook(body, sig)).toBe(true);
  });
  it('rejects a tampered body or missing header', () => {
    const sig = crypto.createHmac('sha256', 'test-secret').update(body, 'utf8').digest('base64');
    expect(verifyWebhook(body + ' ', sig)).toBe(false);
    expect(verifyWebhook(body, null)).toBe(false);
  });
});

describe('Shopify app login (client credentials)', () => {
  it('swaps the client ID/secret for a token once and reuses it', async () => {
    vi.resetModules();
    process.env.SHOPIFY_STORE_DOMAIN = 'potties.myshopify.com';
    process.env.SHOPIFY_CLIENT_ID = 'cid';
    process.env.SHOPIFY_CLIENT_SECRET = 'csecret';
    delete process.env.SHOPIFY_ADMIN_TOKEN;
    const calls: { url: string; body?: string; token?: string }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, body: String(init.body), token: (init.headers as Record<string, string>)['X-Shopify-Access-Token'] });
      if (url.endsWith('/admin/oauth/access_token')) return new Response(JSON.stringify({ access_token: 'shpat_temp', expires_in: 86399 }));
      return new Response(JSON.stringify({ data: { shop: { name: 'Potties' } } }));
    }));
    const { gql } = await import('./shopify');
    await gql('{ shop { name } }');
    await gql('{ shop { name } }');
    expect(calls.filter((c) => c.url.endsWith('/access_token'))).toHaveLength(1);
    expect(calls[0].body).toContain('grant_type=client_credentials');
    expect(calls[1].token).toBe('shpat_temp');
    vi.unstubAllGlobals();
  });
});

describe('Shopify error messages', async () => {
  const { explainShopifyError } = await import('./shopify');
  it('names the missing permission', () => {
    const msg = explainShopifyError(200, { errors: [{ message: 'Access denied for customer field. Required access: `read_customers` access scope.', extensions: { code: 'ACCESS_DENIED', requiredAccess: '`read_customers` access scope.' } }] });
    expect(msg).toContain('read_customers');
    expect(msg).not.toContain('{');
  });
  it('explains a bad login', () => {
    expect(explainShopifyError(401, {})).toContain('client ID');
  });
});
