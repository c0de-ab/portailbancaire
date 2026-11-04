# Image de l'application : l'API compilée sert aussi le frontend construit.
# Trois étapes : construire le frontend, construire l'API, puis une image d'exécution
# qui ne contient que le code compilé et les dépendances de production
# (ni TypeScript, ni ts-node, ni tsx).

# --- 1. Frontend -------------------------------------------------------------
FROM node:24-slim AS build-web
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# --- 2. API ------------------------------------------------------------------
FROM node:24-slim AS build-api
WORKDIR /app/api
COPY api/package.json api/package-lock.json ./
RUN npm ci
COPY api/ ./
# prisma generate n'a pas besoin de DATABASE_URL (vérifié) : aucune valeur factice ici.
RUN npx prisma generate && npm run build

# --- 3. Exécution ------------------------------------------------------------
FROM node:24-slim AS execution
# OpenSSL : requis par le moteur de migration de Prisma (prisma migrate deploy).
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app/api
COPY api/package.json api/package-lock.json ./
# Dépendances de production seulement ; le CLI prisma en fait partie.
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build-api /app/api/dist ./dist
COPY api/prisma ./prisma
COPY api/prisma.config.ts ./
# Même chemin relatif qu'en local : api/dist/main.js -> web/dist.
COPY --from=build-web /app/web/dist /app/web/dist
USER node
EXPOSE 3000
# Les migrations sont appliquées au démarrage, puis l'API compilée est lancée.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
