# Consignes pour Claude — LIANE (Ang-leBox)

## Le projet en bref
Jeu de mots multijoueur (+ mode Sudoku), **100 % côté client**. Aucun backend,
aucune fonction serverless : simple **site statique** servi depuis `public/`. Le
multijoueur passe par du **WebRTC pair-à-pair** (Trystero, signalisation Nostr).
**Aucune étape de build.**

- `public/index.html` — coquille HTML
- `public/css/styles.css` — styles
- `public/js/app.js` — toute la logique du jeu (script classique, non-module)
- `public/data/dict.txt.gz` — dictionnaire FR, décompressé côté navigateur
- `tests/` — tests E2E Playwright · `.github/workflows/ci.yml` — CI

## Règle de développement : TDD, toujours

**On développe en TDD. Sans exception.**

1. **Écrire le(s) test(s) AVANT le code.** Pour toute évolution (fonctionnalité,
   correction de bug, refactor à comportement observable), on écrit d'abord un
   test qui décrit le comportement attendu.
2. **Voir le test échouer** (rouge) pour la bonne raison, avant d'écrire la
   moindre ligne de code de production.
3. **Écrire le minimum de code** pour faire passer le test (vert).
4. **Refactorer** ensuite, en gardant les tests verts.

### Ne PAS adapter les tests pour les faire passer
- Un test qui échoue signale **par défaut un bug dans le code**, pas dans le test.
  On corrige le code, pas le test.
- **On ne modifie un test que si on est certain qu'il est réellement faux** —
  c'est-à-dire qu'il affirme un comportement incorrect ou obsolète. Dans ce cas :
  - expliquer explicitement **pourquoi** le test est faux (quel comportement
    attendu est erroné) avant de le changer ;
  - ne jamais affaiblir/supprimer une assertion juste pour « passer au vert ».
- Ne jamais commenter, `skip`, ou relâcher un test pour contourner un échec.

### Rappel concret
Avant de coder une correction ou une feature : **quel test échoue aujourd'hui à
cause de ce manque ?** S'il n'existe pas, on l'écrit d'abord.

## Tester
Les tests sont **bout-en-bout** (Playwright pilote un vrai Chromium sur le site
servi tel qu'en prod). La logique pure de `app.js` (fonctions globales) est
appelable directement dans la page via `page.evaluate`, ce qui permet de la
tester sans modifier le code source.

```bash
npm install
npx playwright install chromium   # une fois
npm test                          # toute la suite E2E
npm run report                    # rapport HTML du dernier run
```

- Les tests ne doivent **dépendre d'aucun CDN externe** : le harnais coupe les
  requêtes de polices (voir `tests/support.js`). Garder cette indépendance.
- Toute nouvelle logique dans `app.js` doit venir avec ses tests dans `tests/`.
  La CI l'**impose** : une PR qui modifie `public/js/` (hors `vendor/`) sans
  toucher à `tests/` échoue (job « Garde TDD »). Sur `main`, le merge est bloqué
  tant que les tests E2E ne sont pas verts (voir README).
