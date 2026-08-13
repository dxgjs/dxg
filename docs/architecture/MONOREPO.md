# Structure du monorepo DXG

## Arborescence proposée
```
DXG/
├── apps/
│   ├── cli/              # Interface en ligne de commande principale
│   ├── studio/           # Interface graphique légère (optionnelle, futur)
│   └── playground/       # Bac à sable pour tester les générateurs/plugins
├── packages/
│   ├── @dxg/terminal     # Framework de rendu terminal premium
│   ├── @dxg/logger       # Système de logging structuré & configurable
│   ├── @dxg/workspace    # Détection & manipulation de workspace
│   ├── @dxg/git          # Abstraction Git (commands, parsing)
│   ├── @dxg/fs           # Couche d’abstraction système de fichiers
│   ├── @dxg/config       # Chargement, validation, merge de configurations
│   ├── @dxg/validation   # Schémas de validation (Zod‑like) et helpers
│   ├── @dxg/package-manager  # Interface unifiée npm/yarn/pnpm/bun
│   ├── @dxg/node         # Utilitaires spécifiques à Node (versionning, engines)
│   ├── @dxg/json         # Manipulation avancée de JSON
│   ├── @dxg/env          # Gestion des variables d’environnement
│   ├── @dxg/core         # Kernel léger : DI container, event bus
│   ├── @dxg/ai           # Orchestration IA (providers, agents, planner, cache)
│   ├── @dxg/templates    # Moteur de templates (ejs/liquid‑like)
│   ├── @dxg/generators   # Scaffolding basé sur les templates + prompts
│   ├── @dxg/updater      # Vérification de mise à jour, téléchargement de binaires
│   ├── @dxg/plugins      # Système de plugins (découverte, chargement, hooks)
│   ├── @dxg/prompts      # Bibliothèque de prompts interactifs
│   └── @dxg/telemetry    # Collecte de données d’usage (opt‑in)
├── tooling/
│   ├── scripts/          # Scripts d’automatisation (release, changelog)
│   ├── configs/          # Configurations partagées (eslint, prettier, tsconfig, jest)
│   └── types/            # Types TypeScript partagés entre packages (non publiés)
├── examples/
│   ├── cli‑example/      # Mini‑CLI utilisant les packages DXG
│   └── plugin‑example/   # Exemple de plugin externe
├── tests/
│   ├── fixtures/         # Jeux de données réutilisables
│   └── scripts/          # Harness de test (vitest, playwright, etc.)
├── .github/              # Workflows CI/CD, modèles d’issue/PR
├── README.md
├── pnpm-workspace.yaml   # Définition du workspace
�└── package.json          # Racine du monorepo (scripts globaux, version)
```

## Explication des dossiers

- **apps/** : Contient les applications exécutables. Séparer le CLI d'éventuelles futures GUI (studio, playground) permet une évolution indépendante. Chaque application dépend uniquement des packages publiés.
- **packages/** : Regroupe chaque bibliothèque réutilisable, publiée individuellement sur npm sous le scope `@dxg`. Chaque package a son propre `package.json` et suit SemVer.
- **tooling/** : Héberge tout ce qui sert au développement du monorepo lui‑même (scripts, configurations, types partagés) sans être exposé aux consommateurs.
- **examples/** : Démos et showcases pour les contributeurs ; montrent l'usage réel des packages et des plugins.
- **tests/** : Tests d’intégration cross‑packages ; centralise fixtures et harness de test.
- **scripts/** : Scripts globaux du monorepo (ex. `release`, `changelog`, `lint-all`).
- **.github/** : Workflows GitHub Actions, modèles d'issue et de pull‑request.
- **README.md** : Présentation du projet, guide de contribution, liens vers la documentation.
- **pnpm-workspace.yaml** : Définit les espaces de travail pour pnpm, permettant aux packages de se référencer par leur nom (`workspace:*`).
- **package.json** (racine) : Scripts globaux (`install`, `build`, `test`, `lint`) et métadonnées du monorepo.

## Choix de la solution de gestion de monorepo

### Options évaluées
1. **pnpm workspaces seuls**
   - Avantages : extrêmement rapide, efficace en espace disque grâce au magasin de contenu adressable, prise en charge native des protocoles de workspace (`workspace:*`). Aucun ajout de dépendance externe.
   - Inconvénients : manque de fonctionnalités avancées de mise en cache de tâches (comme Turborepo) ; les scripts sont exécutés tels quels.

2. **pnpm + Turborepo**
   - Avantages : pnpm gère l'installation et le linking ; Turborepo apporte un système de mise en cache puissant pour les tâches de build, test, lint, basé sur le hachage des entrées et des dépendances. Peut considérablement accélérer les CI sur de gros monorepos.
   - Inconvénients : ajout d'une dépendance (`turbo`) ; légère complexité de configuration supplémentaire.

3. **Nx**
   - Avantages : intégré avec des plugins pour nombreuses technologies, fournit une expérience complète (cache, affectation de tâches, génération de code).
   - Inconvénients : plus lourd, impose certaines conventions, peut être surdimensionné pour nos besoins actuels.

4. **Autres solutions (Lerna, Rush, etc.)**
   - Généralement moins performantes ou moins adaptées à l'écosystème pnpm/TypeScript.

### Recommandation
Commencer avec **pnpm workspaces seuls** pour sa simplicité et ses performances intrinsèques. Ajouter **Turborepo** exclusivement pour la mise en cache des tâches de build/test/lint lorsque le monorepo dépasse une certaine taille (par ex. > 30 packages) ou lorsque les temps de CI deviennent un goulot d'étranglement. Cette approche permet de bénéficier du meilleur des deux mondes sans complexité initiale inutile.