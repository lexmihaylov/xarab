# Xarab

![Xarab](assets/xarab.png)

**A terminal coding agent with a deliberate answer to “which model should handle this?”**

Ask a quick question, investigate a tricky bug, or plan a complex change: Xarab classifies the capability each request calls for and routes it—with relevant conversation context—to the worker you assigned to that tier. You choose the models and providers. The goal is to make model choice inspectable and adaptable, instead of sending every task down the same path.

### Why Xarab?

- **Match the worker to the work.** Route straightforward requests differently from tasks that need deeper investigation or specialized reasoning.
- **Build your own model lineup.** Configure the classifier and each tier independently; use local GGUF, OpenAI, or OpenRouter models.
- **Get work done in your project.** Workers can inspect and edit files, search code, run commands, and use optional web research tools.
- **Pick up where you left off.** Sessions autosave, can be browsed and restored, and can be compacted to carry important context forward.
- **Inspect and tune routing.** See the chosen tier and rationale, then evaluate a local classifier against labeled examples.

## Try it

**Requirements:** Node.js 26.4.0 or newer. Xarab's terminal UI is built with [OpenTUI](https://github.com/anomalyco/opentui) (`@opentui/core` and `@opentui/react`). The default local GGUF classifier and any local GGUF workers require a machine supported by [`node-llama-cpp`](https://github.com/withcatai/node-llama-cpp).

```sh
npm install
npm start
```

By default, installation downloads and configures the [Google Gemma 4 E2B Q4_0 GGUF classifier](https://huggingface.co/google/gemma-4-E2B-it-qat-q4_0-gguf) (about 3.35 GB) under `~/.xarab/models`. To skip the automatic download, set `XARAB_SKIP_POSTINSTALL=1`; you can configure a classifier later in `/route` or browse for local models with `/download`.

**First run:** open `/connect` to connect OpenAI or add an OpenRouter API key, then open `/route` to choose a classifier and assign workers to tiers. Or choose local GGUF models in `/route` and try Xarab without connecting a provider. Send a request to see the selected tier and its rationale. Type `/help` for the command list.

## The three-tier system

Tiers describe **the capability needed to do the work well**—not a fixed model size, task length, or number of files. Xarab classifies each new request using the request and a limited amount of recent conversation context, then sends it to that tier's configured worker.

| Tier | Best fit | Examples |
| --- | --- | --- |
| **1 — Focused** | Clear, bounded work with established patterns | Explain a concept; make a small, straightforward change |
| **2 — Advanced** | Bounded work that needs investigation, debugging, or architectural judgment | Trace a bug across related modules; implement a feature after understanding existing conventions |
| **3 — Specialized** | Work where quality depends on unusually deep reasoning, specialized expertise, or careful handling of high-consequence trade-offs | Difficult graphics/performance work; complex security or distributed-systems design |

**Why tiers?** A small, well-scoped request and a difficult investigation may not need the same worker. Assign models by capability level, then inspect the classifier's choice. If a worker discovers that the remaining work needs materially different capability, it can request a tier adjustment; the router checks the request and only hands off when an appropriate worker is configured. Tiering is a strategy, not a guarantee of lower cost, faster answers, or better results. Outcomes depend on the classifier, assignments, and task.

### Configure your lineup

In **`/route`**, choose a classifier, select Tier 1, 2, or 3, then assign a worker model. The classifier and each worker are independent assignments: mix providers or use one provider throughout. In the routing dialog, Tab or Left/Right switches sections, Up/Down selects, and Enter applies or assigns. Use `/download` to find local GGUF models on Hugging Face.

- **OpenAI:** Sign in through `/connect`.
- **OpenRouter:** Add an API key through `/connect`.
- **Local GGUF:** Choose a model in `/route` or find one with `/download`.

Models are stored in `~/.xarab/models` by default; set `XARAB_MODELS_DIR` to use another directory. Xarab keeps its configuration, credentials, and sessions under `~/.xarab/`.

## A few useful commands

- `/route` — configure the classifier and tier workers
- `/connect` — connect or manage providers
- `/download [query]` — search Hugging Face for local models
- `/sessions` — browse saved conversations; `Ctrl+O` also opens the session browser
- `/new [name]`, `/save [name]` — start or save a session
- `/compact` — summarize older conversation to make room for continued work
- `/clear` — start a fresh conversation
- `!<command>` — run a shell command and attach its output to your next message
- `Esc` — stop generation

Workers can use project `AGENTS.md` instructions and discover reusable skills from `.agents/skills` in the project or home directory. Available tools include file reading, listing and searching, focused edits, writing files, shell commands, and web search/fetch; web search requires a Tavily API key.

## Develop and evaluate

```sh
npm test
npm run format:check
```

To evaluate a local GGUF classifier against the labeled starter set:

```sh
npm run classifier:evaluate -- /path/to/classifier.gguf
```

The report includes exact tier accuracy, under- and over-routing, two-tier under-routes, rationales, and average classification time. The examples live in `test/fixtures/classifier-cases.json`, making it possible to refine the rubric and measure how a classifier handles your cases. This evaluation does not call a worker provider.

For a focused routing test run:

```sh
node --test test/routing.test.js
```
