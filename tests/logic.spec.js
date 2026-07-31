// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('./support');

/**
 * Tests de la LOGIQUE PURE du jeu, exécutés dans le navigateur via page.evaluate.
 * On appelle directement les fonctions de app.js (portée globale) : dictionnaire,
 * barème de points, RNG déterministe, génération de grille et de sudoku.
 */

test.beforeEach(async ({ page }) => {
  await gotoApp(page);
});

test.describe('Dictionnaire', () => {
  test('WORDS est chargé, trié et cohérent', async ({ page }) => {
    const info = await page.evaluate(() => {
      let sorted = true;
      for (let i = 1; i < WORDS.length; i++) {
        if (WORDS[i] && WORDS[i - 1] && WORDS[i] < WORDS[i - 1]) { sorted = false; break; }
      }
      return { len: WORDS.length, sorted };
    });
    expect(info.len).toBeGreaterThan(100000);
    expect(info.sorted).toBe(true);
  });

  test('isWord / isPrefix reconnaissent les bons mots', async ({ page }) => {
    const r = await page.evaluate(() => ({
      chat: isWord('chat'),
      maison: isWord('maison'),
      table: isWord('table'),
      inconnu: isWord('xyzzyq'),
      vide: isWord(''),
      prefCha: isPrefix('cha'),
      prefZzz: isPrefix('zzzzz'),
    }));
    expect(r.chat).toBe(true);
    expect(r.maison).toBe(true);
    expect(r.table).toBe(true);
    expect(r.inconnu).toBe(false);
    expect(r.vide).toBe(false);
    expect(r.prefCha).toBe(true);
    expect(r.prefZzz).toBe(false);
  });

  test('lb (recherche dichotomique) pointe sur la bonne position', async ({ page }) => {
    const ok = await page.evaluate(() => {
      // Pour un mot présent, WORDS[lb(w)] === w.
      const samples = ['chat', 'maison', WORDS[0], WORDS[Math.floor(WORDS.length / 2)]];
      return samples.every((w) => WORDS[lb(w)] === w);
    });
    expect(ok).toBe(true);
  });
});

test.describe('Barème de points', () => {
  test('valeur des lettres et des digrammes', async ({ page }) => {
    const r = await page.evaluate(() => ({
      a: tileValue('a'),
      z: tileValue('z'),
      qu: tileValue('qu'), // q(6) + u(1)
      ch: tileValue('ch'), // c(3) + h(4)
      empty: tileValue(''),
    }));
    expect(r.a).toBe(1);
    expect(r.z).toBe(7);
    expect(r.qu).toBe(7);
    expect(r.ch).toBe(7);
    expect(r.empty).toBe(0);
  });

  test('multiplicateur de longueur', async ({ page }) => {
    const r = await page.evaluate(() => ({
      two: lenMult(2), // hors barème
      three: lenMult(3),
      five: lenMult(5),
      ten: lenMult(10),
      twelve: lenMult(12),
    }));
    expect(r.two).toBe(0);
    expect(r.three).toBe(0.8);
    expect(r.five).toBe(1.8);
    expect(r.ten).toBe(5.2);
    expect(r.twelve).toBe(5.2);
  });

  test('scoreOf : (somme lettres) × mult longueur × bonus, arrondi', async ({ page }) => {
    const r = await page.evaluate(() => {
      const tiles = [{ letters: 'c' }, { letters: 'h' }, { letters: 'a' }, { letters: 't' }];
      const noBonus = scoreOf([0, 1, 2, 3], { tiles, bonus: -1 });
      const withBonus = scoreOf([0, 1, 2, 3], { tiles, bonus: 2 });
      return { noBonus, withBonus };
    });
    // c+h+a+t = 3+4+1+1 = 9 ; 4 lettres → ×1.4 ; arrondi(12.6)=13
    expect(r.noBonus.score).toBe(13);
    expect(r.noBonus.chars).toBe(4);
    expect(r.noBonus.mult).toBe(1.4);
    expect(r.noBonus.bonus).toBe(1);
    // Passage par la tuile bonus → ×2 : arrondi(25.2)=25
    expect(r.withBonus.score).toBe(25);
    expect(r.withBonus.bonus).toBe(2);
  });
});

test.describe('RNG déterministe', () => {
  test('hashStr est stable et mulberry32 reproductible', async ({ page }) => {
    const r = await page.evaluate(() => {
      const h1 = hashStr('liane');
      const h2 = hashStr('liane');
      const h3 = hashStr('lianes');
      const a = mulberry32(hashStr('seed'));
      const b = mulberry32(hashStr('seed'));
      const seqA = [a(), a(), a()];
      const seqB = [b(), b(), b()];
      return {
        stable: h1 === h2,
        different: h1 !== h3,
        sameSeq: JSON.stringify(seqA) === JSON.stringify(seqB),
        inRange: seqA.every((x) => x >= 0 && x < 1),
      };
    });
    expect(r.stable).toBe(true);
    expect(r.different).toBe(true);
    expect(r.sameSeq).toBe(true);
    expect(r.inRange).toBe(true);
  });
});

test.describe('Génération de grille (boîte à mots)', () => {
  test('genBoard produit une grille valide et entièrement résolvable', async ({ page }) => {
    const r = await page.evaluate(() => {
      SIZE = 5; N = 25; ADJ = buildAdj(5);
      const board = genBoard('seed-e2e', 1);
      const words = [...board.solution.entries()];
      // Chaque mot de la solution doit : être au dictionnaire, avoir un chemin
      // d'index adjacents sans répétition, et se reconstituer lettre à lettre.
      let allValid = true;
      for (const [word, { path }] of words) {
        if (!isWord(word)) { allValid = false; break; }
        if (new Set(path).size !== path.length) { allValid = false; break; }
        let reconstructed = '';
        let adjacent = true;
        for (let k = 0; k < path.length; k++) {
          reconstructed += board.tiles[path[k]].letters;
          if (k > 0 && !ADJ[path[k - 1]].includes(path[k])) { adjacent = false; break; }
        }
        if (!adjacent || reconstructed !== word) { allValid = false; break; }
      }
      return {
        tiles: board.tiles.length,
        bonusInRange: board.bonus >= 0 && board.bonus < 25,
        solSize: board.solution.size,
        allValid,
      };
    });
    expect(r.tiles).toBe(25);
    expect(r.bonusInRange).toBe(true);
    expect(r.solSize).toBeGreaterThan(0);
    expect(r.allValid).toBe(true);
  });

  test('genBoard est déterministe (même seed → même grille)', async ({ page }) => {
    const same = await page.evaluate(() => {
      SIZE = 5; N = 25; ADJ = buildAdj(5);
      const a = genBoard('graine-fixe', 2).tiles.map((t) => t.letters).join(',');
      const b = genBoard('graine-fixe', 2).tiles.map((t) => t.letters).join(',');
      const c = genBoard('graine-fixe', 3).tiles.map((t) => t.letters).join(',');
      return { ab: a === b, ac: a !== c };
    });
    expect(same.ab).toBe(true); // reproductible
    expect(same.ac).toBe(true); // manche différente → grille différente
  });

  test('taille 4×4 → 16 tuiles', async ({ page }) => {
    const n = await page.evaluate(() => {
      SIZE = 4; N = 16; ADJ = buildAdj(4);
      return genBoard('petit', 1).tiles.length;
    });
    expect(n).toBe(16);
  });
});

test.describe('Sudoku', () => {
  test('genFullSudoku produit une grille pleine et valide', async ({ page }) => {
    const r = await page.evaluate(() => {
      const g = genFullSudoku(mulberry32(hashStr('sud')));
      function unitOk(vals) {
        const s = new Set(vals);
        return s.size === 9 && [...s].every((v) => v >= 1 && v <= 9);
      }
      let ok = g.length === 81;
      for (let i = 0; i < 9 && ok; i++) {
        const row = [], col = [], box = [];
        for (let j = 0; j < 9; j++) {
          row.push(g[i * 9 + j]);
          col.push(g[j * 9 + i]);
          const br = ((i / 3) | 0) * 3, bc = (i % 3) * 3;
          box.push(g[(br + ((j / 3) | 0)) * 9 + (bc + (j % 3))]);
        }
        if (!unitOk(row) || !unitOk(col) || !unitOk(box)) ok = false;
      }
      return ok;
    });
    expect(r).toBe(true);
  });

  test('genSudoku : indices cohérents et solution UNIQUE', async ({ page }) => {
    const r = await page.evaluate(() => {
      const { given, solution } = genSudoku('sud-e2e', 1, 'moyen');
      let clues = 0, matches = true;
      for (let i = 0; i < 81; i++) {
        if (given[i]) {
          clues++;
          if (given[i] !== solution[i]) matches = false;
        }
      }
      return {
        clues,
        matches,
        unique: sCountSolutions(given, 5) === 1,
      };
    });
    // 'moyen' vise 30 indices ; l'unicité peut en imposer un peu plus.
    expect(r.clues).toBeGreaterThanOrEqual(25);
    expect(r.clues).toBeLessThanOrEqual(45);
    expect(r.matches).toBe(true);
    expect(r.unique).toBe(true);
  });
});

test.describe('Helpers de texte', () => {
  test('slug, escapeHtml, normWord, fmtMMSS', async ({ page }) => {
    const r = await page.evaluate(() => ({
      slug: slug('Éà Test !'),
      escape: escapeHtml('<b>&"\''),
      norm: normWord('Château-fort !'),
      t90: fmtMMSS(90),
      t5: fmtMMSS(5),
      t0: fmtMMSS(0),
      tNeg: fmtMMSS(-3),
      tMax: fmtMMSS(3599),
    }));
    expect(r.slug).toBe('ea-test');
    expect(r.escape).toBe('&lt;b&gt;&amp;&quot;&#39;');
    expect(r.norm).toBe('chateaufort');
    expect(r.t90).toBe('01:30');
    expect(r.t5).toBe('00:05');
    expect(r.t0).toBe('00:00');
    expect(r.tNeg).toBe('00:00');
    expect(r.tMax).toBe('59:59');
  });
});

test.describe('Définitions — flexions (mot de base)', () => {
  test('lemmaFromLine extrait le mot de base et ignore les termes grammaticaux', async ({ page }) => {
    const r = await page.evaluate(() => ({
      verbe: lemmaFromLine("# ''Troisième personne du pluriel de l'[[indicatif]] présent de'' [[manger]]."),
      pluriel: lemmaFromLine("# ''Pluriel de'' [[cheval]]."),
      cible: lemmaFromLine("# ''Première personne du singulier de'' [[appeler|appelle]]."),
      lien: lemmaFromLine("# ''Féminin pluriel de'' {{lien|beau|fr}}."),
      aucun: lemmaFromLine('# Une définition normale, sans lien.'),
    }));
    expect(r.verbe).toBe('manger'); // [[indicatif]] écarté, [[manger]] retenu
    expect(r.pluriel).toBe('cheval');
    expect(r.cible).toBe('appeler'); // la cible du lien, pas le texte affiché « appelle »
    expect(r.lien).toBe('beau'); // repli sur {{lien|…}}
    expect(r.aucun).toBe('');
  });

  test('parseFrWikitext repère une flexion et remonte le mot de base', async ({ page }) => {
    const wt = [
      '== {{langue|fr}} ==',
      '=== {{S|verbe|fr|flexion}} ===',
      "'''mangent'''",
      "# ''Troisième personne du pluriel de l'[[indicatif]] présent de'' [[manger]].",
    ].join('\n');
    const r = await page.evaluate((wt) => parseFrWikitext(wt), wt);
    expect(r.lemmas).toEqual(['manger']);
    expect(r.sections).toHaveLength(1);
    expect(r.sections[0].pos).toBe('Verbe');
  });

  test('un lemme normal (non-flexion) ne remonte aucun mot de base', async ({ page }) => {
    const wt = [
      '== {{langue|fr}} ==',
      '=== {{S|nom|fr}} ===',
      "'''maison'''",
      "# Bâtiment servant de [[logis]], d'[[habitation]].",
    ].join('\n');
    const r = await page.evaluate((wt) => parseFrWikitext(wt), wt);
    expect(r.lemmas).toEqual([]);
    expect(r.sections[0].pos).toBe('Nom');
  });

  test("seule la section française est lue (l'anglais est ignoré)", async ({ page }) => {
    const wt = [
      '== {{langue|en}} ==',
      '=== {{S|nom|en}} ===',
      '# An English sense with a [[wrong]] link.',
      '== {{langue|fr}} ==',
      '=== {{S|verbe|fr|flexion}} ===',
      "# ''Première personne du singulier de'' [[chanter]].",
    ].join('\n');
    const r = await page.evaluate((wt) => parseFrWikitext(wt), wt);
    expect(r.lemmas).toEqual(['chanter']);
  });
});
