# Mr Robot — Local AI Assistant and Developer Environment

Mr Robot is an experimental **local-first AI assistant** that combines educational NLP/ML components implemented in TypeScript with externally trained open-source language models running in-browser through WebLLM/WebGPU.

The project explores a practical question: how much of an AI assistant's surrounding intelligence stack—retrieval, grounding, memory, tooling, correction capture, developer workflows, and orchestration—can be built and inspected locally instead of hidden behind a hosted API.

## Important distinction

Mr Robot contains two different kinds of AI components:

1. **Custom educational implementations** — tokenizer, stemming, classification, a feed-forward neural network, a compact transformer-style model, knowledge/memory logic, and orchestration utilities.
2. **Pretrained language models** — models such as Llama, Qwen, and Phi loaded through WebLLM/WebGPU for actual language-model inference.

The custom transformer is a learning/experimentation component; it is **not** presented as a replacement for the pretrained LLMs. This distinction matters because the project is about understanding and composing AI-system components, not claiming to have trained a frontier model from scratch.

## Core capabilities

### Local LLM inference

- Runs supported pretrained models in the browser through WebLLM/WebGPU.
- Streams generated tokens to the application.
- Keeps model inference local when using the local-LLM path.
- Optional web retrieval naturally requires network access; therefore the project is local-first rather than literally network-free in every mode.

### Grounded generation

The grounding layer can inject retrieved web context into the model prompt and request inline source references. Follow-up reference resolution helps later questions refer back to previously retrieved material.

This separates the generation model from the evidence-gathering step and makes unsupported output easier to detect than an unconstrained chat response.

### Educational NLP/ML stack

The codebase includes hand-built implementations for learning and experimentation, including:

- byte-pair encoding (BPE) tokenization
- Porter stemming
- multinomial Naive Bayes classification
- feed-forward neural network training/backpropagation
- a compact multi-layer transformer-style implementation
- structured knowledge-base storage
- conversation/memory utilities
- multi-step planning/orchestration logic

These components are intentionally small and inspectable.

### Developer-agent tooling

Mr Robot also experiments with the software-engineering layer around an assistant:

- project/framework scaffolding
- code/file workspace operations
- controlled terminal execution
- Git operations
- development-server lifecycle management
- multi-file rename/refactor support
- known-error detection and automated fix patterns
- database-backed capture of repeated mistakes/fixes

### Correction and training-data workflow

User corrections can be collected and exported in formats commonly used for later model experimentation, including JSONL-style instruction/conversation datasets. The repository includes guidance for downstream fine-tuning workflows; it does not claim that the included pretrained LLMs were originally trained by this project.

## Architecture

```text
User Interface
     ↓
Assistant / Orchestration Layer
     ├── Local pretrained LLM via WebLLM
     ├── Custom NLP/ML components
     ├── Grounding + web retrieval
     ├── Memory / knowledge storage
     └── Developer tools
     ↓
Prisma / SQLite persistence
```

Representative modules under `src/lib/ai/` include:

```text
brain.ts
local-llm.ts
grounded-generation.ts
terms-of-service.ts
training-collector.ts
web-search.ts
classifier.ts
neural-net.ts
transformer.ts
```

## Technology

- Next.js 16
- React 19
- TypeScript
- Prisma + SQLite
- WebLLM / WebGPU
- Web Speech API
- Next.js API routes and streaming responses

## Why this project matters

The most useful lesson from Mr Robot was not simply connecting a model to a chat UI. Building the surrounding system exposed several deeper problems:

- how retrieved evidence should constrain generation
- how local inference changes privacy and deployment tradeoffs
- how model output can be connected safely to tools
- how conversational state and references should be resolved
- how corrections can be captured for later improvement
- where small hand-built ML components help understanding even when production-quality pretrained models are still needed

Those questions are what pushed the project from general full-stack development toward information retrieval, grounded LLM systems, and reliable AI software.

## Quick start

```bash
npm install
npx prisma db push
npx prisma generate
npm run dev
```

Open:

```text
http://localhost:3000/chat
```

WebGPU-backed local LLM inference requires a compatible modern browser and sufficient memory for the selected model.

## Development note

The repository is presented as an engineering and learning project. Quantitative counts in the source tree should be treated as implementation-scale indicators rather than research-performance claims; no benchmark is claimed unless it is explicitly reproducible from the repository.

## Author

**Mohammad Farhat**

- GitHub: [@7clan](https://github.com/7clan)
- Portfolio: [mohammad-farhat.surge.sh](https://mohammad-farhat.surge.sh)
