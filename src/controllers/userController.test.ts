// UserController testai — tikrina profilio ir veiklos žurnalo (UR-1) API endpointus.
// Naudojama supertest biblioteka HTTP užklausoms siųsti į Express aplikaciją atmintyje.

import request from 'supertest';
import app from '../app';
import { supabase } from '../lib/supabase';

// Mock'iname logger modulį, kad testų metu nebūtų rašoma į konsolę/failą
jest.mock('../lib/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

// Mock'iname Supabase klientą — testai neturi kreiptis į tikrą duomenų bazę.
// Kiekvienas from(), auth.getUser() bus pakeistas netikra (mock) funkcija
jest.mock('../lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
    auth: {
      getUser: jest.fn(),
    },
  },
}));

describe('UserController', () => {
  // === PROFILIO TESTAI ===
  describe('GET /api/users/profile', () => {
    // Testas: neautorizuota užklausa (be JWT tokeno) turi grąžinti 401
    it('turėtų grąžinti 401, jei trūksta tokeno', async () => {
      const response = await request(app).get('/api/users/profile');
      expect(response.status).toBe(401);
    });

    // Testas: su galiojančiu tokenu turi grąžinti profilio duomenis
    it('turėtų grąžinti vartotojo profilį, jei tokenas teisingas', async () => {
      // Paruošiame mock duomenis — vartotojas ir jo profilis
      const mockUser = { id: 'user-123', email: 'test@example.com' };
      const mockProfile = {
        username: 'testuser',
        avatar_url: 'https://avatar.url',
        balance: 1000,
        total_points_collected: 2500,
      };

      // Mock'iname auth: supabase.auth.getUser() grąžins sėkmingą vartotoją
      (supabase.auth.getUser as jest.Mock).mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      // Mock'iname DB: supabase.from('profiles').select().eq().single() grąžins profilį
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
      // Tikriname, ar grąžinti duomenys atitinka mock profilį
      expect(response.body).toEqual(mockProfile);
    });

    // Testas: kai profilis nerastas DB — turi grąžinti 404
    it('turėtų grąžinti 404, jei profilis nerastas', async () => {
      (supabase.auth.getUser as jest.Mock).mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      // Mock'iname DB klaidą: single() grąžina error objektą
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

  // --- JV Pradžia ---
  // === UR-1: VEIKLOS ŽURNALO API TESTAI ===
  // Šie testai tikrina getActivity() kontrolerio funkciją per visą HTTP srautą:
  // auth middleware → userRoutes → userController.getActivity → Supabase DB
  describe('GET /api/users/activity', () => {

    // TESTAS 1: Neautorizuota užklausa — be JWT tokeno turi grąžinti 401
    // Tai tikrina, kad requireAuth middleware blokuoja neautorizuotus vartotojus
    it('turėtų grąžinti 401, jei trūksta tokeno', async () => {
      // Siunčiame užklausą BE Authorization antraštės
      const response = await request(app).get('/api/users/activity');
      // requireAuth middleware turi grąžinti 401 Unauthorized
      expect(response.status).toBe(401);
    });

    // TESTAS 2: Sėkmingas scenarijus — tikrina visą duomenų transformacijos grandinę
    // DB raw duomenys → decodeType() → ActivityItem formatas su emoji ir etiketėmis
    it('turėtų grąžinti veiklos sąrašą su teisingai dekoduotais tipais', async () => {
      const mockUser = { id: 'user-123', email: 'test@example.com' };
      // Mock transakcijos — imituojame 3 skirtingus transakcijų tipus iš DB
      const mockTransactions = [
        {
          id: 'tx-1',
          type: 'shop_purchase',     // Pirkimas parduotuvėje
          amount: -50,               // Neigiama suma (taškai nuskaičiuoti)
          reference_id: 'item-1',    // Nupirktos prekės ID
          created_at: '2026-05-10T10:00:00Z',
        },
        {
          id: 'tx-2',
          type: 'quest_reward',      // Užduoties atlygis
          amount: 100,               // Teigiama suma (taškai gauti)
          reference_id: 'quest-1',
          created_at: '2026-05-10T09:00:00Z',
        },
        {
          id: 'tx-3',
          type: 'bet_win',           // Lažybų laimėjimas
          amount: 75,                // Teigiama suma
          reference_id: 'bet-1',
          created_at: '2026-05-10T08:00:00Z',
        },
      ];

      // Mock'iname autentifikaciją
      (supabase.auth.getUser as jest.Mock).mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      // Mock'iname Supabase grandinę: from → select → eq → order → limit
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
      // Turi grąžinti lygiai 3 veiklos elementus
      expect(response.body.activities).toHaveLength(3);

      // Tikriname pirmą elementą: shop_purchase → "Pirkimas" su 🛒
      expect(response.body.activities[0].label).toBe('Pirkimas');
      expect(response.body.activities[0].emoji).toBe('🛒');
      // Neigiama suma formatuojama be + ženklo: "-50"
      expect(response.body.activities[0].amountFormatted).toBe('-50');

      // Tikriname antrą elementą: quest_reward → "Užduoties atlygis" su ✅
      expect(response.body.activities[1].label).toBe('Užduoties atlygis');
      expect(response.body.activities[1].emoji).toBe('✅');
      // Teigiama suma formatuojama su + ženklu: "+100"
      expect(response.body.activities[1].amountFormatted).toBe('+100');

      // Tikriname trečią elementą: bet_win → "Lažybų laimėjimas"
      expect(response.body.activities[2].label).toBe('Lažybų laimėjimas');
      expect(response.body.activities[2].amountFormatted).toBe('+75');
    });

    // TESTAS 3: Tuščias sąrašas — kai vartotojas neturi jokių transakcijų
    it('turėtų grąžinti tuščią masyvą kai nėra transactions', async () => {
      (supabase.auth.getUser as jest.Mock).mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      // DB grąžina tuščią masyvą — vartotojas dar nieko nedarė
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
      // Turi grąžinti tuščią masyvą, ne null ar klaidą
      expect(response.body.activities).toEqual([]);
    });

    // TESTAS 4: Nežinomas transakcijos tipas — turi naudoti fallback reikšmę
    // Tai tikrina decodeType() funkciją su neegzistuojančiu tipu
    it('turėtų dekoduoti nežinomą tipą kaip "Kitas veiksmas"', async () => {
      (supabase.auth.getUser as jest.Mock).mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      // DB grąžina transakciją su nežinomu tipu "unknown_type"
      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            order: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue({
                data: [
                  {
                    id: 'tx-x',
                    type: 'unknown_type',  // Šio tipo nėra TYPE_LABELS žodyne
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
      // decodeType() fallback: nežinomas tipas → "Kitas veiksmas" su 📋
      expect(response.body.activities[0].label).toBe('Kitas veiksmas');
      expect(response.body.activities[0].emoji).toBe('📋');
    });

    // TESTAS 5: Duomenų bazės klaida — turi grąžinti 500
    // Imituojame situaciją, kai Supabase negali pasiekti DB (pvz. tinklo klaida)
    it('turėtų grąžinti 500, jei supabase grąžina klaidą', async () => {
      (supabase.auth.getUser as jest.Mock).mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      // Mock'iname DB klaidą: error objektas su pranešimu
      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            order: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue({
                data: null,                         // Nėra duomenų
                error: { message: 'DB error' },     // Yra klaida
              }),
            }),
          }),
        }),
      });

      const response = await request(app)
        .get('/api/users/activity')
        .set('Authorization', 'Bearer valid-token');

      // Serveris turi grąžinti 500 Internal Server Error
      expect(response.status).toBe(500);
    });
  });
  // --- JV Pabaiga ---
});
