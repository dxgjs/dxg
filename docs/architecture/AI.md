# DXG AI Architecture

This document conceptually describes the artificial intelligence orchestration architecture within the DXG ecosystem. It remains at the specification level; no implementation is provided.

## Vision

AI in DXG is not just a simple wrapper around a language model API call; it constitutes an orchestration layer that combines multiple providers, specialized agents, a prompt registry, a rich context construction, a semantic cache, and reliability mechanisms (rate‑limiter, retry, fallback). This approach allows changing providers or models without touching the rest of the system, offering advanced features such as code review, assisted refactoring, or security auditing, while maintaining a consistent experience regardless of the underlying provider.

## Guiding Principles

1. **Provider Abstraction**: the provider detail (Claude, GPT, Gemini, Fable, future) is hidden behind a common interface.
2. **Specialized Orchestration**: different tasks (generation, review, refactoring, audit) are handled by dedicated agents that can use the same provider or different providers according to relevance.
3. **Context Construction**: before calling a model, the system gathers information from the workspace, configuration, file system, environment variables, and optionally the terminal state (e.g., current selection) to produce a precise and relevant prompt.
4. **Versioned Prompt Registry**: prompt templates are stored, named, and versioned, with a validation schema for their variables, enabling safe reuse and controlled evolution.
5. **Semantic Cache**: responses are cached based on the hash of the rendered prompt, context, and provider version, reducing costs and latency for repeated requests.
6. **Reliability**: provider‑specific rate‑limiter, exponential backoff with jitter, automatic retry, and fallback to another provider in case of failure or quota exceeded.
7. **Security and Confidentiality**: API keys are never stored in plain text; they are read from environment variables or a secrets manager and transmitted only via TLS channels. The context sent to models can be filtered to exclude sensitive data unless the user explicitly authorizes it.
8. **Extensibility**: plugins can register new providers, new prompts, or even new specialized agents.

## Architecture Layers

### 1. Provider Interface (`AIProvider`)

All providers must implement this minimal interface:

```ts
interface AIProvider {
  /** Generates a single completion */
  complete(prompt: string, opts?: AIOptions): Promise<string>;
  /** Generates a streaming completion (useful for interactive chat) */
  stream(prompt: string, opts?: AIOptions): AsyncIterable<string>;
  /** Generates vector embeddings */
  embed(text: string): Promise<number[]>;
}
```

The options (`AIOptions`) may contain: `temperature`, `topP`, `maxTokens`, `stopSequences`, `signal` (AbortSignal for cancellation), etc.

### 2. Provider Registry

The AI core maintains a registry where one can:
- **Register** a provider by name (`registerProvider(name: string, provider: AIProvider)`).
- **Obtain** a registered instance (`getProvider(name: string) => AIProvider | undefined`).
- **Set** the default provider (`setDefaultProvider(name: string)`).
- **List** available providers.

Plugins can call `registerProvider` to add support for a new model (e.g., an internally hosted open‑source model) or a proprietary provider.

### 3. Prompt Registry

Each prompt is identified by a name and has:
- A **string template** (e.g., "Generate a React component named {{name}} with props {{props}}").
- An **optional validation schema** (based on `@dxgjs/validation`) describing the expected variables and their constraints.
- A **version** (semver) allowing tracking of prompt evolution without breaking consumers that depend on a previous version.

Prompt registry API:
- `registerPrompt(name: string, template: string, schema?: Schema<any>, version: string = "1.0.0") => void`
- `getPrompt(name: string) => { template: string; schema: Schema<any> | undefined; version: string } | undefined`
- `listPrompts() => Array<{name: string; version: string}>`

During execution, the system retrieves the template, renders it with the provided variables (after schema validation if present), then passes the result to the provider.

### 4. Context Builder (`ContextBuilder`)

Before calling a provider, the orchestrator can build a rich context from multiple sources:
- **Workspace**: project root, list of dependent packages, available scripts (via `@dxgjs/workspace`).
- **Configuration**: AI‑specific parameters loaded from environment variables (API keys, preferred model, default temperature).
- **File System**: content of relevant files (e.g., the file currently open in an integrated editor, or a configuration file to refactor) (via `@dxgjs/fs`).
- **Environment Variables**: API keys, tokens, etc. (via `@dxgjs/env`).
- **Terminal State**: current text selection, cursor, active theme (via `@dxgjs/terminal` if the orchestrator is called from an interactive session).
- **History**: previous AI calls in the same session (to offer conversation continuity).

The `ContextBuilder` exposes a method `build(contextSpec: ContextSpec) => Promise<ContextObject>` where `contextSpec` indicates which sources to include and how to transform them (e.g., read a file, extract dependencies from a package.json, etc.). The result is a plain object usable for rendering the prompt template.

### 5. Main Orchestrator (`AIOrchestrator`)

The orchestrator coordinates all steps:
1. **Provider Selection**: use the default provider or the one specified in the call options.
2. **Prompt Retrieval**: search for the named template in the registry.
3. **Variable Validation**: if the prompt has a schema, validate the variable dictionary provided by the caller.
4. **Context Construction**: (optional) execute the `ContextBuilder` according to the prompt’s indications (some prompts may need no extra context, others may want to include file content).
5. **Template Rendering**: substitute variables (and possibly context) into the string template.
6. **Cache Key Calculation**: compute a hash based on the rendered text, provider name, model version, and other relevant parameters.
7. **Cache Lookup**: if the key exists and is valid (not expired), return the cached response.
8. **Provider Call**: otherwise, call `complete` (or `stream` if requested) with rate‑limiter, retry, and fallback management.
9. **Caching**: store the received response (with expiration timestamp).
10. **Optional Post‑treatment**: extract code blocks, format, or pass to a specialized agent (see below).
11. **Return**: provide the result to the caller.

The orchestrator mainly exposes two methods:
- `execute(taskName: string, variables: Record<string, any>, options?: { provider?: string; stream?: boolean; }): Promise<any>` – for a named task (see task registry below) or a free prompt.
- `prompt(promptName: string, variables: Record<string, any>, options?: { provider?: string; stream?: boolean; }): Promise<any>` – executes a registered prompt directly.

### 6. Specialized Agents

Instead of calling the provider directly for each need, the system defines agents that encapsulate a particular intention and may apply pre‑ or post‑treatment.

#### Agent Generator
- **Objective**: produce code or text from a description.
- **Workflow**:
  1. Use a registered generation prompt (e.g., « generate-component »).
  2. Build the context (workspace, file selection, etc.).
  3. Call the provider.
  4. Extract the code block from the response (by looking for delimiters like ```tsx…```).
  5. Optionally pass the code to a formatter (Prettier, ESLint via `@dxgjs/validation` or linter integration).
  6. Return the final code.

#### Agent Reviewer (Code Reviewer)
- **Objective**: analyze existing code to detect bugs, style issues, minor vulnerabilities, or improvement opportunities.
- **Workflow**:
  1. Use a registered review prompt (e.g., « Review the following TSX code for React best practices and detect unused props »).
  2. Provide the code to review as a variable.
  3. Call the provider.
  4. Parse the response to extract a list of comments (each comment includes location, severity, suggestion).
  5. Return a structured issues list.

#### Agent Refactorer
- **Objective**: transform code according to a specified intention (e.g., « convert this class to functional hooks », « extract this function into a utility »).
- **Workflow**: similar to the reviewer, but the prompt requests a transformation and the expected return is the new code (possibly with an explanation).

#### Agent Auditor (Security, Performance, Licenses)
- **Objective**: verify code or configuration against known rules (e.g., vulnerable dependencies, secret exposure, potential infinite loops).
- **Workflow**:
  1. May combine local static analysis (via `@dxgjs/validation`, `@dxgjs/fs` to read `package-lock.yaml`) with AI calls for subtler judgments (e.g., « Does this authentication function resist brute‑force attacks? »).
  2. Return an audit report.

#### Agent Planner
- **Objective**: decompose a high‑level request into ordered subtasks (e.g., « Create a new blog with authentication » → [create data model, create REST API, create UI component, add tests]).
- **Workflow**:
  1. Use a planning prompt that asks to return an ordered list of steps.
  2. Execute the provider.
  3. Parse the response into an array of objects `{title: string, description?: string, estimatedEffort?: string}`.
  4. Return the plan to the caller, who can then execute each step (possibly by invoking other agents or generators).

### 7. Semantic Cache

The cache relies on a deterministic key:
```
hash(
  renderedPrompt ||
  providerName ||
  modelVersion ||
  options.hash()   // temperature, topP, maxTokens, etc.
)
```

The cache can be implemented in several ways according to needs:
- **In‑memory** (default for development): simple LRU‑limited Map.
- **Redis‑like** (optional for shared or distributed environments): enabling cache sharing between multiple CLI instances or backend services.
- **Disk** (optional for persistence across restarts): JSON or SQLite file containing entries with timestamps.

Expiration policy is time‑based (configurable TTL, default 1 hour) or size‑based (LRU eviction when maximum entries exceeded).

### 8. Rate‑limiter, Retry, and Fallback

Each registered provider has a configured quota (requests per second, per hour, or token count). The orchestrator wraps each call with:
- **Rate‑limiter**: a queue that respects the quota (implementation type leaky bucket or fixed window with re‑windowing).
- **Retry**: on temporal error (timeout, 5xx, rate limit exceeded), retry with exponential backoff (base 500 ms, factor 2, jitter) up to a maximum of 3 attempts.
- **Fallback**: if all attempts fail or the provider signals a definitive quota exceeded, the orchestrator tries the next provider in an ordered list (configured by the user or defaulted to `[claude, gpt, gemini, fable]`). If no provider succeeds, an error is propagated to the caller.

These mechanisms ensure a smooth experience even when external services are intermittent or rate‑limited.

## Typical Data Flow (example call)

```mermaid
sequenceDiagram
    participant CL as Caller (CLI, Generator, Plugin)
    participant AI as AIOrchestrator
    participant PR as Prompt Registry
    participant CB as Context Builder
    participant PV as Provider Registry
    participant PRV as Specified Provider
    participant CA as Semantic Cache
    participant RT as AI Provider (real)

    CL->>AI: execute(taskName, variables)
    AI->>PR: getPrompt(taskName)
    alt taskName not found
        AI-->>CL: Error unknown prompt
    else found
        PR-->>AI: template, schema, version
        AI->>PRV: validate(variables, schema)
        alt validation fails
            AI-->>CL: Validation error
        else validation OK
            PRV-->>AI: valid variables
            AI->>CB: build(contextSpec from prompt)
            CB-->>AI: built context
            AI: render template + variables + context
            AI->>CA: compute cache key
            alt cache hit
                CA-->>AI: cached response
                AI-->>CL: return response
            else cache miss
                AI->>PV: getProvider(default or specified)
                PV-->>AI: provider instance
                loop retry/up to max 3
                    AI->>RT: complete(rendered prompt, options)
                    alt temporary failure
                        RT-->>AI: error (timeout, 5xx, rate limit)
                        AI: wait for backoff + jitter
                    else success
                        RT-->>AI: text response
                        break
                end
                alt all attempts failed or quota exhausted
                    AI: try next provider in fallback list
                end
                AI->>CA: store response in cache
                AI-->>CL: return response
            end
        end
    end
```

## Security and Confidentiality

- **API Keys**: never hard‑coded; must be provided via environment variables (e.g., `CLAUDE_API_KEY`, `OPENAI_API_KEY`) or an integrated secrets manager. The configuration loader (`@dxgjs/core`) does not expose them in logs thanks to an automatic mask borrowed from `@dxgjs/env`.
- **Transmitted Context**: the `ContextBuilder` allows excluding sensitive fields by default (e.g., any variable containing the keyword `secret`, `key`, `token`). The caller may, however, choose to include a secret explicitly after being warned.
- **Logging**: AI calls are logged at `debug` level only, and never contain the full prompt or response (only task name, provider used, duration, and status).
- **GDPR / CCPA Compliance**: no personal data is sent unless the user decides explicitly (e.g., by passing user data in the prompt variables). The system does not collect AI usage telemetry unless DXG’s general telemetry is enabled and the user consents.

## Extension Points for Plugins

Plugins can extend DXG’s AI in three main ways:
1. **Register a new provider**: via `AIOrchestrator.registerProvider(name, factory)`.
2. **Register a new prompt**: via `AIOrchestrator.registerPrompt(name, template, schema, version)`.
3. **Register a new specialized agent**: although the core agents are provided by the core, a plugin can supply a function that, given a task name, returns a promise of result (internally it may call the orchestrator with a custom prompt or perform specific pre/post‑treatment). The core could offer a function `registerAgent(taskName: string, handler: (vars, options) => Promise<any>) => void` to allow this.

Each extension is subject to the same validation and sandbox rules as other plugin types.

## Global AI Configuration

A sub‑object in (or a dedicated section in the configuration file) may contain:
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

This block is read directly from package.json and provided to the orchestrator at initialization.

## Rejected / Alternatives Considered

- **Direct provider call in each package**: would have created tight coupling and made provider changes require updates across multiple packages.
- **Single monolithic prompt**: would have limited reuse and complicated version management.
- **No context**: would have forced each call to repeat information‑gathering logic, leading to duplicated code and less relevant prompts.
- **Prompt‑only based cache**: would have ignored provider, model, or option differences, potentially returning inappropriate responses when parameters change.
- **No fallback mechanism**: would have made the fragile in the face of service outages or quota exceedances.

## Summary of Decisions Made

- **Abstract provider** with common interface (`complete`, `stream`, `embed`).
- **Versioned prompt registry with schema validation**.
- **Modular context construction** enabling workspace, config, FS, env, terminal aggregation.
- **Centralized orchestrator** managing provider selection, rendering, cache, rate limiting, retries, and fallbacks.
- **Specialized agents** (generator, reviewer, refactorer, auditor, planner) to encapsulate common intentions.
- **Semantic cache** based on hash of rendered prompt + provider + options.
- **Rate‑limiter, exponential backoff with jitter, and provider fallback**.
- **Security**: API keys via environment variables, automatic secret masking in logs, context‑level sensitive data filtering by default.
- **Extensibility** for plugins to add new providers, prompts, or agents.

This architecture provides a solid foundation for advanced AI features while remaining interchangeable, reliable, and secure.