import { Injectable, OnModuleDestroy } from '@nestjs/common';
import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { creerPool } from './pool';
import { executerTransaction } from './transaction';

// Accès à PostgreSQL en SQL brut (CLAUDE.md, règle 13).
// Les requêtes sont toujours paramétrées : `valeurs` remplit $1, $2…
// Ne jamais construire `texte` en y concaténant une valeur.
@Injectable()
export class BaseService implements OnModuleDestroy {
  private readonly pool = creerPool();

  requete<L extends QueryResultRow>(
    texte: string,
    valeurs: unknown[] = [],
  ): Promise<QueryResult<L>> {
    return this.pool.query<L>(texte, valeurs);
  }

  transaction<T>(travail: (tx: PoolClient) => Promise<T>): Promise<T> {
    return executerTransaction(this.pool, travail);
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
