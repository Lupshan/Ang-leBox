// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, createPrivateRoom, setSegment, traceWord } = require('./support');

/**
 * Parcours complet d'une partie "Boîte à mots" en solo (l'hôte lance en local) :
 * lobby → réglages → plateau → tracé réel d'un mot → score → correction → résultats.
 */

test('partie de mots : tracer un mot marque des points, puis correction et résultats', async ({
  page,
}) => {
  test.slow(); // parcours long (chargement dico + génération + tracé + écrans)
  await gotoApp(page);
  await createPrivateRoom(page, { pseudo: 'Alice' });

  // Réglages : 5×5, 3 lettres min, 1 seule manche pour finir vite.
  await setSegment(page, 's-size', '5');
  await setSegment(page, 's-min', '3');
  await setSegment(page, 's-rounds', '1');

  await page.click('#startgame');
  await expect(page.locator('#play')).toHaveClass(/on/);
  await expect(page.locator('#pl-round')).toHaveText('Manche 1/1');
  await expect(page.locator('#grid .tile')).toHaveCount(25);

  // On choisit dans la solution du plateau un mot court et bien scoré, dont le
  // chemin (index de tuiles adjacentes) est garanti traçable.
  const pick = await page.waitForFunction(() => {
    if (!window.G || !window.G.board || !window.G.board.solution.size) return null;
    const entries = [...window.G.board.solution.entries()].map(([word, v]) => ({
      word,
      path: v.path,
      score: v.score,
    }));
    const short = entries.filter((e) => e.path.length >= 3 && e.path.length <= 5);
    const pool = short.length ? short : entries;
    pool.sort((a, b) => b.score - a.score);
    return pool[0];
  });
  const target = await pick.jsonValue();
  expect(target.path.length).toBeGreaterThanOrEqual(3);

  await traceWord(page, target.path);

  // Le mot tracé apparaît dans les trouvailles et le total passe au-dessus de 0.
  await expect(page.locator('#chips .chip')).toHaveCount(1);
  await expect(page.locator('#chips .chip').first()).toContainText(target.word.toUpperCase());
  await expect(page.locator('#found-count')).toContainText('1 mot');
  await expect(page.locator('#found-total')).not.toHaveText('0 pts');

  // "J'ai fini" → en solo on bascule directement en correction.
  await page.click('#endturn');
  await expect(page.locator('#correction')).toHaveClass(/on/);
  expect(await page.locator('#corr-best .chip').count()).toBeGreaterThan(0);
  // Le joueur figure dans la correction avec son mot.
  await expect(page.locator('#corr-players')).toContainText('(toi)');

  // Dernière manche → bouton "Voir les résultats".
  await expect(page.locator('#corr-next')).toHaveText('Voir les résultats');
  await page.click('#corr-next');

  await expect(page.locator('#results')).toHaveClass(/on/);
  await expect(page.locator('#res-title')).toHaveText('Terminé'); // solo
  await expect(page.locator('#res-sub')).toContainText('point');
  await expect(page.locator('#res-lead .lrow')).toHaveCount(1);
});

test('mot trop court : aucun point marqué', async ({ page }) => {
  await gotoApp(page);
  await createPrivateRoom(page, { pseudo: 'Bob' });
  await setSegment(page, 's-min', '4'); // min 4 lettres
  await setSegment(page, 's-rounds', '1');
  await page.click('#startgame');
  await expect(page.locator('#play')).toHaveClass(/on/);

  // Une seule tuile (1 à 2 caractères) est forcément sous le minimum de 4 :
  // ni faux positif possible, ni dépendance au contenu aléatoire du plateau.
  await traceWord(page, [0]);

  // Rien n'est enregistré.
  await expect(page.locator('#chips .chip')).toHaveCount(0);
  await expect(page.locator('#found-total')).toHaveText('0 pts');
});
