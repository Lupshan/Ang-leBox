# LIANE

Jeu de mots multijoueur en temps réel : relie les lettres pour former des mots.
**100 % côté client** — aucun backend, aucune fonction serverless. Le multijoueur
passe par du **WebRTC pair-à-pair** ([Trystero](https://github.com/dmotz/trystero),
signalisation via relais Nostr publics). C'est donc un simple **site statique** :
il s'héberge n'importe où.

## Structure

```
index.html              # Coquille HTML (~9 Ko) : head + markup + <script src>
css/
  styles.css            # Tous les styles
js/
  app.js                # Logique du jeu
  vendor/
    trystero.min.js     # P2P WebRTC / Nostr (window.Trystero)
    qrcode.min.js       # Générateur de QR code (window.QR)
data/
  dict.txt.gz           # Dictionnaire FR (gzip), chargé et décompressé dans le navigateur
.nojekyll               # Désactive Jekyll (pour GitHub Pages)
```

Auparavant tout tenait dans un seul fichier `liane (4).html` de ~567 Ko. Le contenu
est identique ; il est juste réparti dans des fichiers séparés. Le dictionnaire est
désormais un fichier `.gz` externe récupéré par `fetch()` puis décompressé via
`DecompressionStream` (au lieu d'être encodé en base64 dans le HTML).

## Développement local

Comme `app.js` récupère `data/dict.txt.gz` par `fetch()`, **ouvrir `index.html`
directement en `file://` ne marche pas** (le navigateur bloque `fetch` sur
`file://`). Il faut un petit serveur HTTP :

```bash
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

## Hébergement

Le site est statique et servi depuis la racine du dépôt — n'importe quel
hébergeur statique convient. Recommandations gratuites et plus permissives que
Netlify :

### Cloudflare Pages — le plus permissif (recommandé)
Bande passante et requêtes **illimitées** sur le plan gratuit.
1. https://dash.cloudflare.com → **Workers & Pages** → **Create** → **Pages** →
   **Connect to Git**, choisir ce dépôt.
2. **Build command** : *(vide)* — **Build output directory** : `/` (racine).
3. Déployer. Chaque `push` redéploie automatiquement.

### GitHub Pages — le plus simple (le dépôt est déjà sur GitHub)
Gratuit, aucune configuration de build.
1. Repo → **Settings** → **Pages**.
2. **Source** : *Deploy from a branch* → branche `main`, dossier `/ (root)`.
3. Le fichier `.nojekyll` (déjà présent) évite tout traitement Jekyll.

> Limites indicatives GitHub Pages : ~1 Go de site, ~100 Go/mois de bande
> passante — largement suffisant ici, mais Cloudflare Pages ne plafonne pas.

Netlify continue de fonctionner sans changement (site statique, publish
directory = racine).

### Note sur `dict.txt.gz`
Ces trois hébergeurs servent le `.gz` tel quel (sans `Content-Encoding: gzip`),
et `app.js` décompresse côté navigateur. Par sécurité, si un hébergeur
décompressait le fichier de manière transparente, `loadDict()` détecte le cas
(en-tête gzip `1f 8b`) et utilise directement le texte — aucune action requise.
