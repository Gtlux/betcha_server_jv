// Autorius: JV (Jarek)
import { Request, Response, NextFunction } from 'express';
import logger from '../lib/logger';

/**
 * NFR-1: Middleware, matuojantis ir loginantis API atsako laiką.
 * Prideda X-Response-Time header'į į response.
 * Jei atsako laikas > 500ms — logina WARN lygyje.
 */
export function responseTime(req: Request, res: Response, next: NextFunction): void {
  // Matuojame pradžios laiką dideliu tikslumu (BigInt) - tai būtina, nes paprastas Date.now() nėra pakankamai tikslus milisekundžių dalims
  const start = process.hrtime.bigint(); 

  // NFR-1: Perimame (monkey-patch) originalią res.writeHead funkciją.
  // NodeJS 'http' modulyje (kurį naudoja Express), antraštės (headers) yra išsiunčiamos vos tik iškviečiamas writeHead arba send.
  // Jei bandytume pridėti header'į 'finish' įvykyje, gautume klaidą "Cannot set headers after they are sent".
  const originalWriteHead = res.writeHead;
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (res as any).writeHead = function (this: Response, ...args: any[]) {
    // Apskaičiuojame laiką nuo 'start' iki dabar
    const end = process.hrtime.bigint();
    // Konvertuojame iš nanosekundžių į milisekundes (padalijame iš 1,000,000)
    const durationMs = Number(end - start) / 1_000_000;
    // Suapvaliname iki 2 skaičių po kablelio (pvz., 42.15)
    const rounded = Math.round(durationMs * 100) / 100;
    
    // Nustatome savo custom antraštę PRIEŠ kviečiant tikrąjį writeHead
    this.setHeader('X-Response-Time', `${rounded}ms`);
    
    // Iškviečiame originalią funkciją su visais parametrais, kad nesulaužytume Express veikimo
    return originalWriteHead.apply(this, args as any);
  };

  // 'finish' įvykis iššauna, kai atsakymas jau pilnai išsiųstas klientui.
  // Čia atliekame loggingą, nes šiuo metu jau žinome galutinį statusą ir trukmę.
  res.on('finish', () => {
    // Vėl pamatuojame laiką nuo 'start', kad sužinotume pilną užklausos vykdymo trukmę
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1_000_000;
    const rounded = Math.round(durationMs * 100) / 100;

    // Paruošiame metaduomenų objektą logeriui
    const logData = {
      method: req.method, // Pvz. GET, POST
      path: req.originalUrl, // Pvz. /api/users/activity
      statusCode: res.statusCode, // Pvz. 200, 401, 500
      responseTimeMs: rounded, // Mūsų paskaičiuotas laikas
    };

    // NFR-1 SLA sąlyga: užklausos negali trukti ilgiau nei 500ms
    if (rounded > 500) {
      // Jei trunka per ilgai, registruojame kaip įspėjimą (WARN), kad administratorius atkreiptų dėmesį
      logger.warn(logData, 'Lėtas API atsakymas (>500ms)');
    } else {
      // Jei viskas gerai (greitai), registruojame kaip įprastą informaciją (INFO)
      logger.info(logData, 'API atsakymas');
    }
  });

  // Perduodame valdymą sekančiam middleware'ui ar kontroleriui (būtina Express.js architektūroje)
  next();
}
