import { Router, RequestHandler } from 'express';
import { getProfile, getActivity } from '../controllers/userController';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.get(
  '/profile',
  requireAuth as RequestHandler,
  getProfile as RequestHandler,
);

router.get(
  '/activity',
  requireAuth as RequestHandler,
  getActivity as RequestHandler,
);

export default router;
