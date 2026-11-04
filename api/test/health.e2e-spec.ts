import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configurerApp } from '../src/configurer-app';

// Test d'API : vraie application, vraie base portail_test (jamais de mock de la base).
describe('API : santé et routage', () => {
  let app: NestExpressApplication;
  let dossierWeb: string;

  beforeAll(async () => {
    // Un faux frontend construit, pour vérifier le retour vers index.html
    // dans les mêmes conditions qu'en production.
    dossierWeb = mkdtempSync(join(tmpdir(), 'portail-web-'));
    writeFileSync(join(dossierWeb, 'index.html'), '<!doctype html><title>Portail</title>');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configurerApp(app, dossierWeb);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    rmSync(dossierWeb, { recursive: true, force: true });
  });

  it('GET /api/health vérifie la connexion à la base', async () => {
    const reponse = await request(app.getHttpServer()).get('/api/health');

    expect(reponse.status).toBe(200);
    expect(reponse.body).toEqual({ statut: 'ok', base: 'ok' });
  });

  it("une route d'API inconnue renvoie un 404 en JSON, jamais la page du frontend", async () => {
    const reponse = await request(app.getHttpServer()).get('/api/route-inexistante');

    expect(reponse.status).toBe(404);
    expect(reponse.headers['content-type']).toMatch(/application\/json/);
    expect(reponse.text).not.toMatch(/<!doctype html>/i);
  });

  it('une route du frontend renvoie index.html', async () => {
    const reponse = await request(app.getHttpServer()).get('/une/page/du/frontend');

    expect(reponse.status).toBe(200);
    expect(reponse.headers['content-type']).toMatch(/text\/html/);
  });
});
