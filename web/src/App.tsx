import { useEffect, useState } from 'react';
import { lireSante, type EtatSante } from './api';

type Affichage =
  { etape: 'chargement' } | { etape: 'recu'; etat: EtatSante } | { etape: 'injoignable' };

export function App() {
  const [affichage, setAffichage] = useState<Affichage>({ etape: 'chargement' });

  useEffect(() => {
    lireSante()
      .then((etat) => setAffichage({ etape: 'recu', etat }))
      .catch(() => setAffichage({ etape: 'injoignable' }));
  }, []);

  return (
    <main>
      <h1>Portail bancaire</h1>
      <p>{texteEtat(affichage)}</p>
    </main>
  );
}

function texteEtat(affichage: Affichage): string {
  switch (affichage.etape) {
    case 'chargement':
      return "Vérification de l'API…";
    case 'injoignable':
      return 'API injoignable.';
    case 'recu':
      return affichage.etat.base === 'ok'
        ? 'API : ok · base de données : ok'
        : 'API : ok · base de données : indisponible';
  }
}
