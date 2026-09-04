# Refonte de l'interface — conception

Date : 2026-09-04
Portée : `index.html`, nouveau `styles.css`, normalisation pays et URLs d'images dans
`scraper/scrape.mjs`
Hors portée : `concerts.js` (généré), `.github/workflows/update-concerts.yml`, logique de scraping

## 1. Pourquoi

L'application fonctionne et couvre beaucoup de terrain, mais l'interface souffre de six
défauts constatés sur la version déployée v1.5.0 :

1. Les tuiles CartoDB exigent désormais une clé d'API. Le fond de carte affiche
   « API KEY REQUIRED » en filigrane sur toute sa surface, laquelle occupe environ 40 %
   de la hauteur de l'écran.
2. Le ruban pays présente 43 entrées dont 16 sont des villes, avec `IRELAND`, `IRELEND`
   et `Ireland` en triple et `UK` / `United Kingdom` en doublon. Le ruban n'est pas mal
   dessiné : il affiche des données non normalisées.
3. La répartition de l'espace est inversée. La carte prend la moitié haute, tandis que la
   liste de concerts, qui est le contenu réel, est confinée à une colonne de 245 px.
4. Les indicateurs du calendrier se lisent comme `····`. À 4 px avec 1 px d'écart, ni le
   nombre de dates ni la distinction avec les dates complètes ne sont perceptibles.
5. Toute la typographie tient entre 10 et 13 px dans une seule police à une seule graisse,
   donc il n'existe aucune hiérarchie visuelle.
6. `outline: none` est appliqué sans rien mettre à la place, donc le focus clavier est
   invisible. Les boutons de la barre d'outils sont des glyphes emoji sans libellé.

## 2. Décisions arrêtées

| Sujet | Décision |
|---|---|
| Ossature | Agenda d'abord : la liste est le contenu principal, carte et calendrier passent en colonne latérale collante servant de filtre |
| Direction visuelle | Sombre éditorial : noir chaud, titres en grotesque condensée, contraste par la taille plutôt que par la couleur |
| Thèmes | Les deux, sombre et clair |
| Langue | Anglais, `lang="en"` corrigé |
| Organisation du code | CSS extrait dans `styles.css`, JS inline réorganisé en sections. Pas de module ES, pas de build |
| Supprimé | Panneau statistiques, ruban pays permanent, code couleur multi-artistes |
| Conservé | Road trip, export ICS, partage d'URL, carrousel de tournées complet avec nouveautés en tête |

Le choix « pas de module ES » est délibéré : la page reste ouvrable en `file://` et le
déploiement GitHub Pages ne change pas. Un build serait injustifié pour 468 lignes de
données statiques.

## 3. Système de design

### 3.1 Typographie

Une seule famille à axe de largeur, Archivo variable, chargée depuis Google Fonts :

```
https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&display=swap
```

Les titres et noms d'artistes exploitent la largeur condensée (`font-stretch: 75%`), le
corps la largeur normale. Un seul téléchargement fournit le contraste éditorial. Le mono
système (`ui-monospace, 'SF Mono', Menlo, monospace`) porte les métadonnées : nom de
tournée, distances, compteurs, badges.

Échelle, en jetons :

| Jeton | Valeur | Emploi |
|---|---|---|
| `--fs-3xl` | 2.5rem / 40px | en-tête de mois collant dans l'agenda |
| `--fs-2xl` | 1.75rem / 28px | numéro de jour dans la carte de concert |
| `--fs-xl` | 1.25rem / 20px | nom d'artiste dans la liste |
| `--fs-lg` | 1rem / 16px | titres de section |
| `--fs-md` | 0.875rem / 14px | corps, lieu et ville |
| `--fs-sm` | 0.75rem / 12px | métadonnées |
| `--fs-xs` | 0.6875rem / 11px | étiquettes en capitales à tracking élargi uniquement |

Le plancher du corps passe donc de 10 px à 14 px. Le 11 px ne subsiste que pour les
étiquettes capitalisées, où il reste lisible grâce au tracking.

### 3.2 Palettes

Noir chaud plutôt que gris froid. Les trois niveaux de texte tiennent le ratio 4.5:1 sur
leur fond dans les deux thèmes.

| Jeton | Sombre | Clair |
|---|---|---|
| `--bg` | `#0c0b0a` | `#f7f5ef` |
| `--surface` | `#14130f` | `#ffffff` |
| `--surface-2` | `#1d1b16` | `#efece3` |
| `--border` | `#2a2721` | `#ddd8cc` |
| `--border-strong` | `#3d3a32` | `#c7c0b0` |
| `--text` | `#f2efe6` | `#17150f` |
| `--text-dim` | `#a8a29a` | `#5c574d` |
| `--text-faint` | `#837d73` | `#7d776b` |
| `--accent` | `#8fd14f` | `#4f8f22` |
| `--accent-hover` | `#a3dd6b` | `#3f7519` |
| `--accent-soft` | `rgba(143,209,79,.14)` | `rgba(79,143,34,.12)` |
| `--cal-1` | `rgba(143,209,79,.12)` | `rgba(79,143,34,.10)` |
| `--cal-2` | `rgba(143,209,79,.26)` | `rgba(79,143,34,.22)` |
| `--cal-3` | `rgba(143,209,79,.42)` | `rgba(79,143,34,.36)` |
| `--sold-out` | `#e0533d` | `#c03a22` |
| `--today` | `rgba(255,255,255,.06)` | `rgba(0,0,0,.05)` |

Le thème sombre est le défaut sur `:root`, le clair sur `[data-theme="light"]`, comme
aujourd'hui. La préférence reste dans `localStorage` sous `avocado_theme`.

### 3.3 Espacement et rayons

Espacement sur base 4 : `--sp-1: 4px` à `--sp-16: 64px` (4, 8, 12, 16, 24, 32, 48, 64).
Les valeurs actuelles de 5, 6, 7, 10 et 20 px disparaissent.

Rayons ramenés à trois : `--r-sm: 4px`, `--r-md: 8px`, `--r-lg: 14px`, plus `50%` pour les
pastilles circulaires.

## 4. Ossature

### 4.1 Changement structurant

`body { height: 100vh; overflow: hidden }` et les panneaux à défilement indépendant
disparaissent. La page défile comme un document. C'est ce qui libère la liste de sa
colonne de 245 px et rend le comportement mobile trivial, puisqu'il n'y a plus de
défilement imbriqué.

```
grid-template-columns: minmax(0, 1fr) 380px;
```

La colonne latérale est en `position: sticky; top: var(--header-h)`.

### 4.2 Disposition

```
┌ en-tête collant 56px ─────────────────────────────────────────┐
│ LOGO  [Artists ▾] [Countries ▾]  468 dates · 80 artists  ♥3 ⋯ │
├──────────────────────────────────┬────────────────────────────┤
│ [rail nouveautés — si détectées] │  CARTE (collante, 46vh)    │
│                                  │                            │
│ ─ SEPTEMBER 2026 ──── 34 dates   │                            │
│  FRI 4                           ├────────────────────────────┤
│  ┌─────────────────────────────┐ │  SEP  ▪▫▪ ▫▪▪▪ ▪▫▫        │
│  │ SEP│ BURN IT DOWN        ♥  │ │  OCT  ▪▪▫ ▪▫▪▫ ▫▪▪        │
│  │ 04 │ Downward · Roman Candle│ │  NOV  ▫▪▪ ▪▪▫▫ ▪▫▫        │
│  │ FRI│ The Foundry · Torquay  │ │  (3 mois empilés)          │
│  │    │ [Tickets]  [Spotify]   │ │                            │
│  └─────────────────────────────┘ │                            │
│  SAT 5 …                         │                            │
└──────────────────────────────────┴────────────────────────────┘
```

Les en-têtes de mois deviennent collants à l'intérieur de la liste, sous l'en-tête de page.
Chaque en-tête de mois porte son nombre de dates filtrées.

### 4.3 Colonne latérale

Le calendrier reste en trois mois, mais **empilés verticalement**. La vue de planification
sur trois mois qui sert au road trip est donc préservée. Les flèches de navigation déplacent
la fenêtre de trois mois, comme aujourd'hui.

Les sept colonnes sont en `repeat(7, minmax(0, 1fr))` et non en largeur fixe, sinon la
colonne latérale à 320 px après la rupture de 1240 px ferait déborder la grille. La hauteur
de case est bornée par `min-height` et non figée.

## 5. Carte de concert

Grille : `[bloc date 64px] [contenu minmax(0,1fr)] [actions auto]`.

- **Bloc date** : mois en `--fs-xs` capitales atténué, jour en `--fs-2xl` condensé avec
  `font-variant-numeric: tabular-nums`, jour de semaine en `--fs-xs` atténué.
- **Contenu** : nom d'artiste en `--fs-xl` condensé, supports en puces discrètes, nom de
  tournée en mono `--fs-sm` atténué, puis `salle · ville, pays` en `--fs-md`.
- **Actions** : bouton cœur en icône, `Tickets` en bouton plein accent, `Spotify` en bouton
  fantôme.
- **Filet de 3 px** sur le bord gauche, transparent au repos, accent au survol et à la
  sélection, `--sold-out` quand la date est complète.
- **Dates complètes** : filet rouge plus badge mono `SOLD OUT`.
- **Badges de proximité** : `Today` et `Tomorrow` deviennent des pilules mono.

Les cartes festival conservent leur affichage de plateau produit par `detectFestivals()`,
étiquetées `FESTIVAL` en mono capitales.

### 5.1 Rail des tournées

Ma proposition initiale, réduire le carrousel aux seules tournées nouvellement détectées,
est fausse et doit être écartée. `getNewTours()` réécrit `avocado_known_tours` à chaque
appel, donc un rail limité aux nouveautés serait vide dès la deuxième visite.

Le rail conserve donc les 24 entrées de `TOUR_IMAGES`, mais :

- les tournées présentes dans `getNewTours()` sont placées en tête et portent un badge mono
  `NEW` en accent ;
- le rail est réduit en hauteur par rapport à l'actuel et cadré à 16:9, avec un dégradé
  vers `--bg` sous le libellé pour garantir la lisibilité du texte sur n'importe quelle
  image ;
- un clic sur une vignette applique le filtre artiste correspondant, comportement actuel
  inchangé ;
- le rail disparaît si `TOUR_IMAGES` est absent ou vide, garde déjà présente dans
  `renderCarousel()`.

C'est ce qui rend la détection de nouveauté enfin visible, tout en gardant les seules
véritables images de l'application.

## 6. Calendrier

Les points sont supprimés : ils sont la cause directe du `····` illisible et ne dégradent
pas quand une ville accueille plus de trois concerts le même jour.

Chaque case porte son numéro sur un **fond teinté en trois paliers de densité** :

| Dates ce jour | Fond | Numéro |
|---|---|---|
| 0 | transparent | `--text-faint` |
| 1 | `--cal-1` | `--text` |
| 2 à 3 | `--cal-2` | `--text` |
| 4 et plus | `--cal-3` | `--accent`, graisse 600 |

Un **filet rouge de 2 px en bas de case** signale qu'au moins une date du jour est complète.

Une légende de trois paliers plus la pastille sold out reste nécessaire pour expliquer
l'échelle. Elle est conservée, restylée en mono `--fs-xs`.

Le jour sélectionné reçoit une bordure `--accent` de 1 px et le jour courant garde son fond
`--today`.

## 7. Carte

### 7.1 Fond de carte

Remplacement des tuiles CartoDB par les tuiles OpenStreetMap standard, sans clé :

```
https://tile.openstreetmap.org/{z}/{x}/{y}.png
```

Neutralisées par un filtre CSS appliqué au conteneur de tuiles, différent par thème :

- Sombre : `invert(1) hue-rotate(180deg) saturate(.25) brightness(.85) contrast(1.1)`
- Clair : `saturate(.15) brightness(1.05) contrast(.95)`

Un seul fournisseur produit donc les deux rendus, et le filigrane disparaît.

L'attribution `© OpenStreetMap contributors` est **obligatoire** au titre de la licence ODbL
et absente aujourd'hui. Elle est ajoutée via l'option `attribution` de `L.tileLayer`.

La politique d'usage des tuiles OSM tolère un site personnel à faible trafic. Si le trafic
augmente, il faudra passer à un fournisseur à clé (Stadia Maps, Carto, MapTiler). C'est une
limite assumée, notée ici pour mémoire.

### 7.2 Marqueurs

Le code couleur multi-artistes sur cinq couleurs est supprimé, y compris sur la carte, donc
les marqueurs deviennent des `circleMarker` à accent unique :

- remplissage `--accent` à 0.55 d'opacité, bordure `--accent` de 1.5 px
- rayon proportionnel à la racine carrée du nombre de dates, borné entre 6 et 22 px
- anneau supplémentaire sur la ville sélectionnée
- infobulle restylée sur les jetons

`COMPARE_COLORS` et toutes ses utilisations disparaissent. La sélection multiple d'artistes
est conservée : seule sa restitution colorée est retirée.

## 8. Données pays

Une table `COUNTRY_FIX` est appliquée **une seule fois au démarrage** pour produire un jeu
de données normalisé, de sorte que filtres, carte et compteurs soient toujours d'accord
entre eux :

```js
const COUNTRY_FIX = {
  'United Kingdom': 'UK', 'IRELAND': 'Ireland', 'IRELEND': 'Ireland',
  'Dublin': 'Ireland', 'Glasgow': 'UK', 'Manchester': 'UK', 'London': 'UK',
  'Tilburg': 'Netherlands', 'Paris': 'France', 'Cologne': 'Germany',
  'Berlin': 'Germany', 'Munich': 'Germany', 'Warsaw': 'Poland',
  'Prague': 'Czech Republic', 'Vienna': 'Austria', 'Milan': 'Italy',
  'Cruise': 'At sea',
};
```

On passe de 43 entrées à 27. `Cruise` est rattaché à `At sea` plutôt que supprimé, pour ne
pas faire disparaître la date.

La même table est ajoutée à `scraper/scrape.mjs` pour assainir les données futures, mais
**c'est la page qui fait autorité** : sans normalisation côté page, les 468 lignes déjà
commitées resteraient fausses.

Le ruban pays permanent est supprimé. Le filtre pays réutilise le motif du sélecteur
d'artistes : un bouton `Countries` ouvrant un panneau avec champ de filtre et liste à cases
à cocher des 27 pays normalisés, avec leur nombre de dates. Les filtres actifs restent
affichés en puces retirables sous l'en-tête.

### 8.1 Images de tournée en clair

Les 24 `imageUrl` de `TOUR_IMAGES` pointent vers `http://www.avocadobooking.com/...` alors
que le site est servi en `https` par GitHub Pages. C'est du contenu mixte. Chrome le
surclasse aujourd'hui en `https`, mais bloque l'image si le surclassement échoue, et rien
ne garantit ce comportement dans le temps.

Correction en deux endroits :

- dans `scraper/scrape.mjs`, écrire les URLs en `https://` à la génération ;
- dans `renderCarousel()`, forcer `https://` à l'affichage, pour couvrir les 24 entrées
  déjà commitées sans attendre le prochain passage du scraper.

## 9. Mobile

La carte n'est plus masquée sous 480 px. Son `display: none` actuel est un défaut, pas un
choix : il prive les téléphones de la moitié de l'application.

- **En-tête** réduit au logo et à un bouton `Filters` ouvrant une feuille pleine hauteur
  contenant artistes, pays et mes dates.
- **Carte et calendrier** passent en feuilles escamotables déclenchées depuis une barre
  collante en bas de l'en-tête.
- **Carte de concert** repliée en deux lignes, date et contenu sur la première, actions en
  pleine largeur sur la seconde, avec 44 px de cible tactile minimum.
- Le défilement de document supprime tout piège de défilement imbriqué.

Ruptures : **1240 px** (colonne latérale 380 → 320), **900 px** (colonne unique et feuilles),
**560 px** (repli de la carte de concert).

## 10. Accessibilité et états

- **Anneau de focus** `2px solid var(--accent)` avec `outline-offset: 2px` sur tout élément
  interactif. Aujourd'hui `outline: none` n'est remplacé par rien.
- **Boutons d'icône** : les glyphes emoji restants `♥ 🔗 🌍 ☀` deviennent des SVG en ligne de
  24 px en `currentColor`, trait 1.5, avec `aria-label`. Cela règle aussi leur rendu
  incohérent d'une plateforme à l'autre. Le bouton 📊 disparaît avec le panneau
  statistiques.
- **`prefers-reduced-motion`** neutralise transitions et animations.
- **État vide** dessiné, avec une action de réinitialisation des filtres.
- **`aria-live="polite"`** sur le compteur de résultats.
- Les panneaux ouvrants portent `aria-expanded` et se ferment à `Escape`.

## 11. Compatibilité à préserver

Ces contrats ne doivent pas changer, sinon des liens et des données existants cassent :

- **Format de l'URL de partage** produit par `shareFilters()` et lu par
  `loadFiltersFromURL()`, pour que les liens déjà partagés continuent de fonctionner.
- **Clés `localStorage`** : `avocado_theme`, `avocado_map_hidden`, `avocado_going`,
  `avocado_known_tours`.
- **Format de clé de concert** produit par `getConcertKey()`, dont dépend la liste
  « mes dates » déjà enregistrée chez les visiteurs.
- **Export ICS** : contenu inchangé.

## 12. Vérification

Le dépôt n'a pas de harnais de test et les instructions du projet excluent d'en créer un
pour le front. La vérification est donc manuelle, par captures et par exercice des
fonctions.

1. Captures à 1470, 1024, 900 et 390 px de large, dans les deux thèmes.
2. Console du navigateur sans erreur ni avertissement.
3. Tuiles de carte chargées, sans filigrane, attribution visible.
4. Le filtre pays affiche 27 entrées et aucune ville.
5. Chaque fonction réexercée : sélection multiple d'artistes, filtre pays, clic sur un jour,
   clic sur une ville, bascule « mes dates » et son filtre de vue, road trip à deux dates au
   moins, export ICS, aller-retour d'URL de partage, persistance du thème après rechargement.
6. Navigation au clavier seul du début à la fin de l'en-tête et d'une carte de concert, avec
   focus visible en permanence.
