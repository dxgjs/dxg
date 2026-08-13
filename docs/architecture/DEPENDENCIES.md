# Graphe de dépendances DXG

## Vue d'ensemble
Le graphe de dépendances du monorepo DXG est conçu pour être **acyclique** et **stratifié** : les dépendances vont des paquets de haut niveau (qui orchestrent ou présentent) vers les paquets de bas niveau (qui fournissent des primitives faibles couplage). Aucun paquet de bas niveau ne dépend d'un paquet de haut niveau, évitant ainsi les dépendances circulaires et les couplages indésirables.

## Couches (du bas vers le haut)

### Couche 1 – Fondamentaux (aucune dépendance interne ou seulement vers le logging/validation pour leurs propres opérations)
- `@dxgjs/fs` – Système de fichiers portable
- `@dxgjs/json` – Manipulation avancée de JSON
- `@dxgjs/env` – Chargement des variables d’environnement
- `@dxgjs/validation` – Schémas de validation
- `@dxgjs/logger` – Journalisation structurée (peut dépendre de `@dxgjs/validation` pour valider ses options, mais généralement pas de dépendance interne)
> Remarque : ces paquets sont fondamentalement indépendants ; ils peuvent s’appuyer les uns sur les autres si le besoin est justifié (ex. `@dxgjs/env` utilise `@dxgjs/fs` pour lire les fichiers `.env`), mais aucune dépendance ne crée de cycle.

### Couche 2 – Infrastructures (s’appuie sur la couche 1)
- `@dxgjs/package-manager` – Interface unifiée npm/Yarn/pnpm/Bun → dépend de `@dxgjs/fs`, `@dxgjs/env`, `@dxgjs/validation`, `@dxgjs/logger`
- `@dxgjs/node` – Utilitaires Node/Bun/Deno → dépend de `@dxgjs/fs`, `@dxgjs/env`, `@dxgjs/validation`, `@dxgjs/logger`
- `@dxgjs/git` – Abstraction Git → dépend de `@dxgjs/fs`, `@dxgjs/validation`, `@dxgjs/logger`
- `@dxgjs/config` – Chargement/merge/validation de configuration → dépend de `@dxgjs/fs`, `@dxgjs/env`, `@dxgjs/validation`, `@dxgjs/json`, `@dxgjs/logger`
- `@dxgjs/workspace` – Détection de workspace → dépend de `@dxgjs/fs`, `@dxgjs/json`, `@dxgjs/validation`, `@dxgjs/logger`

### Couche 3 – Core et services partagés
- `@dxgjs/core` – DI container + event bus → dépend de `@dxgjs/logger` (pour ses propres traces) et `@dxgjs/validation` (pour valider les enregistrements DI et les schémas d’événement)
> Le core ne dépend **pas** des paquets d’infrastructure ou de haut niveau ; il reste une fondation neutre.

### Couche 4 – Présentation et interaction
- `@dxgjs/terminal` – Rendu terminal premium → dépend de `@dxgjs/logger` (pour logger les événements de rendu) et `@dxgjs/core` (optionnel, pour accéder à des services via DI si nécessaire)
- `@dxgjs/prompts` – Prompts interactifs → dépend de `@dxgjs/terminal` (pour l’affichage et la capture d’entrée), `@dxgjs/validation` (pour valider les réponses si un schéma est fourni), `@dxgjs/logger` (optionnel)
> Remarque : `@dxgjs/prompts` dépend de `@dxgjs/terminal` mais **pas** l’inverse – le terminal ne connaît pas les prompts, préservant la séparation des préoccupations.

### Couche 5 – Orchestration et génération
- `@dxgjs/templates` – Moteur de templates → dépend de `@dxgjs/fs` (chargement de fichiers de template), `@dxgjs/validation` (validation des données si schéma), `@dxgjs/logger` (optionnel)
- `@dxgjs/generators` – Scaffolding guidé → dépend de `@dxgjs/prompts` (collecte réponses), `@dxgjs/templates` (rendu), `@dxgjs/fs` (écriture fichiers), `@dxgjs/logger`, `@dxgjs/validation`, **optionnellement** `@dxgjs/ai` (pour génération assistée ou révision)
- `@dxgjs/ai` – Orchestration IA → dépend de `@dxgjs/core` (DI/event bus), `@dxgjs/config` (clés API, modèles), `@dxgjs/validation` (schémas de prompts/variables), `@dxgjs/logger`, `@dxgjs/fs` (lecture contexte), `@dxgjs/json` (manipulation JSON de contexte)
- `@dxgjs/updater` – Vérification de mises à jour → dépend de `@dxgjs/fs`, `@dxgjs/logger`, `@dxgjs/validation`, `@dxgjs/json`

### Couche 6 – Extensibilité
- `@dxgjs/plugins` – Système de plugins → dépend de `@dxgjs/core` (DI/event bus pour fournir des services aux plugins), `@dxgjs/logger`, `@dxgjs/validation` (validation du manifeste), `@dxgjs/fs` (chargement du paquet plugin depuis le disque si nécessaire)
> Les plugins eux‑mêmes peuvent déclarer des dépendances vers n’importe quel paquet DXG (ex. un plugin qui ajoute un generator dépendra de `@dxgjs/generators`), mais cela reste dans leurs propres `package.json` et n’affecte pas le graphe du monorepo de base.

### Couche 7 – Applications finales
- `apps/cli` – Interface en ligne de commande principale → dépend de pratiquement tous les packages ci‑dessus selon les commandes implémentées (ex. `dxg generate` dépend de `@dxgjs/generators`, `dxg ai` dépend de `@dxgjs/ai`, `dxg update` dépend de `@dxgjs/updater`, etc.)
- `apps/studio` et `apps/playground` (futur) – similaires, dépendent des packages nécessaires à leurs fonctionnalités.

## Vérification des principes

1. **Aucune dépendance circulaire** : En suivant la stratification ci‑dessus, aucune dépendance ne pointe vers une couche égale ou inférieure (en termes d’abstraction) ; toutes vont de haut vers bas ou restent dans la même couche lorsqu’il s’agit de dépendances utilitaires (ex. `@dxgjs/config` → `@dxgjs/fs` est autorisé car fs est plus fondamental).

2. **Les paquets de bas niveau ne dépendent jamais du CLI** : Le CLI n’apparaît nulle part dans les dépendances des packages (ni dans `packages/` ni dans `tooling/`), seulement dans `apps/cli`. Ainsi, `@dxgjs/fs`, `@dxgjs/logger`, `@dxgjs/core`, etc. restent indépendants du CLI.

3. **Le terminal ne dépend pas de la logique métier du CLI** : `@dxgjs/terminal` ne dépend que de `@dxgjs/logger` et éventuellement `@dxgjs/core`. Il n’a aucune dépendance envers `@dxgjs/generators`, `@dxgjs/ai`, `@dxgjs/workspace`, etc. – la logique de ce qu’afficher reste dans l’appelant (CLI, plugin, etc.).

4. **Le logger ne dépend pas du terminal rendering** : `@dxgjs/logger` dépend au maximum de `@dxgjs/validation` (pour valider ses options) et possiblement `@dxgjs/fs` (si un transport fichier est utilisé). Il ne connaît pas `@dxgjs/terminal`.

5. **Le core reste minimal** : Comme mentionné, `@dxgjs/core` ne dépend que de `@dxgjs/logger` (pour ses propres traces) et `@dxgjs/validation` (pour valider les enregistrements DI et les schémas d’événement). Il n’importe aucun paquet de haut niveau.

6. **Les paquets de haut niveau peuvent dépendre de bas niveau, mais pas l’inverse** : Vérifié dans la stratification – ex. `@dxgjs/generators` (haut) dépend de `@dxgjs/fs` (bas) ; l’inverse n’existe pas.

## Représentation simplifiée (flèches de dépendance)

```
[Couche 7 – Apps]
      ↑
[Couche 6 – Plugins]
      ↑
[Couche 5 – Orchestration]
      ↑
[Couche 4 – Présentation]
      ↑
[Couche 3 – Core]
      ↑
[Couche 2 – Infra]
      ↑
[Couche 1 – Fondamentaux]
```

Chaque flèche « depends on » pointe vers une couche inférieure ou égale (dans le cas de dépendances au sein de la même couche, ex. `@dxgjs/config` → `@dxgjs/fs` reste fondamental).

## Conséquences pour le développement
- Toute introduction d’une nouvelle dépendance doit respecter cette stratification ; sinon, le CI devrait détecter un cycle via `madge` ou `depcruft` et bloquer la merge.
- Les paquets de bas niveau sont largement réutilisables et peuvent être publiés indépendamment avec une surface minimale.
- Les paquets de haut niveau (comme `@dxgjs/ai` ou `@dxgjs/generators`) sont plus spécifiques et peuvent évoluer rapidement sans impacter les fondations.

## Rejetés / alternatives considérées
- **Un seul paquet de utilities** regroupant `fs`, `json`, `env`, `validation` aurait créé un « god package » inutile et aurait lié des préoccupations autrement indépendantes.
- **Faire dépendre le core de tous les infrastructures** aurait rendu le core lourd et aurait introduit des risques de cycles (ex. core → fs → logger → core si logger dépendait de core pour quelque raison).
- **Autoriser les dépendances latérales au sein d’une même couche** uniquement lorsqu’elles sont clairement justifiées et acycliques (ex. `@dxgjs/config` → `@dxgjs/json` est acceptable car json est plus fondamental que config).