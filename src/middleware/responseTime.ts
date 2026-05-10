import { Request, Response, NextFunction } from 'express';
import logger from '../lib/logger';

/**
 * Middleware, matuojantis ir loginantis API atsako laiką.
 * Prideda X-Response-Time header'į į response.
 * Jei atsako laikas > 500ms — logina WARN lygyje.
 */
export function responseTime(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1_000_000;
    const rounded = Math.round(durationMs * 100) / 100;

    res.setHeader('X-Response-Time', `${rounded}ms`);

    const logData = {
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      responseTimeMs: rounded,
    };

    if (rounded > 500) {
      logger.warn(logData, 'Lėtas API atsakymas (>500ms)');
    } else {
      logger.info(logData, 'API atsakymas');
    }
  });

  next();
}
