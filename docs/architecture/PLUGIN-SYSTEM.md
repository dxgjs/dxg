# Système de plugins DXG

Ce document décrit l’architecture du système de plugins permettant d’étendre les fonctionnalités de DXG sans modifier le core. Il reste conceptuel ; aucune implémentation n’est fournie.

## Objectif
Permettre à des développeurs tiers de créer des paquets npm (par exemple `@acme/dxg-plugin-tailwind`) qui s’intègrent facilement à DXG en ajoutant :
- De nouvelles commandes CLI
- De nouveaux generators
- Des templates supplémentaires
- Des hooks de cycle de vie
- Des fournisseurs d’IA personnalisés
- Des extensions du terminal (panels, composants, thèmes)
Le tout tout en maintenant une isolation sécurisée (sandbox) et en évitant les conflits de dépendances.

## Découverte des plugins
Au démarrage du CLI (ou lorsqu’une commande `dxg plugin …` est invoquée), DXG recherche les plugins selon deux mécanismes :
1. **Convention de nommage** : tout paquet installé localement ou dans le workspace dont le nom commence par `dxg-plugin-` (ex. `dxg-plugin-myfeature`, `@scope/dxg-plugin-foo`) est considéré comme un candidat.
2. **Champ explicite dans `package.json`** : tout paquet possédant le champ `"dxg-plugin": true` est également reconnu, indépendamment de son nom.

Cette double approche permet une flexibilité : les plugins peuvent suivre la convention de nommage pour une découverte automatique, ou simplement indiquer leur intention via le champ booléen.

Le recherche se limite au répertoire de travail du projet (et éventuellement aux workspaces configurés via `pnpm-workspace.yaml`) afin d’éviter de charger des plugins globaux non désirés.

## Chargement et sandboxing
Chaque plugin candidat est chargé dans un environnement **sandboxé** afin de limiter son accès uniquement aux API exposées par DXG. Deux stratégies sont envisagées :
- **ESM dynamique avec `importAttributes`** : le paquet est importé comme module ES avec un objet `global` restreint (pas d’accès à `process`, `require`, etc.) et uniquement les exportations que le plugin déclare sont visibles.
- **VM2 ou équivalent** : pour une isolation plus forte, le code du plugin est exécuté dans un contexte virtuel où seules les fonctions explícitement autorisées sont injectées.

Le sandbox garantit que le plugin ne peut pas effectuer d’opérations dangereuses (lecture/écriture arbitraire du système de fichiers, accès réseau non autorisé, modification du processus principal) sans passer par les API DXG qui peuvent appliquer leurs propres contrôles (ex. validation de chemins, quotas).

### API exposées aux plugins (dans le sandbox)
Depuis le contexte du plugin, les fonctions suivantes sont disponibles :

| Fonction | Description |
|----------|-------------|
| `registerCommand(descriptor: CommandDescriptor) => void` | Enregistre une nouvelle commande disponible via `dxg <command>`. |
| `registerGenerator(descriptor: GeneratorDescriptor) => void` | Enregistre un nouveau generator utilisable via `dxg generate <name>`. |
| `registerHook(descriptor: HookDescriptor) => void` | Enregistre un hook qui sera appelé à un point de cycle de vie prédéterminé. |
| `registerAIProvider(descriptor: AIProviderDescriptor) => void` | Enregistre un nouveau fournisseur d’IA utilisable par l’orchestrateur IA. |
| `registerTerminalExtension(descriptor: TerminalExtensionDescriptor) => void` | Enregistre une extension du terminal (par exemple un nouveau type de panel ou un composant de rendu). |
| `getCoreServices() => { logger: Logger; config: Config; fs: FS; ... }` | Fournit un accès en lecture seule à certains services du core (logger, config, fs, etc.) pour permettre au plugin d’accomplir ses tâches sans nécessiter de dépendances directes. |
| `getPluginContext() => PluginContext` | Retourne des métadonnées sur le plugin lui‑même (nom, version, répertoire d’installation). |

Chacune de ces APIs effectue une validation d’entrée et, le cas échéant, une vérification de capacités (ex. un plugin qui essaie d’enregistrer une commande doit fournir un nom unique et un handler fonctionnel).

## Enregistrement des points d’extension

### Commandes
Un descriptor de commande possède la forme :
```ts
interface CommandDescriptor {
  name: string;                   // nom de la commande (ex. "add-tailwind")
  description: string;            // texte d’aide affiché dans `dxg help`
  handler: (args: string[], context: PluginContext) => Promise<void>; // logique de la commande
  options?: OptionDescriptor[];   // définitions d’options (flags) utilisables par un parseur de type commander.js ou yargs
}
```
Le système de commandes du CLI (probablement basé sur une bibliothèque comme `commander.js` ou `oclif`) fusionne les commandes intégrées et celles enregistrées par les plugins, en assurant l’unicité des noms.

### Generators
Un descriptor de generator ressemble à :
```ts
interface GeneratorDescriptor {
  name: string;                                 // nom utilisé dans `dxg generate <name>`
  description: string;                          // aide affichée
  prompts?: PromptDescriptor[] | PromptFunction; // soit une liste statique de prompts, soit une fonction qui retourne des prompts basée sur des réponses précédentes
  template: string | TemplateSource;            // chemin vers le fichier de template ou chaîne de template inline
  outputPathResolver?: (answers: Record<string, any>) => string; // fonction retournant le chemin de destination relatif au cwd
  postProcess?: (files: string[], answers: Record<string, any>) => Promise<void>; // étape optionnelle après écriture (formatage, lint via IA)
}
```
Le generator utilise le moteur de templates `@dxgjs/templates` et le système de prompts `@dxgjs/prompts` provenant du core (fournis via les services ou directement si le plugin déclare ces dépendances en peer).

### Hooks
Un descriptor de hook possède :
```ts
interface HookDescriptor {
  event: string;                                 // nom de l’événement (ex. "pre:generate", "post:update", "plugin:load")
  handler: (context: PluginContext) => Promise<void>; // fonction asynchrone à exécuter
  priority?: number;                             // ordre d’exécution lorsqu’il y a plusieurs hooks sur le même événement (valeur plus faible = plus tôt)
}
```
Les événements courants sont définis par le core et documentés afin que les plugins sachent à quel moment s’abonner.

### Fournisseurs d’IA
Un descriptor de fournisseur d’IA doit implémenter l’interface suivante :
```ts
interface AIProviderDescriptor {
  name: string;                                  // identifiant unique (ex. "acme-llama")
  factory: () => AIProvider;                     // fonction qui retourne une instance conforme à l’interface AIProvider du core
  // L’interface AIProvider (définie dans @dxgjs/ai) est :
  //   complete(prompt: string, opts?: AIOptions): Promise<string>;
  //   stream(prompt: string, opts?: AIOptions): AsyncIterable<string>;
  //   embed(text: string): Promise<number[]>;
}
```
Une fois enregistré, le fournisseur apparaît dans le registre de l’orchestrateur IA et peut être sélectionné par nom ou défini comme fournisseur par défaut dans la configuration.

### Extensions du terminal
Un descriptor d’extension du terminal pourrait ressembler à :
```ts
interface TerminalExtensionDescriptor {
  name: string;                                  // nom unique de l’extension
  component: TerminalComponent;                  // composant de rendu (dépend de l’API de rendu de @dxgjs/terminal)
  // Le TerminalComponent pourrait être une classe qui implémente une méthode `render(buffer: TerminalBuffer) => void`
  // ou un objet qui décrit une nouvelle sorte d’élément de rendu (panel, tableau personnalisé, etc.)
  placement?: 'sidebar' | 'modal' | 'inline';    // où l’extension doit apparaître par défaut
  activation?: { event: string; condition?: (context: PluginContext) => boolean }; // quand l’extension doit être activée
}
```
Le système de terminal du core doit offrir un point d’extension où les plugins peuvent insérer leurs composants (par exemple un registre de panneaux latéraux qui sont affichés lorsque le terminal est en mode « split »).

## Gestion du cycle de vie
Lorsque le CLI démarre :
1. Il découvre les plugins candidats.
2. Pour chaque plugin, il crée un sandbox.
3. Il exécute le point d’entrée du plugin (export nommé `manifest` ou fonction d’initialisation) qui appelle les fonctions d’enregistrement ci‑dessus.
4. Il collecte toutes les extensions enregistrées et les intègre dans les systèmes appropriés (commande, generator, hook, IA, terminal).
5. En cas d’erreur lors du chargement (syntaxiquement invalide, appel d’API interdit, timeout), le plugin est marqué comme échoué, un message est journalisé, mais le CLI continue de fonctionner sans ce plugin.

Le CLI offre également une commande `dxg plugin list` pour afficher les plugins chargés avec leur statut, et `dxg plugin reload <name>` pour recharger un plugin particulier (utile durant le développement).

## Compatibilité de version
Les plugins déclarent leurs dépendances peer vers les paquets DXG qu’ils utilisent (ex. `"peerDependencies": { "@dxgjs/templates": "^1.0.0", "@dxgjs/prompts": "^1.0.0" }`). Le système de plugins vérifie au chargement que les versions satisfont aux contraintes peer (en utilisant la même logique que le gestionnaire de paquets). Si une version requise n’est pas présente ou est incompatible, le plugin ne sera pas chargé et un avertissement sera affiché.

Cette approche permet aux plugins d’évoluer indépendamment du core tant qu’ils respectent les interfaces exposées. Lorsqu’une modification rétro‑compatible est faite dans un paquet DXG (ex. ajout d’un paramètre optionnel à une fonction), les plugins existants continuent de fonctionner. Les changements majeurs entraîneront une mise à jour majeure du paquet DXG, obligeant les plugins à mettre à jour leurs peerDependencies.

## Configuration du plugin
Un plugin peut exposer une configuration optionnelle via un champ `dxgPluginConfig` dans le `package.json` du projet consommateur ou via un fichier de configuration dédié (`dxg-plugin.<name>.json`). Le noyau de DXG fournit une fonction `getPluginConfig(name: string) => Promise<any>` que le plugin peut appeler (via les services du core) pour récupérer sa configuration spécifique.

Cette configuration permet d’ajuster le comportement du plugin sans nécessiter de nouvelle version (ex. changer les couleurs d’un thème fourni par le plugin, activer/désactiver une caractéristique, spécifier une clé API pour un fournisseur d’IA externe).

## Sécurité et bonnes pratiques
- **Principle of least privilege** : le sandbox ne fournit que les APIs strictement nécessaires. Aucun accès direct à `process.env`, `require` ou au système de fichiers en dehors du répertoire de travail n’est offert.
- **Validation des entrées** : toutes les fonctions d’enregistrement effectuent une validation (ex. noms de commandes non vides, handlers fonctions, schémas de prompts corrects) avant d’enregistrer l’extension.
- **Isolation des erreurs** : si le handler d’un plugin lance une exception, elle est capturée et journalisée sans faire planter le CLI principal (les erreurs sont remontées à l’appelant sous forme de rejet de promesse gentil).
- **Audit des dépendances** : les plugins sont encouragés à auditer leurs propres dépendances pour éviter d’introduire des vulnérabilités transmises via DXG.
- **Signalement** : les plugins doivent éviter d’utiliser `console.log` directement ; ils doivent plutôt utiliser le service logger fourni via `getCoreServices().logger` afin que leurs messages soient uniformément formatés et respectent le niveau de verbosité global.

## Exemple de structure de plugin
```text
my-dxg-plugin/
├── package.json          // contient "name": "@acme/dxg-plugin-foo", "dxg-plugin": true, "peerDependencies": {...}
├── src/
│   └── index.ts          // point d’entrée qui enregistre les extensions
├── templates/            // fichiers de template utilisés par les generators du plugin
│   └── component.hbs
�└── README.md
```

`src/index.ts` pourrait contenir :
```ts
import { registerCommand, registerGenerator } from '@dxgjs/plugins/api'; // fourni via le sandbox

registerCommand({
  name: 'add-foo',
  description: 'Ajoute une fonctionnalité foo au projet',
  handler: async (args, ctx) => {
    // utilisation des services du core
    const fs = ctx.getCoreServices().fs;
    const logger = ctx.getCoreServices().logger;
    await fs.writeFile('foo.txt', 'Hello from plugin');
    logger.info('Plugin foo installé avec succès');
  }
});

registerGenerator({
  name: 'foo-component',
  description: 'Génère un composant React foo',
  template: await ctx.getCoreServices().fs.readFile('./templates/component.hbs', 'utf-8'),
  prompts: [
    { type: 'input', name: 'name', message: 'Nom du composant' },
    { type: 'confirm', name: 'withHooks', message: 'Inclure des hooks ?', default: false }
  ],
  outputPathResolver: (answers) => `src/components/${answers.name}.jsx`,
  postProcess: async (files, answers) => {
    // éventuellement appeler @dxgjs/ai pour améliorer le code généré
  }
});
```

Ce plugin, une fois installé dans un projet DXG (`npm i -D @acme/dxg-plugin-foo`), sera découvert au prochain démarrage du CLI et pourra être invoqué via :
- `dxg add-foo`
- `dxg generate foo-component`

## Résumé des décisions prises
- **Découverte basée sur la convention de nommage + champ `dxg-plugin:true`**.
- **Sandboxing obligatoire** pour garantir la sécurité.
- **API d’enregistrement clairement séparées** (commands, generators, hooks, AI providers, terminal extensions).
- **Gestion du cycle de vie** (découverte, chargement, enregistrement, intégration, rechargement).
- **Compatibilité de version via peerDependencies** et vérification au chargement.
- **Configuration externe** via `package.json` du projet ou fichiers dédiés.
- **Bonnes pratiques de sécurité** (principe du moindre privilège, validation, isolation des erreurs).

Ces choix assurent un système de plugins extensible, sûr et agréable à utiliser tant pour les développeurs de plugins que pour les consommateurs de DXG.

---

