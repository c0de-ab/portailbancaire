import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { NextFunction, Request, Response } from 'express';
import type { NestExpressApplication } from '@nestjs/platform-express';

// Configuration commune à main.ts et aux tests d'API : les tests vérifient ainsi
// exactement ce qui tourne en production.
export function configurerApp(app: NestExpressApplication, dossierWeb: string): void {
  app.setGlobalPrefix('api');

  // Le frontend construit n'existe pas toujours (développement avec Vite, CI de l'API).
  if (!existsSync(join(dossierWeb, 'index.html'))) {
    return;
  }

  app.useStaticAssets(dossierWeb);

  // Les routes du frontend (React Router) renvoient index.html. Jamais sous /api :
  // une route d'API inconnue doit rester un 404 JSON de NestJS.
  app.use((req: Request, res: Response, next: NextFunction) => {
    const versApi = req.path === '/api' || req.path.startsWith('/api/');
    if (req.method !== 'GET' || versApi) {
      next();
      return;
    }
    res.sendFile(join(dossierWeb, 'index.html'));
  });
}
