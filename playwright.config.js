// @ts-check
const { defineConfig, devices } = require('@playwright/test');

/**
 * Config Playwright pour LIANE (site 100 % statique).
 *
 * Le site est servi tel quel depuis `public/` par un petit serveur HTTP Python
 * (le même que celui décrit dans le README pour le dev local). Aucune étape de
 * build : Playwright démarre le serveur, puis pilote un vrai Chromium.
 *
 * Le jeu est pensé mobile-first (viewport-fit=cover, tracé au doigt) : on teste
 * donc dans un viewport de type téléphone, avec le tactile activé.
 */
const PORT = 8000;
const BASE_URL = `http://localhost:${PORT}`;

module.exports = defineConfig({
  testDir: './tests',
  // Chaque test est isolé (contexte + page neufs) → tout est parallélisable.
  fullyParallel: true,
  // Interdit les .only oubliés en CI.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Un seul worker en CI pour rester déterministe ; local : auto.
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }], ['list']]
    : [['html', { open: 'never' }], ['list']],

  use: {
    baseURL: BASE_URL,
    // Traces/screenshots seulement quand ça casse : léger et utile.
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Chargement du dictionnaire (~300 Ko gzip) puis P2P : on laisse de la marge.
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  projects: [
    {
      name: 'chromium-mobile',
      use: {
        ...devices['Pixel 5'],
        // On force un viewport net et stable pour le tracé au pointeur.
        viewport: { width: 412, height: 915 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],

  // Sert public/ exactement comme en prod (fichier .gz brut, décompressé côté client).
  webServer: {
    command: `python3 -m http.server ${PORT} --directory public`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
