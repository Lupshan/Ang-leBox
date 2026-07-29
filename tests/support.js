// @ts-check
const { expect } = require('@playwright/test');

/**
 * Helpers partagés par les tests E2E.
 *
 * Détail important : `app.js` est un script classique (non-module). Ses fonctions
 * et constantes de haut niveau (`isWord`, `scoreOf`, `genBoard`, `SIZE`…) vivent
 * donc dans la portée globale de la page et sont accessibles par leur nom nu
 * depuis `page.evaluate(...)`. C'est ce qui nous permet de tester la logique pure
 * dans le vrai navigateur, sans rien modifier au code source du jeu.
 */

/** Ouvre l'app et attend que le dictionnaire soit chargé et l'accueil affiché. */
async function gotoApp(page) {
  // Un confirm()/alert() non géré bloquerait le test : on les accepte par défaut.
  page.on('dialog', (d) => d.accept().catch(() => {}));
  // Les tests ne doivent pas dépendre d'un CDN externe : on coupe Google Fonts.
  // (En prod la feuille de style des polices est en <head> et bloque l'exécution
  //  des scripts ; si le réseau externe est lent/coupé, le jeu ne démarrerait
  //  qu'après son timeout. On l'avorte pour un démarrage instantané et stable —
  //  seul le rendu des polices change, jamais la logique.)
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.goto('/');
  // `loadDict()` retire l'overlay de chargement et remplit WORDS quand c'est prêt.
  await expect(page.locator('#loading')).toHaveClass(/hide/, { timeout: 30_000 });
  await page.waitForFunction(
    () => typeof WORDS !== 'undefined' && Array.isArray(WORDS) && WORDS.length > 1000,
    null,
    { timeout: 30_000 },
  );
  await expect(page.locator('#home')).toHaveClass(/on/);
}

/** Saisit un pseudo sur l'accueil. */
async function setPseudo(page, name = 'Testeur') {
  await page.fill('#name', name);
}

/**
 * Crée une room PRIVÉE (évite l'annonce publique / le salon réseau) et attend le lobby.
 * L'utilisateur devient hôte : il peut lancer la partie en local, sans pair.
 */
async function createPrivateRoom(page, { pseudo = 'Testeur', roomName = 'Room de test' } = {}) {
  await setPseudo(page, pseudo);
  await page.click('#btn-create');
  await expect(page.locator('#modal')).toHaveClass(/on/);
  await page.fill('#cr-name', roomName);
  await page.click('#cr-vis button[data-v="0"]'); // Privée
  await page.click('#cr-go');
  await expect(page.locator('#lobby')).toHaveClass(/on/);
  await expect(page.locator('#startgame')).toBeVisible();
}

/** Règle un segment de type "seg" du lobby sur la valeur voulue. */
async function setSegment(page, segId, value) {
  await page.click(`#${segId} button[data-v="${value}"]`);
  await expect(page.locator(`#${segId} button[data-v="${value}"]`)).toHaveAttribute(
    'aria-pressed',
    'true',
  );
}

/** Centre (en pixels page) d'une tuile du plateau de mots, par index. */
async function tileCenter(page, idx) {
  const box = await page.locator('#grid .tile').nth(idx).boundingBox();
  if (!box) throw new Error(`tuile ${idx} introuvable`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * Trace un mot en simulant un vrai glissé du pointeur de tuile en tuile.
 * `path` est une liste d'index de tuiles adjacentes (issue de la solution du plateau).
 */
async function traceWord(page, path) {
  const centers = [];
  for (const idx of path) centers.push(await tileCenter(page, idx));
  await page.mouse.move(centers[0].x, centers[0].y);
  await page.mouse.down();
  for (let k = 1; k < centers.length; k++) {
    await page.mouse.move(centers[k].x, centers[k].y, { steps: 4 });
  }
  await page.mouse.up();
}

module.exports = {
  gotoApp,
  setPseudo,
  createPrivateRoom,
  setSegment,
  tileCenter,
  traceWord,
};
