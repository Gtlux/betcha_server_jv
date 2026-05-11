import { Router, RequestHandler } from 'express';
import { getProfile, getActivity } from '../controllers/userController';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.get(
  '/profile',
  requireAuth as RequestHandler,
  getProfile as RequestHandler,
);

// --- JV Pradžia ---
// UR-1: Veiklos žurnalo endpointas (apsaugotas requireAuth)
router.get(
  '/activity',
  requireAuth as RequestHandler,
  getActivity as RequestHandler,
);
// --- JV Pabaiga ---

export default router;
