import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// Prisma 7 ne charge pas les fichiers .env tout seul. En local, on charge api/.env
// s'il existe ; dans Docker et dans la CI, les variables viennent de l'environnement.
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Lu directement, et non avec env() : env() échoue si la variable manque,
    // ce qui bloquerait aussi `prisma generate`, qui n'a pas besoin de la base.
    url: process.env.DATABASE_URL,
  },
});
