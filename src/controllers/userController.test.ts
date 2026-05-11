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

describe('UserController', () => {
  describe('GET /api/users/profile', () => {
    it('turėtų grąžinti 401, jei trūksta tokeno', async () => {
      const response = await request(app).get('/api/users/profile');
      expect(response.status).toBe(401);
    });

    it('turėtų grąžinti vartotojo profilį, jei tokenas teisingas', async () => {
      const mockUser = { id: 'user-123', email: 'test@example.com' };
      const mockProfile = {
        username: 'testuser',
        avatar_url: 'https://avatar.url',
        balance: 1000,
        total_points_collected: 2500,
      };

      (supabase.auth.getUser as jest.Mock).mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest
              .fn()
              .mockResolvedValue({ data: mockProfile, error: null }),
          }),
        }),
      });

      const response = await request(app)
        .get('/api/users/profile')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockProfile);
    });

    it('turėtų grąžinti 404, jei profilis nerastas', async () => {
      (supabase.auth.getUser as jest.Mock).mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { message: 'Not found' },
            }),
          }),
        }),
      });

      const response = await request(app)
        .get('/api/users/profile')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/users/activity', () => {
    it('turėtų grąžinti 401, jei trūksta tokeno', async () => {
      const response = await request(app).get('/api/users/activity');
      expect(response.status).toBe(401);
    });

    it('turėtų grąžinti veiklos sąrašą su teisingai dekoduotais tipais', async () => {
      const mockUser = { id: 'user-123', email: 'test@example.com' };
      const mockTransactions = [
        {
          id: 'tx-1',
          type: 'shop_purchase',
          amount: -50,
          reference_id: 'item-1',
          created_at: '2026-05-10T10:00:00Z',
        },
        {
          id: 'tx-2',
          type: 'quest_reward',
          amount: 100,
          reference_id: 'quest-1',
          created_at: '2026-05-10T09:00:00Z',
        },
        {
          id: 'tx-3',
          type: 'bet_win',
          amount: 75,
          reference_id: 'bet-1',
          created_at: '2026-05-10T08:00:00Z',
        },
      ];

      (supabase.auth.getUser as jest.Mock).mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            order: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue({
                data: mockTransactions,
                error: null,
              }),
            }),
          }),
        }),
      });

      const response = await request(app)
        .get('/api/users/activity')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body.activities).toHaveLength(3);

      expect(response.body.activities[0].label).toBe('Pirkimas');
      expect(response.body.activities[0].emoji).toBe('🛒');
      expect(response.body.activities[0].amountFormatted).toBe('-50');

      expect(response.body.activities[1].label).toBe('Užduoties atlygis');
      expect(response.body.activities[1].emoji).toBe('✅');
      expect(response.body.activities[1].amountFormatted).toBe('+100');

      expect(response.body.activities[2].label).toBe('Lažybų laimėjimas');
      expect(response.body.activities[2].amountFormatted).toBe('+75');
    });

    it('turėtų grąžinti tuščią masyvą kai nėra transactions', async () => {
      (supabase.auth.getUser as jest.Mock).mockResolvedValue({
        data: { user: { id: 'user-123' } },
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

      const response = await request(app)
        .get('/api/users/activity')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body.activities).toEqual([]);
    });

    it('turėtų dekoduoti nežinomą tipą kaip "Kitas veiksmas"', async () => {
      (supabase.auth.getUser as jest.Mock).mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            order: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue({
                data: [
                  {
                    id: 'tx-x',
                    type: 'unknown_type',
                    amount: 10,
                    reference_id: null,
                    created_at: '2026-05-10T10:00:00Z',
                  },
                ],
                error: null,
              }),
            }),
          }),
        }),
      });

      const response = await request(app)
        .get('/api/users/activity')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body.activities[0].label).toBe('Kitas veiksmas');
      expect(response.body.activities[0].emoji).toBe('📋');
    });

    it('turėtų grąžinti 500, jei supabase grąžina klaidą', async () => {
      (supabase.auth.getUser as jest.Mock).mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            order: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue({
                data: null,
                error: { message: 'DB error' },
              }),
            }),
          }),
        }),
      });

      const response = await request(app)
        .get('/api/users/activity')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(500);
    });
  });
});
