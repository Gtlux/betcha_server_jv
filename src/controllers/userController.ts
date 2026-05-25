import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { supabase } from '../lib/supabase';
import logger from '../lib/logger';

export const getProfile = async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ error: 'Vartotojas neidentifikuotas' });
  }

  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id, username, avatar_url, balance, total_points_collected')
      .eq('id', userId)
      .single();

    if (error) {
      logger.error({ error, userId }, 'Klaida gaunant vartotojo profilį');
      return res.status(404).json({ error: 'Profilis nerastas' });
    }

    return res.status(200).json(profile);
  } catch (err) {
    logger.error({ err, userId }, 'Serverio klaida gaunant profilį');
    return res.status(500).json({ error: 'Vidinė serverio klaida' });
  }
};

const TYPE_LABELS: Record<string, { label: string; emoji: string }> = {
  shop_purchase: { label: 'Pirkimas', emoji: '🛒' },
  bet_win: { label: 'Lažybų laimėjimas', emoji: '🎲' },
  bet_placed: { label: 'Statymas', emoji: '🎲' },
  bet_loss: { label: 'Lažybų pralaimėjimas', emoji: '🎲' },
  quest_reward: { label: 'Užduoties atlygis', emoji: '✅' },
  quest_completion: { label: 'Užduoties užbaigimas', emoji: '✅' },
  bonus: { label: 'Bonusas', emoji: '🏆' },
};

function decodeType(type: string): { label: string; emoji: string } {
  return TYPE_LABELS[type] ?? { label: 'Kitas veiksmas', emoji: '📋' };
}

// --- JV Pradžia ---
/**
 * UR-1: Veiklos žurnalo API
 * Grąžina vartotojo transakcijų istoriją (iki 20 naujausių įrašų).
 * Formatuoja duomenis kliento ActivityLog komponentui (prideda emoji ir atitinkamą tekstą).
 */
export const getActivity = async (req: AuthenticatedRequest, res: Response) => {
  // 1. Ištraukiame userId iš objekto, kurį priskyrė requireAuth middleware
  const userId = req.user?.id;

  // Jei ID nėra, vadinasi vartotojas neturi teisės pasiekti šio resurso
  if (!userId) {
    return res.status(401).json({ error: 'Vartotojas neidentifikuotas' });
  }

  try {
    // 2. Darome užklausą į Supabase DB:
    // - Iš lentelės 'transactions'
    // - Nuskaitome nurodytus stulpelius (optimizacija, neimame * )
    // - Filtruojame pagal vartotojo ID ('profile_id')
    // - Rūšiuojame nuo naujausio ('created_at' mažėjančia tvarka)
    // - Paimame tik 20 naujausių įrašų, kad neperkrautume tinklo (Limit)
    const { data: transactions, error } = await supabase
      .from('transactions')
      .select('id, type, amount, reference_id, created_at')
      .eq('profile_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);

    // Jei Supabase grąžino klaidą (pvz. blogas ryšys su DB)
    if (error) {
      logger.error({ error, userId }, 'Klaida gaunant vartotojo veiklą'); // Užloginame klaidą serveryje su NFR loggeriu
      return res.status(500).json({ error: 'Nepavyko gauti veiklos duomenų' });
    }

    // 3. Mapiname (transformuojame) raw DB transakcijas į klientui patogų ActivityItem formatą
    const activities = (transactions ?? []).map((t) => {
      // Dekoduojame duomenų bazės 'type' stringą į žmogišką kalbą ir parenkame emoji (pvz. 'shop_purchase' -> 'Pirkimas', '🛒')
      const decoded = decodeType(t.type);
      return {
        id: t.id, // Unikalus transakcijos identifikatorius
        type: t.type, // Techninis tipas
        label: decoded.label, // Žmogiškas pavadinimas, kurį rodysime UI
        emoji: decoded.emoji, // Grafinis simbolis
        amount: t.amount, // Suma skaičiais (svarbi spalvinimui UI)
        // Sukuriame gražiai suformatuotą sumą su + ženklu teigiamiems skaičiams (pvz. "+100")
        amountFormatted: t.amount >= 0 ? `+${t.amount}` : `${t.amount}`,
        referenceId: t.reference_id, // Gali būti susijusio objekto (quest'o, item'o) ID
        createdAt: t.created_at, // ISO data
      };
    });

    return res.status(200).json({ activities });
  } catch (err) {
    logger.error({ err, userId }, 'Serverio klaida gaunant veiklą');
    return res.status(500).json({ error: 'Vidinė serverio klaida' });
  }
};
// --- JV Pabaiga ---
