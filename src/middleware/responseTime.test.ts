// Autorius: JV (Jarek)
// NFR-1: Unit testai responseTime middleware'ui.
// Šie testai tikrina, ar middleware teisingai prideda X-Response-Time antraštę
// ir ar visos API užklausos atsakomos greičiau nei per 500ms (SLA reikalavimas).

// supertest — biblioteka, leidžianti siųsti HTTP užklausas į Express serverį
// be tikro serverio paleidimo (testuojama atmintyje)
import request from 'supertest';
// Importuojame sukonfigūruotą Express aplikaciją su visais middleware ir maršrutais
import app from '../app';
// Importuojame Supabase klientą, kurį mock'insime (pakeisime netikru)
import { supabase } from '../lib/supabase';

// jest.mock() — pakeičia tikrąjį logger modulį netikru (mock) objektu.
// Tai būtina, nes:
// 1. Tikrasis logger rašytų į konsolę/failą ir užterštų testų output'ą
// 2. Galime tikrinti, ar logger.warn() buvo iškviesta (lėtoms užklausoms)
jest.mock('../lib/logger', () => ({
  info: jest.fn(),    // Mock'iname info() — greitų užklausų logavimui
  error: jest.fn(),   // Mock'iname error() — klaidų logavimui
  warn: jest.fn(),    // Mock'iname warn() — lėtų užklausų (>500ms) logavimui
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

// jest.mock() Supabase klientui — pakeičiame tikrąjį DB klientą netikru.
// Tai būtina, nes testai neturi kreiptis į tikrą duomenų bazę:
// 1. Testai turi būti greiti (DB užklausos lėtos)
// 2. Testai turi būti izoliuoti (nepriklausyti nuo DB būsenos)
// 3. Testai turi veikti be interneto ryšio
jest.mock('../lib/supabase', () => ({
  supabase: {
    from: jest.fn(),           // Mock'iname DB užklausas (from('profiles'), from('transactions'))
    auth: {
      getUser: jest.fn(),      // Mock'iname autentifikacijos tikrinimą
    },
  },
}));

// NFR-1: API Atsako laiko testai
// Šis describe blokas grupuoja visus testus, susijusius su responseTime middleware
describe('Response Time Middleware (NFR-1: <500ms)', () => {

  // TESTAS 1: Tikriname, ar /health endpointas grąžina X-Response-Time antraštę
  it('turėtų pridėti X-Response-Time header prie /health', async () => {
    // Paruošiame mock'ą: kai serveris kreipsis į supabase.from('profiles'),
    // grąžinsime sėkmingą atsakymą su vienu profiliu (imituojame DB atsakymą)
    (supabase.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue({ data: [{ id: '1' }], error: null }),
      }),
    });

    // Siunčiame GET užklausą į /health endpointą per supertest
    const response = await request(app).get('/health');

    // Tikriname, ar atsakymas sėkmingas (HTTP 200)
    expect(response.status).toBe(200);
    // Tikriname, ar atsakyme yra X-Response-Time antraštė
    expect(response.headers['x-response-time']).toBeDefined();
    // Tikriname antraštės formatą: turi būti skaičius + "ms" (pvz. "12.34ms" arba "5ms")
    // Regex: ^\d+ — prasideda skaičiumi, (\.\d+)? — gali turėti dešimtainę dalį, ms$ — baigiasi "ms"
    expect(response.headers['x-response-time']).toMatch(/^\d+(\.\d+)?ms$/);
  });

  // TESTAS 2: Tikriname, ar /health endpointas atsako per mažiau nei 200ms
  // (200ms — dar griežtesnė riba nei NFR-1 reikalaujami 500ms, nes health check turi būti labai greitas)
  it('turėtų grąžinti /health atsakymą greičiau nei 200ms', async () => {
    // Paruošiame tą patį mock'ą kaip aukščiau
    (supabase.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue({ data: [{ id: '1' }], error: null }),
      }),
    });

    // Fiksuojame pradžios laiką prieš siunčiant užklausą
    const start = Date.now();
    await request(app).get('/health');
    // Apskaičiuojame trukmę milisekundėmis
    const duration = Date.now() - start;

    // Tikriname, ar užklausa užtruko mažiau nei 200ms
    expect(duration).toBeLessThan(200);
  });

  // TESTAS 3: Tikriname neautorizuotą užklausą — turi grąžinti 401 per <500ms
  // Šis testas tikrina ir saugumo (401), ir greičio (<500ms) aspektus vienu metu
  it('turėtų grąžinti 401 per <500ms kai nėra auth header', async () => {
    const start = Date.now();
    // Siunčiame užklausą BE Authorization antraštės
    const response = await request(app).get('/api/users/activity');
    const duration = Date.now() - start;

    // Serveris turi grąžinti 401 (Unauthorized), nes nebuvo JWT tokeno
    expect(response.status).toBe(401);
    // Net klaidos atsakymas turi būti greitas (per <500ms)
    expect(duration).toBeLessThan(500);
  });

  // TESTAS 4: Tikriname pilną autorizuotą užklausą — /api/users/activity per <500ms
  // Šis testas imituoja visą srautą: auth → controller → DB → response
  it('turėtų grąžinti /api/users/activity per <500ms su valid token', async () => {
    // Mock'iname autentifikaciją: supabase.auth.getUser grąžins sėkmingą vartotoją
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@test.com' } },
      error: null,
    });

    // Mock'iname DB užklausą: supabase.from('transactions').select().eq().order().limit()
    // Grąžiname tuščią masyvą (nėra transakcijų) — tai validus scenarijus
    // Kiekvienas .mockReturnValue() atitinka Supabase grandinės (chaining) metodą
    (supabase.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue({          // .select('id, type, amount...')
        eq: jest.fn().mockReturnValue({            // .eq('profile_id', userId)
          order: jest.fn().mockReturnValue({        // .order('created_at', { ascending: false })
            limit: jest.fn().mockResolvedValue({    // .limit(20)
              data: [],                             // Tuščias transakcijų masyvas
              error: null,                          // Jokios klaidos
            }),
          }),
        }),
      }),
    });

    const start = Date.now();
    // Siunčiame GET užklausą su Authorization antrašte (imituojame prisijungusį vartotoją)
    const response = await request(app)
      .get('/api/users/activity')
      .set('Authorization', 'Bearer valid-token'); // JWT tokenas (mock'intas, todėl gali būti bet koks)
    const duration = Date.now() - start;

    // Tikriname, ar atsakymas sėkmingas (HTTP 200) — tai reiškia, kad auth ir DB veikia
    expect(response.status).toBe(200);
    // Tikriname, ar visa operacija (auth + DB + response) užtruko mažiau nei 500ms (NFR-1 SLA)
    expect(duration).toBeLessThan(500);
  });
});
