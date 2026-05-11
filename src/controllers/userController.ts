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

export const getActivity = async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ error: 'Vartotojas neidentifikuotas' });
  }

  try {
    const { data: transactions, error } = await supabase
      .from('transactions')
      .select('id, type, amount, reference_id, created_at')
      .eq('profile_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      logger.error({ error, userId }, 'Klaida gaunant vartotojo veiklą');
      return res.status(500).json({ error: 'Nepavyko gauti veiklos duomenų' });
    }

    const activities = (transactions ?? []).map((t) => {
      const decoded = decodeType(t.type);
      return {
        id: t.id,
        type: t.type,
        label: decoded.label,
        emoji: decoded.emoji,
        amount: t.amount,
        amountFormatted: t.amount >= 0 ? `+${t.amount}` : `${t.amount}`,
        referenceId: t.reference_id,
        createdAt: t.created_at,
      };
    });

    return res.status(200).json({ activities });
  } catch (err) {
    logger.error({ err, userId }, 'Serverio klaida gaunant veiklą');
    return res.status(500).json({ error: 'Vidinė serverio klaida' });
  }
};
