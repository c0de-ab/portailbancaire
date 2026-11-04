import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configurerApp } from './configurer-app';

async function demarrer(): Promise<void> {
  // En local, les variables viennent de api/.env ; dans Docker, de l'environnement.
  if (existsSync('.env')) {
    process.loadEnvFile('.env');
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // api/dist/main.js -> web/dist : même chemin relatif en local et dans l'image.
  configurerApp(app, join(__dirname, '..', '..', 'web', 'dist'));
  await app.listen(Number(process.env.PORT ?? 3000));
}

void demarrer();
