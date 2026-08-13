# Architecture du terminal DXG

Ce document décrit conceptuellement l'architecture du système de rendu terminal haut de gamme de DXG. Il reste au niveau de la spécification ; aucune implémentation n'est fournie.

## Vision
Le terminal DXG vise à offrir une expérience riche, réactive et personnalisable comparable à celle des terminaux modernes comme ceux de Bun, Biome, npm, pnpm ou Turbo, tout en restant découplé de la logique métier. Il doit permettre d'afficher du texte coloré, des layouts complexes, des animations fluides, des panneaux interactifs, des tableaux et des arbres de données, tout en supportant le clavier, la souris et le redimensionnement. L'objectif est de fournir une couche de présentation que les autres parties du système (CLI, generators, plugins, IA) peuvent utiliser sans avoir à connaître les détails du rendu sous‑jacent (ANSI, SIXEL, protocoles de terminal avancés, ou même un rendu web pour un mode « playground »).

## Principes directeurs
1. **Separation of concerns** : le terminal ne connaît rien de la logique de l'application (pas d’accès direct au système de fichiers, au workspace, aux commandes, etc.). Il ne sait que rendre un arbre de nœuds et retourner des événements d’entrée.
2. **Render‑agnostic** : le noyau définit une représentation abstraite de l’interface (éléments comme `Box`, `Text`, `Table`, `Tree`, `Spinner`, `ProgressBar`, `Panel`, `Modal`, `Tooltip`) qui peut être implémentée par différents backends (ANSI terminal réel, simulateur pour les tests, rendu HTML/CSS pour un aperçu web, ou même un protocole de terminal riche comme SIXEL ou sixel lorsqu’il est disponible).
3. **Composable et hiérarchique** : l’interface est construite comme un arbre d’éléments imbriqués, où chaque nœud possède des propriétés de layout (flex‑like, dimensions, marges, padding, alignement) et de style (couleurs, bordures, caractères de ligne).
4. **Thémable à chaud** : les thèmes (palettes de couleurs, styles de bordure, caractères de ligne) peuvent être changés en temps réel sans devoir détruire et recréer l’arbre entier.
5. **Performance par rendu différé** : seules les régions de l’écran réellement modifiées sont réécrites, réduisant le trafic sortant et évitant le scintillement.
6. **Accessibilité** : support de la navigation au clavier (tab, flèches, entrée, échappement), contraste suffisante par défaut, et possibilité d’exposer des rôles ARIA‑like pour les lecteurs d’écran dans les environnements qui le permettent (ex. rendu web).
7. **Extensibilité** : lesplugins peuvent enregistrer de nouveaux types de nœuds de rendu ou des panneaux personnalisés qui s’intègrent dans l’arbre de rendu.
8. **Mode non‑interactif et CI** : lorsqu’il détecte une sortie non‑interactive (pas de TTY, variable d’environnement `CI=true`), le terminal se désactive automatiquement et retourne des représentations simples (texte brut ou JSON) selon la configuration.

## Couches de l'architecture

### 1. Nœuds de rendu de base (`RenderableNode`)
Tous les éléments visibles dérivent d’une classe ou interface abstrait `RenderableNode` possédant :
- `type` : chaîne discriminante identifiant le nœud (`"box"`, `"text"`, `"table"`, etc.).
- `props` : objet de propriétés spécifiques au type (contenu du texte, données du tableau, options du spinner, etc.).
- `layout` : objet décrivant comment le nœud doit être dimensionné et positionné dans son parent (flex‑grow, flex‑shrink, basis, minWidth, maxWidth, height, alignSelf, margin, padding).
- `style` : objet de style qui référence le thème actif (couleurs de premier plan et d’arrière‑plan, style de bordure, caractères de ligne pour les bordures, éventuellement ombre ou effet).
- `children?` : liste optionnelle de `RenderableNode` pour les nœuds pouvant contenir d’autres nœuds (ex. `Box`, `Panel`, `Table` possède des lignes contenant des cellules qui peuvent être du texte ou d’autres nœuds).

### 2. Moteur de layout (`LayoutEngine`)
Donné un nœud racine et les dimensions du terminal (largeur × hauteur en cellules), le moteur de layout calcule la boîte englobante (x, y, width, height) de chaque nœud en suivant un algorithme de type flexbox simplifié :
- L’axe principal (`flexDirection`) peut être `column` (défaut) ou `row`.
- Les propriétés `flexGrow`, `flexShrink` et `flexBasis` déterminent comment l’espace disponible est distribué.
- `alignItems` contrôle l’alignement sur l’axe secondaire.
- Dimensions absolutes (`width`, `height` en cellules) peuvent dépasser les contraintes flex et provoquer du débordement (gestion du débordement : scrollable, ellipsis, ou héritage du comportement du parent).
- Le moteur travaille en deux passes : première pour déterminer les tailles mínimes/maximales, deuxième pour répartir l’espace restant selon les flex factors.
- Le résultat est un arbre annoté avec des boîtes de rendu absolues.

### 3. Gestionnaire de thème (`ThemeManager`)
Un thème est un objet contenant :
- `palette` : mapping de noms de couleurs sémantiques vers des valeurs RGB ou ANSI (`foreground`, `background`, `primary`, `secondary`, `success`, `warning`, `error`, `muted`, `border`, `inputBackground`, etc.).
- `borderStyle` : objet définissant les caractères à utiliser pour les différents types de bordure (horizontal, vertical, coin supérieur‑gauche, etc.) – permet de passer d’un style ASCII simple à un style double ou à des caractères Unicode.
- `cursor` : forme du cursor (`block`, `underline`, `beam`) et couleur.
- `animationSpeed` : facteur multiplicateur pour la durée des animations (spinners, transitions de panneaux).
Le gestionnaire de thème fournit des méthodes :
- `getColor(name: string) => string` : retourne la séquence ANSI ou la valeur CSS correspondant à la couleur nommée.
- `getBorderChar(side: string) => string` : retourne le caractère de bordure demandé.
- `applyTheme(theme: Partial<Theme>) => void` : fusionne le thème partiel avec le thème actif et déclenche un re‑render de l’arbre complet (puisque les couleurs peuvent avoir changé partout).
Les thèmes peuvent être définis en JSON et chargés depuis un fichier ou fournis par un plugin.

### 4. Analyseur d’événements (`EventParser`)
Le terminal reçoit des entrées brutes depuis l’entrée standard (clavier, souris, redimensionnement) sous forme de séquences d’octets (comme celles émises par un véritable terminal VT‑compatible). L'`EventParser` transforme cette séquence en événements sémantiques :
- **Événements de clavier** : `keypress` (avec propriétés `key` : nom de la touche comme `"Enter"`, `"Escape"`, `"ArrowUp"`, `"a"`, `"A"` avec indicateur de shift/ctrl/meta), `keydown`, `keyup` (optionnel selon le niveau de détail souhaité).
- **Événements de souris** : si le terminal supporte le protocole de souris (ex. `X10` ou `UTF-8 mouse reporting`), des événements `mousedown`, `mouseup`, `mousemove` avec coordonnées de colonne/ligne et bouton.
- **Événements de redimensionnement** : `resize` comportant la nouvelle largeur et hauteur en colonnes/ligne.
- **Événements de focus** : `focus` et `blur` si le terminal supporte la notion de focus provenant d’un gestionnaire de fenêtres (rare dans les terminaux pur texte, mais utile dans un rendu web).
L'analyseur doit gérer les séquences d’échappement (ESC `[ …`) et être capable de distinguer les touches fonction des séquences de couleur ANSI.

### 5. Rendu spécifique au backend (`Renderer`)
L'interface du renderer abstrait définit comment traduire un arbre de nœuds annoté avec leurs boîtes absolutess en sorties spécifiques au dispositif. Trois backends principaux sont envisagés :
- **ANSI Renderer** : destiné à un véritable terminal émulant VT100/ANSI. Il traduit chaque nœud en séquence d’échappement pour positionner le curseur (`\x1b[<y>;<x>H`), définir les couleurs (`\x1b[38;2;<r>;<g>;<b>m` pour le foreground, `\x1b[48;2;<r>;<g>;<b>m` pour le background), dessiner les caractères de bordure, remplir le contenu, puis remettre les attributs par défaut.
- **Simulateur Renderer** : utilisé durant les tests unitaires. Il ne produit aucune sortie réelle mais enregistre les appels (ou construit un buffer en mémoire) permettant d’affirmer que certains caractères apparaissent à certaines coordonnées.
- **Web Renderer** : destiné à un aperçu dans une page web (ex. le playground DXG ou une intégration dans un IDE). Il transforme l’arbre de nœuds en une structure DOM réelle (en utilisant du HTML/CSS) et la rend dans un conteneur fourni. Ce backend permet d’avoir un rendu riche avec des polices, des ombres, des animations CSS, tout en réutilisant la même définition d’arbre de nœuds.
Chaque renderer doit respecter le même contrat : donné un nœud racine et les dimensions du terminal, il retourne (ou écrit dans un flux) la représentation visuelle.

### 6. Gestionnaire d’arbre et de rendu différé (`TerminalCore`)
Le cœur du terminal possède :
- Une référence au nœud racine actuel (`root: RenderableNode`).
- Le renderer actif (`renderer: Renderer`).

Il offre une méthode principale :
```ts
render(root: RenderableNode, options?: { force?: boolean }) => void
```
Qui :
1. (Optionnel) exécute le moteur de layout sur le nouveau `root` pour produire les boîtes absolutess.
2. Compare les boîtes absolutess nouvellement calculées avec celles du rendu précédent (stockées en interne).
3. Calcule le ensemble des régions qui ont changé (nouveaux nœuds, nœuds déplacés, nœuds dont le contenu ou le style a changé, nœuds supprimés).
4. Si `options.force` est vrai ou si des différences existent, demande au `renderer` de ne redessiner que ces régions (ou, si force, tout l’écran).
5. Met à jour le cache des boîtes absolutess pour le prochain rendu.
6. Retourne éventuellement une promesse qui se résout quand le rendu est terminé (utile pour les animations).

Le terminal gère également un boucle d’événements interne qui :
- Lit l’entrée standard (en mode non bloquant ou via un wrapper qui transforme les données brutes en flux d’événements grâce à `EventParser`).
- Pour chaque événement sémantique reçu, le distribue aux enregistreurs d’écoute (`onKeyPress`, `onMouseClick`, `onResize`) associés au nœud racine ou à des nœuds spécifiques (via un système de propagasion d’événement similaire au DOM : capture → cible → bouillonnement).
- Met à jour l’état interne (ex. position du curseur actif si un nœud d’entrée comme un `Input` est présent).
- Peut demander un re‑render si l’événement a modifié l’état (ex. frappe de touche dans un champ de texte).

### 7. Composants de rendu prêts à l’emploi
Le terminal fournit une bibliothèque de composants de haut niveau construits à partir des nœuds de base :

| Composant | Description | Props typiques |
|----------|-------------|----------------|
| `Box` | Conteneur générique pouvant avoir bordure, fond, padding, et alignement flex. | `border?: boolean`, `bg?: string`, `color?: string`, `padding: number | {top:number,right:number,bottom:number,left:number}`, `flex?: number | {grow:number,shrink:number,basis:string}` |
| `Text` | Chaîne de caractères, avec retour à la ligne automatique si largeur connue. | `content: string`, `wrap?: boolean`, `truncate?: boolean` |
| `Spinner` | Indicateur d’activité animé (points, barre, bouncing ball). | `type?: "dots" | "bar" | "pulse"`, `speed?: number` |
| `ProgressBar` | Barre indiquant la proportion d’une tâche terminée. | `value: number` (0‑1), `bg?: string`, `filled?: string` |
| `Panel` | Boîte avec titre éventuel et contenu scrollable si débordement. | `title?: string`, `scrollable?: boolean` |
| `Table` | Grille de données avec en-têtes, lignes, alignement par colonne, possibilité de tri interactif. | `columns: Array<{header:string, accessor:(row:any)=>any, align:'left'|'center'|'right', width?:number|string}>`, `rows: Array<any>` |
| `Tree` | Représentation hiérarchique (ex. dépendances, structure de fichiers). Chaque nœud peut être développé/réduit. | `nodes: Array<{label:string, children?:Array<...>, value:any}>`, `selected?: string` |
| `Modal` | Boîte flottante centrée qui obscurcit l’arrière‑plan lorsqu’elle est ouverte. | `title?: string`, `content: RenderableNode`, `onClose: () => void` |
| `Tooltip` | Petite boîte apparaissant près d’un élément lorsqu’on le survole ou le focus (clavier). | `content: string`, `delay?: number` |
| `Input` | Champ de saisie de texte simple (pour les prompts). | `placeholder?: string`, `value: string`, `onChange: (val:string)=>void`, `onSubmit: (val:string)=>void` |

Ces composants retournent un `RenderableNode` (ou un arbre) que l’appelant peut intégrer dans son propre arbre de rendu.

### 8. Gestion des États et animations
Pour les composants qui nécessitent un état interne (spinner, barre de progression, champ de saisie, arbre développable/réductible) le terminal offre :
- Un mécanisme d’état local similaire à React (`useState` simplifié) où chaque nœud peut déclarer un état qui, lorsqu’il change, déclenche un nouveau rendu de ce nœud et de ses descendants.
- Un système d’animation basé sur `requestAnimationFrame` (ou équivalent via `setInterval` avec timestamps) pour les propriétés numériques pouvant être interpolées (opacity, rotation du spinner, taille d’une barre de progression).
Le développeur de composant n’a pas besoin de gérer le timer directement ; il indique la propriété à animer, la durée et la fonction d’interpolation (linear, ease-in-out, etc.) et le moteur s’en charge.

### 9. Mode non‑interactif / CI / JSON
Lorsque le terminal détecte qu’il n’est pas rattaché à un TTY (via `process.stdout.isTTY === false` ou la variable `CI=true`), il peut basculer automatiquement en un mode de sortie alternative :
- **Mode texte brut** : rendu uniquement des chaînes de texte sans séquences d’échappement ANSI, utile pour les logs ou la redirection vers un fichier.
- **Mode JSON** : au lieu de produire des caractères visuels, le terminal émet une représentation JSON de l’arbre de rendu à chaque frame (ou uniquement lorsqu’il y a changement). Cela permet à un frontend externe (ex. une extension IDE) de reconstruire l’interface sans devoir parser des séquences d’échappement.
Le mode à utiliser peut être configuré via une option globale (`dxg config set terminal.outputMode json`) ou déduit automatiquement.

### 10. Extensibilité via les plugins
Les plugins peuvent enrichir le terminal de deux manières principales :
1. **Enregistrement de nouveaux types de nœuds** : en fournissant une fabrique qui, donnée un nom et des propriétés, retourne un `RenderableNode` personnalisé (ex. un nœud qui affiche un graphique sparkline ou un compteur de téléchargements).
2. **Enregistrement de panneaux ou de composants de terminal** : via l’API du système de plugins (`registerTerminalExtension`) qui spécifie où le composant doit apparaître (ex. dans une barre latérale droite, en modal, ou intégré dans la ligne de statut).
Le moteur de thème et le renderer doivent être suffisamment génériques pour gérer ces nouveaux nœuds ; idéalement, ils s’appuient sur une méthode `renderNode(node: RenderableNode, ctx: RenderContext) => void` que chaque type de nœud implémente (ou que le renderer délègue à un registre de renderers par type de nœud).

## Flux de rendu typé (exemple)
```mermaid
sequenceDiagonal
    participant App as Code qui veut afficher quelque chose (CLI, Generator, Plugin)
    participant TC as TerminalCore
    participant LE as Layout Engine
    participant TM as Theme Manager
    participant RD as Renderer (ANSI)
    participant Ev as Event Parser (clavier/souris)

    App->>TC: render(rootNode)
    TC->>LE: calculate layout(rootNode, terminalSize)
    LE-->>TC: arbre avec boîtes absolutess
    TC->>TC: diff avec précédent rendu
    alt changements détectés
        TC->>RD: renderOnly(diffRegion)
        RD-->>TC: séquences ANSI écrites sur stdout
    else aucun changement et pas force
        TC-->>App: pas de sortie (optimisation)
    end
    loop écoute d’entrée
        Ev-->>TC: keypress, mouse, resize events
        TC->>App: propager l’événement aux handlers enregistrés (ex. onKeyPress sur un Input)
    end
```

## Sécurité et bonnes pratiques
- **Isolation** : le terminal ne fait aucune appel au système de fichiers, au réseau ou à des processus enfants ; toute interaction avec l’extérieur doit passer par l’appelant (ex. le CLI lit un fichier puis passe son contenu comme propriété à un nœud `Text`).
- **Non‑privé par défaut** : sauf activation explicite, le terminal ne tente pas de lire le presse‑papiers ni d’accéder à la géolocalisation.
- **Performance** : le rendu différé et le layout efficace visent à maintenir un taux de rafraîchissement de 60 fps même dans de grands tableaux ou arbres, tant que le nombre de réellement modifiés reste faible.
- **Testabilité** : le simulateur renderer permet d’écrire des tests unitaires qui affirment que certaines coordonnées contiennent un certain caractère ou une certaine couleur, sans dépendre d’un vraie terminal.
- **Accessibilité** : dans le rendu web, chaque nœud de rendu peut recevoir des attributs `role`, `aria-label`, `tabindex` pour une navigation au clavier et une lecture par les écrans.
- **Thèmes respectant le contraste** : les thèmes fournis par défaut respectent un rapport de contraste d’au moins 4,5:1 pour le texte normal et 3:1 pour le texte grand, suivant les WCAG AA.

## Rejetés / alternatives considérées
- **Terminal basé exclusivement sur les séquences ANSI** : aurait rendu difficile le support d’un rendu web ou d’un protocole avancé comme SIXEL sans réécrire beaucoup de code.
- **Chaque composant gère son propre rendu** : aurait conduits à du code dupliqué et à des incohérences de layout (marge, padding, alignement hétérogènes).
- **Pas de rendu différé** : aurait généré un flot constante de séquences d’échappement même quand rien ne change, surchargeant la liaison série ou consommant inutilement la batterie sur les terminaux sans fil.
- **Thème statique (changé seulement au redémarrage)** : aurait limité la capacité de répondre à des changements de préférences en temps réel (ex. basculer entre clair et sombre basé sur l’heure du jour).
- **Pas de séparation entre rendu et événements** : aurait mélangé les préoccupations, rendant difficile le remplacement du backend de rendu sans toucher la logique d’entrée.

## Résumé des décisions prises
- **Arbre de nœuds de rendu abstrait** (`Box`, `Text`, `Table`, etc.) totalement séparé de la logique d’entrée et du rendu spécifique au backend.
- **Moteur de layout basé sur flexbox simplifié** pour déterminer les positions et tailles.
- **Gestionnaire de thème à chaud** permettant de changer palette, bordures et cursor sans reconstruction complète.
- **Analyseur d’événements robuste** transformant les séquences d’échappement brutes en événements sémantiques (clavier, souris, redimensionnement).
- **Renderer abstrait** avec implémentations ANSI, simulateur et web, permettant de choisir le backend adapté au contexte.
- **TerminalCore** qui orchestre le layout, le diff, le rendu différé et la distribution d’événements.
- **Bibliothèque de composants prêts à l’emploi** construits à partir des nœuds de base (spinner, barre de progression, tableau, arbre, modal, tooltip, input).
- **État local et système d’animation** intégrés pour permettre des éléments dynamiques sans gestion manuelle de timers.
- **Mode non‑interactif / CI / JSON** automatique basé sur la détection de TTY ou de variables d’environnement.
- **Extensibilité via les plugins** pour de nouveaux types de nœuds et des panneaux/extensions de terminal.
- **Sécurité et bonnes pratiques** : aucun accès au FS ou réseau depuis le terminal, rendu différé pour performance, thèmes respectant l’accessibilité, testabilité via simulateur renderer.

Cette architecture fournit une base solide pour une expérience terminale haut de gamme, modulable et adaptée aux besoins variés d’un CLI moderne, tout en restant prête à évoluer vers des protocoles de terminal plus riches ou des rendus web lorsqu’ils sont pertinents.

---

