# LIANE

Jeu de mots multijoueur en temps réel : relie les lettres pour former des mots.
**100 % côté client** — aucun backend, aucune fonction serverless. Le multijoueur
passe par du **WebRTC pair-à-pair** ([Trystero](https://github.com/dmotz/trystero),
signalisation via relais Nostr publics). C'est donc un simple **site statique**.

## Structure

```
public/                 # tout ce qui est servi en ligne
  index.html            # coquille HTML (~9 Ko) : head + markup + <script src>
  css/styles.css        # tous les styles
  js/app.js             # logique du jeu
  js/vendor/            # trystero.min.js (P2P) + qrcode.min.js
  data/dict.txt.gz      # dictionnaire FR (gzip), chargé et décompressé dans le navigateur
wrangler.jsonc          # config de déploiement Cloudflare (sert le dossier public/)
```

Auparavant tout tenait dans un seul fichier `liane (4).html` de ~567 Ko. Le contenu
est identique ; il est juste réparti dans des fichiers séparés. Le dictionnaire est
désormais un fichier `.gz` externe récupéré par `fetch()` puis décompressé via
`DecompressionStream` (au lieu d'être encodé en base64 dans le HTML).

## Développement local

Comme `app.js` récupère `data/dict.txt.gz` par `fetch()`, **ouvrir `index.html`
directement en `file://` ne marche pas**. Il faut un petit serveur HTTP servant le
dossier `public/` :

```bash
python3 -m http.server 8000 -d public
# puis ouvrir http://localhost:8000
```

## Hébergement — Cloudflare (gratuit)

Le déploiement se fait via **Cloudflare Workers · Static Assets**, piloté par
`wrangler.jsonc` (qui sert le dossier `public/`). Gratuit, y compris pour un repo
privé, avec bande passante illimitée.

### Mise en place (une fois)
1. Merge de la branche sur `main` (Cloudflare déploie la branche de production).
2. Dashboard Cloudflare → **Workers & Pages** → **Create** → **Import a repository**
   → sélectionner `Lupshan/Ang-leBox`.
3. Renseigner :
   - **Project name** : `ang-lebox` *(doit correspondre au `name` de `wrangler.jsonc`)*
   - **Build command** : *(laisser vide — aucun build)*
   - **Deploy command** : `npx wrangler deploy` *(valeur par défaut)*
4. **Deploy**.

Ensuite, **chaque push sur `main` redéploie automatiquement** (les autres branches
génèrent des *preview deployments*).

### Déploiement manuel (optionnel)
```bash
npx wrangler login
npx wrangler deploy
```

### Note sur `dict.txt.gz`
Cloudflare sert le `.gz` tel quel (sans `Content-Encoding: gzip`) et `app.js`
décompresse côté navigateur. Par sécurité, si un hébergeur décompressait le fichier
de manière transparente, `loadDict()` détecte le cas (en-tête gzip `1f 8b`) et
utilise directement le texte — aucune action requise.
