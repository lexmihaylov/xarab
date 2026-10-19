# Xarab Router

Xarab Router is a terminal coding assistant that uses a small local GGUF model only to classify each request, then routes it with relevant conversation context to an OpenAI worker.

The Hugging Face GGUF browser/downloader manages classifier models; local models never generate chat responses. The routing harness classifies task complexity into three task-defined tiers, and users configure an OpenAI worker for each tier. The local classifier runs through `node-llama-cpp`.

## Requirements

- Node.js 20 or newer
- A supported machine for [`node-llama-cpp`](https://github.com/withcatai/node-llama-cpp)
- One or more local GGUF models

## Start

```sh
npm install
npm start
```

The CLI uses a local GGUF model for classification and OpenAI Codex workers for all chat responses, using the same ChatGPT OAuth flow as Pi. Use `/route` to configure routing, or `/download` to search Hugging Face for classifier models. Models are shared with `xarab-local` and stored in `~/.xarab/models` by default; set `XARAB_MODELS_DIR` to change that location. Router configuration, OAuth credentials, general settings, and sessions are stored under `~/.xarab/`.

### Tier routing

Open `/route` for a three-column setup dialog: choose the local classifier, select Tier 1/2/3, and assign that tier an OpenAI model. Use Tab or Left/Right to switch sections, Up/Down to select, and Enter to apply/assign. OpenAI models are fetched for your signed-in account. `/download` remains a separate Hugging Face browser for classifier models.

You can also configure routing from commands. For example:

```text
/router classifier ~/.xarab/models/SmolLM2-360M-Instruct-Q4_K_M.gguf
/router worker 1 openai gpt-6-astra
/router worker 2 openai gpt-6-astra
/router worker 3 openai gpt-6-astra
/router status
```

Classifier and tier assignments are stored separately in `~/.xarab/routing.conf`; general settings and OAuth credentials are stored in `~/.xarab/config.json` and `~/.xarab/auth/`. Existing routing settings are migrated automatically, and legacy local tier assignments are converted to OpenAI assignments. Classification always runs locally; all routed tiers use OpenAI workers. `/router classifier off` disables automatic routing. OpenAI workers require `/openai login` and a model available to the signed-in account; select a default with `/openai use <model-id>` or assign a model directly in `/router worker`.

Use `/openai login` to start Codex OAuth, then run `/openai copy` to copy the sign-in URL to your clipboard (including the Windows clipboard from WSL2). Paste that URL into a browser and sign in to ChatGPT. After the browser redirects to `http://localhost:1455/auth/callback`, copy the full URL from the address bar and paste it into Xarab. Xarab does not start a callback server. Credentials are stored in `~/.xarab/auth/openai-chatgpt.json` with owner-only permissions; `/openai logout` removes the local tokens.

Then use `/openai models`, `/openai use <model-id>`, and `/openai ask <request>`. Codex requests use the ChatGPT Codex Responses endpoint, streaming, and `store: false`. The adapter can call Xarab's existing tools and approvals.

## Development

```sh
npm test
npm run format:check
```

Routing harness tests can be run independently with `node --test test/routing.test.js`.

### Evaluate a local classifier

Select or download a classifier GGUF, then evaluate it against the labeled examples:

```sh
npm run classifier:evaluate -- /path/to/classifier.gguf
```

The harness reports exact tier accuracy, under- and over-routing, two-tier under-routes, per-case rationales, and average classification time. Its starter dataset is `test/fixtures/classifier-cases.json`; review and expand those examples as the tier rubric is refined. The evaluation does not call any worker provider.
