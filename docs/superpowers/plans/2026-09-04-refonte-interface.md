# Refonte de l'interface — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refondre l'interface d'avocadobookingcalendar en une vue « agenda d'abord » sombre et éditoriale, en réparant le fond de carte, la normalisation des pays, la lisibilité du calendrier, le parcours mobile et le focus clavier.

**Architecture:** Application d'une seule page, sans build. Le CSS quitte `index.html` pour `styles.css` et se reconstruit autour de jetons. Le JS reste inline dans `index.html`, réorganisé en sections, et passe du défilement par panneaux imbriqués au défilement de document avec une colonne latérale collante.

**Tech Stack:** HTML/CSS/JS natifs, Leaflet 1.9.4 via unpkg, Google Fonts (Archivo variable), tuiles OpenStreetMap, GitHub Pages, scraper Node dans `scraper/`.

**Spec:** `docs/superpowers/specs/2026-09-04-refonte-interface-design.md`

## Global Constraints

- **Aucun build, aucun module ES.** `index.html` doit rester ouvrable en `file://` et déployable tel quel sur GitHub Pages. Interdiction d'ajouter `type="module"`, un `package.json` à la racine, ou une étape de compilation.
- **Pas de tests unitaires front.** Le dépôt n'a pas de harnais et les instructions du projet l'excluent. Le cycle de vérification de chaque tâche est : assertions `node -e` pour la logique de données, puis capture navigateur et lecture de la console pour le visuel.
- **`concerts.js` ne doit jamais être modifié à la main.** Il est régénéré par `.github/workflows/update-concerts.yml`. Toute correction de données se fait dans `scraper/scrape.mjs` **et** dans une couche de normalisation côté page.
- **Contrats à ne pas casser :** le format de l'URL de partage (`?artists=a,b&city=X&countries=A,B`), les clés `localStorage` `avocado_theme`, `avocado_map_hidden`, `avocado_going`, `avocado_known_tours`, et le format de clé de concert `` `${date}|${artist}|${city}` `` produit par `getConcertKey()`.
- **Les deux thèmes sont obligatoires.** Toute couleur se définit en jeton sur `:root` (sombre) et se redéfinit sur `[data-theme="light"]`. Aucune couleur littérale dans les règles de composant.
- **Plancher typographique 14 px** pour le corps. Le 11 px est réservé aux étiquettes en capitales à tracking élargi.
- **Langue de l'interface : anglais.** `lang="en"` sur `<html>`.
- **Références de lignes :** les numéros cités valent pour le commit `98e9403`. Après la première tâche ils bougent. Localiser par le texte d'ancrage cité, pas par le numéro.

---

## Structure des fichiers

| Fichier | Sort | Responsabilité |
|---|---|---|
| `styles.css` | créé, tâche 3 | Tous les styles. Ordre imposé : jetons, base, en-tête, panneaux de filtre, rail des tournées, agenda, carte de concert, colonne latérale, calendrier, carte Leaflet, mes dates, pied de page, ruptures, barre de défilement |
| `index.html` | modifié partout | Balisage et logique. Sections du `<script>` : constantes, état, normalisation, cycle de rendu, agenda, calendrier, carte, filtres, mes dates, partage, ICS, amorçage |
| `scraper/scrape.mjs` | modifié, tâche 1 | Ajout de la normalisation pays et du forçage `https` à la génération |
| `docs/superpowers/plans/` | ce fichier | Plan |

Le JS reste dans un seul bloc `<script>` par décision de conception. Les bannières de section sont la seule structure : le dépôt n'a pas de convention de modules et en introduire une imposerait un serveur local.

---

## Task 1: Normalisation des pays et des URLs d'images

**Files:**
- Modify: `index.html` — bloc de constantes après `WEEKDAYS_FR` (ligne 1268) et `init()` (ligne 1282)
- Modify: `scraper/scrape.mjs` — écriture de `TOUR_IMAGES` (ligne 322) et construction de l'objet concert (ligne 275)
- Test: aucun fichier de test. Assertions `node -e` en ligne de commande

**Interfaces:**
- Consumes: rien
- Produces:
  - `const COUNTRY_FIX: Record<string,string>` dans `index.html`
  - `function normalizeCountry(name: string): string`
  - `function normalizeData(): void`, appelée en **première ligne** de `init()`, qui réécrit `c.country` sur place dans `CONCERTS_DATA` et force `https` sur `TOUR_IMAGES[].imageUrl`
  - `function httpsUrl(u: string): string`

- [ ] **Step 1: Écrire l'assertion qui échoue**

Créer le script de vérification jetable :

```bash
cat > /tmp/verif-pays.mjs <<'EOF'
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const html = readFileSync('index.html', 'utf8');
const m = html.match(/const COUNTRY_FIX = \{[\s\S]*?\};/);
if (!m) { console.error('ECHEC: COUNTRY_FIX absent de index.html'); process.exit(1); }

writeFileSync('/tmp/_data.cjs', readFileSync('concerts.js', 'utf8') + '\nmodule.exports={CONCERTS_DATA,TOUR_IMAGES};');
const { CONCERTS_DATA, TOUR_IMAGES } = createRequire(import.meta.url)('/tmp/_data.cjs');

const COUNTRY_FIX = eval(m[0].replace('const COUNTRY_FIX =', '(') + ')');
const norm = (n) => COUNTRY_FIX[n] || n;
const countries = [...new Set(CONCERTS_DATA.map(c => norm(c.country)))].sort();

const villes = ['Paris','Berlin','London','Munich','Milan','Prague','Vienna','Warsaw',
                'Cologne','Dublin','Glasgow','Manchester','Tilburg','Cruise'];
const restes = countries.filter(c => villes.includes(c));
const http = TOUR_IMAGES.filter(t => t.imageUrl.startsWith('http://'));

let ko = 0;
if (countries.length !== 27) { console.error(`ECHEC: ${countries.length} pays au lieu de 27`); ko = 1; }
if (restes.length) { console.error('ECHEC: villes restantes ->', restes.join(', ')); ko = 1; }
if (countries.includes('IRELAND') || countries.includes('IRELEND')) { console.error('ECHEC: variantes IRELAND non fusionnees'); ko = 1; }
if (countries.includes('United Kingdom')) { console.error('ECHEC: United Kingdom non fusionne avec UK'); ko = 1; }
if (http.length) { console.error(`ECHEC: ${http.length} imageUrl en http://`); ko = 1; }
if (ko) process.exit(1);
console.log(`OK: ${countries.length} pays, aucune ville, aucun http://`);
console.log(countries.join(', '));
EOF
```

- [ ] **Step 2: Lancer l'assertion pour vérifier qu'elle échoue**

Run: `node /tmp/verif-pays.mjs`
Expected: FAIL avec `ECHEC: COUNTRY_FIX absent de index.html`

- [ ] **Step 3: Ajouter la table et les fonctions dans `index.html`**

Insérer juste après la ligne `const WEEKDAYS_FR = [...]` :

```js
  // ===== NORMALISATION DES DONNEES =====
  // Le scraper laisse passer des villes dans le champ country, des variantes de casse
  // et un doublon UK / United Kingdom. On corrige au chargement pour que filtres,
  // carte et compteurs soient toujours d'accord entre eux. Corriger uniquement le
  // scraper ne suffirait pas : les lignes deja commitees resteraient fausses.
  const COUNTRY_FIX = {
    'United Kingdom': 'UK', 'IRELAND': 'Ireland', 'IRELEND': 'Ireland',
    'Dublin': 'Ireland', 'Glasgow': 'UK', 'Manchester': 'UK', 'London': 'UK',
    'Tilburg': 'Netherlands', 'Paris': 'France', 'Cologne': 'Germany',
    'Berlin': 'Germany', 'Munich': 'Germany', 'Warsaw': 'Poland',
    'Prague': 'Czech Republic', 'Vienna': 'Austria', 'Milan': 'Italy',
    'Cruise': 'At sea',
  };

  function normalizeCountry(name) {
    return COUNTRY_FIX[name] || name;
  }

  function httpsUrl(u) {
    return typeof u === 'string' ? u.replace(/^http:\/\//i, 'https://') : u;
  }

  function normalizeData() {
    CONCERTS_DATA.forEach(c => { c.country = normalizeCountry(c.country); });
    if (typeof TOUR_IMAGES !== 'undefined') {
      TOUR_IMAGES.forEach(t => { t.imageUrl = httpsUrl(t.imageUrl); });
    }
  }
```

- [ ] **Step 4: Appeler `normalizeData()` en tête de `init()`**

Dans `init()`, la première instruction devient l'appel de normalisation. Remplacer :

```js
  function init() {
    loadTheme();
```

par :

```js
  function init() {
    normalizeData();
    loadTheme();
```

L'ordre compte : `loadFiltersFromURL()` lit un paramètre `countries` qui peut contenir un nom déjà normalisé, et le ruban pays se construit plus bas dans `init()` à partir de `CONCERTS_DATA`.

- [ ] **Step 5: Lancer l'assertion pour vérifier qu'elle passe**

Run: `node /tmp/verif-pays.mjs`
Expected: PASS, `OK: 27 pays, aucune ville, aucun http://`

- [ ] **Step 6: Appliquer la même normalisation dans le scraper**

Dans `scraper/scrape.mjs`, ajouter la table près du haut du fichier, au-dessus de la fonction qui construit les concerts :

```js
// Meme table que dans index.html. La page fait autorite, ceci assainit les donnees futures.
const COUNTRY_FIX = {
  'United Kingdom': 'UK', 'IRELAND': 'Ireland', 'IRELEND': 'Ireland',
  'Dublin': 'Ireland', 'Glasgow': 'UK', 'Manchester': 'UK', 'London': 'UK',
  'Tilburg': 'Netherlands', 'Paris': 'France', 'Cologne': 'Germany',
  'Berlin': 'Germany', 'Munich': 'Germany', 'Warsaw': 'Poland',
  'Prague': 'Czech Republic', 'Vienna': 'Austria', 'Milan': 'Italy',
  'Cruise': 'At sea',
};
const normalizeCountry = (n) => COUNTRY_FIX[n] || n;
const httpsUrl = (u) => typeof u === 'string' ? u.replace(/^http:\/\//i, 'https://') : u;
```

Puis appliquer `normalizeCountry` au champ `country` là où l'objet concert est assemblé, autour de la ligne 275 (repère : `if (soldOut) concert.soldOut = true;`), et `httpsUrl` à `imageUrl` là où `TOUR_IMAGES` est écrit, autour de la ligne 322 (repère : `js += 'const TOUR_IMAGES = [\n';`).

- [ ] **Step 7: Vérifier que le scraper reste syntaxiquement valide**

Run: `node --check scraper/scrape.mjs`
Expected: aucune sortie, code de retour 0

Ne pas exécuter le scraper : il ferait un appel réseau vers avocadobooking.com et réécrirait `concerts.js`.

- [ ] **Step 8: Vérifier visuellement que le ruban pays a maigri**

Ouvrir `index.html` dans le navigateur. Le ruban pays affiche 27 étiquettes au lieu de 43, et aucune ville. Aucune erreur en console.

- [ ] **Step 9: Commit**

```bash
git add index.html scraper/scrape.mjs
git commit -m "fix: normalise les pays et force https sur les images de tournee"
```

---

## Task 2: Suppression du code couleur multi-artistes

**Files:**
- Modify: `index.html` — `COMPARE_COLORS` (1275), `renderActiveFilters` (1394), `renderCarousel` (1437), `renderMap` (1519), `renderCalendar` (1705), `toggleArtistSelection` (2005), `updateArtistSelectLabel` (2031), `buildArtistDropdown` (1965), `loadFiltersFromURL` (2283)

**Interfaces:**
- Consumes: tâche 1
- Produces:
  - `let searchTerms: string[]` — un simple tableau de noms d'artistes en minuscules, plus d'objets `{name, color}`
  - `function matchesArtistFilter(c: Concert): boolean` — vrai si `searchTerms` est vide, ou si l'artiste principal ou un support de `c` contient un des termes

Cette tâche est cross-cutting et doit passer avant toute réécriture visuelle, sinon chaque tâche suivante devrait manipuler les deux formes de `searchTerms`.

- [ ] **Step 1: Introduire le prédicat partagé**

Le même test d'appartenance est aujourd'hui recopié dans `getFilteredConcerts`, `renderMap` et `renderCarousel`, avec des variantes. Le factoriser. Ajouter sous le bloc de normalisation de la tâche 1 :

```js
  function matchesArtistFilter(c) {
    if (searchTerms.length === 0) return true;
    const artist = c.artist.toLowerCase();
    const support = (c.support || '').toLowerCase();
    return searchTerms.some(t => artist.includes(t) || support.includes(t));
  }
```

- [ ] **Step 2: Changer la forme de l'état**

Remplacer :

```js
  let searchTerms = []; // [{ name: 'artist', color: '#6dbf4a' }]
  const COMPARE_COLORS = ['#6dbf4a', '#e67e22', '#3498db', '#e74c3c', '#9b59b6'];
```

par :

```js
  let searchTerms = []; // noms d'artistes en minuscules
```

- [ ] **Step 3: Reporter le changement sur les huit appelants**

`getFilteredConcerts` — remplacer le bloc :

```js
      if (searchTerms.length > 0) {
        const match = searchTerms.some(s => c.artist.toLowerCase().includes(s.name) || c.support.toLowerCase().includes(s.name));
        if (!match) return false;
      }
```

par :

```js
      if (!matchesArtistFilter(c)) return false;
```

`renderMap` — remplacer le même bloc dans le filtre `concertsNoCity` par `if (!matchesArtistFilter(c)) return false;`.

`renderActiveFilters` — la puce d'artiste perd sa pastille de couleur :

```js
    if (searchTerms.length > 0) {
      searchTerms.forEach(name => {
        chips.push({ label: name, clear: () => {
          searchTerms = searchTerms.filter(x => x !== name);
          updateArtistSelectLabel();
          buildArtistDropdown(document.getElementById('artistFilterInput').value);
          render();
        }});
      });
    }
```

`renderCarousel` — la détection d'artiste actif et le clic :

```js
      const artistLower = t.artist.toLowerCase();
      const isActive = searchTerms.some(term => artistLower.includes(term));
      if (isActive) slide.classList.add('active');
```

et dans le gestionnaire de clic, remplacer la branche d'ajout :

```js
        const existIdx = searchTerms.indexOf(artistLower);
        if (existIdx >= 0) {
          searchTerms.splice(existIdx, 1);
        } else {
          searchTerms.push(artistLower);
          const today = new Date(); today.setHours(0,0,0,0);
          const todayStr = today.toISOString().slice(0,10);
          const artistConcerts = CONCERTS_DATA.filter(c =>
            c.artist.toLowerCase().includes(artistLower) ||
            (c.support || '').toLowerCase().includes(artistLower)
          );
          const futureConcerts = artistConcerts.filter(c => c.date >= todayStr);
          const nearest = futureConcerts.length > 0 ? futureConcerts[0] : artistConcerts[0];
          if (nearest) {
            const d = new Date(nearest.date);
            currentMonth = d.getMonth();
            currentYear = d.getFullYear();
          }
        }
```

`matchesArtistFilter` n'est pas utilisable ici : elle teste un concert au regard de `searchTerms`, alors qu'il s'agit de retrouver les concerts d'une vignette donnée avant même que le terme soit ajouté.

La limite `searchTerms.length < COMPARE_COLORS.length`, qui plafonnait la sélection à cinq artistes par manque de couleurs, disparaît : il n'y a plus de raison de plafonner.

`renderCalendar` — supprimer entièrement la branche `if (searchTerms.length > 0)` qui produisait des points colorés par artiste. La tâche 7 réécrit ce rendu de toute façon ; ici, ne garder que la branche `else` à points neutres.

`renderMap`, tracé des tournées — remplacer `color: artist.color` par `color: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()` et le pas de route `html: \`<span style="background:${artist.color}">${i + 1}</span>\`` par `html: \`<span>${i + 1}</span>\``, la couleur passant en CSS sur `.route-step span`. Adapter la boucle : `routeArtists.forEach(name => { ... c.artist.toLowerCase().includes(name) ... })`.

`toggleArtistSelection` et `buildArtistDropdown` — remplacer les recherches `searchTerms.findIndex(s => s.name === x)` par `searchTerms.indexOf(x)` et les tests `searchTerms.some(s => s.name === x)` par `searchTerms.includes(x)`. Supprimer l'attribution de couleur et le plafond de cinq.

`updateArtistSelectLabel` — remplacer `searchTerms.map(s => s.name)` par `searchTerms` directement.

`loadFiltersFromURL` — remplacer :

```js
      names.forEach((name, i) => {
        searchTerms.push({ name: name.toLowerCase(), color: COMPARE_COLORS[i % COMPARE_COLORS.length] });
      });
```

par :

```js
      names.filter(Boolean).forEach(name => searchTerms.push(name.toLowerCase()));
```

et la branche `params.has('artist')` par `searchTerms.push(params.get('artist').toLowerCase());`.

- [ ] **Step 4: Vérifier qu'aucune référence ne subsiste**

Run: `grep -n "COMPARE_COLORS\|\.color\b\|s\.name" index.html`
Expected: aucune ligne. Si `grep` trouve quelque chose, la migration est incomplète.

Run: `grep -c "matchesArtistFilter" index.html`
Expected: au moins 4

- [ ] **Step 5: Vérifier le comportement dans le navigateur**

Ouvrir `index.html`. Sélectionner deux artistes dans le menu déroulant, puis un troisième, puis un sixième : la sélection n'est plus plafonnée à cinq. Les puces de filtre actif affichent les noms sans pastille de couleur. Le tracé de tournée sur la carte est vert. Console sans erreur.

Vérifier l'aller-retour d'URL : cliquer sur le bouton de partage, coller l'URL dans un nouvel onglet, les mêmes artistes sont sélectionnés.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "refactor: searchTerms devient un tableau de noms, retire le code couleur"
```

---

## Task 3: Extraction du CSS et jetons de design

**Files:**
- Create: `styles.css`
- Modify: `index.html` — `<head>` (lignes 1-8), bloc `<style>` (lignes 8-1165), `<html lang>` (ligne 2)

**Interfaces:**
- Consumes: tâches 1 et 2
- Produces: les jetons consommés par toutes les tâches suivantes
  - couleurs : `--bg --surface --surface-2 --border --border-strong --text --text-dim --text-faint --accent --accent-hover --accent-soft --cal-1 --cal-2 --cal-3 --sold-out --today`
  - typo : `--font-sans --font-mono --fs-xs --fs-sm --fs-md --fs-lg --fs-xl --fs-2xl --fs-3xl`
  - espace : `--sp-1 --sp-2 --sp-3 --sp-4 --sp-6 --sp-8 --sp-12 --sp-16`
  - rayons : `--r-sm --r-md --r-lg`
  - gabarit : `--header-h --sidebar-w`

Cette tâche se fait en deux mouvements séparés pour rester relisible : d'abord un déplacement sans changement, ensuite le remplacement des jetons.

- [ ] **Step 1: Déplacer le CSS sans le changer**

Extraire le contenu exact du bloc `<style>` (de la ligne suivant `<style>` jusqu'à celle précédant `</style>`) dans `styles.css`, en retirant l'indentation de quatre espaces. Supprimer les balises `<style>` et `</style>` de `index.html`.

Dans le `<head>`, après la feuille Leaflet, ajouter :

```html
  <link rel="stylesheet" href="styles.css">
```

- [ ] **Step 2: Vérifier que le rendu est inchangé**

Ouvrir `index.html`. La page est visuellement identique à avant l'extraction, dans les deux thèmes. Console sans erreur, aucun 404 sur `styles.css` dans l'onglet réseau.

Run: `grep -c "<style>" index.html`
Expected: `0`

- [ ] **Step 3: Commit du déplacement seul**

```bash
git add index.html styles.css
git commit -m "refactor: extrait le CSS dans styles.css sans changement de rendu"
```

Ce commit séparé est ce qui rend le suivant relisible : sans lui, le diff mélangerait 1150 lignes déplacées et 1150 lignes réécrites.

- [ ] **Step 4: Remplacer le bloc de jetons**

Remplacer les deux blocs `:root` et `[data-theme="light"]` en tête de `styles.css` par :

```css
/* ===== JETONS ===== */
:root {
  /* couleurs, theme sombre par defaut */
  --bg: #0c0b0a;
  --surface: #14130f;
  --surface-2: #1d1b16;
  --border: #2a2721;
  --border-strong: #3d3a32;
  --text: #f2efe6;
  --text-dim: #a8a29a;
  --text-faint: #837d73;
  --accent: #8fd14f;
  --accent-hover: #a3dd6b;
  --accent-soft: rgba(143, 209, 79, .14);
  --cal-1: rgba(143, 209, 79, .12);
  --cal-2: rgba(143, 209, 79, .26);
  --cal-3: rgba(143, 209, 79, .42);
  --sold-out: #e0533d;
  --today: rgba(255, 255, 255, .06);
  --on-accent: #0c0b0a;

  /* typographie */
  --font-sans: 'Archivo', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-mono: ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace;
  --fs-xs: 0.6875rem;
  --fs-sm: 0.75rem;
  --fs-md: 0.875rem;
  --fs-lg: 1rem;
  --fs-xl: 1.25rem;
  --fs-2xl: 1.75rem;
  --fs-3xl: 2.5rem;

  /* espacement, base 4 */
  --sp-1: 4px;
  --sp-2: 8px;
  --sp-3: 12px;
  --sp-4: 16px;
  --sp-6: 24px;
  --sp-8: 32px;
  --sp-12: 48px;
  --sp-16: 64px;

  /* rayons */
  --r-sm: 4px;
  --r-md: 8px;
  --r-lg: 14px;

  /* gabarit */
  --header-h: 56px;
  --sidebar-w: 380px;

  color-scheme: dark;
}

[data-theme="light"] {
  --bg: #f7f5ef;
  --surface: #ffffff;
  --surface-2: #efece3;
  --border: #ddd8cc;
  --border-strong: #c7c0b0;
  --text: #17150f;
  --text-dim: #5c574d;
  --text-faint: #7d776b;
  --accent: #4f8f22;
  --accent-hover: #3f7519;
  --accent-soft: rgba(79, 143, 34, .12);
  --cal-1: rgba(79, 143, 34, .10);
  --cal-2: rgba(79, 143, 34, .22);
  --cal-3: rgba(79, 143, 34, .36);
  --sold-out: #c03a22;
  --today: rgba(0, 0, 0, .05);
  --on-accent: #ffffff;

  color-scheme: light;
}
```

- [ ] **Step 5: Faire suivre les anciens noms de jetons**

Les règles existantes utilisent `--text-muted`, `--surface2`, `--available`, `--available-border` et `--concert-dot`, qui ne sont plus définis. Les renommer partout dans `styles.css` :

Run:
```bash
sed -i '' \
  -e 's/var(--text-muted)/var(--text-dim)/g' \
  -e 's/var(--surface2)/var(--surface-2)/g' \
  -e 's/var(--available-border)/var(--accent)/g' \
  -e 's/var(--available)/var(--accent-soft)/g' \
  -e 's/var(--concert-dot)/var(--accent)/g' \
  -e 's/var(--accent-bg)/var(--accent-soft)/g' \
  styles.css
```

Puis vérifier qu'aucun jeton mort ne reste :

Run: `grep -n "text-muted\|surface2\|--available\|concert-dot\|accent-bg" styles.css index.html`
Expected: aucune ligne

- [ ] **Step 6: Interdire les couleurs littérales dans les règles de composant**

Run: `grep -nE "^[^-].*:\s*(#[0-9a-fA-F]{3,8}|rgba?\()" styles.css | grep -v "^[0-9]*:\s*--"`
Expected: seules des lignes appartenant au bloc de jetons, aux dégradés de lisibilité, ou aux ombres. Toute couleur de composant restante doit être remplacée par un jeton. Consigner dans le message de commit celles qui sont volontairement littérales.

- [ ] **Step 7: Vérifier les deux thèmes**

Ouvrir `index.html`. La page adopte la palette noir chaud. Basculer le thème avec le bouton `☀` : la palette claire s'applique, aucun élément ne devient illisible, aucun texte ne disparaît. Recharger : le thème choisi persiste. Console sans erreur.

- [ ] **Step 8: Commit**

```bash
git add styles.css index.html
git commit -m "feat: reconstruit le CSS sur des jetons de design, palette noir chaud"
```

---

## Task 4: Typographie

**Files:**
- Modify: `index.html` — `<head>`, attribut `lang`
- Modify: `styles.css` — règle `body` et toutes les déclarations `font-size`

**Interfaces:**
- Consumes: jetons de la tâche 3
- Produces: classes utilitaires `.u-display` (condensée, capitales, tracking serré) et `.u-mono` (mono, capitales, tracking élargi), utilisées par les tâches 6, 7 et 9

- [ ] **Step 1: Charger Archivo et corriger la langue**

Dans `index.html`, remplacer `<html lang="fr">` par `<html lang="en">`.

Dans le `<head>`, avant le lien vers `styles.css` :

```html
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&display=swap">
```

- [ ] **Step 2: Poser la base typographique**

Dans `styles.css`, remplacer la règle `body` par :

```css
body {
  font-family: var(--font-sans);
  font-size: var(--fs-md);
  line-height: 1.45;
  background: var(--bg);
  color: var(--text);
  -webkit-font-smoothing: antialiased;

  /* conserve tel quel jusqu'a la tache 5, qui passe au defilement de document */
  height: 100vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
```

`height`, `overflow` et `display` sont volontairement conservés ici. Les retirer maintenant casserait la disposition et cette tâche se terminerait sur un état non vérifiable. C'est la tâche 5 qui les supprime, en même temps qu'elle reconstruit la grille.

Ajouter les deux utilitaires :

```css
.u-display {
  font-family: var(--font-sans);
  font-stretch: 75%;
  font-weight: 700;
  letter-spacing: -0.01em;
  text-transform: uppercase;
  line-height: 1.05;
}

.u-mono {
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-dim);
}
```

- [ ] **Step 3: Remonter toutes les tailles sous le plancher**

Lister les tailles actuellement sous 14 px :

Run: `grep -nE "font-size:\s*1[0-3]px" styles.css`

Pour chaque ligne trouvée, appliquer la règle de conversion :

| Ancienne valeur | Nouveau jeton |
|---|---|
| `10px`, `11px` sur une étiquette en capitales | `var(--fs-xs)` |
| `10px`, `11px` sur du texte en casse normale | `var(--fs-sm)` |
| `12px` | `var(--fs-sm)` |
| `13px` | `var(--fs-md)` |

Puis convertir les tailles au-dessus :

| Ancienne valeur | Nouveau jeton |
|---|---|
| `14px`, `15px` | `var(--fs-md)` |
| `16px`, `18px` | `var(--fs-lg)` |
| `20px`, `22px` | `var(--fs-xl)` |
| `24px` et plus | `var(--fs-2xl)` |

- [ ] **Step 4: Vérifier qu'aucune taille littérale ne reste**

Run: `grep -nE "font-size:\s*[0-9]" styles.css`
Expected: aucune ligne. Toutes les tailles passent par un jeton.

- [ ] **Step 5: Vérifier le plancher dans le navigateur**

Ouvrir `index.html`, puis dans la console :

```js
[...document.querySelectorAll('*')]
  .filter(el => el.children.length === 0 && el.textContent.trim())
  .map(el => parseFloat(getComputedStyle(el).fontSize))
  .filter(s => s < 11)
```

Expected: tableau vide. Aucun texte final ne descend sous 11 px.

Vérifier aussi qu'Archivo est bien appliqué :

```js
getComputedStyle(document.body).fontFamily
```

Expected: la chaîne commence par `Archivo`.

- [ ] **Step 6: Commit**

```bash
git add index.html styles.css
git commit -m "feat: echelle typographique Archivo, plancher de corps a 14px"
```

---

## Task 5: Ossature agenda d'abord

**Files:**
- Modify: `index.html` — balisage du `<body>` (lignes 1167-1261), suppression de `toggleStats` (2045) et `renderStats` (2050), appel dans `render()` (1382)
- Modify: `styles.css` — sections `MAIN CONTENT`, `BOTTOM PANEL`, `COUNTRY RIBBON`, blocs `stat-*`

**Interfaces:**
- Consumes: jetons tâche 3, utilitaires tâche 4
- Produces: identifiants et classes sur lesquels les tâches 6 à 11 s'appuient
  - `#agendaList` — conteneur de l'agenda, remplace `#concertList`
  - `#sidebar` — colonne latérale collante
  - `#mapPanel`, `#calendarPanel` — les deux blocs de la colonne latérale
  - `.agenda-month` — en-tête de mois collant
  - `--header-h` et `--sidebar-w` comme seules sources de vérité du gabarit

- [ ] **Step 1: Retirer le panneau statistiques et le ruban pays**

Dans `index.html`, supprimer :

- le bouton `<button class="btn-icon" onclick="toggleStats()" title="Statistics">&#128202;</button>` (ligne 1188)
- le bloc `<div class="country-ribbon">` complet (lignes 1209-1212)
- le bloc `<div class="stats-panel" id="statsPanel">` complet (lignes 1215-1217)

Dans le `<script>`, supprimer les fonctions `toggleStats()` et `renderStats()` en entier, ainsi que le bloc d'`init()` qui construit les étiquettes pays :

```js
    // Country tags
    const container = document.getElementById('countryFilters');
    [...countries].sort().forEach(country => { ... });
```

Conserver en revanche le calcul de `countries`, dont la tâche 9 a besoin pour le panneau de filtre, et les trois compteurs `totalConcerts`, `totalArtists`, `totalCountries`.

Dans `styles.css`, supprimer la section `/* ===== COUNTRY RIBBON ===== */` et toutes les règles `.stats-panel`, `.stats-inner`, `.stat-block`, `.stat-bar`, `.stat-bar-row`, `.stat-bar-label`, `.stat-bar-fill`, `.stat-bar-value`.

- [ ] **Step 2: Vérifier qu'aucune référence morte ne subsiste**

Run: `grep -n "toggleStats\|renderStats\|statsPanel\|statsInner\|countryFilters\|country-ribbon\|stat-bar\|stat-block" index.html styles.css`
Expected: aucune ligne

- [ ] **Step 3: Restructurer le balisage**

Remplacer tout le bloc allant de `<div class="main-content">` à son `</div>` fermant (lignes 1226-1261) par :

```html
<main class="layout">

  <div class="agenda">
    <div class="tour-rail" id="tourCarousel"></div>
    <div class="agenda-head">
      <h2 id="concertTitle">Concerts</h2>
      <span class="agenda-count" id="concertCount" aria-live="polite">0</span>
    </div>
    <div class="agenda-list" id="agendaList"></div>
  </div>

  <aside class="sidebar" id="sidebar">
    <section class="side-panel" id="mapPanel">
      <div id="leafletMap"></div>
      <div class="map-city-filter" id="mapCityFilter">
        <span id="mapCityLabel"></span>
        <button onclick="selectedCity=null;render();" aria-label="Clear city filter">&times;</button>
      </div>
      <div class="road-trip-summary" id="roadTripSummary" hidden></div>
    </section>

    <section class="side-panel" id="calendarPanel">
      <div class="calendar-nav">
        <button class="nav-btn" onclick="changeMonth(-1)" aria-label="Previous months">&#9664;</button>
        <h3 id="currentMonth"></h3>
        <button class="nav-btn" onclick="changeMonth(1)" aria-label="Next months">&#9654;</button>
      </div>
      <div class="calendar-months" id="calendar3months"></div>
      <div class="calendar-legend" id="calendarLegend"></div>
    </section>
  </aside>

</main>
```

L'identifiant `calendar3months` est conservé pour ne pas casser `renderCalendar`, que la tâche 7 réécrit. `#concertList` devient `#agendaList` : la tâche 6 met `renderConcertList` en accord.

Le `roadTripSummary` passe de `style="display:none;"` à l'attribut `hidden`, plus propre. Adapter les deux lignes de `renderMap` qui le pilotent : `tripPanel.hidden = false;` et `tripPanel.hidden = true;` au lieu de `style.display`.

- [ ] **Step 4: Écrire la disposition**

D'abord libérer le `body` du défilement par panneaux, ce que la tâche 4 avait volontairement laissé en place. Retirer de la règle `body` les quatre déclarations `height: 100vh`, `overflow: hidden`, `display: flex` et `flex-direction: column`, ainsi que le commentaire qui les annonçait.

Puis, dans `styles.css`, remplacer les sections `MAIN CONTENT` et `BOTTOM PANEL` par :

```css
/* ===== OSSATURE ===== */
.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) var(--sidebar-w);
  gap: var(--sp-6);
  max-width: 1600px;
  margin: 0 auto;
  padding: var(--sp-6) var(--sp-6) var(--sp-16);
  align-items: start;
}

.agenda {
  min-width: 0;
}

.agenda-head {
  display: flex;
  align-items: baseline;
  gap: var(--sp-3);
  margin-bottom: var(--sp-4);
}

.agenda-head h2 {
  font-stretch: 75%;
  font-weight: 700;
  font-size: var(--fs-xl);
  text-transform: uppercase;
  letter-spacing: -0.01em;
}

.agenda-count {
  font-family: var(--font-mono);
  font-size: var(--fs-sm);
  color: var(--accent);
}

/* en-tete de mois collant dans l'agenda */
.agenda-month {
  position: sticky;
  top: var(--header-h);
  z-index: 3;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-3);
  margin: var(--sp-8) 0 var(--sp-4);
  padding: var(--sp-2) 0;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
}

.agenda-month:first-child {
  margin-top: 0;
}

.agenda-month .month-name {
  font-stretch: 62%;
  font-weight: 700;
  font-size: var(--fs-3xl);
  text-transform: uppercase;
  letter-spacing: -0.02em;
  line-height: 1;
}

.agenda-month .month-count {
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-faint);
  white-space: nowrap;
}

/* separateur de jour */
.date-separator {
  position: sticky;
  top: calc(var(--header-h) + 44px);
  z-index: 2;
  padding: var(--sp-2) 0 var(--sp-1);
  background: var(--bg);
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-dim);
}

/* ===== COLONNE LATERALE ===== */
.sidebar {
  position: sticky;
  top: calc(var(--header-h) + var(--sp-6));
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  min-width: 0;
}

.side-panel {
  position: relative;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  overflow: hidden;
}

#leafletMap {
  height: 46vh;
  min-height: 280px;
  width: 100%;
}
```

L'en-tête garde `position: sticky; top: 0` et devient la référence de `--header-h`. Dans `styles.css`, section `TOOLBAR`, ajouter à `.toolbar` :

```css
  position: sticky;
  top: 0;
  height: var(--header-h);
```

et retirer `flex-shrink: 0`, qui n'a plus de sens hors du `body` en flex.

- [ ] **Step 5: Mettre `renderConcertList` en accord avec le nouvel identifiant**

Dans `renderConcertList`, remplacer `document.getElementById('concertList')` par `document.getElementById('agendaList')`, et supprimer la dernière ligne `list.scrollTop = 0;` : la liste ne défile plus indépendamment, c'est le document qui défile.

- [ ] **Step 6: Vérifier la disposition**

Ouvrir `index.html` en 1440 px de large.

Attendu :
- l'agenda occupe la colonne large, la carte et le calendrier la colonne de 380 px à droite
- au défilement de la page, l'en-tête reste en haut et la colonne latérale reste visible
- aucune barre de défilement interne dans l'agenda : c'est la page qui défile
- ni ruban pays ni bouton statistiques
- console sans erreur

Vérifier la valeur de gabarit :

```js
getComputedStyle(document.documentElement).getPropertyValue('--sidebar-w')
```

Expected: ` 380px`

- [ ] **Step 7: Commit**

```bash
git add index.html styles.css
git commit -m "feat: ossature agenda d'abord, defilement de document et colonne collante"
```

---

## Task 6: Carte de concert, cartes festival et rail des tournées

**Files:**
- Modify: `index.html` — `renderConcertList` (1819), `getCountdownBadge` (1901), `createConcertCard` (1913), `renderCarousel` (1437)
- Modify: `styles.css` — sections `TOUR CAROUSEL`, règles `.concert-card`, `.concert-date`, `.concert-info`, `.concert-actions`, `.festival-card`, `.badge-*`, `.btn-ticket`, `.btn-spotify`, `.btn-going`

**Interfaces:**
- Consumes: `#agendaList`, `.agenda-month`, `.date-separator` (tâche 5), `.u-mono` (tâche 4)
- Produces:
  - `function escapeHtml(s: string): string`
  - délégation d'événements : un unique écouteur `click` sur `#agendaList` qui lit `data-action` et `data-key` sur l'élément cliqué. Les tâches 9 et 11 réutilisent ce mécanisme.
  - `data-action="going"` avec `data-key="<clé de concert>"`

- [ ] **Step 1: Remplacer les `onclick` inline par de la délégation**

Les gabarits actuels interpolent une clé de concert dans un attribut `onclick`, en n'échappant que l'apostrophe. Un nom de salle contenant un guillemet double casserait le balisage. La délégation supprime la classe entière de problème.

Ajouter, sous les fonctions de normalisation :

```js
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
```

Dans `init()`, après le premier `render()`, brancher l'écouteur unique :

```js
    document.getElementById('agendaList').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      if (btn.dataset.action === 'going') {
        e.stopPropagation();
        toggleGoing(btn.dataset.key);
      }
    });
```

- [ ] **Step 2: Réécrire `createConcertCard`**

```js
  function createConcertCard(c) {
    const d = new Date(c.date + 'T00:00:00');
    const mn = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    const key = getConcertKey(c);
    const isGoing = goingSet.has(key);

    const card = document.createElement('article');
    card.className = 'concert-card' + (c.soldOut ? ' is-sold-out' : '') + (isGoing ? ' is-going' : '');

    card.innerHTML = `
      <div class="cc-date">
        <span class="cc-month">${mn[d.getMonth()]}</span>
        <span class="cc-day">${d.getDate()}</span>
        <span class="cc-weekday">${DAYS_FR[(d.getDay() + 6) % 7]}</span>
      </div>
      <div class="cc-body">
        <h3 class="cc-artist">${escapeHtml(c.artist)}</h3>
        ${c.tour ? `<div class="cc-tour">${escapeHtml(c.tour)}</div>` : ''}
        <div class="cc-venue">${escapeHtml(c.venue)} &middot; ${escapeHtml(c.city)}, ${escapeHtml(c.country)}</div>
        ${c.support ? `<div class="cc-support">${c.support.split(',').map(s => `<span class="cc-chip">${escapeHtml(s.trim())}</span>`).join('')}</div>` : ''}
      </div>
      <div class="cc-actions">
        ${getCountdownBadge(c.date)}
        ${c.soldOut ? '<span class="badge badge-sold">Sold out</span>' : ''}
        <button class="btn-going${isGoing ? ' active' : ''}" data-action="going" data-key="${escapeHtml(key)}"
                aria-label="${isGoing ? 'Remove from my concerts' : 'Add to my concerts'}"
                aria-pressed="${isGoing}">${isGoing ? '&#9829;' : '&#9825;'}</button>
        <a class="btn-spotify" href="https://open.spotify.com/search/${encodeURIComponent(c.artist)}"
           target="_blank" rel="noopener">Spotify</a>
        ${c.ticketUrl ? `<a class="btn-ticket" href="${escapeHtml(c.ticketUrl)}" target="_blank" rel="noopener">Tickets</a>` : ''}
      </div>
    `;
    return card;
  }
```

`DAYS_FR` contient `['Mon',...,'Sun']` indexé lundi en premier, d'où la conversion `(getDay() + 6) % 7`. Ne pas utiliser `WEEKDAYS_FR`, qui donne le nom complet indexé dimanche en premier et déborderait du bloc de 64 px.

- [ ] **Step 3: Réécrire `getCountdownBadge` en pilules mono**

```js
  function getCountdownBadge(dateStr) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const concert = new Date(dateStr + 'T00:00:00');
    const diff = Math.round((concert - today) / 86400000);
    if (diff < 0) return '';
    if (diff === 0) return '<span class="badge badge-now">Today</span>';
    if (diff === 1) return '<span class="badge badge-soon">Tomorrow</span>';
    if (diff <= 30) return `<span class="badge badge-soon">In ${diff} days</span>`;
    return '';
  }
```

Les deux branches `diff <= 7` et `diff <= 30` de la version actuelle renvoient exactement le même balisage : elles sont fusionnées.

- [ ] **Step 4: Grouper l'agenda par mois puis par jour**

Dans `renderConcertList`, remplacer la boucle de rendu par une double rupture. Remplacer :

```js
    let currentGroup = '';
    displayed.forEach(c => {
```

par :

```js
    let currentMonthKey = '';
    let currentGroup = '';
    const monthTotals = {};
    displayed.forEach(c => { const k = c.date.slice(0, 7); monthTotals[k] = (monthTotals[k] || 0) + 1; });

    displayed.forEach(c => {
      const monthKey = c.date.slice(0, 7);
      if (monthKey !== currentMonthKey) {
        currentMonthKey = monthKey;
        const [my, mm] = monthKey.split('-');
        const head = document.createElement('div');
        head.className = 'agenda-month';
        const n = monthTotals[monthKey];
        head.innerHTML = `<span class="month-name">${MONTHS_FR[+mm - 1]} ${my}</span>` +
                         `<span class="month-count">${n} date${n > 1 ? 's' : ''}</span>`;
        list.appendChild(head);
        currentGroup = '';
      }
```

Le reste de la boucle est conservé, en veillant à ce que le `forEach` ne soit pas ouvert deux fois : la ligne `displayed.forEach(c => {` d'origine est remplacée, pas dupliquée.

Le séparateur de jour passe en format court :

```js
      const d = new Date(c.date + 'T00:00:00');
      const dayStr = `${WEEKDAYS_FR[d.getDay()]} ${d.getDate()}`;
```

- [ ] **Step 5: Réécrire la carte festival**

Remplacer le gabarit de `fCard.innerHTML` par :

```js
        fCard.innerHTML = `
          <div class="fc-head">
            <span class="badge badge-fest">Festival</span>
            ${getCountdownBadge(c.date)}
          </div>
          <h3 class="fc-name">${escapeHtml(c.venue)}</h3>
          <div class="fc-meta">${escapeHtml(c.city)}, ${escapeHtml(c.country)}</div>
          <div class="fc-lineup">${group.map(g => {
            const gk = getConcertKey(g);
            const gGoing = goingSet.has(gk);
            return `<span class="fc-chip${gGoing ? ' active' : ''}">${escapeHtml(g.artist)}` +
                   `<button class="btn-going${gGoing ? ' active' : ''}" data-action="going" data-key="${escapeHtml(gk)}"` +
                   ` aria-label="${gGoing ? 'Remove from my concerts' : 'Add to my concerts'}"` +
                   ` aria-pressed="${gGoing}">${gGoing ? '&#9829;' : '&#9825;'}</button></span>`;
          }).join('')}</div>
          ${group[0].ticketUrl ? `<div class="fc-cta"><a class="btn-ticket" href="${escapeHtml(group[0].ticketUrl)}" target="_blank" rel="noopener">Tickets</a></div>` : ''}
        `;
```

Supprimer la ligne suivante qui ajoutait le bouton en concaténant `fCard.innerHTML +=` : le lien est désormais dans le gabarit.

- [ ] **Step 6: Réécrire le rail des tournées**

Trier les nouveautés en tête et forcer `https` à l'affichage. Remplacer le début de `renderCarousel` par :

```js
  function renderCarousel() {
    const container = document.getElementById('tourCarousel');
    if (!container || typeof TOUR_IMAGES === 'undefined' || !TOUR_IMAGES.length) return;
    container.innerHTML = '';

    // Les nouveautes passent en tete : getNewTours() reecrit avocado_known_tours a chaque
    // appel, donc un rail limite aux nouveautes serait vide des la deuxieme visite.
    const ordered = [...TOUR_IMAGES].sort((a, b) =>
      (newTours.has(b.artist) ? 1 : 0) - (newTours.has(a.artist) ? 1 : 0));

    ordered.forEach(t => {
      const slide = document.createElement('button');
      slide.type = 'button';
      slide.className = 'tour-slide';
      const artistLower = t.artist.toLowerCase();
      if (searchTerms.some(term => artistLower.includes(term))) slide.classList.add('active');
      slide.innerHTML = `
        <img src="${escapeHtml(httpsUrl(t.imageUrl))}" alt="" loading="lazy">
        <span class="slide-label">${escapeHtml(t.artist)}</span>
        ${newTours.has(t.artist) ? '<span class="badge badge-new">New</span>' : ''}
      `;
```

La vignette devient un `<button type="button">` pour être atteignable au clavier. `alt=""` est correct : le libellé texte juste à côté porte déjà l'information, donc l'image est décorative.

Le reste du gestionnaire de clic est celui de la tâche 2. Conserver le défilement automatique, mais l'encadrer par la préférence de mouvement :

```js
    if (carouselInterval) clearInterval(carouselInterval);
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      carouselInterval = setInterval(() => {
        if (container.matches(':hover, :focus-within')) return;
        const maxScroll = container.scrollWidth - container.clientWidth;
        if (container.scrollLeft >= maxScroll - 10) container.scrollTo({ left: 0, behavior: 'smooth' });
        else container.scrollBy({ left: 240, behavior: 'smooth' });
      }, 4000);
    }
```

- [ ] **Step 7: Écrire les styles**

Ajouter dans `styles.css`, en remplacement des règles `.concert-card`, `.concert-date`, `.concert-info`, `.concert-actions`, `.festival-card` et de la section `TOUR CAROUSEL` :

```css
/* ===== CARTE DE CONCERT ===== */
.concert-card {
  position: relative;
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr) auto;
  gap: var(--sp-4);
  align-items: start;
  padding: var(--sp-4) var(--sp-4) var(--sp-4) var(--sp-3);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  background: var(--surface);
  margin-bottom: var(--sp-2);
  transition: border-color .15s, background .15s;
}

.concert-card::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  border-radius: var(--r-md) 0 0 var(--r-md);
  background: transparent;
  transition: background .15s;
}

.concert-card:hover { border-color: var(--border-strong); }
.concert-card:hover::before,
.concert-card.is-going::before { background: var(--accent); }
.concert-card.is-sold-out::before { background: var(--sold-out); }

.cc-date {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 2px;
}

.cc-month, .cc-weekday {
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  letter-spacing: 0.08em;
  color: var(--text-faint);
}

.cc-day {
  font-stretch: 75%;
  font-weight: 700;
  font-size: var(--fs-2xl);
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
  color: var(--text);
}

.cc-body { min-width: 0; }

.cc-artist {
  font-stretch: 75%;
  font-weight: 700;
  font-size: var(--fs-xl);
  text-transform: uppercase;
  letter-spacing: -0.01em;
  line-height: 1.15;
  overflow-wrap: anywhere;
}

.cc-tour {
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-faint);
  margin-top: var(--sp-1);
}

.cc-venue {
  font-size: var(--fs-md);
  color: var(--text-dim);
  margin-top: var(--sp-2);
}

.cc-support {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-1);
  margin-top: var(--sp-2);
}

.cc-chip {
  font-size: var(--fs-sm);
  color: var(--text-dim);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  padding: 2px var(--sp-2);
}

.cc-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--sp-2);
}

/* ===== BADGES ===== */
.badge {
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 3px var(--sp-2);
  border-radius: var(--r-sm);
  white-space: nowrap;
}

.badge-now { background: var(--accent); color: var(--on-accent); }
.badge-soon { background: var(--accent-soft); color: var(--accent); }
.badge-sold { background: var(--sold-out); color: #fff; }
.badge-fest { background: var(--surface-2); color: var(--text-dim); border: 1px solid var(--border); }
.badge-new { background: var(--accent); color: var(--on-accent); }

/* ===== CARTE FESTIVAL ===== */
.festival-card {
  padding: var(--sp-4);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-md);
  background: var(--surface);
  margin-bottom: var(--sp-2);
}

.fc-head {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  margin-bottom: var(--sp-2);
}

.fc-name {
  font-stretch: 75%;
  font-weight: 700;
  font-size: var(--fs-xl);
  text-transform: uppercase;
  letter-spacing: -0.01em;
}

.fc-meta {
  font-size: var(--fs-md);
  color: var(--text-dim);
  margin-top: var(--sp-1);
}

.fc-lineup {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
  margin-top: var(--sp-3);
}

.fc-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
  font-size: var(--fs-md);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  padding: var(--sp-1) var(--sp-2);
}

.fc-chip.active { border-color: var(--accent); }
.fc-cta { margin-top: var(--sp-3); }

/* ===== RAIL DES TOURNEES ===== */
.tour-rail {
  display: flex;
  gap: var(--sp-3);
  overflow-x: auto;
  scroll-snap-type: x proximity;
  padding-bottom: var(--sp-2);
  margin-bottom: var(--sp-6);
}

.tour-slide {
  position: relative;
  flex: 0 0 240px;
  aspect-ratio: 16 / 9;
  scroll-snap-align: start;
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  overflow: hidden;
  padding: 0;
  background: var(--surface-2);
  cursor: pointer;
  text-align: left;
}

.tour-slide.active { border-color: var(--accent); }

.tour-slide img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

/* degrade de lisibilite : le libelle doit rester lisible sur n'importe quelle image */
.tour-slide .slide-label {
  position: absolute;
  inset: auto 0 0 0;
  padding: var(--sp-4) var(--sp-2) var(--sp-2);
  font-stretch: 75%;
  font-weight: 700;
  font-size: var(--fs-md);
  text-transform: uppercase;
  color: #f2efe6;
  background: linear-gradient(to top, rgba(0, 0, 0, .88), rgba(0, 0, 0, 0));
}

.tour-slide .badge-new {
  position: absolute;
  top: var(--sp-2);
  left: var(--sp-2);
}
```

- [ ] **Step 8: Vérifier**

Ouvrir `index.html` en 1440 px.

Attendu :
- l'agenda affiche un en-tête de mois en très grand condensé, avec son nombre de dates, collant au défilement
- chaque carte porte le bloc date à gauche, le nom d'artiste en 20 px condensé, la tournée en mono, la salle en 14 px
- le filet gauche s'allume en vert au survol
- un clic sur le cœur bascule l'état, le compteur de l'en-tête s'incrémente, et le filet reste vert
- une carte festival affiche l'étiquette `Festival` et son plateau en puces
- le rail affiche des vignettes 16:9, les nouveautés badgées `New` en tête, le libellé lisible sur toutes les images
- console sans erreur

Vérifier que la délégation ne dépend plus d'`onclick` :

Run: `grep -c "onclick=\"toggleGoing" index.html`
Expected: `0`

Vérifier qu'un guillemet dans une donnée ne casse rien, dans la console :

```js
document.querySelectorAll('#agendaList [data-action="going"]').length
```

Expected: un nombre égal au nombre de cartes plus les puces de plateau, et non `0`.

- [ ] **Step 9: Commit**

```bash
git add index.html styles.css
git commit -m "feat: refonte des cartes de concert, festival et du rail des tournees"
```

---

## Task 7: Calendrier à paliers de densité

**Files:**
- Modify: `index.html` — `renderCalendar` (1705), légende (1246-1249 avant la tâche 5)
- Modify: `styles.css` — règles `.calendar-*`, `.month-block`, `.day-header`, `.calendar-day`, `.day-number`, suppression de `.concert-dots`, `.concert-dot`, `.day-dot`

**Interfaces:**
- Consumes: `--cal-1 --cal-2 --cal-3 --sold-out` (tâche 3), `#calendar3months` et `#calendarLegend` (tâche 5)
- Produces: classes de palier `.d-1 .d-2 .d-3` sur `.calendar-day`, utilisées seulement par la feuille de style

- [ ] **Step 1: Réécrire le rendu des cases**

Dans `renderCalendar`, remplacer tout le bloc allant de `const num = document.createElement('div');` jusqu'à `cell.appendChild(dots);` inclus par :

```js
        const num = document.createElement('span');
        num.className = 'day-number';
        num.textContent = d;
        cell.appendChild(num);

        // Palier de densite : le nombre de dates se lit au fond de la case, pas en points.
        const n = matchingFiltered.length;
        if (n >= 4) cell.classList.add('d-3');
        else if (n >= 2) cell.classList.add('d-2');
        else if (n === 1) cell.classList.add('d-1');

        if (matchingFiltered.some(x => x.soldOut)) cell.classList.add('has-sold-out');

        if (n > 0) {
          cell.setAttribute('aria-label', `${d} ${MONTHS_FR[m]}: ${n} date${n > 1 ? 's' : ''}`);
        }
```

Supprimer la classe `has-concerts`, désormais redondante avec les paliers, ainsi que ses règles CSS.

- [ ] **Step 2: Passer les cases et les en-têtes en éléments atteignables**

Remplacer la création de la case :

```js
        const cell = document.createElement('div');
```

par :

```js
        const cell = document.createElement('button');
        cell.type = 'button';
```

Une case de calendrier est un contrôle : elle porte déjà un `onclick`. En faire un `<button>` la rend atteignable au clavier sans ajouter de `tabindex` ni de gestion de touche.

Les cases vides de début de mois restent des `<div class="calendar-day empty">` : elles ne sont pas cliquables.

- [ ] **Step 3: Construire la légende par le script**

Remplacer le balisage figé de la légende, qui contenait des styles en ligne, par un rendu depuis `renderCalendar`. Ajouter à la fin de la fonction :

```js
    document.getElementById('calendarLegend').innerHTML = `
      <span class="lg-item"><i class="lg-sw d-1"></i>1</span>
      <span class="lg-item"><i class="lg-sw d-2"></i>2&ndash;3</span>
      <span class="lg-item"><i class="lg-sw d-3"></i>4+</span>
      <span class="lg-item"><i class="lg-sw lg-sold"></i>Sold out</span>
    `;
```

- [ ] **Step 4: Écrire les styles**

Remplacer les règles de calendrier de `styles.css` par :

```css
/* ===== CALENDRIER ===== */
.calendar-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-2);
  padding: var(--sp-3) var(--sp-3) var(--sp-2);
  border-bottom: 1px solid var(--border);
}

.calendar-nav h3 {
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-dim);
  text-align: center;
  flex: 1;
}

.nav-btn {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  color: var(--text-dim);
  font-size: var(--fs-sm);
  cursor: pointer;
}

.nav-btn:hover { color: var(--text); border-color: var(--border-strong); }

/* trois mois empiles */
.calendar-months {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  padding: var(--sp-3);
}

.month-block h3 {
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-faint);
  margin-bottom: var(--sp-2);
}

/* colonnes flexibles, jamais en largeur fixe : la colonne laterale passe a 320px
   sous 1240px et une grille figee deborderait */
.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 2px;
}

.day-header {
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-faint);
  text-align: center;
  padding-bottom: var(--sp-1);
}

.calendar-day {
  position: relative;
  min-height: 34px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--text-faint);
  font-family: var(--font-sans);
  font-size: var(--fs-md);
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition: border-color .12s, background .12s;
}

.calendar-day.empty { cursor: default; }
.calendar-day.past { opacity: .45; }
.calendar-day.today { box-shadow: inset 0 0 0 1px var(--border-strong); background: var(--today); }

.calendar-day.d-1 { background: var(--cal-1); color: var(--text); }
.calendar-day.d-2 { background: var(--cal-2); color: var(--text); }
.calendar-day.d-3 { background: var(--cal-3); color: var(--accent); font-weight: 600; }

.calendar-day.has-sold-out::after {
  content: '';
  position: absolute;
  inset: auto var(--sp-1) 2px var(--sp-1);
  height: 2px;
  border-radius: 1px;
  background: var(--sold-out);
}

.calendar-day:hover:not(.empty) { border-color: var(--border-strong); }
.calendar-day.selected-day,
.calendar-day.date-selected { border-color: var(--accent); }

/* legende */
.calendar-legend {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-3);
  padding: var(--sp-2) var(--sp-3) var(--sp-3);
  border-top: 1px solid var(--border);
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-faint);
}

.lg-item { display: inline-flex; align-items: center; gap: var(--sp-1); }

.lg-sw {
  width: 12px;
  height: 12px;
  border-radius: 2px;
  border: 1px solid var(--border);
}

.lg-sw.d-1 { background: var(--cal-1); }
.lg-sw.d-2 { background: var(--cal-2); }
.lg-sw.d-3 { background: var(--cal-3); }
.lg-sw.lg-sold { background: var(--sold-out); border-color: var(--sold-out); }
```

Supprimer les règles `.concert-dots`, `.concert-dot`, `.day-dot`, `.calendar-3months` et `.calendar-day.has-concerts`.

- [ ] **Step 5: Vérifier qu'aucune référence morte ne subsiste**

Run: `grep -n "concert-dot\|day-dot\|has-concerts\|calendar-3months" styles.css index.html`
Expected: seule la ligne `getElementById('calendar3months')` du script et l'attribut `id="calendar3months"` du balisage, qui sont conservés volontairement. Aucune règle CSS.

- [ ] **Step 6: Vérifier la lisibilité**

Ouvrir `index.html`. Dans la console, trouver le jour le plus chargé de la fenêtre visible :

```js
[...document.querySelectorAll('.calendar-day')]
  .map(c => ({ n: c.textContent.trim(), cls: [...c.classList].filter(x => x.startsWith('d-')).join() }))
  .filter(x => x.cls)
```

Attendu : un mélange de `d-1`, `d-2` et `d-3`, et non une seule valeur.

Visuellement :
- les cases chargées sont nettement plus vertes que les cases à une seule date, sans aucun point
- une case avec une date complète porte un filet rouge en bas
- la légende explique les trois paliers plus le sold out
- les trois mois sont empilés verticalement dans la colonne latérale et ne débordent pas
- la navigation `◂ ▸` déplace la fenêtre de trois mois
- au clavier, `Tab` atteint les cases et `Entrée` en sélectionne une
- console sans erreur

- [ ] **Step 7: Commit**

```bash
git add index.html styles.css
git commit -m "feat: calendrier a paliers de densite, remplace les points illisibles"
```

---

## Task 8: Carte OpenStreetMap et marqueurs

**Files:**
- Modify: `index.html` — `initMap` (1504), `renderMap` (1519), `toggleTheme` (2139)
- Modify: `styles.css` — section `MAP`, `TOUR ROUTE STEPS`, `ROAD TRIP PLANNER`, règles `.leaflet-popup-*`

**Interfaces:**
- Consumes: jetons tâche 3, `#mapPanel` tâche 5
- Produces:
  - `const OSM_TILES: string` et `const OSM_ATTRIB: string`
  - `function accentColor(): string` — lit `--accent` sur `documentElement`, utilisée par `renderMap` pour les marqueurs et les tracés
  - `function applyMapTheme(): void` — appelée par `toggleTheme`

- [ ] **Step 1: Remplacer le fournisseur de tuiles**

Le filigrane vient de ce que `basemaps.cartocdn.com` exige désormais une clé. Remplacer `initMap` par :

```js
  // ===== CARTE LEAFLET =====
  let leafletMap = null;
  let markersLayer = null;
  let routeLayer = null;

  // Tuiles sans cle d'API. Le rendu sombre ou clair vient d'un filtre CSS, pas d'un
  // second fournisseur. L'attribution est obligatoire au titre de la licence ODbL.
  const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  const OSM_ATTRIB = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';

  function accentColor() {
    return getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#8fd14f';
  }

  function initMap() {
    leafletMap = L.map('leafletMap', {
      center: [50, 10], zoom: 4, minZoom: 3, maxZoom: 8,
      zoomControl: false
    });
    L.tileLayer(OSM_TILES, { attribution: OSM_ATTRIB, maxZoom: 8 }).addTo(leafletMap);
    L.control.zoom({ position: 'topright' }).addTo(leafletMap);
    markersLayer = L.layerGroup().addTo(leafletMap);
    routeLayer = L.layerGroup().addTo(leafletMap);
  }
```

`attributionControl: false` est retiré : c'est ce qui masquait l'attribution. La sélection de tuiles par thème disparaît, un seul fournisseur suffit.

- [ ] **Step 2: Neutraliser les tuiles par thème en CSS**

Ajouter dans `styles.css`, section carte :

```css
/* Les tuiles OSM sont colorees. Un filtre par theme les ramene a un fond neutre,
   ce qui evite un second fournisseur et une seconde cle. */
.leaflet-tile-pane {
  filter: invert(1) hue-rotate(180deg) saturate(.25) brightness(.85) contrast(1.1);
}

[data-theme="light"] .leaflet-tile-pane {
  filter: saturate(.15) brightness(1.05) contrast(.95);
}

/* l'attribution ne doit pas subir le filtre, elle est hors du volet de tuiles */
.leaflet-container .leaflet-control-attribution {
  background: color-mix(in srgb, var(--surface) 85%, transparent);
  color: var(--text-faint);
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: .04em;
}

.leaflet-container .leaflet-control-attribution a { color: var(--text-dim); }
```

L'attribution est le seul endroit du projet où descendre sous 11 px est acceptable : c'est une mention légale, pas du contenu, et Leaflet la dimensionne ainsi par défaut. Le noter dans le message de commit.

- [ ] **Step 3: Simplifier `toggleTheme`**

`toggleTheme` recrée aujourd'hui la couche de tuiles à chaque bascule. Ce n'est plus nécessaire. Remplacer le bloc qui reconstruit le `tileLayer` (lignes 2145-2153) par un simple rafraîchissement des marqueurs, dont la couleur dépend du jeton :

```js
  function toggleTheme() {
    const cur = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('avocado_theme', next);
    renderMap();
  }
```

Vérifier la forme exacte du bloc remplacé avant d'écrire : le repère est `L.tileLayer(tiles, { subdomains: 'abcd' }).addTo(leafletMap);` dans `toggleTheme`.

- [ ] **Step 4: Marqueurs à accent unique**

Dans `renderMap`, remplacer la construction du cercle par :

```js
      const acc = accentColor();
      const r = Math.max(6, Math.min(22, 5 + Math.sqrt(count) * 3.2));
      const isSelected = selectedCity === city;

      const circle = L.circleMarker([coords[0], coords[1]], {
        radius: isSelected ? r + 3 : r,
        fillColor: acc,
        fillOpacity: isSelected ? 0.85 : 0.55,
        color: acc,
        weight: isSelected ? 3 : 1.5
      });
```

Le rayon passe d'une échelle linéaire relative au maximum à une racine carrée absolue : une ville à 30 dates ne comprime plus toutes les autres.

La variable `maxCount`, qui ne servait qu'à cette échelle et à l'opacité, devient inutile. La supprimer et vérifier :

Run: `grep -n "maxCount" index.html`
Expected: aucune ligne

- [ ] **Step 5: Styliser l'infobulle et les pas de route**

```css
.leaflet-popup-content-wrapper {
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-md);
  box-shadow: 0 8px 24px rgba(0, 0, 0, .35);
}

.leaflet-popup-content { margin: var(--sp-2) var(--sp-3); font-family: var(--font-sans); }
.leaflet-popup-tip { background: var(--surface); border: 1px solid var(--border-strong); }

.popup-city {
  font-stretch: 75%;
  font-weight: 700;
  font-size: var(--fs-lg);
  text-transform: uppercase;
}

.popup-count {
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--accent);
}

.popup-artists { font-size: var(--fs-sm); color: var(--text-dim); margin-top: var(--sp-1); }

.route-step span,
.route-step-orange span {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 700;
  color: var(--on-accent);
  background: var(--accent);
}

.route-step-orange span { background: var(--sold-out); }

.distance-label {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: .04em;
  color: var(--text);
  background: color-mix(in srgb, var(--surface) 90%, transparent);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  padding: 1px 4px;
  white-space: nowrap;
}
```

Les pas de route et l'étiquette de distance sont des vignettes de carte de 20 px : leur `font-size` de 10 px est contrainte par la géométrie du marqueur, pas un choix typographique. Le noter dans le message de commit.

Le tracé du road trip garde sa couleur distincte, `--sold-out`, pour se démarquer des tracés de tournée en accent. Dans `renderMap`, remplacer `color: '#e67e22'` par `color: getComputedStyle(document.documentElement).getPropertyValue('--sold-out').trim()`.

- [ ] **Step 6: Vérifier**

Ouvrir `index.html`.

Attendu :
- aucun filigrane « API KEY REQUIRED » sur la carte
- le fond est gris neutre sombre, et gris clair après bascule de thème, sans rechargement
- l'attribution `© OpenStreetMap contributors` est visible en bas à droite de la carte
- les marqueurs sont tous verts, dimensionnés par le nombre de dates
- au survol d'un marqueur, l'infobulle affiche ville, nombre, artistes, sur fond de surface
- sélectionner deux artistes trace deux itinéraires verts pointillés numérotés
- cocher deux concerts puis activer le filtre « mes dates » trace le road trip en rouge avec les distances
- console sans erreur, et l'onglet réseau ne montre aucun 404 de tuile

Vérifier l'absence de dépendance à Carto :

Run: `grep -n "cartocdn" index.html`
Expected: aucune ligne

- [ ] **Step 7: Commit**

```bash
git add index.html styles.css
git commit -m "fix: passe aux tuiles OSM sans cle, retablit l'attribution obligatoire"
```

---

## Task 9: Filtre pays en panneau

**Files:**
- Modify: `index.html` — en-tête (1172-1207), `init()`, `renderActiveFilters` (1394)
- Modify: `styles.css` — règles `.artist-dropdown*` généralisées en `.picker*`

**Interfaces:**
- Consumes: `normalizeCountry` tâche 1, `escapeHtml` tâche 6
- Produces:
  - `function buildCountryPicker(filter?: string): void`
  - `function toggleCountryPicker(): void`, `function closeCountryPicker(): void`
  - `function toggleCountrySelection(name: string): void`
  - `function updateCountryLabel(): void`

Le sélecteur d'artistes et celui de pays partagent leurs styles sous le préfixe `.picker`. Les deux gardent leurs fonctions séparées : elles pilotent des états différents (`searchTerms` contre `activeCountries`) et fusionner leur logique demanderait une abstraction paramétrée que rien d'autre ne réutiliserait.

- [ ] **Step 1: Ajouter le sélecteur de pays au balisage**

Après le bloc `<div class="search-wrapper" id="searchWrapper">`, ajouter :

```html
  <div class="picker-wrapper" id="countryWrapper">
    <button class="picker-btn" id="countrySelectBtn" onclick="toggleCountryPicker()"
            aria-expanded="false" aria-haspopup="listbox">
      <span id="countrySelectLabel">All countries</span>
      <span class="picker-caret" aria-hidden="true">&#9662;</span>
    </button>
    <div class="picker-panel" id="countryPanel" role="listbox">
      <input type="text" class="picker-filter" id="countryFilterInput" placeholder="Filter countries…"
             oninput="buildCountryPicker(this.value)" aria-label="Filter countries">
      <div class="picker-list" id="countryPickerList"></div>
    </div>
  </div>
```

Renommer les classes du sélecteur d'artistes pour qu'il partage la même feuille : `artist-select-btn` devient `picker-btn`, `artist-dropdown` devient `picker-panel`, `artist-filter-input` devient `picker-filter`, `artist-dropdown-list` devient `picker-list`, `artist-dropdown-item` devient `picker-item`. Les identifiants restent inchangés pour ne pas casser le script.

Run: `grep -n "artist-select-btn\|artist-dropdown\|artist-filter-input" index.html styles.css`
Expected: aucune ligne après le renommage

- [ ] **Step 2: Écrire les fonctions du sélecteur**

Ajouter après les fonctions du sélecteur d'artistes :

```js
  // ===== FILTRE PAYS =====
  function countryCounts() {
    const counts = {};
    CONCERTS_DATA.forEach(c => { counts[c.country] = (counts[c.country] || 0) + 1; });
    return counts;
  }

  function toggleCountryPicker() {
    const panel = document.getElementById('countryPanel');
    const open = !panel.classList.contains('visible');
    closeArtistDropdown();
    panel.classList.toggle('visible', open);
    document.getElementById('countrySelectBtn').setAttribute('aria-expanded', String(open));
    if (open) {
      buildCountryPicker('');
      document.getElementById('countryFilterInput').focus();
    }
  }

  function closeCountryPicker() {
    document.getElementById('countryPanel').classList.remove('visible');
    document.getElementById('countrySelectBtn').setAttribute('aria-expanded', 'false');
  }

  function buildCountryPicker(filter) {
    const list = document.getElementById('countryPickerList');
    const counts = countryCounts();
    const needle = (filter || '').toLowerCase();
    const names = Object.keys(counts).sort((a, b) => a.localeCompare(b))
      .filter(n => n.toLowerCase().includes(needle));

    if (names.length === 0) {
      list.innerHTML = '<div class="picker-empty">No match</div>';
      return;
    }

    list.innerHTML = names.map(n => {
      const on = activeCountries.has(n);
      return `<div class="picker-item${on ? ' selected' : ''}" role="option" aria-selected="${on}"
                   data-country="${escapeHtml(n)}">
                <input type="checkbox" ${on ? 'checked' : ''} tabindex="-1" aria-hidden="true">
                <span class="picker-name">${escapeHtml(n)}</span>
                <span class="picker-count">${counts[n]}</span>
              </div>`;
    }).join('');

    list.querySelectorAll('.picker-item').forEach(el => {
      el.onclick = () => toggleCountrySelection(el.dataset.country);
    });
  }

  function toggleCountrySelection(name) {
    if (activeCountries.has(name)) activeCountries.delete(name);
    else activeCountries.add(name);
    updateCountryLabel();
    buildCountryPicker(document.getElementById('countryFilterInput').value);
    selectedDay = null;
    render();
  }

  function updateCountryLabel() {
    const label = document.getElementById('countrySelectLabel');
    const n = activeCountries.size;
    if (n === 0) label.textContent = 'All countries';
    else if (n === 1) label.textContent = [...activeCountries][0];
    else label.textContent = `${n} countries`;
  }
```

- [ ] **Step 3: Brancher la fermeture au clic extérieur et à Échap**

Dans `init()`, étendre l'écouteur de document existant :

```js
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#searchWrapper')) closeArtistDropdown();
      if (!e.target.closest('#countryWrapper')) closeCountryPicker();
      if (!e.target.closest('.going-wrapper')) document.getElementById('goingPanel').classList.remove('visible');
    });

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      closeArtistDropdown();
      closeCountryPicker();
      document.getElementById('goingPanel').classList.remove('visible');
    });
```

Ajouter aussi `updateCountryLabel();` dans `init()`, après `loadFiltersFromURL()`, pour que le libellé refète un paramètre `countries` reçu par l'URL.

- [ ] **Step 4: Retirer la pastille de couleur des puces de filtre actif**

`renderActiveFilters` a déjà été simplifiée à la tâche 2. Ajouter les puces de pays, absentes aujourd'hui alors que le filtre existe :

```js
    activeCountries.forEach(name => {
      chips.push({ label: name, clear: () => {
        activeCountries.delete(name);
        updateCountryLabel();
        render();
      }});
    });
```

Remplacer aussi l'étiquette `Filters` construite avec des styles en ligne par une classe :

```js
    bar.innerHTML = '<span class="af-label">Filters</span>';
```

et ajouter dans `styles.css` :

```css
.af-label {
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--text-faint);
}
```

- [ ] **Step 5: Généraliser les styles du sélecteur**

Renommer les règles correspondantes dans `styles.css` et ajouter ce qui manque :

```css
/* ===== SELECTEURS (artistes, pays) ===== */
.picker-wrapper, .search-wrapper { position: relative; min-width: 0; }

.picker-btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-2);
  width: 100%;
  padding: var(--sp-2) var(--sp-3);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  color: var(--text);
  font-family: var(--font-sans);
  font-size: var(--fs-md);
  text-align: left;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.picker-btn:hover { border-color: var(--border-strong); }
.picker-caret { color: var(--text-faint); flex-shrink: 0; }

.picker-panel {
  display: none;
  position: absolute;
  top: calc(100% + var(--sp-1));
  left: 0;
  z-index: 40;
  min-width: 260px;
  max-width: 340px;
  background: var(--surface);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-md);
  box-shadow: 0 12px 32px rgba(0, 0, 0, .4);
  overflow: hidden;
}

.picker-panel.visible { display: block; }

.picker-filter {
  width: 100%;
  padding: var(--sp-2) var(--sp-3);
  background: var(--surface-2);
  border: none;
  border-bottom: 1px solid var(--border);
  color: var(--text);
  font-family: var(--font-sans);
  font-size: var(--fs-md);
}

.picker-list { max-height: 320px; overflow-y: auto; }

.picker-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-2) var(--sp-3);
  font-size: var(--fs-md);
  cursor: pointer;
}

.picker-item:hover { background: var(--surface-2); }
.picker-item.selected { background: var(--accent-soft); }
.picker-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.picker-count {
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  color: var(--text-faint);
}

.picker-empty {
  padding: var(--sp-3);
  font-size: var(--fs-md);
  color: var(--text-faint);
}
```

- [ ] **Step 6: Vérifier**

Ouvrir `index.html`.

Attendu :
- le bouton `All countries` ouvre un panneau listant **27 pays**, chacun avec son nombre de dates, aucune ville
- taper `ger` filtre jusqu'à `Germany`
- cocher `Germany` et `France` réduit l'agenda, la carte et le calendrier de façon cohérente, et le libellé du bouton affiche `2 countries`
- deux puces retirables apparaissent sous l'en-tête et les retirer restaure la vue
- ouvrir le sélecteur d'artistes ferme celui des pays, et l'inverse
- `Échap` ferme le panneau ouvert
- console sans erreur

Compter les entrées dans la console :

```js
toggleCountryPicker();
document.querySelectorAll('#countryPickerList .picker-item').length
```

Expected: `27`

Vérifier l'aller-retour d'URL : cocher deux pays, cliquer sur partager, ouvrir l'URL copiée, les deux pays sont cochés et le libellé affiche `2 countries`.

- [ ] **Step 7: Commit**

```bash
git add index.html styles.css
git commit -m "feat: filtre pays en panneau, remplace le ruban de 43 etiquettes"
```

---

## Task 10: Mobile et feuilles escamotables

**Files:**
- Modify: `styles.css` — section `Responsive` (lignes 1066-1155 du fichier d'origine)
- Modify: `index.html` — en-tête, ajout d'une barre de bascule
- Modify: `index.html` — `getMonthCount` (1335), `toggleMap` (2161), `loadMapPref` (2172)

**Interfaces:**
- Consumes: `#sidebar`, `#mapPanel`, `#calendarPanel` tâche 5, `.picker-panel` tâche 9
- Produces:
  - `function toggleSheet(id: string): void` — ouvre ou ferme une feuille mobile, ferme les autres
  - classe `.sheet-open` sur `<body>` pendant qu'une feuille est ouverte

- [ ] **Step 1: Ajouter la barre de bascule mobile**

Juste après l'en-tête, avant `<div class="active-filters" id="activeFilters"></div>` :

```html
<div class="sheet-bar">
  <button class="sheet-tab" onclick="toggleSheet('mapPanel')" aria-controls="mapPanel" aria-expanded="false">Map</button>
  <button class="sheet-tab" onclick="toggleSheet('calendarPanel')" aria-controls="calendarPanel" aria-expanded="false">Calendar</button>
</div>
```

Cette barre est masquée au-dessus de 900 px.

- [ ] **Step 2: Écrire la bascule**

```js
  // ===== FEUILLES MOBILES =====
  function toggleSheet(id) {
    const target = document.getElementById(id);
    const wasOpen = target.classList.contains('sheet-open');
    document.querySelectorAll('.side-panel.sheet-open').forEach(p => {
      p.classList.remove('sheet-open');
      const tab = document.querySelector(`.sheet-tab[aria-controls="${p.id}"]`);
      if (tab) tab.setAttribute('aria-expanded', 'false');
    });
    document.body.classList.toggle('sheet-open', !wasOpen);
    if (!wasOpen) {
      target.classList.add('sheet-open');
      const tab = document.querySelector(`.sheet-tab[aria-controls="${id}"]`);
      if (tab) tab.setAttribute('aria-expanded', 'true');
      if (id === 'mapPanel' && leafletMap) setTimeout(() => leafletMap.invalidateSize(), 120);
    }
  }
```

L'appel à `invalidateSize` est indispensable : Leaflet calcule ses dimensions à l'affichage et une carte révélée depuis un conteneur masqué reste vide sans lui.

- [ ] **Step 3: Corriger `getMonthCount` sur le nouveau seuil**

`getMonthCount` renvoie aujourd'hui 1 sous 480 px. Le seuil pertinent devient celui de la colonne unique :

```js
  function getMonthCount() {
    return window.innerWidth <= 560 ? 1 : 3;
  }
```

- [ ] **Step 4: Réécrire la section responsive**

Remplacer intégralement la section `/* ===== Responsive ===== */` par :

```css
/* ===== RUPTURES ===== */

/* colonne laterale resserree */
@media (max-width: 1240px) {
  :root { --sidebar-w: 320px; }
  .layout { gap: var(--sp-4); padding: var(--sp-4) var(--sp-4) var(--sp-12); }
}

/* colonne unique : la laterale devient deux feuilles escamotables */
@media (max-width: 900px) {
  .layout {
    grid-template-columns: minmax(0, 1fr);
    padding: var(--sp-3) var(--sp-3) var(--sp-12);
  }

  .sheet-bar {
    display: flex;
    gap: var(--sp-2);
    position: sticky;
    top: var(--header-h);
    z-index: 20;
    padding: var(--sp-2) var(--sp-3);
    background: var(--bg);
    border-bottom: 1px solid var(--border);
  }

  .sheet-tab {
    flex: 1;
    min-height: 40px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    color: var(--text-dim);
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    letter-spacing: .08em;
    text-transform: uppercase;
    cursor: pointer;
  }

  .sheet-tab[aria-expanded="true"] {
    background: var(--accent-soft);
    border-color: var(--accent);
    color: var(--accent);
  }

  /* la laterale ne s'empile plus dans le flux : chaque panneau devient une feuille */
  .sidebar {
    position: static;
    display: contents;
  }

  .side-panel {
    display: none;
    position: fixed;
    inset: auto 0 0 0;
    z-index: 60;
    max-height: 78vh;
    overflow-y: auto;
    border-radius: var(--r-lg) var(--r-lg) 0 0;
    border-bottom: none;
    box-shadow: 0 -12px 40px rgba(0, 0, 0, .5);
  }

  .side-panel.sheet-open { display: block; }

  body.sheet-open::after {
    content: '';
    position: fixed;
    inset: 0;
    z-index: 50;
    background: rgba(0, 0, 0, .5);
  }

  #leafletMap { height: 52vh; min-height: 260px; }

  /* l'en-tete de mois n'a plus la barre de feuilles au-dessus de lui */
  .agenda-month { top: calc(var(--header-h) + 57px); }
  .date-separator { top: calc(var(--header-h) + 57px + 44px); }
}

/* repli de la carte de concert */
@media (max-width: 560px) {
  .toolbar { padding: var(--sp-2) var(--sp-3); gap: var(--sp-2); flex-wrap: wrap; height: auto; }
  .toolbar-sep, .toolbar-stats { display: none; }
  .search-wrapper, .picker-wrapper { flex: 1 1 45%; }

  .concert-card {
    grid-template-columns: 52px minmax(0, 1fr);
    gap: var(--sp-3);
    padding: var(--sp-3);
  }

  .cc-actions {
    grid-column: 1 / -1;
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-start;
    margin-top: var(--sp-1);
  }

  /* cibles tactiles */
  .cc-actions .btn-going,
  .cc-actions .btn-ticket,
  .cc-actions .btn-spotify {
    min-height: 44px;
    display: inline-flex;
    align-items: center;
  }

  .cc-day { font-size: var(--fs-xl); }
  .agenda-month .month-name { font-size: var(--fs-2xl); }
  .calendar-day { min-height: 40px; }
  .tour-slide { flex-basis: 200px; }
  .picker-panel { min-width: 0; width: calc(100vw - var(--sp-6)); max-width: none; }
}
```

Le `display: none` qui masquait `.map-container` et `.map-toggle-btn` sous 480 px disparaît. C'était le défaut principal du parcours mobile.

- [ ] **Step 5: Adapter le bouton de masquage de carte**

`toggleMap` et `loadMapPref` agissent sur `.map-container`, qui n'existe plus. Les repointer sur `#mapPanel` :

```js
  function toggleMap() {
    const panel = document.getElementById('mapPanel');
    const hidden = !panel.classList.contains('is-hidden');
    panel.classList.toggle('is-hidden', hidden);
    document.getElementById('btnMapToggle').classList.toggle('active', !hidden);
    localStorage.setItem('avocado_map_hidden', hidden ? '1' : '0');
    if (!hidden && leafletMap) setTimeout(() => leafletMap.invalidateSize(), 120);
  }

  function loadMapPref() {
    const hidden = localStorage.getItem('avocado_map_hidden') === '1';
    if (hidden) document.getElementById('mapPanel').classList.add('is-hidden');
    document.getElementById('btnMapToggle').classList.toggle('active', !hidden);
  }
```

L'appel à `loadMapPref` reste à sa place dans `init()` : le balisage est statique et déjà analysé quand `init()` s'exécute, puisque le `<script>` est en fin de `<body>`.

Ajouter la règle :

```css
.side-panel.is-hidden { display: none; }
```

et vérifier qu'elle ne prend pas le pas sur `.sheet-open` en mobile, l'ordre de déclaration plaçant `.is-hidden` avant la section des ruptures.

Run: `grep -n "map-container\|map-toggle-btn" index.html styles.css`
Expected: seule la règle éventuelle de `.map-toggle-btn` conservée pour le style du bouton d'en-tête. Aucune référence à `.map-container`.

- [ ] **Step 6: Vérifier aux deux largeurs**

Ouvrir `index.html` et redimensionner à 900 px.

Attendu :
- une seule colonne, la barre `Map` / `Calendar` apparaît sous l'en-tête
- cliquer `Map` fait monter une feuille depuis le bas, la carte est dessinée et non vide
- cliquer `Calendar` ferme la carte et ouvre le calendrier
- cliquer sur le voile assombri ne casse rien, et re-cliquer l'onglet actif referme

À 390 px :
- la carte de concert tient sur deux lignes, actions en dessous
- chaque bouton d'action mesure au moins 44 px de haut
- le calendrier affiche un seul mois
- rien ne déborde horizontalement

Vérifier l'absence de débordement, dans la console :

```js
document.documentElement.scrollWidth <= window.innerWidth
```

Expected: `true` aux deux largeurs et dans les deux thèmes

- [ ] **Step 7: Commit**

```bash
git add index.html styles.css
git commit -m "feat: parcours mobile en feuilles escamotables, retablit la carte sur telephone"
```

---

## Task 11: Accessibilité, icônes SVG et branchement de l'export ICS

**Files:**
- Modify: `index.html` — `toolbar-actions` (1187-1205), panneau mes dates (1191-1201), `renderConcertList` état vide (1846), `renderGoingPanel` (2210)
- Modify: `styles.css` — anneau de focus, `prefers-reduced-motion`, `.btn-icon`, `.no-results`

**Interfaces:**
- Consumes: tout ce qui précède
- Produces: rien que les tâches suivantes consomment

**Note hors spec :** `exportICS()` est défini à la ligne 2305 mais n'est branché sur **aucun** élément d'interface. C'est du code mort. La spec le listait comme contrat à préserver en supposant qu'il était atteignable. Puisque le panneau « mes dates » est réécrit ici, cette tâche le branche. C'est un ajout délibéré au périmètre, à signaler dans la description de la MR.

- [ ] **Step 1: Remplacer les glyphes emoji par des SVG**

Remplacer le contenu de `<div class="toolbar-actions">` par :

```html
<div class="toolbar-actions">
  <div class="going-wrapper">
    <button class="btn-icon going-toggle-btn" id="btnGoingFilter" onclick="toggleGoingPanel()"
            aria-label="My concerts" aria-expanded="false">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
        <path d="M12 20s-7-4.5-7-9.5A4 4 0 0 1 12 7a4 4 0 0 1 7 3.5c0 5-7 9.5-7 9.5z"/>
      </svg>
      <span id="goingCount" class="going-badge" data-count="0">0</span>
    </button>
    <div class="going-panel" id="goingPanel">
      <div class="going-panel-header">
        <span class="u-mono">My concerts</span>
        <div class="going-panel-actions">
          <button class="btn-filter-going" onclick="toggleGoingFilter()">Filter view</button>
          <button onclick="exportICS()">Export .ics</button>
          <button onclick="clearAllGoing()">Clear all</button>
        </div>
      </div>
      <div class="going-panel-list" id="goingPanelList"></div>
    </div>
  </div>

  <button class="btn-icon" onclick="shareFilters()" aria-label="Copy link to this filtered view">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/>
      <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>
    </svg>
  </button>

  <button class="btn-icon map-toggle-btn" id="btnMapToggle" onclick="toggleMap()" aria-label="Show or hide the map">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
      <circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>
    </svg>
  </button>

  <button class="btn-icon" onclick="toggleTheme()" aria-label="Switch between light and dark theme">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
      <circle cx="12" cy="12" r="4.5"/>
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.4 5.4l1.4 1.4M17.2 17.2l1.4 1.4M18.6 5.4l-1.4 1.4M6.8 17.2l-1.4 1.4"/>
    </svg>
  </button>
</div>
```

`shareFilters()` retrouve son bouton par `title*="Share"`, qui n'existe plus. Corriger le sélecteur et le retour visuel, qui ne peut plus écraser un `innerHTML` contenant un SVG :

```js
    navigator.clipboard.writeText(url).then(() => {
      const btn = document.querySelector('.toolbar-actions .btn-icon[aria-label^="Copy link"]');
      if (btn) {
        btn.classList.add('copied');
        setTimeout(() => btn.classList.remove('copied'), 1500);
      }
    }).catch(() => {
      prompt('Copy this link:', url);
    });
```

avec :

```css
.btn-icon.copied { border-color: var(--accent); color: var(--accent); }
```

- [ ] **Step 2: Styliser les boutons d'icône**

```css
.btn-icon {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  position: relative;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  color: var(--text-dim);
  cursor: pointer;
  transition: color .15s, border-color .15s;
}

.btn-icon:hover { color: var(--text); border-color: var(--border-strong); }
.btn-icon.active { color: var(--accent); border-color: var(--accent); background: var(--accent-soft); }
.btn-icon svg { width: 20px; height: 20px; }
```

- [ ] **Step 3: Poser l'anneau de focus**

Aujourd'hui `outline: none` est appliqué sans remplacement, ce qui rend la navigation clavier invisible. Ajouter en tête de `styles.css`, juste après la base :

```css
/* ===== FOCUS ===== */
:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: var(--r-sm);
}

/* pas d'anneau au clic souris, seulement au clavier */
:focus:not(:focus-visible) { outline: none; }
```

Puis supprimer tous les `outline: none` restants, qui écraseraient la règle :

Run: `grep -n "outline:\s*none" styles.css`
Expected: seule la ligne `:focus:not(:focus-visible)`. Supprimer les autres.

- [ ] **Step 4: Respecter la préférence de mouvement**

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .001ms !important;
    scroll-behavior: auto !important;
  }
}
```

Le défilement automatique du rail est déjà conditionné par la même requête, à la tâche 6.

- [ ] **Step 5: Dessiner l'état vide**

Dans `renderConcertList`, remplacer le bloc de résultat vide par :

```js
    if (displayed.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <p class="es-title">No dates match this selection</p>
          <p class="es-hint">Try another month, or clear the active filters.</p>
          <button class="btn-ticket" onclick="clearAllFilters()">Clear filters</button>
        </div>`;
      return;
    }
```

et ajouter la fonction, qui n'existe pas encore :

```js
  function clearAllFilters() {
    searchTerms = [];
    activeCountries.clear();
    selectedCity = null;
    selectedDay = null;
    selectedDates.clear();
    showGoingOnly = false;
    document.getElementById('btnGoingFilter').classList.remove('active');
    updateArtistSelectLabel();
    updateCountryLabel();
    buildArtistDropdown('');
    buildCountryPicker('');
    render();
  }
```

avec :

```css
.empty-state {
  padding: var(--sp-12) var(--sp-4);
  text-align: center;
  border: 1px dashed var(--border-strong);
  border-radius: var(--r-lg);
}

.es-title {
  font-stretch: 75%;
  font-weight: 700;
  font-size: var(--fs-lg);
  text-transform: uppercase;
  margin-bottom: var(--sp-2);
}

.es-hint { font-size: var(--fs-md); color: var(--text-dim); margin-bottom: var(--sp-4); }
```

Supprimer les règles `.no-results` devenues mortes.

- [ ] **Step 6: Compléter les attributs d'état des panneaux**

`toggleGoingPanel` doit tenir `aria-expanded` à jour, comme les sélecteurs :

```js
  function toggleGoingPanel() {
    const panel = document.getElementById('goingPanel');
    const open = !panel.classList.contains('visible');
    panel.classList.toggle('visible', open);
    document.getElementById('btnGoingFilter').setAttribute('aria-expanded', String(open));
    if (open) renderGoingPanel();
  }
```

Vérifier que `toggleGoingFilter` et `clearAllGoing`, qui referment le panneau, remettent aussi l'attribut à `false`.

Dans `renderGoingPanel`, remplacer le `onclick` inline du bouton de retrait par la même délégation qu'à la tâche 6, en ajoutant l'écouteur sur `#goingPanelList` dans `init()` :

```js
    document.getElementById('goingPanelList').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action="going"]');
      if (!btn) return;
      e.stopPropagation();
      toggleGoing(btn.dataset.key);
    });
```

et le bouton devient :

```js
        <button class="going-item-remove" data-action="going" data-key="${escapeHtml(getConcertKey(c))}"
                aria-label="Remove ${escapeHtml(c.artist)} from my concerts">&times;</button>
```

- [ ] **Step 7: Vérifier l'export ICS**

Ouvrir `index.html`, cocher deux concerts, ouvrir le panneau `My concerts`, cliquer `Export .ics`.

Attendu : un fichier `avocado-concerts.ics` est téléchargé. L'ouvrir dans un éditeur et vérifier qu'il contient `BEGIN:VCALENDAR`, deux blocs `BEGIN:VEVENT`, et `END:VCALENDAR`.

Run: `grep -c "BEGIN:VEVENT" ~/Downloads/avocado-concerts.ics`
Expected: `2`

- [ ] **Step 8: Parcours clavier complet**

Depuis un rechargement, appuyer sur `Tab` de façon répétée.

Attendu :
- chaque élément atteint porte un anneau vert visible
- l'ordre suit la lecture : logo, sélecteur d'artistes, sélecteur de pays, boutons d'en-tête, vignettes du rail, cases de calendrier, boutons de carte de concert
- `Entrée` ou `Espace` active l'élément focalisé
- `Échap` ferme tout panneau ouvert
- aucun piège de focus : on peut traverser toute la page et revenir

Dans la console, vérifier qu'aucun `outline: none` ne subsiste à l'exécution sur un élément focalisable :

```js
[...document.querySelectorAll('button, a, input')]
  .filter(el => getComputedStyle(el).outlineStyle === 'none' && el.matches(':focus-visible')).length
```

Expected: `0`

- [ ] **Step 9: Commit**

```bash
git add index.html styles.css
git commit -m "feat: focus visible, icones SVG etiquetees, etat vide et export ICS branche"
```

---

## Task 12: Vérification finale, version et MR

**Files:**
- Modify: `index.html` — chaîne de version dans le pied de page (ligne 2336)

**Interfaces:**
- Consumes: tout
- Produces: la MR

- [ ] **Step 1: Passer la version et nettoyer le pied de page**

Remplacer :

```html
  <p style="margin-top:4px;font-size:10px;color:#555;">v1.5.0</p>
```

par :

```html
  <p class="version">v2.0.0</p>
```

avec :

```css
.disclaimer .version {
  margin-top: var(--sp-1);
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  letter-spacing: .08em;
  color: var(--text-faint);
}
```

Corriger aussi le lien `http://www.avocadobooking.com` du pied de page en `https://`, même motif de contenu mixte qu'à la tâche 1.

- [ ] **Step 2: Vérifier qu'aucun style en ligne ne subsiste**

Run: `grep -n 'style="' index.html`
Expected: aucune ligne. Tout est passé en classes.

- [ ] **Step 3: Passe fonctionnelle complète**

Reprendre la liste de la spec, section 12, point 5. Cocher chaque élément :

- [ ] sélection multiple d'artistes, plus de plafond à cinq
- [ ] filtre pays, 27 entrées, aucune ville
- [ ] clic sur un jour du calendrier, l'agenda se réduit à ce jour
- [ ] clic sur une ville de la carte, l'agenda et le calendrier se réduisent à cette ville
- [ ] bascule d'un cœur, le compteur d'en-tête s'incrémente
- [ ] filtre « mes dates », l'agenda ne montre que les concerts cochés
- [ ] road trip avec au moins deux dates cochées : tracé rouge, distances, panneau de résumé
- [ ] export ICS, deux événements dans le fichier
- [ ] aller-retour d'URL de partage : artistes, ville et pays restitués
- [ ] persistance du thème après rechargement
- [ ] persistance de « mes dates » après rechargement
- [ ] persistance du masquage de carte après rechargement

- [ ] **Step 4: Captures aux quatre largeurs dans les deux thèmes**

Prendre huit captures : 1470, 1024, 900 et 390 px de large, chacune en sombre et en clair. Vérifier sur chacune :

- aucun débordement horizontal
- aucun texte tronqué ou superposé
- aucun contraste illisible
- la carte affiche ses tuiles et son attribution

- [ ] **Step 5: Console propre**

Recharger et lire la console complète, puis exercer chaque fonction et relire.

Expected: aucune erreur, aucun avertissement, aucun 404 dans l'onglet réseau.

- [ ] **Step 6: Commit et pousse**

```bash
git add index.html styles.css
git commit -m "chore: passe en v2.0.0 et corrige le lien du pied de page en https"
git push -u origin redesign/agenda-first-ui
```

- [ ] **Step 7: Ouvrir la MR**

Le dépôt est sur GitHub, pas GitLab : utiliser `gh`, pas `glab`.

```bash
gh pr create --draft \
  --title "Refonte de l'interface: agenda d'abord, carte reparee, pays normalises" \
  --body "$(cat <<'EOF'
## Pourquoi

Les tuiles CartoDB exigent desormais une cle, donc la carte affichait
« API KEY REQUIRED » sur 40 % de l'ecran. Le ruban pays montrait 43 entrees
dont 16 villes. La liste de concerts, qui est le contenu reel, tenait dans
245 px. Le focus clavier etait invisible.

## Ce qui change

- Ossature « agenda d'abord » : defilement de document, colonne laterale collante
- Tuiles OpenStreetMap sans cle, avec l'attribution ODbL obligatoire
- 43 valeurs de `country` normalisees vers 27 pays, cote page et cote scraper
- Calendrier a paliers de densite, les points illisibles disparaissent
- CSS extrait dans `styles.css` et reconstruit sur des jetons, deux themes
- Carte reaffichee sur telephone, ou elle etait masquee par `display: none`
- Anneau de focus, icones SVG etiquetees, etat vide

## Hors perimetre initial, signale

`exportICS()` existait mais n'etait branche sur aucun bouton. Il est desormais
accessible depuis le panneau « My concerts ».

Conception : `docs/superpowers/specs/2026-09-04-refonte-interface-design.md`
Plan : `docs/superpowers/plans/2026-09-04-refonte-interface.md`
EOF
)"
```

---

## Auto-revue du plan

**Couverture de la spec**

| Section de la spec | Tâche |
|---|---|
| §2 décisions, langue anglaise | 4 |
| §3.1 typographie Archivo et échelle | 4 |
| §3.2 palettes et deux thèmes | 3 |
| §3.3 espacement et rayons | 3 |
| §4.1 défilement de document | 5 |
| §4.2 disposition et en-têtes de mois collants | 5, 6 |
| §4.3 trois mois empilés, colonnes flexibles | 7 |
| §5 carte de concert et carte festival | 6 |
| §5.1 rail des tournées, nouveautés en tête | 6 |
| §6 calendrier à paliers, légende | 7 |
| §7.1 tuiles OSM, filtre par thème, attribution | 8 |
| §7.2 marqueurs à accent unique | 8 |
| §8 normalisation des pays, filtre en panneau | 1, 9 |
| §8.1 URLs d'images en https | 1 |
| §9 mobile, feuilles, ruptures | 10 |
| §10 accessibilité et états | 11 |
| §11 contrats de compatibilité | vérifiés en 2, 9, 12 |
| §12 protocole de vérification | 12 |

Suppression du panneau statistiques et du ruban pays : tâche 5. Suppression du code couleur multi-artistes : tâche 2. Aucune section de la spec sans tâche.

**Cohérence des noms**

- `searchTerms` est un `string[]` à partir de la tâche 2, et toutes les tâches suivantes le traitent comme tel.
- `#concertList` devient `#agendaList` à la tâche 5, et la tâche 6 est la seule autre à s'y référer.
- `#calendar3months` est conservé volontairement pour ne pas casser `renderCalendar`, dont seul le rendu des cases change à la tâche 7.
- `.map-container` disparaît à la tâche 5, et la tâche 10 repointe `toggleMap` et `loadMapPref` sur `#mapPanel`.
- `matchesArtistFilter` est produite à la tâche 2 et consommée aux tâches 2 et 6.
- `escapeHtml` est produite à la tâche 6 et consommée aux tâches 6, 9 et 11.
- `accentColor` est produite à la tâche 8 et n'est consommée que là.
- `clearAllFilters` est produite à la tâche 11 et appelle `updateCountryLabel` et `buildCountryPicker`, produites à la tâche 9. L'ordre des tâches respecte cette dépendance.

**Écarts assumés, à ne pas corriger sans décision**

1. L'attribution Leaflet, les pas de route et l'étiquette de distance descendent à 9 ou 10 px. Ce sont des vignettes de carte et une mention légale, contraintes par la géométrie, pas du contenu. Chaque tâche concernée le consigne dans son message de commit.
2. Les données de concert sont injectées via `innerHTML` après passage par `escapeHtml`. Le contenu vient d'un scrape, donc semi-fiable ; l'échappement est la mesure proportionnée, pas une refonte en `createElement` de tous les gabarits.
3. Le tracé du road trip garde une couleur distincte de l'accent, `--sold-out`, pour rester distinguable des tracés de tournée. C'est le seul écart à la règle d'accent unique, et il est fonctionnel.
