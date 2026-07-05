/**
 * BPE Tokenizer — Built from scratch
 *
 * Byte Pair Encoding tokenizer for the from-scratch transformer.
 * Learns subword units from text and encodes/decodes between text and tokens.
 *
 * No external libraries. Pure TypeScript.
 */

export interface BPEToken {
  id: number;
  token: string;
}

export class BPETokenizer {
  private vocab: Map<string, number> = new Map();
  private idToToken: Map<number, string> = new Map();
  private merges: Array<[string, string]> = [];
  private vocabSize: number = 0;

  // Special tokens
  static readonly PAD = 0;
  static readonly BOS = 1;  // Beginning of sequence
  static readonly EOS = 2;  // End of sequence
  static readonly UNK = 3;  // Unknown token
  static readonly SYSTEM = 4;
  static readonly USER = 5;
  static readonly ASSISTANT = 6;

  constructor() {
    // Initialize with special tokens
    this.addToken("<pad>");
    this.addToken("<bos>");
    this.addToken("<eos>");
    this.addToken("<unk>");
    this.addToken("<system>");
    this.addToken("<user>");
    this.addToken("<assistant>");
  }

  private addToken(token: string): number {
    if (this.vocab.has(token)) return this.vocab.get(token)!;
    const id = this.vocabSize++;
    this.vocab.set(token, id);
    this.idToToken.set(id, token);
    return id;
  }

  /**
   * Train the tokenizer on a corpus of text.
   * Learns the most frequent byte pairs and merges them.
   */
  train(text: string, targetVocabSize: number = 2000): void {
    // Start with character-level tokens
    const chars = new Set<string>();
    for (const c of text) {
      chars.add(c);
      if (!this.vocab.has(c)) this.addToken(c);
    }

    // Split text into words (with space markers)
    const words = text.split(/\s+/).filter((w) => w.length > 0);
    const wordFreqs: Map<string, number> = new Map();
    for (const word of words) {
      wordFreqs.set(word, (wordFreqs.get(word) || 0) + 1);
    }

    // Convert words to symbol sequences
    const wordSymbols: Map<string, string[]> = new Map();
    for (const [word, freq] of wordFreqs) {
      wordSymbols.set(word, word.split(""));
    }

    // BPE merge loop
    while (this.vocabSize < targetVocabSize) {
      // Count pair frequencies
      const pairFreqs: Map<string, number> = new Map();
      for (const [word, symbols] of wordSymbols) {
        const freq = wordFreqs.get(word) || 0;
        for (let i = 0; i < symbols.length - 1; i++) {
          const pair = `${symbols[i]}${symbols[i + 1]}`;
          pairFreqs.set(pair, (pairFreqs.get(pair) || 0) + freq);
        }
      }

      if (pairFreqs.size === 0) break;

      // Find most frequent pair
      let bestPair = "";
      let bestFreq = 0;
      for (const [pair, freq] of pairFreqs) {
        if (freq > bestFreq) {
          bestFreq = freq;
          bestPair = pair;
        }
      }

      if (bestFreq < 2) break; // Stop if pairs are too rare

      // Split the pair back into two symbols
      const mid = Math.floor(bestPair.length / 2);
      // Find the actual split point by checking which split exists in vocab
      let splitA = "";
      let splitB = "";
      for (let i = 1; i <= bestPair.length; i++) {
        const a = bestPair.slice(0, i);
        const b = bestPair.slice(i);
        if (this.vocab.has(a) && (this.vocab.has(b) || b.length > 0)) {
          splitA = a;
          splitB = b;
          break;
        }
      }
      if (!splitA) {
        splitA = bestPair[0];
        splitB = bestPair.slice(1);
      }

      this.merges.push([splitA, splitB]);
      this.addToken(bestPair);

      // Apply merge to all words
      for (const [word, symbols] of wordSymbols) {
        const newSymbols: string[] = [];
        let i = 0;
        while (i < symbols.length) {
          if (i < symbols.length - 1 && symbols[i] === splitA && symbols[i + 1] === splitB) {
            newSymbols.push(bestPair);
            i += 2;
          } else {
            newSymbols.push(symbols[i]);
            i++;
          }
        }
        wordSymbols.set(word, newSymbols);
      }
    }
  }

  /**
   * Encode text into token IDs.
   */
  encode(text: string): number[] {
    const tokens: number[] = [BPETokenizer.BOS];

    // Split into words, preserving spaces
    const words = text.match(/\S+|\s+/g) || [];
    for (const word of words) {
      // Try to match the longest token starting from each position
      let i = 0;
      while (i < word.length) {
        let matched = false;
        // Try decreasing lengths
        for (let len = Math.min(word.length - i, 20); len > 0; len--) {
          const sub = word.slice(i, i + len);
          if (this.vocab.has(sub)) {
            tokens.push(this.vocab.get(sub)!);
            i += len;
            matched = true;
            break;
          }
        }
        if (!matched) {
          // Fall back to character-level
          for (const c of word.slice(i)) {
            tokens.push(this.vocab.get(c) ?? BPETokenizer.UNK);
          }
          i = word.length;
        }
      }
    }

    tokens.push(BPETokenizer.EOS);
    return tokens;
  }

  /**
   * Decode token IDs back into text.
   */
  decode(tokenIds: number[]): string {
    const parts: string[] = [];
    for (const id of tokenIds) {
      if (id === BPETokenizer.PAD || id === BPETokenizer.BOS || id === BPETokenizer.EOS) continue;
      if (id === BPETokenizer.UNK) continue;
      const token = this.idToToken.get(id);
      if (token) parts.push(token);
    }
    return parts.join("");
  }

  /**
   * Get the vocabulary size.
   */
  getVocabSize(): number {
    return this.vocabSize;
  }

  /**
   * Save the tokenizer state (vocab + merges) to JSON.
   */
  serialize(): string {
    return JSON.stringify({
      vocab: Array.from(this.vocab.entries()),
      merges: this.merges,
      vocabSize: this.vocabSize,
    });
  }

  /**
   * Load the tokenizer state from JSON.
   */
  deserialize(data: string): void {
    const obj = JSON.parse(data);
    this.vocab = new Map(obj.vocab);
    this.idToToken = new Map();
    for (const [token, id] of obj.vocab) {
      this.idToToken.set(id, token);
    }
    this.merges = obj.merges || [];
    this.vocabSize = obj.vocabSize || this.vocab.size;
  }

  /**
   * Train on a default corpus (English + code).
   */
  trainOnDefaultCorpus(): void {
    const corpus = `
The quick brown fox jumps over the lazy dog. Hello world, this is a test.
Programming is the art of telling a computer what to do. Code is poetry.
function add(a, b) { return a + b; } const result = add(5, 3);
Artificial intelligence is the future of technology. Machine learning models
can learn from data and make predictions. Neural networks are inspired by
the human brain. Deep learning uses many layers of neurons.
The capital of France is Paris. The capital of Japan is Tokyo.
Python is a popular programming language. JavaScript runs in the browser.
React is a JavaScript library for building user interfaces.
Angular and Vue are other popular frontend frameworks.
Node.js allows JavaScript to run on the server. Express is a web framework.
Django and Flask are Python web frameworks. FastAPI is modern and fast.
What is the meaning of life? Why is the sky blue? How do computers work?
Search the web for information. Remember that fact for later. Calculate math.
The weather today is sunny. Tomorrow it will rain. Next week is uncertain.
Israel and Lebanon have a complex history. Hezbollah is a political party.
The World Cup is the biggest football tournament. FIFA organizes it.
Egypt and Iran played to a 1-1 draw in the 2026 World Cup in Seattle.
Sports results change every day. News updates come from many sources.
BBC, ESPN, CNN, Al Jazeera, Reuters are news organizations.
Google, Bing, DuckDuckGo are search engines. Wikipedia is an encyclopedia.
To write good code, use meaningful variable names. Test your code often.
Git is a version control system. GitHub hosts git repositories.
The terminal allows you to run commands. Use ls to list files.
NPM is the Node Package Manager. Install packages with npm install.
TypeScript adds types to JavaScript. It compiles to plain JavaScript.
React components are reusable pieces of UI. Props pass data to components.
State management is important in React. useState and useEffect are hooks.
APIs allow different software to communicate. REST and GraphQL are popular.
Databases store data. SQL and NoSQL are two types. SQLite is embedded.
Authentication verifies who you are. Authorization determines what you can do.
Security is important. Use HTTPS. Hash passwords. Never trust input.
The internet is a network of networks. HTTP is the protocol of the web.
DNS translates domain names to IP addresses. TCP/IP is the foundation.
Cloud computing provides on-demand resources. AWS, Azure, GCP are providers.
Machine learning models train on data. They learn patterns and make predictions.
Supervised learning uses labeled data. Unsupervised learning finds patterns.
Reinforcement learning learns from rewards. Deep learning uses neural networks.
Transformers are a neural network architecture. Attention is all you need.
GPT generates text. BERT understands text. CLIP connects text and images.
Large language models are trained on massive text corpora. They generate text.
ChatGPT, Claude, Gemini are large language models. They can chat and reason.
Building an AI from scratch is challenging but educational. Every component matters.
Tokenizers split text into tokens. BPE is a popular tokenization method.
Embeddings represent words as vectors. Similar words have similar vectors.
Attention mechanisms allow models to focus on relevant parts of the input.
Multi-head attention runs multiple attention mechanisms in parallel.
Positional encoding tells the model the position of each token.
Layer normalization stabilizes training. Dropout prevents overfitting.
The feedforward network processes each token independently.
Residual connections help with gradient flow. Skip connections are the same thing.
Softmax converts logits to probabilities. Temperature controls randomness.
Top-k sampling picks from the k most likely tokens. Top-p uses cumulative probability.
Beam search keeps multiple hypotheses. Greedy decoding picks the best at each step.
Training a model requires a loss function. Cross-entropy is common for classification.
Backpropagation computes gradients. Chain rule is the mathematical foundation.
Stochastic gradient descent updates weights. Adam is a popular optimizer.
Learning rate controls step size. Too high diverges, too low is slow.
Batch size affects training stability. Larger batches are more stable but slower.
Epochs are full passes through the data. Overfitting happens with too many epochs.
Regularization prevents overfitting. L1 and L2 are common methods.
Data augmentation creates more training data from existing data.
Transfer learning uses pre-trained models. Fine-tuning adapts them to new tasks.
The transformer architecture revolutionized NLP. It enables parallel training.
Self-attention allows each token to attend to all other tokens.
Cross-attention is used in encoder-decoder models like the original transformer.
Decoder-only models like GPT generate text autoregressively.
Encoder-only models like BERT are good for understanding text.
The context window limits how much text a model can process at once.
Scaling laws predict model performance from size and data.
Emergent abilities appear in larger models. Reasoning emerges at scale.
Chain of thought prompting improves reasoning. Step by step thinking helps.
Few-shot learning uses examples in the prompt. Zero-shot uses no examples.
Instruction tuning teaches models to follow instructions. RLHF uses human feedback.
Constitutional AI uses principles instead of human feedback. Safety is important.
Alignment ensures models act in accordance with human values.
Hallucination is when models make things up. Grounding reduces hallucination.
Retrieval augmented generation fetches information to ground responses.
Tools allow models to take actions. Function calling is a form of tool use.
Agents are systems that use tools to accomplish goals. Planning is key.
Multi-step reasoning breaks problems into steps. Each step builds on the previous.
Code generation is a key capability. Models can write, debug, and explain code.
Code understanding requires parsing syntax and semantics. ASTs help.
Execution sandboxes allow models to run code safely. Feedback loops improve results.
Streaming responses generate tokens one at a time. This feels more natural.
Embeddings enable semantic search. Similar texts have similar embeddings.
Vector databases store embeddings efficiently. Similarity search is fast.
Conversation memory stores all messages. Context windows summarize history.
Multi-turn planning tracks state across steps. The model knows where it is.
Error correction learns from mistakes. Self-improvement is the goal.
The future of AI is bright. From scratch means understanding every component.
Building things yourself gives you control. No external dependencies. Your terms.
`;

    this.train(corpus, 1500);
  }
}

// Fix the typo (BOS constant reference)
