// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, setPseudo, createPrivateRoom } = require('./support');

/** Parcours d'accueil : chargement, modales, création de room. */

test.beforeEach(async ({ page }) => {
  await gotoApp(page);
});

test('l\'accueil se charge (titre, marque, boutons)', async ({ page }) => {
  await expect(page).toHaveTitle(/LIANE/);
  await expect(page.locator('.brand')).toBeVisible();
  await expect(page.locator('#btn-create')).toBeVisible();
  await expect(page.locator('#btn-joincode')).toBeVisible();
  await expect(page.locator('#btn-rules')).toBeVisible();
  await expect(page.locator('#btn-dict')).toBeVisible();
});

test('la modale Règles affiche le barème', async ({ page }) => {
  await page.click('#btn-rules');
  await expect(page.locator('#modal')).toHaveClass(/on/);
  await expect(page.locator('#modal-title')).toHaveText('Règles & points');
  await expect(page.locator('#modal-body')).toContainText('multiplicateur');
  await expect(page.locator('#modal-body')).toContainText('Valeur des lettres');
  await page.click('#modal-close');
  await expect(page.locator('#modal')).not.toHaveClass(/on/);
});

test('la modale Dictionnaire filtre les mots par préfixe', async ({ page }) => {
  await page.click('#btn-dict');
  await expect(page.locator('#modal')).toHaveClass(/on/);
  await expect(page.locator('#dict-count')).toContainText('Tape au moins 2 lettres');
  await page.fill('#dict-q', 'cha');
  await expect(page.locator('#dict-count')).toContainText(/commençant par/);
  const chips = page.locator('#dict-res .wchip');
  expect(await chips.count()).toBeGreaterThan(0);
  // Tous les résultats commencent bien par le préfixe.
  await expect(chips.first()).toContainText(/^cha/);
});

test('le pseudo choisi apparaît dans le lobby', async ({ page }) => {
  await createPrivateRoom(page, { pseudo: 'Zoé', roomName: 'Chez Zoé' });
  await expect(page.locator('#plist .pitem').first()).toContainText('Zoé');
});

test('créer une room privée mène au lobby en tant qu\'hôte', async ({ page }) => {
  await createPrivateRoom(page, { pseudo: 'Alice', roomName: 'Soirée mardi' });
  await expect(page.locator('#room-name')).toHaveText('Soirée mardi');
  await expect(page.locator('#pcount')).toHaveText('1');
  // Un seul joueur, marqué "(toi)" et hôte.
  const items = page.locator('#plist .pitem');
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText('(toi)');
  await expect(items.first().locator('.badge')).toHaveText('hôte');
  await expect(page.locator('#startgame')).toBeVisible();
  await expect(page.locator('#set-title')).toContainText("tu es l'hôte");
});

test('quitter la room revient à l\'accueil', async ({ page }) => {
  await createPrivateRoom(page);
  await page.click('#leave1');
  await expect(page.locator('#home')).toHaveClass(/on/);
});

test('la modale "Rejoindre par code" refuse un code vide', async ({ page }) => {
  await setPseudo(page, 'Bob');
  await page.click('#btn-joincode');
  await expect(page.locator('#modal')).toHaveClass(/on/);
  await page.click('#jc-go');
  await expect(page.locator('#toast')).toContainText(/code/i);
});
