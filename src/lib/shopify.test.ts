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
