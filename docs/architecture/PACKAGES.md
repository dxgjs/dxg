# Catalogue des packages DXG

Chaque package est décrit selon les critères suivants :

- **package name** : nom npm (scope @dxg)
- **purpose** : raison d'être du package
- **responsibilities** : ce que le package fait
- **public surface** : API exposée aux consommateurs
- **internal responsibilities** : logique interne non exposée
- **allowed dependencies** : quels autres packages il peut dépendre
- **forbidden dependencies** : dépendances interdites (pour éviter les cycles ou couplages indésirables)
- **public or internal** : publié sur npm ou réservé à l'usage interne du monorepo
- **exist now or later** : à créer immédiatement ou dans une phase ultérieure

---

## @dxgjs/terminal
- **purpose** : Offrir un rendu terminal riche, personnalisable et performant.
- **responsibilities** : Gestion de l'affichage (texte, couleurs, styles), layouts (flex‑like), thèmes, animations, composants (panels, tables, trees, spinners, progress bars, modals, tooltips), capture d'événements clavier/souris, rendu différé des régions dirty.
- **public surface** : Classes et fonctions pour créer un arbre de rendu (`Box`, `Text`, `Table`, `Tree`, `Spinner`, `ProgressBar`, `Panel`, `Modal`, `Tooltip`), méthodes pour rendre (`render`, `clear`, `resize`), gestion du thème (`setTheme`, `getTheme`), gestion des événements (`onKeyPress`, `onMouseClick`).
- **internal responsibilities** : Calcul de layout, gestion du buffer d'écran, traduction en séquences ANSI/SIXEL, gestion du focus, cache de rendu.
- **allowed dependencies** : `@dxgjs/logger` (pour logger les événements de rendu), `@dxgjs/core` (pour accéder à des services via DI/event bus si nécessaire).
- **forbidden dependencies** : Aucun paquet de haut niveau (CLI, générators, IA, etc.), aucun paquet qui implémente de la logique métier (workspace, git, config, etc.).
- **public or internal** : Public
- **exist now or later** : Maintenant

---

## @dxgjs/logger
- **purpose** : Fournir un système de journalisation structuré, configurable et extensible.
- **responsibilities** : Niveaux de log (trace, debug, info, warn, error, fatal), formatters (JSON, pretty), transports (stdout, fichier, HTTP, webhook), enrichment de contexte (trace‑id, user‑id, tags), filtrage dynamique, rotation de fichiers (optionnelle via transport).
- **public surface** : Méthodes (`log`, `trace`, `debug`, `info`, `warn`, `error`, `fatal`), création d'instances avec options (`createLogger`), méthodes pour ajouter/supprimer des transports, définir le niveau minimal, enrichir le contexte.
- **internal responsibilities** : Gestion des transports, formatage des messages, filtrage selon le niveau, mise en tampon éventuel.
- **allowed dependencies** : `@dxgjs/validation` (pour valider les options de configuration), `@dxgjs/core` (pour publier des événements de log si on utilise le bus d'événements).
- **forbidden dependencies** : Aucun paquet de haut niveau (terminal, CLI, IA, etc.) qui créerait un couplage vers la présentation ou la logique métier.
- **public or internal** : Public
- **exist now or later** : Maintenant

---

## @dxgjs/workspace
- **purpose** : Détecter la racine d'un projet, comprendre sa structure (monorepo simple, pnpm, Nx, Turborepo, Lerna) et fournir les informations sur les projets/workspaces présents.
- **responsibilities** : Lecture des fichiers de définition de workspace (`pnpm-workspace.yaml`, `turbo.json`, `nx.json`, `lerna.json`), analyse du `package.json` racine, résolution des dépendances entre projets, retour d'un arbre de projets avec leurs chemins et leurs `package.json`.
- **public surface** : Fonction asynchrone `detectWorkspace(root?: string) => Promise<WorkspaceResult>`, interfaces `WorkspaceResult`, `WorkspaceProject`.
- **internal responsibilities** : Parsing des fichiers de configuration, résolution des chemins, gestion des cas particuliers (workspaces imbriqués, espaces de travail non standards).
- **allowed dependencies** : `@dxgjs/fs` (lecture du système de fichiers), `@dxgjs/json` (parsing du JSON), `@dxgjs/logger`, `@dxgjs/validation` (validation des schémas de workspace).
- **forbidden dependencies** : Aucun paquet qui dépend de la logique d'application (CLI, générators, IA, terminal).
- **public or internal** : Public
- **exist now or later** : Maintenant

---

## @dxgjs/git
- **purpose** : Abstraction portable et typée des opérations Git courantes.
- **responsibilities** : Exécution des commandes Git de base (`clone`, `pull`, `push`, `commit`, `add`, `reset`, `branch`, `tag`, `status`, `diff`, `log`, `show`, `submodule`), parsing de la sortie lorsqu'il est utile, gestion des erreurs (codes de sortie non nuls), support des signatures GPG et du protocole credential.
- **public surface** : Méthodes typées correspondant aux commandes Git (ex. `git.clone(url, dir) => Promise<void>`), objets de résultat pour le status/diff, gestion des options (ex. `--depth`, `--branch`).
- **internal responsibilities** : Construction des appels processus, gestion du flux stdout/stderr, transformation de la sortie en structures utilisables, gestion du cache d'authentification.
- **allowed dependencies** : `@dxgjs/fs` (création de fichiers temporaires, verification de l'existence de répertoires), `@dxgjs/logger`, `@dxgjs/validation` (validation des paramètres).
- **forbidden dependencies** : Aucun paquet de haut niveau (CLI, workspace, IA, etc.) qui imposerait une logique de quand appeler Git.
- **public or internal** : Public
- **exist now or later** : Maintenant

---

## @dxgjs/fs
- **purpose** : Couche d’abstraction portable du système de fichiers, utilisable avec différents runtimes (Node, Bun, Deno futur).
- **responsibilities** : Opérations de bas niveau : lecture/écriture de fichiers (`readFile`, `writeFile`), copie, suppression, déplacement, création de répertoires, lecture de répertoires (`readdir`), globbing (`glob`), observation de changements (`watch`), création de dossiers temporaires (`mkdtemp`), gestion des liens symboliques, vérification d’existence (`exists`), gestion des permissions (mode).
- **public surface** : Fonctions asynchrones correspondant aux opérations ci‑dessus, avec options (ex. encoding, mode, flag). Retour de Buffers ou strings selon l'encoding.
- **internal responsibilities** : Gestion des différences entre runtimes, normalisation des chemins, gestion des erreurs spécifiques au système d'exploitation.
- **allowed dependencies** : Aucun (c'est un paquet fondamental). Peut dépendre de `@dxgjs/logger` pour tracer ses propres opérations si souhaité, mais généralement pas nécessaire.
- **forbidden dependencies** : Aucun paquet de haut niveau (workflow, configuration, etc.) qui créerait un couplage vers la logique métier. En particulier, ne doit **pas** dépendre de `@dxgjs/json` ou `@dxgjs/config` — ces traitements appartiennent à des paquets spécialisés.
- **public or internal** : Public
- **exist now or later** : Maintenant

---

## @dxgjs/config
- **purpose** : Charger, merger et valider la configuration provenant de plusieurs sources (fichiers, variables d'environnement, arguments CLI, valeurs par défaut).
- **responsibilities** : Définition d'un ordre de priorité (CLI > env > fichier > defaults), support de plusieurs formats (JSON, YAML, TOML), résolution de références internes (`$ref` à la manière de JSON Schema), watch de fichiers pour rechargement à chaud, validation selon un schéma fourni.
- **public surface** : Fonction `loadConfig(sources: ConfigSource[], schema?: Schema) => Promise<ConfigObject>`, méthodes pour ajouter des sources, définir un schéma, activer le watch.
- **internal responsibilities** : Lecture et parsing des différents formats, merger selon la priorité, résolution des références, application du schéma de validation, gestion du watch (via chokidar ou équivalent natif).
- **allowed dependencies** : `@dxgjs/fs` (lecture des fichiers), `@dxgjs/env` (lecture des variables d'environnement), `@dxgjs/validation` (validation du schéma), `@dxgjs/json` (manipulation d'objets JSON si nécessaire), `@dxgjs/logger`.
- **forbidden dependencies** : Aucun paquet de haut niveau (CLI, générators, IA, etc.) qui dicterait quelle configuration charger ou comment l'utiliser.
- **public or internal** : Public
- **exist now or later** : Maintenant

---

## @dxgjs/validation
- **purpose** : Bibliothèque de validation de données inspirée de Zod, fournissant des schémas composables et des messages d'erreur clairs.
- **responsibilities** : Définition de types primitifs (string, number, boolean, bigint, symbol, undefined, null, unknown, any), objets, arrays, tuples, unions, intersections, discriminated unions, refinements, transformation, gestion des erreurs détaillées (chemin, valeur reçue, règle violée).
- **public surface** : Fonction de création de schéma (`z.object({...})`), méthodes de chaîne (`.refine(...)`, `.transform(...)`, `.superRefine(...)`), méthode de parsing (`schema.parse(data) => typed data`), méthode de validation sûre (`schema.safeParse(data) => {success:boolean, data?:T, error?:ZodError}`).
- **internal responsibilities** : Implémentation du parsing récursif, accumulation des erreurs, optimisation pour éviter les clonages inutiles.
- **allowed dependencies** : Aucun (paquet fondamental). Peut logger ses propres opérations via `@dxgjs/logger` si souhaité, mais généralement pas nécessaire.
- **forbidden dependencies** : Aucun paquet de haut niveau (terminal, CLI, IA, etc.) qui créerait un couplage vers la logique métier.
- **public or internal** : Public
- **exist now ou later** : Maintenant

---

## @dxgjs/package-manager
- **purpose** : Interface unifiée au-dessus des principaux gestionnaires de paquets JavaScript (npm, Yarn, pnpm, Bun).
- **responsibilities** : Détection du gestionnaire en cours d'utilisation (via vérification des fichiers de lock ou variables d'environnement), exécution des commandes communes (`install`, `add`, `remove`, `list`, `outdated`, `run-script`, `exec`, `upgrade`, `why`), abstraction des différences de noms de flags et de comportement.
- **public surface** : Classe `PackageManager` avec méthodes statiques (`detect() => PackageManagerInstance`) et méthodes d'instance correspondant aux opérations ci‑dessus, returning des résultats typés (ex. `list() => Promise<Array<PackageInfo>>`).
- **internal responsibilities** : Construction des appels processus spécifiques à chaque gestionnaire, gestion du flux, parsing de la sortie lorsqu'il est utile (ex. sortie de `npm list --json`).
- **allowed dependencies** : `@dxgjs/fs` (vérification de l'existence de lockfiles), `@dxgjs/env` (lecture de variables comme `npm_config_useragent`), `@dxgjs/logger`, `@dxgjs/validation` (vérification des noms de paquets, versions).
- **forbidden dependencies** : Aucun paquet de haut niveau (CLI, générators, IA, etc.) qui supposerait un gestionnaire particulier.
- **public or internal** : Public
- **exist now ou later** : Maintenant

---

## @dxgjs/node
- **purpose** : Utilitaires liés à l'environnement d'exécution Node (et compatible avec Bun/Deno lorsqu'il s'agit de fonctionnalités similaires).
- **responsibilities** : Lecture du fichier `.nvmrc` pour déterminer la version Node souhaitée, comparaison des versions d'engines spécifiées dans `package.json` (`engines.node`), résolution du binaire Node à utiliser, fourniture de helpers pour vérifier la présence de polyfills, détection du runtime actuel (Node vs Bun vs Deno).
- **public surface** : Fonctions telles que `getNodeVersionFromNVMRC(path) => Promise<string|null>`, `satisfiesEngines(packageJsonPath, currentVersion) => Promise<boolean>`, `resolveNodeBinary() => Promise<string>`, `getRuntime() => Promise<'node'|'bun'|'deno'|'unknown'>`.
- **internal responsibilities** : Parsing des fichiers, appel éventuel à des sous‑processus (`nvm`, `fnm`) si disponibles, gestion des erreurs de résolution.
- **allowed dependencies** : `@dxgjs/fs` (lecture du système de fichiers), `@dxgjs/env` (lecture de variables comme `NVMRC`), `@dxgjs/logger`, `@dxgjs/validation` (validation des semver).
- **forbidden dependencies** : Aucun paquet de haut niveau (CLI, IA, générators, etc.) qui supposerait une version particulière ou un runtime spécifique.
- **public or internal** : Public
- **exist now ou later** : Maintenant

---

## @dxgjs/json
- **purpose** : Manipulation avancée et sûre d'objets JSON (deep‑merge, patch, traversal, jq‑like).
- **responsibilities** : Fusion profonde (`merge(target, source)`), application de patch JSON (RFC 6902), parcours d'objet avec sélecteur (`get(obj, path)`), mise à jour (`set(obj, path, value)`), suppression (`del(obj, path)`), parcours récursif (`walk(obj, callback)`), aplatissement et dé‑aplatissement, comparaison profonde.
- **public surface** : Fonctions pures correspondant aux opérations ci‑dessus, en général curriées pour faciliter la composition. Retour de nouveaux objets (immutabilité par défaut) sauf indication contraire.
- **internal responsibilities** : Gestion des tableaux, des propriétés non énumérables, préservation du prototype lorsqu'il est souhaité, gestion profonde des dates, des expressions régulières, etc.
- **allowed dependencies** : Aucun (paquet fondamental). Peut logger via `@dxgjs/logger` si souhaité.
- **forbidden dependencies** : Aucun paquet de haut niveau (terminal, CLI, IA, etc.) qui créerait un couplage vers la logique métier.
- **public or internal** : Public
- **exist now ou later** : Maintenant

---

## @dxgjs/env
- **purpose** : Chargement et expansion des variables d’environnement à partir de fichiers `.env`, `.env.local`, `.env.development`, etc., avec masquage des sekrets.
- **responsibilities** : Lecture d'un ou plusieurs fichiers `.env` selon la priorité, expansion récursive des références (`${VAR}`), fourniture d'une représentation prête à l'emploi (objet clé/valeur), masquage automatique des variables contenant des motifs de sekret (`password`, `secret`, `key`, `token`) dans les logs ou les erreurs.
- **public surface** : Fonction `loadEnv(options?: {cwd?: string; override?: boolean; mask?: RegExp[]}) => Promise<EnvMap>`, helper pour masquer des valeurs dans un objet (`maskSecrets(obj, mask)`).
- **internal responsibilities** : Parsing conforme à la spécification dot‑env, gestion des commentaires et des lignes vides, expansion sûre (éviter les boucles infinies), filtrage des sekrets.
- **allowed dependencies** : `@dxgjs/fs` (lecture des fichiers), `@dxgjs/logger` (pour logger les opérations internes si besoin), `@dxgjs/validation` (validation du nom des variables si souhaité).
- **forbidden dependencies** : Aucun paquet de haut niveau (CLI, IA, générators, etc.) qui supposerait un format particulier de variables d'environnement.
- **public or internal** : Public
- **exist now ou later** : Maintenant

---

## @dxgjs/core
- **purpose** : Noyau léger fournissant les primitives d'injection de dépendances et de communication inter‑paquets via un bus d'événements typé.
- **responsibilities** : Conteneur d'injection de dépendances simple (enregistrement de factories ou d'instances, résolution par nom ou par token), bus d'événements permettant à des packages de s'abonner à des événements typés et de publier des événements, gestion du cycle de vie d'initialisation / arrêt (hooks `onInit`, `onShutdown`).
- **public surface** : Classe `Container` avec méthodes `register<T>(token: string, factory: () => T)` et `resolve<T>(token: string) => T`, classe `EventBus` avec méthodes `on<T>(event: string, handler: (data: T) => void)` et `emit<T>(event: string, data: T)`, éventuellement une façade combinée `DXGCore` qui expose les deux.
- **internal responsibilities** : Gestion du registre des dépendances, résolution des dépendances circulaires (détection et erreur), gestion de la file d'attente d'événements si nécessaire, nettoyage lors de l'arrêt.
- **allowed dependencies** : `@dxgjs/logger` (pour logger les opérations du core lui‑même), `@dxgjs/validation` (pour valider les enregistrements de dépendances ou les schémas d'événements).
- **forbidden dependencies** : Aucun paquet qui implémente de la logique métier de haut niveau (terminal, générators, IA, etc.) qui créerait un couplage indésirable vers le core. Le core doit rester agnostic.
- **public or internal** : Public
- **exist now ou later** : Maintenant

---

## @dxgjs/ai
- **purpose** : Orchestration de l'intelligence artificielle, supportant plusieurs fournisseurs et offrant des agents spécialisés.
- **responsibilities** : Abstraction des fournisseurs d'IA (Claude, GPT, Gemini, Fable, futurs), registre de prompts versionnés, construction de contexte à partir du workspace, de la configuration, du système de fichiers, etc., planification de tâches complexes (décomposition en sous‑tâches, ordonnancement), agents spécialisés (générateur de code, réviseur, refactorer, auditeur), cache sémantique des réponses, gestion du taux de requêtes (rate‑limiter) avec exponentielle backoff, retry et fallback entre fournisseurs.
- **public surface** : Classe `AIOrchestrator` avec méthodes comme `execute(taskName: string, variables: Record<string,any>) => Promise<any>`, enregistrement de fournisseurs (`registerProvider(name, provider)`), enregistrement de promesse de prompts (`registerPrompt(name, template, schema)`), accès au cache (`getCacheStats()`).
- **internal responsibilities** : Construction du contexte, sélection du fournisseur adapté, application du schéma de validation aux variables, appel du provider avec le prompt rendu, post‑treatment éventuel (extraction de blocs de code, formatage), gestion du cache (clé basée sur le hash du prompt+contexte+version provider), gestion des erreurs et du fallback.
- **allowed dependencies** : `@dxgjs/core` (DI/event bus pour obtenir des services comme le logger ou le config), `@dxgjs/config` (chargement des clés API et paramètres de modèle), `@dxgjs/validation` (validation du schéma de prompts et des variables), `@dxgjs/logger` (journalisation des appels IA), `@dxgjs/fs` (lecture éventuelle de fichiers de contexte), `@dxgjs/json` (manipulation d'objets JSON si nécessaire).
- **forbidden dependencies** : Aucun paquet de haut niveau qui dicterait la logique d'appel IA (CLI, générators, etc.) sauf via l'interface publique de l'orchestrateur.
- **public or internal** : Public
- **exist now ou later** : Maintenant

---

## @dxgjs/templates
- **purpose** : Moteur de templates léger et sûr pour la génération de texte à partir de modèles et de données.
- **responsibilities** : Syntaxe similaire à Handlebars/EJS (expressions `{{variable}}`, blocs `{{#if}}`, `{{#each}}`, `{{#with}}`, helpers prédéfinis), échappement automatique pour éviter les injections (XSS, command injection si utilisé dans des scripts), support de layouts et de partials, chargement depuis le système de fichiers ou depuis la mémoire.
- **public surface** : Fonction `compile(templateString: string | TemplateSource) => TemplateFunction`, fonction `render(templateFn, data) => string`, méthodes pour enregistrer des helpers (`registerHelper(name, fn)`) et des partials (`registerPartial(name, template)`).
- **internal responsibilities** : Parsing du template en arborescence, génération de fonction de rendu efficace, gestion du cache des templates compilés, gestion de l'échappement selon le contexte (HTML, texte brut, chemin de fichier, etc.).
- **allowed dependencies** : `@dxgjs/fs` (lecture de fichiers de template si chargé depuis le disque), `@dxgjs/logger` (pour logger les opérations de compilation si besoin), `@dxgjs/validation` (validation des données si le schéma est fourni).
- **forbidden dependencies** : Aucun paquet de haut niveau (terminal, CLI, IA, générators) qui supposerait une utilisation particulière du moteur de templates.
- **public or internal** : Public
- **exist now ou later** : Maintenant

---

## @dxgjs/generators
- **purpose** : Scaffolding guidé par des prompts interactifs et des modèles de templates.
- **responsibilities** : Orchestration du processus de génération : collecte d'informations via des prompts (`@dxgjs/prompts`), sélection d'un template approprié, rendu du template avec les données collectées, écriture des fichiers résultants via `@dxgjs/fs`, éventuellement application de transformations post‑génération (formatage, lint) via des outils ou des agents IA.
- **public surface** : Fonction `generate(generatorName: string, options?: {cwd?: string; promptsOverride?: any}) => Promise<GenerateResult>`, où `GenerateResult` contient la liste des fichiers créés/ modifiés et éventuellement des avertissements.
- **internal responsibilities** : Gestion du flux de prompts, résolution du template (depuis le paquet génétique ou depuis un plugin), appel au moteur de templates, écriture sécurisée des fichiers (éviter l'écrasement accidentel sans confirmation), intégration optionnelle avec `@dxgjs/ai` pour une révision ou un refactoring automatisé.
- **allowed dependencies** : `@dxgjs/prompts` (pour les questions interactives), `@dxgjs/templates` (pour le rendu), `@dxgjs/fs` (écriture des fichiers), `@dxgjs/logger` (journalisation du processus), `@dxgjs/validation` (validation des réponses aux prompts), `@dxgjs/ai` (optionnel, pour la génération assistée ou la révision).
- **forbidden dependencies** : Aucun paquet qui implémente de la logique de haut niveau qui devrait rester dans le générateur lui‑même (ex. pas de dépendance directe à `@dxgjs/terminal` pour l'affichage — le générateur doit retourner le résultat et laisser le décideur (CLI ou plugin) choisir comment l'afficher).
- **public or internal** : Public
- **exist now ou later** : Maintenant

---

## @dxgjs/updater
- **purpose** : Vérification de la disponibilité de mises à jour, téléchargement de binaires ou de paquets, gestion des canaux de distribution (stable, beta, nightly).
- **responsibilities** : Interrogation des registres (npm, GitHub Releases, serveurs personnalisés) pour connaître la dernière version disponible, comparaison avec la version courante selon SemVer, téléchargement avec affichage de progression, validation de l'intégrité (checksum, signature GPG), extraction d'archives, nettoyage des fichiers temporaires.
- **public surface** : Fonction `checkForUpdates(currentVersion: string, channel?: 'stable'|'beta'|'nightly') => Promise<UpdateInfo | null>`, fonction `applyUpdate(updateInfo: UpdateInfo) => Promise<void>`, où `UpdateInfo` contient la version cible, l'URL de téléchargement, les checksums, etc.
- **internal responsibilities** : Construction des requêtes HTTP, gestion du téléchargement en flux, validation des artefacts, gestion du cache de téléchargement, intégration éventuelle avec le système de plugins pour des stratégies de mise à jour personnalisées.
- **allowed dependencies** : `@dxgjs/fs` (écriture et lecture de fichiers temporaires), `@dxgjs/logger` (journalisation des étapes de mise à jour), `@dxgjs/validation` (validation du numéro de version, des schéma de réponse des registres), `@dxgjs/json` (parsing de réponses JSON des registres).
- **forbidden dependencies** : Aucun paquet de haut niveau (CLI, IA, générators, etc.) qui dicterait quand ou comment mettre à jour — la décision appartient à l'application qui utilise l'updater.
- **public or internal** : Public
- **exist now ou later** : Maintenant

---

## @dxgjs/plugins
- **purpose** : Système de découverte, chargement et gestion sécurisée des plugins externes.
- **responsibilities** : Recherche de plugins dans le registre npm (paquets avec champ `dxg-plugin:true` ou suivant la convention `dxg-plugin-*`), chargement dynamique dans un environnement sandboxé (ESM avec `importAttributes` ou `vm2`), validation du manifeste du plugin, enregistrement des points d'extension (commands, generators, hooks, AI providers, terminal extensions), gestion du cycle de vie du plugin (activation, désactivation), fourniture d'une API pour que les plugins puissent accéder aux services du core (logger, config, fs, etc.) via injection de dépendances.
- **public surface** : Fonction `loadPlugins(options?: {cwd?: string; allowUnsafe?: boolean}) => Promise<PluginLoadResult>`, classes permettant aux plugins de déclarer leur manifeste (`export const manifest: PluginManifest`), API pour les plugins afin de s'enregistrer (`registerCommand`, `registerGenerator`, `registerHook`, `registerAIProvider`, `registerTerminalExtension`).
- **internal responsibilities** : Résolution du paquet plugin, création d'un sandbox avec accès limité aux seules APIs autorisées, appel de la fonction d'export du manifeste, validation du schéma du manifeste, enregistrement des extensions dans les registres internes, gestion du déschargement et du nettoyage.
- **allowed dependencies** : `@dxgjs/core` (pour fournir le conteneur DI et le bus d'événements aux plugins), `@dxgjs/logger` (pour logger le chargement des plugins), `@dxgjs/validation` (pour valider le manifeste du plugin), `@dxgjs/fs` (vérifier l'existence du paquet plugin sur le disque si chargé depuis un chemin local).
- **forbidden dependencies** : Aucun paquet de haut niveau (terminal, CLI, IA, générators) qui créerait un couplage indésirable vers le système de plugins depuis l'intérieur d'un plugin — les plugins ne doivent dépendre que des abstractions fournies par le core et les packages qu'ils étendent explicitement.
- **public or internal** : Public
- **exist now ou later** : Maintenant

---

## @dxgjs/prompts
- **purpose** : Bibliothèque d'interaction utilisateur dans le terminal, offrant des prompts interactifs variés.
- **responsibilities** : Types de prompts : entrée de texte (`input`), confirmation (`confirm`), sélection simple (`select`), sélection multiple (`checkbox`), autocomplétion (`autocomplete`), saisie de mot de passe (`password`). Chaque prompt retourne une promesse résolue avec la valeur saisie ou rejetée si l'utilisateur annule (Ctrl+C, Esc). Support du thème pour harmoniser l'apparence avec `@dxgjs/terminal`, validation intégrée des réponses, gestion du masque de saisie (pour les mots de passe ou les entrées sensibles).
- **public surface** : Fonctions correspondant à chaque type de prompt (`promptInput(message, options?)`, `promptConfirm(message, options?)`, `promptSelect(message, choices, options?)`, `promptCheckbox(message, choices, options?)`, `promptAutocomplete(message, suggestions, options?)`, `promptPassword(message, options?)`), chacune retournant `Promise<string | string[] | boolean | void>` selon le type.
- **internal responsibilities** : Gestion du branchement des événements clavier depuis le terminal (via `@dxgjs/terminal` ou abstraction d'événement), rendu des options, gestion de la navigation (flèches, entrée, échappement), affichage dynamique basé sur le thème, masque de saisie pour les mots de passe.
- **allowed dependencies** : `@dxgjs/terminal` (pour afficher les prompts et capturer les entrées si le moteur de prompt est construit sur le terminal), `@dxgjs/logger` (journalisation des interactions si désiré), `@dxgjs/validation` (validation des réponses si un schéma est fourni).
- **forbidden dependencies** : Aucun paquet de haut niveau (CLI, générators, IA, etc.) qui dicterait quoi demander ou comment interpréter les réponses — la logique de promptage doit rester pure et réutilisable.
- **public or internal** : Public
- **exist now ou later** : Maintenant

---

## @dxgjs/telemetry
- **purpose** : Collecte optionnelle et anonymisée de données d'utilisation pour améliorer le produit tout en respectant la vie privée.
- **responsibilities** : Génération d'un identificateur anonyme stabilisé (UUID v4 stocké ou dérivé), envoi périodique d'un payload contenant des métriques d'utilisation (commandes exécutées, succès/échec, durées, versions des packages, système d'exploitation, architecture CPU) à un endpoint de télémetry, respect du consentement de l'utilisateur (opt‑in via drapeau dans la configuration ou variable d'environnement), batching des événements pour réduire le nombre de requêtes, chiffrement ou obfuscation légère des données sensibles, conformité au Do‑Not‑Track.
- **public surface** : Fonction `startTelemetry(options?: {endpoint?: string; intervalMs?: number; consentCallback?: () => Promise<boolean>}) => Promise<TelemetryController>`, méthodes sur le contrôleur pour mettre à jour le consentement, forcer l'envoi, arrêter la telemetry.
- **internal responsibilities** : Génération et stockage sûr de l'ID anonyme, construction du payload selon un schéma prédéfini, gestion du file d'attente d'événements, gestion du temps et du ré‑envoi en cas d'échec, effacer les données sensibles avant l'envoi.
- **allowed dependencies** : `@dxgjs/fs` (stockage de l'ID anonyme sur le disque), `@dxgjs/logger` (pour logger les erreurs de telemetry sans révéler de données sensibles), `@dxgjs/validation` (validation du schéma du payload si besoin), `@dxgjs/json` (sérialisation du payload).
- **forbidden dependencies** : Aucun paquet de haut niveau (CLI, IA, générators, etc.) qui supposerait que la telemetry est toujours active ou qui dicterait quoi collecter — la décision d'activer et la définition du payload restent dans ce paquet.
- **public or internal** : Public
- **exist now ou later** : Maintenant

---

## Remarques générales et défis
- Aucun des paquets listés ci‑dessus ne doit être considéré comme obligatoire immédiatement ; certains pourraient être introduits ultérieurement selon les besoins réels (ex. `@dxgjs/updater` pourrait attendre une première version binaire du CLI).
- La séparation stricte entre `@dxgjs/terminal` et `@dxgjs/logger` est volontaire : le terminal ne doit **pas** effectuer de journalisation, et le logger ne doit **pas** connaître de concepts de rendu.
- Le paquet `@dxgjs/core` est volontairement minimal ; il ne doit **pas** s'étendre pour inclure de la logique de configuration, de validation ou de templating — ces responsabilités appartiennent à leurs propres paquets dédiés.
- Un éventuel paquet `@dxgjs/types` global n'est **pas** créé ; les types restent soit dans le paquet concerné, soit dans les contrats internes non publiés (voir la section Type Architecture plus bas).
- Si deux paquet devaient être fusionnés (ex. `@dxgjs/env` et `@dxgjs/config` partagent des responsabilités de chargement), nous avons décidé de les garder séparés car le chargement d'env est une préoccupation distincte de la résolution de configuration à multiples sources et formats.
- Un paquet manquant pourrait être `@dxgjs/errors` pour une hiérarchie d'erreurs typée, mais nous estimons que les erreurs peuvent être modélisées comme des objets simples enrichis de contexte et que chaque paquet peut définir ses propres types d'erreur si nécessaire ; un paquet dédié ajouterait de l'indirection sans bénéfice clair.
- Le paquet `@dxgjs/processus` (gestion du cycle de vie des sous‑processus) est couvert par `@dxgjs/fs` (création de fichiers temporaires) et par l'utilisation directe de `child_process` dans les paquets qui en ont besoin (comme `@dxgjs/git`, `@dxgjs/package-manager`) ; aucune abstraction supplémentaire n'est jugée nécessaire actuellement.

---

## Type Architecture (où vivent les types)

### @dxgjs/types (option envisagée mais rejetée)
Nous avons délibérément **évité** de créer un paquet global `@dxgjs/js/types` contenant tous les types de l'écosystème. Un tel paquet aurait tendance à devenir un fourre‑tout et à créer des couplages indésirables : un paquet de bas niveau finirait par dépendre de types définissant des concepts de haut niveau simplement pour partager une interface.

### Types locaux (préférés)
- Chaque paquet définit ses propres types et interfaces qui sont strictement liés à ses responsabilités.
  Exemple : `@dxgjs/terminal` définit les types `TerminalOptions`, `Theme`, `BoxProps`, etc.
  Exemple : `@dxgjs/validation` définit `Schema<T>`, `ParseResult<T>`, etc.
- Cette approche garantit que les types évoluent avec leur paquet et que les consommateurs n'importent que ce qui leur est réellement nécessaire.

### Contrats partagés internes (non publiés)
Seuls les **contrats stables et trans‑domaine** sont partagés via un mécanisme interne non publié (dans `tooling/types/` ou un paquet privé `@dxgjs/_contracts` non publié sur npm). Ces contrats incluent :
- Interface du manifeste de plugin (`PluginManifest`)
- Types d'événements du bus d'événements core (`EventMap`)
- Types de contexte transmis entre les étapes d'une opération CLI (ex. `CliContext`)
- Types de résultat de détection de workspace (`WorkspaceResult`, `WorkspaceProject`)

Ces types sont importés en relative (`../../tooling/types/...`) ou via un alias de type uniquement (pas de code d'exécution publié). Ils ne sont **pas** empaquetés dans les distributions npm, évitant ainsi l'exposition d'API internes aux consommateurs extérieurs.

### Contenu de @dxgjs/core
Le paquet `@dxgjs/core` ne contient que :
- Le conteneur d'injection de dépendances (`Container`)
- Le bus d'événements typé (`EventBus`)
- Éventuellement quelques types utilitaires très généraux (`DXGToken<T>` pour représenter un enregistrement DI, `ListenerFn`).
Il **ne** contient pas :
- Types de configuration spécifiques
- Types de validation
- Types de template
- Types de terminal
- Tout autre type appartenant à un domaine particulier.

Cette restriction garantit que le core reste véritablement agnostic et ne devient pas un dépôt de types hétérogènes.