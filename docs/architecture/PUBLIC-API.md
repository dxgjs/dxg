# API publiques DXG (conceptuelles)

Cette section décrit conceptuellement les API publiques des différents packages DXG. Aucune implémentation n'est fournie ici ; seules les signatures, les responsabilités et les consommateurs sont expliqués.

Chaque entrée indique :
- **Ce que fait l’API**
- **Quel paquet la possède**
- **Qui la consomme** (ex. CLI, autres packages, plugins)
- **Public ou interne** (visibilité hors du monorepo ou uniquement interne)

---

## @dxgjs/terminal

### `terminal.render(tree: RenderableNode, options?: RenderOptions) => void`
- **Ce que fait** : Rend un arbre de nœuds terminaux (`Box`, `Text`, `Table`, etc.) dans le terminal réel, en appliquant le thème actif et en ne mettant à jour que les régions modifiées (render différé).
- **Possédé par** : `@dxgjs/terminal`
- **Consommateurs** : CLI (pour afficher le résultat des commandes), prompts interactifs (`@dxgjs/prompts`), panneaux de plugins, sorties de génération de code, tout composant qui veut afficher du contenu riche.
- **Public** : Oui

### `terminal.clear() => void`
- **Ce que fait** : Efface complètement l’écran terminal et replace le curseur en haut‑gauche.
- **Possédé par** : `@dxgjs/terminal`
- **Consommateurs** : CLI (avant d’afficher une nouvelle vue), prompts, écrans de bienvenue.
- **Public** : Oui

### `terminal.resize(width: number, height: number) => void`
- **Ce que fait** : Informe le terminal d’un changement de taille de la console (généralement déclenché par un événement SIGWINCH ou via l’API du terminal).
- **Possédé par** : `@dxgjs/terminal`
- **Consommateurs** : Gestionnaire d’événements du terminal interne, CLI pour adapter les layouts.
- **Public** : Oui (souvent utilisé en interne mais exposé pour les intégrations avancées)

### `terminal.onKeyPress(handler: (key: KeyEvent) => void) => () => void`
- **Ce que fait** : Enregistre un rappel pour les événements de touche clavier ; retourne une fonction de désabonnement.
- **Possédé par** : `@dxgjs/terminal`
- **Consommateurs** : Prompts interactifs, panneaux personnalisés, plugins qui veulent ajouter des raccourcis clavier.
- **Public** : Oui

### `terminal.getTheme() => Theme`
- **Ce que fait** : Retourne l’objet thème actuellement actif (couleurs, styles de bordure, caractères de ligne).
- **Possédé par** : `@dxgjs/terminal`
- **Consommateurs** : Composants de rendu qui ont besoin de connaître les couleurs actuelles, plugins qui souhaitent adapter leur apparence.
- **Public** : Oui

### `terminal.setTheme(theme: Theme) => void`
- **Ce que fait** : Définit un nouveau thème actif ; déclenche un re‑render de l’affichage actuel.
- **Possédé par** : `@dxgjs/terminal`
- **Consommateurs** : CLI (changement de thème via commande), plugins, fichiers de configuration.
- **Public** : Oui

---

## @dxgjs/logger

### `logger.createLogger(options?: LoggerOptions) => LoggerInstance`
- **Ce que fait** : Crée une nouvelle instance de logger avec les options spécifiées (niveau minimal, formatters, transports, contexte par défaut).
- **Possédé par** : `@dxgjs/logger`
- **Consommateurs** : Tous les packages qui ont besoin de journaliser (core, terminal, cli, generators, IA, etc.), plugins, applications.
- **Public** : Oui

### `loggerInstance.log(level: LogLevel, message: string, meta?: Record<string, any>) => void`
- **Ce que fait** : Écrit un message de journal au niveau spécifié, en enrichissant avec le contexte éventuel.
- **Possédé par** : `@dxgjs/logger` (sur l’instance)
- **Consommateurs** : Code interne des packages.
- **Public** : Oui (via l’instance retournée)

### Méthodes de commodité : `trace`, `debug`, `info`, `warn`, `error`, `fatal`
- **Ce que font** : Appellent `log` avec le niveau correspondant.
- **Possédé par** : `@dxgjs/logger`
- **Consommateurs** : Tout le code.
- **Public** : Oui

### `loggerInstance.setLevel(level: LogLevel) => void`
- **Ce que fait** : Change dynamiquement le niveau minimal de journalisation pour cette instance.
- **Possédé par** : `@dxgjs/logger`
- **Consommateurs** : CLI (option `--verbose`/`--silent`), programmes qui veulent ajuster le verbeage à l’exécution.
- **Public** : Oui

### `loggerInstance.addTransport(transport: Transport) => void`
- **Ce que fait** : Ajoute un nouveau transport (ex. fichier, HTTP, webhook) à l’instance de logger.
- **Possédé par** : `@dxgjs/logger`
- **Consommateurs** : Applications qui veulent envoyer les logs vers un fichier ou un service externe.
- **Public** : Oui

---

## @dxgjs/workspace

### `workspace.detect(root?: string) => Promise<WorkspaceResult>`
- **Ce que fait** : À partir d’un répertoire racine optionnel (défaut : répertoire de travail courant), détecte si le projet est un workspace (pnpm, Turborepo, Nx, Lerna, ou simple monorepo) et retourne la racine du workspace ainsi que la liste des projets présents avec leur `package.json`.
- **Possédé par** : `@dxgjs/workspace`
- **Consommateurs** : CLI (commandes qui travaillent sur l’ensemble du workspace, ex. `dxg update --all`), generators qui veulent itérer sur tous les paquets, plugins qui ont besoin de connaître la structure du projet.
- **Public** : Oui

### Interfaces retournées :
- `interface WorkspaceResult { root: string; projects: WorkspaceProject[]; }`
- `interface WorkspaceProject { name: string; path: string; packageJson: Record<string, any>; dependencies: Record<string, string>; }`
- **Possédé par** : `@dxgjs/workspace`
- **Consommateurs** : Tout consommateur de la fonction `detect`.
- **Public** : Oui (les interfaces sont publiques car retournées par une fonction publique)

---

## @dxgjs/git

### `git.clone(url: string, destination?: string, options?: CloneOptions) => Promise<void>`
- **Ce que fait** : Clone un dépôt Git distant dans le répertoire de destination (ou répertoire courant si non spécifié).
- **Possédé par** : `@dxgjs/git`
- **Consommateurs** : CLI (commande `dxg clone` éventuelle), updater qui récupère des sources, plugins qui veulent ajouter un sous‑module.
- **Public** : Oui

### `git.pull(options?: PullOptions) => Promise<void>`
- **Ce que fait** : Effectue un `git pull` dans le répertoire de travail actuel (ou spécifié dans les options).
- **Possédé par** : `@dxgjs/git`
- **Consommateurs** : CLI (commande `dxg pull`), updater, scripts de release.
- **Public** : Oui

### `git.push(options?: PushOptions) => Promise<void>`
- **Ce que fait** : Effectue un `git push`.
- **Possédé par** : `@dxgjs/git`
- **Consommateurs** : CLI, workflows de release.
- **Public** : Oui

### `git.commit(message: string, options?: CommitOptions) => Promise<string>` (renvoie le hash du commit)
- **Ce que fait** : Crée un commit avec le message donné et les options (ajout éventuel de fichiers, signature GPG).
- **Possédé par** : `@dxgjs/git`
- **Consommateurs** : CLI (commande `dxg commit`), plugins qui veulent automatiser le commit après génération.
- **Public** : Oui

### `git.status() => Promise<GitStatusResult>`
- **Ce que fait** : Retourne l’état du répertoire de travail (fichiers modifiés, ajoutés, supprimés, branche actuelle, etc.).
- **Possédé par** : `@dxgjs/git`
- **Consommateurs** : CLI (commande `dxg status`), plugins qui veulent vérifier avant d’agir.
- **Public** : Oui

### Autres fonctions utiles : `branch`, `tag`, `log`, `diff`, `show`, `submoduleUpdate`, `fetch`, `reset`
- **Possédé par** : `@dxgjs/git`
- **Consommateurs** : CLI, plugins, scripts d’automatisation.
- **Public** : Oui

---

## @dxgjs/config

### `config.load(sources: ConfigSource[], schema?: Schema<any>) => Promise<ConfigObject>`
- **Ce que fait** : Charge la configuration à partir d’une liste ordonnée de sources (fichiers JSON/YAML/TOML, variables d’environnement, arguments CLI, valeurs par défaut), les fusionne selon la priorité (CLI > env > fichier > defaults), puis valide le résultat contre le schéma fourni (le cas échéant).
- **Possédé par** : `@dxgjs/config`
- **Consommateurs** : CLI (chargement de `dxg.config.json`), generators qui veulent lire la configuration du projet, plugins qui ont besoin de paramètres, IA (pour lire les clés API et les préférences de modèle).
- **Public** : Oui

### Interfaces
- `type ConfigSource = { type: 'file' | 'env' | 'cli' | 'default'; payload?: any; }`
- `interface ConfigObject extends Record<string, any>` – le résultat typé si un schéma est fourni, sinon `Record<string, any>`.
- **Possédé par** : `@dxgjs/config`
- **Consommateurs** : Toute fonction qui consomme le résultat de `load`.
- **Public** : Oui

### `config.watch(sources: ConfigSource[], callback: (newConfig: ConfigObject) => void) => () => void`
- **Ce que fait** : Surveille les fichiers de configuration spécifiés et rappelle le callback lorsqu’un quelconque change (re‑chargement et re‑validation).
- **Possédé par** : `@dxgjs/config`
- **Consommateurs** : CLI (mode watch pour les commandes de développement), plugins qui veulent réagir aux changements de config à chaud.
- **Public** : Oui

---

## @dxgjs/validation

### `validation.object<T extends Record<string, any>>(shape: { [K in keyof T]: Schema<T[K]> }) => Schema<T>`
- **Ce que fait** : Crée un schéma pour un objet avec les champs spécifiés.
- **Possédé par** : `@dxgjs/validation`
- **Consommateurs** : Tous les packages qui veulent valider des entrées de configuration, des réponses de prompts, des données d’IA, etc.
- **Public** : Oui

### `validation.string(options?: { minLength?: number; maxLength?: number; regex?: RegExp; }) => Schema<string>`
- **Ce que fait** : Crée un schéma pour une chaîne avec contraintes éventuelles.
- **Possédé par** : `@dxgjs/validation`
- **Consommateurs** : Validation de noms de paquets, de chemins, de réponses de prompts.
- **Public** : Oui

### `validation.number(options?: { min?: number; max?: number; integer?: boolean; }) => Schema<number>`
- **Ce que fait** : Crée un schéma pour un nombre.
- **Possédé par** : `@dxgjs/validation`
- **Consommateurs** : Validation de ports, de versions, de compteurs.
- **Public** : Oui

### `validation.union<T extends Schema<any>[]>(schemas: T) => Schema<UnionType<T>>`
- **Ce que fait** : Crée un schéma qui accepte l’un des schémas fournis.
- **Possédé par** : `@dxgjs/validation`
- **Consommateurs** : Quand un champ peut être de plusieurs types (ex. string ou number).
- **Public** : Oui

### `validation.refine<T>(schema: Schema<T>, refinement: (value: T) => boolean, message?: string) => Schema<T>`
- **Ce que fait** : Ajoute une affirmation personnalisée à un schéma existant.
- **Possédé par** : `@dxgjs/validation`
- **Consommateurs** : Validation conditionnelle (ex. « ce nombre doit être pair »).
- **Public** : Oui

### `schema.parse(data: unknown) => T` (et `schema.safeParse`)
- **Ce que fait** : Valide `data` contre le schéma ; lance une erreur détaillée si échec ou retourne la valeur typée si succès. `safeParse` retourne un objet `{ success: boolean; data?: T; error?: ValidationError }`.
- **Possédé par** : `@dxgjs/validation` (sur l’instance de schéma retournée par les fabriques ci‑dessus).
- **Consommateurs** : Tout code qui veut garantir la conformité d’une entrée.
- **Public** : Oui

---

## @dxgjs/package-manager

### `packageManager.detect() => Promise<PackageManagerInstance>`
- **Ce que fait** : Détermine quel gestionnaire de paquets est actif dans le répertoire courant (en cherchant `pnpm-lock.yaml`, `yarn.lock`, `package-lock.json`, `bun.lockb` ou en vérifiant les variables d’environnement).
- **Possédé par** : `@dxgjs/package-manager`
- **Consommateurs** : CLI (avant d’exécuter une installation), generators qui veulent ajouter une dépendance, updater qui veut vérifier les versions.
- **Public** : Oui

### Méthodes sur l’instance (exemplaires) :
- `install(options?: InstallOptions) => Promise<void>` – Installe les dépendances selon le lockfile.
- `add(packageName: string, version?: string, options?: AddOptions) => Promise<void>` – Ajoute une dépendance.
- `remove(packageName: string, options?: RemoveOptions) => Promise<void>` – Supprime une dépendance.
- `list(options?: ListOptions) => Promise<Array<PackageInfo>>` – Retourne la liste des paquets installés.
- `outdated(options?: OutdatedOptions) => Promise<Array<OutdatedInfo>>` – Retourne les paquets avec une version plus récente disponible.
- `runScript(scriptName: string, args?: string[], options?: RunOptions) => Promise<void>` – Exécute un script défini dans `package.json`.
- **Possédé par** : `@dxgjs/package-manager`
- **Consommateurs** : CLI (commandes `dxg add`, `dxg remove`, `dxg update`), generators, updater, plugins.
- **Public** : Oui

### Interfaces de retour (exemple) :
- `interface PackageInfo { name: string; version: string; dev: boolean; }`
- **Possédé par** : `@dxgjs/package-manager`
- **Consommateurs** : Toute fonction qui consomme le résultat de `list` ou `outdated`.
- **Public** : Oui

---

## @dxgjs/node

### `node.getRuntime() => Promise<'node' | 'bun' | 'deno' | 'unknown'>`
- **Ce que fait** : Détermine quel runtime JavaScript est actuellement utilisé.
- **Possédé par** : `@dxgjs/node`
- **Consommateurs** : CLI (pour afficher des avertissements ou adapter le comportement), generators qui veulent générer du code spécifique au runtime, upgrader qui veut vérifier la compatibilité.
- **Public** : Oui

### `node.resolveNodeBinary() => Promise<string>`
- **Ce que fait** : Retourne le chemin complet du binaire Node à utiliser (en tenant compte de `.nvmrc`, `nvm`, `fnm` ou du PATH).
- **Possédé par** : `@dxgjs/node`
- **Consommateurs** : CLI (exécution de sous‑processus Node), updater qui veut télécharger un binaire Node spécifique.
- **Public** : Oui

### `node.satisfiesEngines(packageJsonPath: string, currentVersion: string) => Promise<boolean>`
- **Ce que fait** : Vérifie si la version du runtime actuelle satisfait le champ `engines` du `package.json` indiqué.
- **Possédé par** : `@dxgjs/node`
- **Consommateurs** : CLI (avant d’exécuter un générateur qui dépend d’une version Node précise), plugins qui veulent vérifier lacompatibilité.
- **Public** : Oui

### `node.readNVMRC(filePath?: string) => Promise<string | null>`
- **Ce que fait** : Lit le fichier `.nvmrc` et retourne la version spécifiée (ou null si absent/invalide).
- **Possédé par** : `@dxgjs/node`
- **Consommateurs** : Même usage que ci‑dessus.
- **Public** : Oui

---

## @dxgjs/env

### `env.load(options?: { cwd?: string; override?: boolean; mask?: RegExp[] }) => Promise<EnvMap>`
- **Ce que fait** : Charge les variables d’environnement à partir des fichiers `.env`, `.env.local`, `.env.development`, `.env.production` (selon la valeur de `NODE_ENV` ou du mode) en appliquant la priorité et en expandant les références `${VAR}`.
- **Possédé par** : `@dxgjs/env`
- **Consommateurs** : CLI (chargement de la configuration initiale), config loader (pour injecter les variables d’environnement dans la hiérarchie de configuration), generators qui veulent accéder à des variables lors du rendu, IA (pour lire les clés API stockées en .env).
- **Public** : Oui

### `env.maskSecrets(target: Record<string, any>, mask?: RegExp[]) => Record<string, any>`
- **Ce que fait** : Retourne une copie de l’objet où les valeurs correspondant aux motifs de masque (par défaut : `/(pass|secret|key|token|auth)/i`) sont remplacées par `"[SECRET]"`.
- **Possédé par** : `@dxgjs/env`
- **Consommateurs** : Logger (pour éviter d’écrire des sekrets en clair), tout code qui veut afficher en toute sécurité un objet de configuration.
- **Public** : Oui

---

## @dxgjs/core

### `core.container.register<T>(token: string, factory: () => T) => void`
- **Ce que fait** : Enregistre une factory pour créer une dépendance de type `T` associée à `token`. La factory est appelée lazy‑ement au moment de la résolution.
- **Possédé par** : `@dxgjs/core`
- **Consommateurs** : Tous les packages qui veulent fournir un service (ex. logger, config, fs) aux autres packages via injection de dépendances.
- **Public** : Oui

### `core.container.resolve<T>(token: string) => T`
- **Ce que fait** : Résout et retourne une instance de la dépendance associée à `token` (en appelant la factory si nécessaire).
- **Possédé par** : `@dxgjs/core`
- **Consommateurs** : Tous les packages qui veulent consommer un service fourni par un autre paquet.
- **Public** : Oui

### `core.eventBus.on<T>(event: string, handler: (data: T) => void) => () => void`
- **Ce que fait** : S’abonne à un événement nommé ; retourne une fonction de désabonnement.
- **Possédé par** : `@dxgjs/core`
- **Consommateurs** : Packages qui veulent réagir à des événements du cycle de vie (ex. `pre:generate`, `post:update`), plugins qui veulent étendre le comportement.
- **Public** : Oui

### `core.eventBus.emit<T>(event: string, data: T) => void`
- **Ce que fait** : Publie un événement avec la donnée associée ; tous les abonnés reçoivent l’appel.
- **Possédé par** : `@dxgjs/core`
- **Consommateurs** : Packages qui veulent notifier d’un changement d’état.
- **Public** : Oui

---

## @dxgjs/ai

### `ai.orchestrator.execute(taskName: string, variables: Record<string, any>, options?: { provider?: string; temperature?: number; }) => Promise<any>`
- **Ce que fait** : Exécute une tâche d’IA nommée (ex. « generate-component », « refactor-code », « audit-security ») en construisant un prompt à partir d’un template enregistré, en injectant les variables, en appelant le fournisseur sélectionné (ou le défaut), et en retournant le résultat brut du modèle.
- **Possédé par** : `@dxgjs/ai`
- **Consommateurs** : CLI (commande `dxg ai`), generators qui veulent une génération assistée ou une révision, plugins qui veulent offrir des fonctionnalités IA.
- **Public** : Oui

### `ai.orchestrator.registerProvider(name: string, provider: AIProvider) => void`
- **Ce que fait** : Enregistre un nouveau fournisseur d’IA (doit implémenter l’interface `AIProvider` avec méthodes `complete`, `stream`, `embed`).
- **Possédé par** : `@dxgjs/ai`
- **Consommateurs** : Plugins qui veulent ajouter un support pour un nouveau modèle ou un fournisseur privé.
- **Public** : Oui

### `ai.orchestrator.registerPrompt(name: string, template: string, schema?: Schema<any>) => void`
- **Ce que fait** : Enregistre un template de prompt associé à un nom et éventuellement un schéma de validation pour les variables.
- **Possédé par** : `@dxgjs/ai`
- **Consommateurs** : Même chose que ci‑dessus ; permet de définir des prompts réutilisables pour différentes tâches.
- **Public** : Oui

### `ai.orchestrator.getCacheStats() => CacheStats`
- **Ce que fait** : Retourne des statistiques sur le cache sémantique (taux de hit, nombre d’entrées, taille moyenne).
- **Possédé par** : `@dxgjs/ai`
- **Consommateurs** : CLI (option de débogage), outils de monitoring.
- **Public** : Oui

### Interfaces (exemple) :
- `interface AIProvider { complete(prompt: string, opts?: AIOptions): Promise<string>; stream(prompt: string, opts?: AIOptions): AsyncIterable<string>; embed(text: string): Promise<number[]>; }`
- `interface CacheStats { hits: number; misses: number; hitRate: number; entryCount: number; }`
- **Possédé par** : `@dxgjs/ai`
- **Consommateurs** : Tout ce qui consomme les méthodes ci‑dessus.
- **Public** : Oui

---

## @dxgjs/templates

### `templates.compile(source: string | TemplateSource) => TemplateFunction`
- **Ce que fait** : Compile une chaîne de template (ou une promesse qui résout vers une chaîne) en une fonction de rendu efficace.
- **Possédé par** : `@dxgjs/templates`
- **Consommateurs** : Generators (pour rendre des fichiers à partir de données), plugins qui veulent fournir leurs propres templates, tout code qui veut générer du texte dynamique.
- **Public** : Oui

### `templates.render(fn: TemplateFunction, data: Record<string, any>) => string`
- **Ce que fait** : Exécute la fonction de template compilée avec les données fournies, retourne la chaîne résultante.
- **Possédé par** : `@dxgjs/templates`
- **Consommateurs** : Même que ci‑dessus.
- **Public** : Oui

### `templates.registerHelper(name: string, fn: HelperFunction) => void`
- **Ce que fait** : Enregistre un helper utilisable dans les templates (`{{name arg1 arg2}}`).
- **Possédé par** : `@dxgjs/templates`
- **Consommateurs** : Ceux qui veulent étendre le moteur de template avec des fonctions personnalisées (ex. formatage de date, conversion en majuscules).
- **Public** : Oui

### `templates.registerPartial(name: string, template: string) => void`
- **Ce que fait** : Enregistre un partial (un sous‑template) pouvant être inclus avec `{{> name}}`.
- **Possédé par** : `@dxgjs/templates`
- **Consommateurs** : Même que ci‑dessus.
- **Public** : Oui

---

## @dxgjs/generators

### `generators.generate(name: string, options?: { cwd?: string; promptsOverride?: any; skipAi?: boolean }) => Promise<GenerateResult>`
- **Ce que fait** : Lance le processus de génération pour le générateur identifié par `name` : collecte d’informations via des prompts (sauf si `promptsOverride` est fourni), sélection du template approprié, rendu avec les données, écriture des fichiers, étape optionnelle de révision ou de refactoring via IA (si `skipAi` est false et qu’un fournisseur est configuré).
- **Possédé par** : `@dxgjs/generators`
- **Consommateurs** : CLI (commande `dxg generate`), plugins qui veulent offrir leurs propres generators, scripts d’automatisation qui veulent scaffollder un nouveau composant ou un nouveau service.
- **Public** : Oui

### Interface de résultat (exemple) :
- `interface GenerateResult { created: string[]; modified: string[]; skipped: string[]; warnings: string[]; }`
- **Possédé par** : `@dxgjs/generators`
- **Consommateurs** : Même que ci‑dessus.
- **Public** : Oui

### `generators.registerGenerator(name: string, factory: () => GeneratorInterface) => void`
- **Ce que fait** : Permet à un plugin d’enregistrer un nouveau generator qui deviendra disponible via `dxg generate <name>`.
- **Possédé par** : `@dxgjs/generators`
- **Consommateurs** : Plugins qui veulent étendre les possibilités de scaffolding.
- **Public** : Oui

---

## @dxgjs/updater

### `updater.checkForUpdates(currentVersion: string, channel?: 'stable' | 'beta' | 'nightly') => Promise<UpdateInfo | null>`
- **Ce que fait** : Interroge le registre configuré (npm, GitHub Releases, serveur personnalisé) pour déterminer si une version plus récente de DXG est disponible dans le canal spécifié.
- **Possédé par** : `@dxgjs/updater`
- **Consommateurs** : CLI (commande `dxg update` ou vérification automatique au démarrage), scripts de CI qui veulent s’assurer d’utiliser la dernière version.
- **Public** : Oui

### Interface `UpdateInfo` (exemple) :
- `interface UpdateInfo { version: string; releaseNotes: string; tarballUrl: string; signature?: string; requiredNodeVersion?: string; }`
- **Possédé par** : `@dxgjs/updater`
- **Consommateurs** : Même que ci‑dessus.
- **Public** : Oui

### `updater.applyUpdate(updateInfo: UpdateInfo) => Promise<void>`
- **Ce que fait** : Télécharge l’artifact spécifié, vérifie son intégrité, extrait éventuellement l’archive, remplace l’installation actuelle (ou installe la version côte à côte selon la stratégie).
- **Possédé par** : `@dxgjs/updater`
- **Consommateurs** : Même que ci‑dessus (généralement appelé après un `checkForUpdates` positif).
- **Public** : Oui

---

## @dxgjs/plugins

### `plugins.load(options?: { cwd?: string; allowUnsafe?: boolean }) => Promise<PluginLoadResult>`
- **Ce que fait** : Recherche dans le répertoire spécifié (ou cwd) les paquets installés qui déclarent être un plugin DXG (champ `dxg-plugin:true` dans `package.json` ou suivant la convention `dxg-plugin-*`), les charge dans un environnement sandboxé, valide leur manifeste et enregistre leurs extensions (commands, generators, hooks, AI providers, terminal extensions).
- **Possédé par** : `@dxgjs/plugins`
- **Consommateurs** : CLI (au démarrage, pour activer les plugins installés), outils de développement qui veulent recharger les plugins à la volée.
- **Public** : Oui

### Interface `PluginLoadResult` (exemple) :
- `interface PluginLoadResult { loaded: string[]; failed: Array<{ name: string; error: string }>; warnings: string[]; }`
- **Possédé par** : `@dxgjs/plugins`
- **Consommateurs** : Même que ci‑dessus.
- **Public** : Oui

### API pour les plugins (exposées au sein du sandbox) :
- `plugin.registerCommand(command: CommandDescriptor) => void`
- `plugin.registerGenerator(generator: GeneratorDescriptor) => void`
- `plugin.registerHook(hook: HookDescriptor) => void`
- `plugin.registerAIProvider(provider: AIProviderDescriptor) => void`
- `plugin.registerTerminalExtension(extension: TerminalExtensionDescriptor) => void`
- **Possédé par** : `@dxgjs/plugins` (mais appelées depuis le contexte du plugin)
- **Consommateurs** : Le code du plugin lui‑même.
- **Public** : Non (ces fonctions ne sont accessibles que à l’intérieur du sandbox du plugin ; elles ne font pas partie de l’API publique publiée sur npm).

---

## @dxgjs/prompts

### `prompts.input(message: string, options?: { default?: string; validate?: (input:string)=>boolean|Promise<boolean>; }) => Promise<string>`
- **Ce que fait** : Affiche un invité demandant une entrée de texte, retourne la valeur saisie lorsque l’utilisateur appuie sur Entrée.
- **Possédé par** : `@dxgjs/prompts`
- **Consommateurs** : Generators (pour recueillir des paramètres comme le nom d’un composant), CLI (pour des interactions simples), plugins qui veulent poser une question à l’utilisateur.
- **Public** : Oui

### `prompts.confirm(message: string, options?: { default?: boolean }) => Promise<boolean>`
- **Ce que fait** : Demande une confirmation oui/non ; retourne `true` pour oui, `false` pour non ou annulation.
- **Possédé par** : `@dxgjs/prompts`
- **Consommateurs** : CLI (avant une action destructive), generators (pour confirmer l’écrasement de fichiers), plugins.
- **Public** : Oui

### `prompts.select(message: string, choices: Array<{ title: string; value: any; description?: string }>, options?: { default?: any }) => Promise<any>`
- **Ce que fait** : Présente une liste d’options et retourne la valeur associée à la sélection de l’utilisateur.
- **Possédé par** : `@dxgjs/prompts`
- **Consommateurs** : Generators (choix d’un template), CLI (choix d’une configuration), plugins.
- **Public** : Oui

### `prompts.checkbox(message: string, choices: same as select) => Promise<any[]>`
- **Ce que fait** : Permet de sélectionner zéro, une ou plusieurs options.
- **Possédé par** : `@dxgjs/prompts`
- **Consommateurs** : Generators (activer/désactiver des fonctionnalités), CLI (multi‑choix).
- **Public** : Oui

### `prompts.autocomplete(message: string, suggestions: (input:string)=>Promise<string[]>, options?: { default?: string }) => Promise<string>`
- **Ce que fait** : Suggestion dynamique pendant la saisie ; l’utilisateur peut choisir parmi les propositions ou taper sa propre valeur.
- **Possédé par** : `@dxgjs/prompts`
- **Consommateurs** : Generators (saisie de nom de dépendance avec recherche dans le registre), CLI (saisie de commande avec historique).
- **Public** : Oui

### `prompts.password(message: string, options?: { mask?: string }) => Promise<string>`
- **Ce que fait** : Comme `input` mais masque les caractères tapés (utile pour les mots de passe ou les clés API).
- **Possédé par** : `@dxgjs/prompts`
- **Consommateurs** : CLI (demande de clé API pour un fournisseur IA), plugins qui veulent récupérer un secret de manière sécurisée.
- **Public** : Oui

---

## @dxgjs/telemetry

### `telemetry.start(options?: { endpoint?: string; intervalMs?: number; consentCallback?: () => Promise<boolean>; }) => Promise<TelemetryController>`
- **Ce que fait** : Initialise la collecte de télémétrie ; si le consentement est donné (via `consentCallback` ou une configuration opt‑in), commence à recueillir des événements périodiquement et à les envoyer à l’endpoint spécifié.
- **Possédé par** : `@dxgjs/telemetry`
- **Consommateurs** : CLI (au démarrage, pour activer la télémétrie si l’utilisateur a accepté), outils qui veulent désactiver ou re‑configurer la télémétrie à l’exécution.
- **Public** : Oui

### Interface `TelemetryController` (exemple) :
- `interface TelemetryController { updateConsent(consent: boolean): void; forceFlush(): Promise<void>; stop(): Promise<void>; }`
- **Possédé par** : `@dxgjs/telemetry`
- **Consommateurs** : Même que ci‑dessus.
- **Public** : Oui

### Le payload envoyé (exemple) :
- `{ anonId: string; timestamp: number; os: string; arch: string; runtime: string; version: string; command: string; success: boolean; durationMs: number; }`
- **Possédé par** : `@dxgjs/telemetry` (en interne)
- **Consommateurs** : Service de télémétrie backend.
- **Public** : Non (le payload est interne, mais la fonction de démarrage est publique)

---

