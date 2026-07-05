# Mr Robot — From-Scratch AI Assistant with Embedded Open-Source LLM

An AI assistant that runs **entirely on-device** with zero external APIs. Combines a from-scratch NLP stack with real open-source LLMs (Llama-3.2, Qwen-2.5, Phi-3.5) running in-browser via WebGPU.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Set up the database
npx prisma db push
npx prisma generate

# 3. Start the dev server
npm run dev

# 4. Open http://localhost:3000/chat
```

## Browser Requirements

For the Local LLM tab (WebGPU):
- Chrome 113+, Edge 113+, Brave, or Arc
- ~1-3 GB free RAM/VRAM depending on model

For all other features (Chat from-scratch mode, Code Studio, Terminal, Git, etc.):
- Any modern browser

## What's Inside

### From-Scratch NLP Stack (~12,000 lines of TypeScript)
- **BPE Tokenizer** — byte-pair encoding for subword tokenization
- **Porter Stemmer** — reduces words to roots (running → run)
- **Naive Bayes Classifier** — multinomial with Laplace smoothing
- **Neural Network** — feedforward with backpropagation
- **Transformer** — 4 layers, 4 attention heads, dim=64
- **Knowledge Base** — subject-predicate-object triples in SQLite
- **Conversation Memory** — sliding window with embeddings
- **Chain-of-Thought Reasoning** — multi-step planning

### Real LLM Integration (WebLLM)
- Runs Llama-3.2-1B/3B, Qwen-2.5-0.5B/1.5B, Phi-3.5-mini in-browser
- Streaming token generation
- 8 models available (all Apache 2.0 or MIT)

### Grounded Generation (Hallucination Prevention)
- Web search results injected into LLM prompt
- Forces inline citations [Source N]
- Reference resolution for follow-up questions

### Custom Terms of Service
- User-editable, versioned ToS
- Injected into LLM system prompt

### Training Pipeline
- Collect corrections on AI responses
- Export as JSONL/Alpaca/ShareGPT/DPO
- LoRA fine-tuning guide included

### Agent Capabilities
- **19 framework scaffolders** (React, Next.js, Vue, Angular, Svelte, etc.)
- **Code Studio** — file explorer + editor
- **Terminal** — safe command runner (60+ binaries)
- **Git integration** — init, commit, log, branches, diff
- **Dev server manager** — start/stop/monitor
- **Multi-file rename refactor**
- **50+ error patterns** with auto-fix + DB-backed mistake learning

## Tech Stack

- **Frontend**: Next.js 16, React 19, TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: Next.js API Routes, SSE streaming
- **Database**: SQLite via Prisma ORM
- **AI/ML**: WebLLM, custom neural network, transformer, classifier
- **Voice**: Web Speech API (TTS + STT)

## Project Structure

```
src/
├── app/
│   ├── page.tsx              # Root → redirects to /chat
│   ├── chat/                 # Mr Robot AI chat (13 tabs)
│   └── api/ai/               # 22 API endpoints
├── components/               # React components
└── lib/
    ├── ai/                   # 28 AI modules
    │   ├── brain.ts          # Main orchestrator
    │   ├── local-llm.ts      # WebLLM wrapper
    │   ├── grounded-generation.ts
    │   ├── terms-of-service.ts
    │   ├── training-collector.ts
    │   ├── web-search.ts     # Bing/Google/DDG scraping
    │   ├── classifier.ts     # Naive Bayes
    │   ├── neural-net.ts     # Feedforward NN
    │   ├── transformer.ts    # 4-layer transformer
    │   └── ...               # 19 more modules
    └── db.ts                 # Prisma client
└── prisma/
    └── schema.prisma         # 8 models
```

## Stats

- ~12,000 lines of TypeScript in `src/lib/ai/`
- 28 AI modules
- 13 UI tabs
- 22 REST API endpoints
- 8 Prisma models
- 8 LLM models supported
- 19 framework scaffolders
- 50+ auto-fix error patterns

## License

- **Source code**: MIT — do whatever you want
- **WebLLM runtime**: Apache 2.0
- **Underlying LLMs**: Apache 2.0 (Llama, Qwen), MIT (Phi)

## Author

**Mohammad Farhat**
- GitHub: [@7clan](https://github.com/7clan)
- Portfolio: [mohammad-farhat.surge.sh](https://mohammad-farhat.surge.sh)
