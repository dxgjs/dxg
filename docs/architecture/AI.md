# Architecture de l'IA DXG

Ce document décrit conceptuellement l'architecture d'orchestration de l'intelligence artificielle au sein de l'écosystème DXG. Il reste au niveau de la spécification ; aucune implémentation n'est fournie.

## Vision
L'IA dans DXG n'est pas une simple enveloppe autour d'un appel API à un modèle de langage ; elle constitue une couche d'orchestration qui combine plusieurs fournisseurs, des agents spécialisés, un registre de prompts, un construction de contexte riche, un cache sémantique et des mécanismes de fiabilité (rate‑limiter, retry, fallback). Cette approche permet de changer de fournisseur ou de modèle sans toucher le reste du système, d'offrir des fonctionnalités avancées telles que la révision de code, le refactoring assisté ou l'audit de sécurité, et de maintenir une expérience cohérente indépendamment du fournisseur sous-jacent.

## Principes directeurs
1. **Abstraction du fournisseur** : le détail du fournisseur (Claude, GPT, Gemini, Fable, futur) est caché derrière une interface commune.
2. **Orchestration spécialisée** : différentes tâches (génération, révision, refactor, audit) sont traitées par des agents dédiés qui peuvent utiliser le même fournisseur ou des fournisseurs différents selon la pertinence.
3. **Construction de contexte** : avant d'appeler un modèle, le système rassemble des informations provenant du workspace, de la configuration, du système de fichiers, des variables d’environnement et éventuellement de l’état du terminal (ex. sélection courante) pour produire un prompt précis et pertinent.
4. **Registre de prompts versionnés** : les modèles de prompt sont stockés, nommés et versionnés, avec un schéma de validation pour leurs variables, permettant une réutilisation sûre et une évolution maîtrisée.
5. **Cache sémantique** : les réponses sont mises en cache basé sur le hachage du prompt rendu, du contexte et de la version du fournisseur, réduisant les coûts et la latence pour les requêtes répétées.
6. **Fiabilité** : rate‑limiter par fournisseur, exponentielle backoff avec jitter, retry automatique et fallback vers un autre fournisseur en cas d’échec ou de dépassement de quota.
7. **Sécurité et confidentialité** : les clés API ne sont jamais enregistrées en clair ; elles sont lues depuis des variables d’environnement ou un gestionnaire de secrets et ne sont transmises que via des canaux TLS. Le contexte envoyé aux modèles peut être filtré pour exclure les données sensibles sauf si l'utilisateur l'autorise explícitement.
8. **Extensibilité** : les plugins peuvent enregistrer de nouveaux fournisseurs, de nouveaux prompts ou même de nouveaux agents spécialisés.

## Couches de l'architecture

### 1. Interface du fournisseur (`AIProvider`)
Tous les fournisseurs doivent implémenter cette interface minimale :
```ts
interface AIProvider {
  /** Génère une completion unique */
  complete(prompt: string, opts?: AIOptions): Promise<string>;
  /** Génère une completion en flux (utile pour le chat interactif) */
  stream(prompt: string, opts?: AIOptions): AsyncIterable<string>;
  /** Génère des embeddings vecteurs */
  embed(text: string): Promise<number[]>;
}
```
Les options (`AIOptions`) peuvent contenir : `temperature`, `topP`, `maxTokens`, `stopSequences`, `signal` (AbortSignal pour annulation), etc.

### 2. Registre de fournisseurs
Le noyau de l'IA maintient un registre où l'on peut :
- **Enregistrer** un fournisseur par nom (`registerProvider(name: string, provider: AIProvider)`).
- **Obtenir** une instance enregistrée (`getProvider(name: string) => AIProvider | undefined`).
- **Définir** le fournisseur par défaut (`setDefaultProvider(name: string)`).
- **Lister** les fournisseurs disponibles.

Les plugins peuvent appeler `registerProvider` pour ajouter un support pour un nouveau modèle (ex. un modèle open‑source hébergé en interne) ou un fournisseur propriétaire.

### 3. Registre de prompts
Chaque prompt est identifié par un nom et possède :
- Un **modèle de chaîne** (ex. « Génère un composant React nommé {{name}} avec les props {{props}} »).
- Un **schéma de validation** (optionnel, basé sur `@dxgjs/validation`) qui décrit les variables attendues et leurs contraintes.
- Une **version** (semver) permettant de suivre les évolutions du prompt sans casser les consommateurs qui dépendent d’une version précédente.

API du registre :
- `registerPrompt(name: string, template: string, schema?: Schema<any>, version: string = "1.0.0") => void`
- `getPrompt(name: string) => { template: string; schema: Schema<any> | undefined; version: string } | undefined`
- `listPrompts() => Array<{name: string; version: string}>`

Lors de l'exécution, le système récupère le modèle, le rend avec les variables fournies (après validation du schéma si présent), puis passe le résultat au fournisseur.

### 4. Construction de contexte (`ContextBuilder`)
Avant d'appeler un fournisseur, l'orchestrateur peut construire un contexte riche à partir de plusieurs sources :
- **Workspace** : racine du projet, liste des paquets dépendants, scripts disponibles (via `@dxgjs/workspace`).
- **Configuration** : paramètres spécifiques à l'IA chargés depuis `dxg.config.json` ou variables d’environnement (clés API, modèle préféré, température par défaut) (via `@dxgjs/config`).
- **Système de fichiers** : contenu de fichiers pertinents (ex. le fichier actuellement ouvert dans un éditeur intégré, ou un fichier de configuration à refactorer) (via `@dxgjs/fs`).
- **Variables d’environnement** : clés API, tokens, etc. (via `@dxgjs/env`).
- **État du terminal** : sélection de texte actuelle, curseur, thème actif (via `@dxgjs/terminal` si l'orchestrateur est appelé depuis une session interactive).
- **Historique** : précédents appels IA dans la même session (pour offrir une continuité de conversation).

Le `ContextBuilder` expose une méthode `build(contextSpec: ContextSpec) => Promise<ContextObject>` où `contextSpec` indique quelles sources inclure et comment les transformer (ex. lire un fichier, extraire les dépendances d'un package.json, etc.). Le résultat est un objet plain qui peut être utilisé pour rendre le template de prompt.

### 5. Orchestrateur principal (`AIOrchestrator`)
L'orchestrateur coordonne toutes les étapes :
1. **Sélection du fournisseur** : utilisation du fournisseur par défaut ou celui spécifié dans les options de l'appel.
2. **Récupération du prompt** : recherche du template nommé dans le registre.
3. **Validation des variables** : si le prompt possède un schéma, validation du dictionnaire de variables fourni par l'appelant.
4. **Construction du contexte** : (optionnel) exécution du `ContextBuilder` selon les indications du prompt (certains prompts peuvent ne nécessiter aucun contexte supplémentaire, d'autres peuvent vouloir inclure le contenu d'un fichier).
5. **Rendu du template** : substitution des variables (et éventuellement du contexte) dans le modèle de chaîne.
6. **Clé de cache** : calcul d'un hash basé sur le texte rendu, le nom du fournisseur, la version du modèle et d'autres paramètres pertinents.
7. **Lookup du cache** : si la clé existe et est valide (non expirée), retourner la réponse mise en cache.
8. **Appel au fournisseur** : sinon, appeler `complete` (ou `stream` si demandé) avec gestion du rate‑limiter, retry et fallback.
9. **Mise en cache** : stocker la réponse reçue (avec horodatage d'expiration).
10. **Post‑treatment éventuel** : extraction de blocs de code, formatage, ou passage à un agent spécialisé (voir ci‑dessous).
11. **Retour** : fournir le résultat à l'appelant.

L'orchestrateur expose principalement deux méthodes :
- `execute(taskName: string, variables: Record<string, any>, options?: { provider?: string; stream?: boolean; }): Promise<any>` – pour une tâche nommée (voir registre de tâches ci‑dessous) ou un prompt libre.
- `prompt(promptName: string, variables: Record<string, any>, options?: { provider?: string; stream?: boolean; }): Promise<any>` – exécute directement un prompt enregistré.

### 6. Agents spécialisés
Au lieu d’appeler directement le fournisseur pour chaque besoin, le système définit des agents qui encapsulent une intention particulière et peuvent appliquer du pré‑ ou post‑treatment.

#### Agent Generator
- **Objectif** : produire du code ou du texte à partir d’une description.
- **Workflow** :
  1. Utiliser un prompt de génération enregistré (ex. « generate-component ») ;
  2. Construire le contexte (workspace, sélection de fichier, etc.) ;
  3. Appeler le fournisseur ;
  4. Extraire le bloc de code du retour (en cherchant des délimiteurs comme ```tsx…```) ;
  5. Optionnellement passer le code à un formateur (Prettier, ESLint via `@dxgjs/validation` ou intégration d’un linter) ;
  6. Retourner le code fini.

#### Agent Reviewer (Code Reviewer)
- **Objectif** : analyser du code existant pour y détecter des bugs, des problèmes de style, des vulnérabilités légères ou des améliorations possibles.
- **Workflow** :
  1. Utiliser un prompt de révision (ex. « Revise le suivant code TSX pour les meilleures pratiques React et détecte les props inutilisées ») ;
  2. Fournir le code à reviewer comme variable ;
  3. Appeler le fournisseur ;
  4. Parser la réponse pour extraire une liste de commentaires (chaque commentaire comprenant localisation, sévérité, suggestion) ;
  5. Retourner une structurée d’issues.

#### Agent Refactorer
- **Objectif** : transformer du code selon une intention spécifiée (ex. « convertir cette classe en hooks fonctionnels », « extraire cette fonction en utility »).
- **Workflow** similaire au reviewer, mais le prompt demande une transformation et le retour attendue est le nouveau code (éventuellement avec une explication).

#### Agent Auditor (Sécurité, performance, licences)
- **Objectif** : vérifier le code ou la configuration contre des règles connues (ex. dépendances vulnérables, exposition de secrets, boucles infinies potentielles).
- **Workflow** :
  1. Peut combiner analyse statique locale (via `@dxgjs/validation`, `@dxgjs/fs` pour lire `package-lock.yaml`) avec appel IA pour des jugements plus subtils (ex. « Cette fonction d’authentification résiste‑t-elle aux attaques par force brute ? ») ;
  2. Retourner un rapport d’audit.

#### Agent Planner
- **Objectif** : décomposer une demande de haut niveau en sous‑tâches ordonnées (ex. « Créer un nouveau blog avec authentification » → [créer le modèle de données, créer l’API REST, créer le composant UI, ajouter les tests]).
- **Workflow** :
  1. Utiliser un prompt de planification qui demande de retourner une liste d’étapes ordonnées ;
  2. Exécuter le fournisseur ;
  3. Parser la réponse en tableau d’objets `{title: string, description?: string, estimatedEffort?: string}` ;
  4. Retourner le plan à l’appelant qui pourra alors exécuter chaque étape (possiblement en invoquant d’autres agents ou des generators).

### 7. Cache sémantique
Le cache repose sur une clé déterministe :
```
hash(
  renderedPrompt ||
  providerName ||
  modelVersion ||
  options.hash()   // température, topP, maxTokens, etc.
)
```
Le cache peut être implémenté de plusieurs façons selon les besoins :
- **In‑memory** (défaut pour le développement) : Map simple avec limite de taille LRU.
- **Redis‑like** (optionnel pour les environnements partagés ou les déploiements distribués) : permettant le partage du cache entre plusieurs instances du CLI ou des services backend.
- **Disque** (optionnel pour la persistance entre redémarrages) : fichier JSON ou SQLite contenant les entrées avec horodatage.

La politique d’expiration est basée sur le temps (TTL configurable, par défaut 1 heure) ou sur la taille (éviction LRU cuando se supera el límite máximo de entradas).

### 8. Rate‑limiter, retry et fallback
Chaque fournisseur enregistré possède un quota configuré (requêtes par seconde, par heure, ou nombre de tokens). L'orchestrateur enveloppe chaque appel dans :
- **Rate‑limiter** : file d’attente qui respecte le quota (implémentation type leaky bucket ou fixed window avec redécoupage).
- **Retry** : en cas d’erreur temporelle (timeout, 5xx, rate limit exceeded), nouvelle tentative avec exponentielle backoff (base 500 ms, facteur 2, jitter) jusqu’à un maximum de 3 tentatives.
- **Fallback** : si toutes les tentatives échouent ou si le fournisseur signale un dépassement de quota définitif, l'orchestrateur essaye le prochain fournisseur dans une liste ordonnée (configurée par l'utilisateur ou définie par défaut comme `[claude, gpt, gemini, fable]`). Si aucun fournisseur ne réussit, une erreur est propagée à l'appelant.

Ces mécanismes garantissent une expérience fluide même lorsque les services externes sont intermittents ou soumis à des limitations.

## Flux de données typé (exemple d’appel)
```mermaid
sequenceDiagram
    participant CL as Appelant (CLI, Generator, Plugin)
    participant AI as AIOrchestrator
    participant PR as Prompt Registry
    participant CB as Context Builder
    participant PV as Provider Registry
    participant PRV as Specified Provider
    participant CA as Semantic Cache
    participant RT as AI Provider (réel)

    CL->>AI: execute(taskName, variables)
    AI->>PR: getPrompt(taskName)
    alt taskName non trouvé
        AI-->>CL: Erreur prompt inconnu
    else trouvé
        PR-->>AI: template, schéma, version
        AI->>PRV: validate(variables, schéma)
        alt validation échoue
            AI-->>CL: Erreur de validation
        else validation OK
            PRV-->>AI: variables valides
            AI->>CB: build(contextSpec from prompt)
            CB-->>AI: contexte construit
            AI: render template + variables + contexte
            AI->>CA: compute cache key
            alt cache hit
                CA-->>AI: réponse mise en cache
                AI-->>CL: retourner réponse
            else cache miss
                AI->>PV: getProvider(default or spécifié)
                PV-->>AI: instance du fournisseur
                loop retry/jusqu'à max 3
                    AI->>RT: complete(prompt rendu, options)
                    alt échec temporaire
                        RT-->>AI: erreur (timeout, 5xx, rate limit)
                        AI: attendre backoff + jitter
                    else succès
                        RT-->>AI: réponse texte
                        break
                end
                alt toutes les tentatives échouées ou quota épuisé
                    AI: essayer prochain fournisseur dans liste de fallback
                end
                AI->>CA: stocker réponse dans cache
                AI-->>CL: retourner réponse
            end
        end
    end
```

## Sécurité et confidentialité
- **Clés API** : ne sont jamais codées en dur ; elles doivent être fournies via des variables d’environnement (ex. `CLAUDE_API_KEY`, `OPENAI_API_KEY`) ou via un gestionnaire de secrets intégré au système d’exploitation. Le chargeur de configuration (`@dxgjs/core` ou `@dxgjs/config`) ne les expose pas dans les logs grâce à un masque automatique emprunté à `@dxgjs/env`.
- **Contexte transmis** : le `ContextBuilder` permet de exclure des champs sensibles par défaut (ex. toute variable contenant le mot-clé `secret`, `key`, `token`). L'appelant peut toutefois choisir d'inclure expressément un secret après avoir été averti.
- **Journalisation** : les appels à l'IA sont journalisés au niveau `debug` uniquement, et ne contiennent jamais le prompt complet ni la réponse (seulement le nom du tâche, le fournisseur utilisé, la durée et le statut).
- **Conformité RGPD / CCPA** : aucune donnée personnelle n'est envoyée à moins que l'utilisateur ne le décide explicite (ex. en passant des données utilisateur dans les variables du prompt). Le système ne collecte pas de télémétrie d'utilisation des IA sauf si la télémétrie générale de DXG est activée et que l'utilisateur y consent.

## Points d'extension pour les plugins
Les plugins peuvent étendre l'IA de trois manières principales :
1. **Enregistrer un nouveau fournisseur** : via `AIOrchestrator.registerProvider(name, factory)`.
2. **Enregistrer un nouveau prompt** : via `AIOrchestrator.registerPrompt(name, template, schema, version)`.
3. **Enregistrer un nouvel agent spécialisé** : bien que les agents principaux soient fournis par le core, un plugin peut fournir une fonction qui, étant donné un nom de tâche, retourne une promesse de résultat (en interne il peut appeler l'orchestrateur avec un prompt personnalisé ou effectuer du pré/post‑treatment spécifique). Le noyau pourrait offrir une fonction `registerAgent(taskName: string, handler: (vars, options) => Promise<any>) => void` pour permettre cela.

Chaque extension est soumise aux mêmes règles de validation et de sandbox que les autres types de plugins.

## Configuration globale de l'IA
Un sous‑objet dans `dxg.config.json` (ou une section dédiée dans le fichier de configuration) peut contenir :
```json
{
  "ai": {
    "defaultProvider": "claude",
    "providers": {
      "claude": { "apiKeyEnv": "CLAUDE_API_KEY", "model": "claude-3-opus-20240229", "rateLimit": { "requestsPerMinute": 60 } },
      "gpt": { "apiKeyEnv": "OPENAI_API_KEY", "model": "gpt-4-turbo-preview", "rateLimit": { "requestsPerMinute": 50 } }
    },
    "cache": { "type": "memory", "maxEntries": 1000, "ttlSeconds": 3600 },
    "contextDefaults": { "includeWorkspace": true, "includeFs": ["package.json", "tsconfig.json"], "includeTerminalSelection": false }
  }
}
```
Le chargeur de configuration (@dxgjs/config) lit ce bloc et le fournit à l'orchestrateur lors de son initialisation.

## Rejetés / alternatives considérées
- **Appel direct au fournisseur dans chaque paquet** : aurait créé un couplage fort et rendu impossible le changement de fournisseur sans mettre à jour plusieurs paquets.
- **Un seul prompt monolithique** : aurait limité la réutilisation et rendu la gestion des versions complexe.
- **Pas de contexte** : aurait forcé chaque appel à répéter la logique de rassemblement d'informations, conduisant à du code dupliqué et à des prompts moins pertinents.
- **Cache basé uniquement sur le texte du prompt** : aurait ignoré les différences de fournisseur, de modèle ou d'options, entraînant des retours potentiellement inappropriés lorsqu'on change de paramètre.
- **Aucun mécanisme de fallback** : aurait rendu le système fragile face aux pannes de service ou aux dépassements de quota.

## Résumé des décisions prises
- **Fournisseur abstrait** avec interface commune (`complete`, `stream`, `embed`).
- **Registre de prompts versionnés avec validation de schéma**.
- **Construction de contexte modulaire** permettant d'agréger workspace, config, FS, env, terminal.
- **Orchestrateur centralisé** qui gère la sélection du fournisseur, le rendu, le cache, le taux de limite, les tentatives nouvelles et le basculement.
- **Agents spécialisés** (générateur, réviseur, refactorer, auditeur, planificateur) pour encapsuler des intentions courantes.
- **Cache sémantique** basé sur le hachage du prompt rendu + fournisseur + options.
- **Rate‑limiter, exponentielle backoff avec jitter, et fallback entre fournisseurs**.
- **Sécurité** : clés API via variables d’environnement, masque automatique des secrets dans les logs, filtrage du contexte sensible par défaut.
- **Extensibilité** pour les plugins afin d’ajouter de nouveaux fournisseurs, prompts ou agents.

Cette architecture offre une base solide pour des fonctionnalités IA avancées tout en restant interchangeable, fiable et sécurisée.

---

