// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, createPrivateRoom, setSegment } = require('./support');

/**
 * Parcours complet du mode Sudoku en solo : on remplit toute la grille via
 * l'interface (sélection de case + pavé numérique), on valide, on gagne la
 * manche, puis correction et résultats.
 */

test('sudoku : remplir la grille correctement mène à la victoire et aux résultats', async ({
  page,
}) => {
  test.slow(); // ~40 cases à remplir au clic
  await gotoApp(page);
  await createPrivateRoom(page, { pseudo: 'Alice' });

  // Bascule en mode Sudoku, difficulté facile (plus d'indices → moins à remplir).
  await setSegment(page, 's-game', 'sudoku');
  await expect(page.locator('#sudoku-settings')).toBeVisible();
  await setSegment(page, 's-diff', 'facile');
  await setSegment(page, 's-rounds', '1');

  await page.click('#startgame');
  await expect(page.locator('#splay')).toHaveClass(/on/);
  await expect(page.locator('#sudoku-grid .scell')).toHaveCount(81);
  await expect(page.locator('#numpad button')).toHaveCount(10); // 1-9 + EFF.
  // Il doit rester des cases pré-remplies (indices) verrouillées.
  expect(await page.locator('#sudoku-grid .scell.given').count()).toBeGreaterThan(20);

  // On récupère la solution et les cases verrouillées, puis on remplit le reste.
  const { solution, locked } = await page.evaluate(() => ({
    solution: Array.from(SUD.solution),
    locked: Array.from({ length: 81 }, (_, i) => sLocked[i]),
  }));

  const cells = page.locator('#sudoku-grid .scell');
  const pad = page.locator('#numpad button');
  for (let i = 0; i < 81; i++) {
    if (locked[i]) continue;
    await cells.nth(i).click();
    await pad.nth(solution[i] - 1).click(); // le bouton d'index d-1 saisit le chiffre d
  }

  // Sécurité : la grille saisie doit être identique à la solution avant validation.
  const filledOk = await page.evaluate(() => {
    for (let i = 0; i < 81; i++) if (sCells[i] !== SUD.solution[i]) return false;
    return true;
  });
  expect(filledOk).toBe(true);

  // "J'ai fini" → modale de confirmation → valider.
  await page.click('#s-finish');
  await expect(page.locator('#modal')).toHaveClass(/on/);
  await page.click('#sf-go');

  // Solo : victoire → correction directe.
  await expect(page.locator('#correction')).toHaveClass(/on/);
  await expect(page.locator('#corr-grid .scell')).toHaveCount(81);
  await expect(page.locator('#corr-players')).toContainText('gagnant');

  await expect(page.locator('#corr-next')).toHaveText('Voir les résultats');
  await page.click('#corr-next');

  await expect(page.locator('#results')).toHaveClass(/on/);
  await expect(page.locator('#res-title')).toHaveText('Terminé'); // solo
  await expect(page.locator('#res-lead .lrow')).toHaveCount(1);
});
