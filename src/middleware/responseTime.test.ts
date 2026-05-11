import request from 'supertest';
import app from '../app';
import { supabase } from '../lib/supabase';

jest.mock('../lib/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock('../lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
    auth: {
      getUser: jest.fn(),
    },
  },
}));

describe('Response Time Middleware (NFR-1: <500ms)', () => {
  it('turėtų pridėti X-Response-Time header prie /health', async () => {
    (supabase.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue({ data: [{ id: '1' }], error: null }),
      }),
    });

    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.headers['x-response-time']).toBeDefined();
    expect(response.headers['x-response-time']).toMatch(/^\d+(\.\d+)?ms$/);
  });

  it('turėtų grąžinti /health atsakymą greičiau nei 200ms', async () => {
    (supabase.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue({ data: [{ id: '1' }], error: null }),
      }),
    });

    const start = Date.now();
    await request(app).get('/health');
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(200);
  });

  it('turėtų grąžinti 401 per <500ms kai nėra auth header', async () => {
    const start = Date.now();
    const response = await request(app).get('/api/users/activity');
    const duration = Date.now() - start;

    expect(response.status).toBe(401);
    expect(duration).toBeLessThan(500);
  });

  it('turėtų grąžinti /api/users/activity per <500ms su valid token', async () => {
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@test.com' } },
      error: null,
    });

    (supabase.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          order: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue({
              data: [],
              error: null,
            }),
          }),
        }),
      }),
    });

    const start = Date.now();
    const response = await request(app)
      .get('/api/users/activity')
      .set('Authorization', 'Bearer valid-token');
    const duration = Date.now() - start;

    expect(response.status).toBe(200);
    expect(duration).toBeLessThan(500);
  });
});
