# Architecture DXG

## Vision
DXG est un écosystème complet d'outils pour développeurs, conçu pour être modulaire, extensible et adapté aux besoins des équipes modernes. Il s'inspire de projets telles que Angular CLI, Nx, Turborepo, Biome, Bun, Tailwind CSS, Prisma, Vite et Expo, en offrant une expérience cohérente depuis l'initialisation du projet jusqu'au déploiement, en passant par la génération de code, la gestion de la configuration, l'intégration d'IA et bien plus encore.

## Principes architecturaux
1. **Responsabilité unique** : Chaque package possède une seule raison d'être.
2. **Pas de "god packages"** : Éviter les paquets fourre-tout qui deviennent difficiles à maintenir.
3. **Frontières claires** : Les dépendances suivent une direction hiérarchique (de haut niveau vers bas niveau) sans cycles.
4. **Extensibilité par plugin** : Un système de plugin permet d'ajouter des fonctionnalités sans toucher au core.
5. **Orchestration IA** : L'intelligence artificielle est traitée comme une couche d'orchestration supportant plusieurs fournisseurs.
6. **Terminal premium** : Le rendu terminal est séparé de la logique métier pour offrir une expérience riche et testable.
7. **Versionnage indépendant** : Chaque package est versionné séparément selon SemVer.
8. **Open‑source friendly** : Conçu pour accueillir des contributions externes facilement.

## Limites du système
- **DXG Ecosystem** : L'ensemble constitué de tous les packages, du CLI, des outils, de la documentation et des exemples.
- **DXG CLI** : Une application spécifique au sein de l'écosystème, fournissant l'interface en ligne de commande principale.
Les frontières sont définies de telle sorte que le CLI dépend des packages de l'écosystème, mais l'inverse n'est pas vrai.

## Couches principales
1. **Couche d'orchestration** : CLI, générateurs, intelligence artificielle.
2. **Couche d'infrastructure** : Système de fichiers, travail sur les dépôts (git), gestion des gestionnaires de paquets, variables d'environnement, configuration.
3. **Couche de traitement** : Validation, journalisation, types.
4. **Couche de présentation** : Terminal, prompts interactifs.
5. **Couche d'extension** : Système de plugins, registre de templates.

## Philosophie des paquets
Chaque paquet résout un problème bien défini. Par exemple :
- `@dxgjs/terminal` ne fait que le rendu et la gestion de l'interface terminale.
- `@dxgjs/logger` ne fait que la journalisation structurée.
- `@dxgjs/core` fournit uniquement un conteneur d'injection de dépendances et un bus d'événements minimal.
Cette approche évite la création de paquets à responsabilités multiples et facilite le remplacement ou la mise à jour de composants individuels.

## Philosophie des dépendances
- Les dépendances vont du spécifique vers le générique (ex. CLI → workspace → fs).
- Aucun paquet de bas niveau ne dépend d'un paquet de haut niveau (ex. fs ne dépend pas de CLI).
- Le paquet core reste minimal : il ne dépend que du logger (pour ses propres traces) et du validation (pour valider les options d'injection).
- Les cycles sont interdits et seront détectés lors de l'intégration continue.

## Stratégie d'extensibilité
L'extensibilité se fait principalement par le système de plugins. Les plugins peuvent enregistrer :
- De nouvelles commandes CLI
- De nouveaux générateurs
- Des modèles de templates
- Des hooks de cycle de vie
- Des fournisseurs d'IA
- Des extensions du terminal (panels, composants)
Les plugins sont chargés dans un environnement sandboxé pour garantir la sécurité.

## Évolution à long terme
L'écosystème est conçu pour accueillir de nouvelles catégories de fonctionnalités (ex. services cloud, outils de test intégrés, pipelines CI/CD) sans modifier les fondations. Chaque nouveau domaine peut être introduit sous la forme d'un ou plusieurs paquets, éventuellement accompagné d'un plugin d'exemple. Le versionnage indépendant permet de corriger des bogues ou d'ajouter des fonctionnalités dans un paquet sans forcer la mise à jour de l'ensemble.

