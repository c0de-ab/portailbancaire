// Appels à l'API. Les URL sont relatives : même origine en production,
// redirection par Vite en développement.

// Recopié de api/src/health/health.service.ts (pas de package partagé).
export type EtatSante = { statut: 'ok'; base: 'ok' } | { statut: 'degrade'; base: 'indisponible' };

// L'API renvoie le même format avec 200 (base joignable) et 503 (base indisponible).
// Une autre réponse signifie que l'API elle-même ne répond pas correctement.
export async function lireSante(): Promise<EtatSante> {
  const reponse = await fetch('/api/health');
  if (reponse.status !== 200 && reponse.status !== 503) {
    throw new Error(`Réponse inattendue de l'API : ${reponse.status}`);
  }
  return (await reponse.json()) as EtatSante;
}
