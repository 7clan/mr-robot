/**
 * Transformer Language Model — Built from scratch
 *
 * A complete transformer neural network for text generation.
 * No external libraries. Pure TypeScript.
 *
 * Architecture:
 *   - Token embeddings
 *   - Positional encoding (learned)
 *   - N transformer decoder layers, each with:
 *     - Multi-head self-attention
 *     - Layer normalization
 *     - Feedforward network (2 linear layers + ReLU)
 *     - Residual connections
 *   - Output projection to vocabulary
 *
 * This is a nano-GPT style implementation.
 */

import { BPETokenizer } from "./bpe-tokenizer";

// ============ MATH UTILITIES ============

function randomNormal(stddev: number = 0.02): number {
  // Box-Muller transform
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v) * stddev;
}

function softmax(arr: number[]): number[] {
  const max = Math.max(...arr);
  const exps = arr.map((x) => Math.exp(x - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((x) => x / sum);
}

function relu(x: number): number {
  return Math.max(0, x);
}

function gelu(x: number): number {
  return 0.5 * x * (1 + Math.tanh(Math.sqrt(2 / Math.PI) * (x + 0.044715 * x * x * x)));
}

// ============ MATRIX OPERATIONS ============

type Matrix = number[][];

function matMul(a: Matrix, b: Matrix): Matrix {
  const rows = a.length;
  const cols = b[0].length;
  const inner = b.length;
  const result: Matrix = Array(rows).fill(0).map(() => Array(cols).fill(0));
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      let sum = 0;
      for (let k = 0; k < inner; k++) {
        sum += a[i][k] * b[k][j];
      }
      result[i][j] = sum;
    }
  }
  return result;
}

function matAdd(a: Matrix, b: Matrix): Matrix {
  return a.map((row, i) => row.map((val, j) => val + b[i][j]));
}

function transpose(m: Matrix): Matrix {
  const rows = m.length;
  const cols = m[0].length;
  const result: Matrix = Array(cols).fill(0).map(() => Array(rows).fill(0));
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      result[j][i] = m[i][j];
    }
  }
  return result;
}

// ============ LAYER NORMALIZATION ============

class LayerNorm {
  gamma: number[];
  beta: number[];
  eps: number = 1e-5;

  constructor(dim: number) {
    this.gamma = Array(dim).fill(1);
    this.beta = Array(dim).fill(0);
  }

  forward(x: number[][]): number[][] {
    return x.map((row) => {
      const mean = row.reduce((a, b) => a + b, 0) / row.length;
      const variance = row.reduce((a, b) => a + (b - mean) ** 2, 0) / row.length;
      const std = Math.sqrt(variance + this.eps);
      return row.map((val, i) => this.gamma[i] * (val - mean) / std + this.beta[i]);
    });
  }
}

// ============ ATTENTION ============

class MultiHeadAttention {
  numHeads: number;
  headDim: number;
  dim: number;
  
  // Weights (initialized randomly)
  wQ: number[][][];
  wK: number[][][];
  wV: number[][][];
  wO: number[][];

  constructor(dim: number, numHeads: number) {
    this.dim = dim;
    this.numHeads = numHeads;
    this.headDim = Math.floor(dim / numHeads);

    // Initialize weights for each head
    this.wQ = [];
    this.wK = [];
    this.wV = [];
    for (let h = 0; h < numHeads; h++) {
      this.wQ.push(this.initMatrix(dim, this.headDim));
      this.wK.push(this.initMatrix(dim, this.headDim));
      this.wV.push(this.initMatrix(dim, this.headDim));
    }
    this.wO = this.initMatrix(dim, dim);
  }

  private initMatrix(rows: number, cols: number): number[][] {
    return Array(rows).fill(0).map(() => Array(cols).fill(0).map(() => randomNormal(0.02)));
  }

  forward(x: number[][], mask?: boolean[][]): number[][] {
    const seqLen = x.length;
    const headOutputs: number[][][] = [];

    for (let h = 0; h < this.numHeads; h++) {
      // Project to Q, K, V
      const Q = matMul(x, this.wQ[h]);
      const K = matMul(x, this.wK[h]);
      const V = matMul(x, this.wV[h]);

      // Compute attention scores
      const scores: number[][] = Array(seqLen).fill(0).map(() => Array(seqLen).fill(0));
      for (let i = 0; i < seqLen; i++) {
        for (let j = 0; j < seqLen; j++) {
          // Causal mask: can only attend to positions <= i
          if (mask && !mask[i][j]) {
            scores[i][j] = -Infinity;
            continue;
          }
          let dot = 0;
          for (let k = 0; k < this.headDim; k++) {
            dot += Q[i][k] * K[j][k];
          }
          scores[i][j] = dot / Math.sqrt(this.headDim);
        }
      }

      // Softmax over each row
      const attnWeights = scores.map((row) => softmax(row));

      // Apply attention to values
      const headOut: number[][] = Array(seqLen).fill(0).map(() => Array(this.headDim).fill(0));
      for (let i = 0; i < seqLen; i++) {
        for (let j = 0; j < seqLen; j++) {
          for (let k = 0; k < this.headDim; k++) {
            headOut[i][k] += attnWeights[i][j] * V[j][k];
          }
        }
      }
      headOutputs.push(headOut);
    }

    // Concatenate heads
    const concat: number[][] = Array(seqLen).fill(0).map(() => Array(this.dim).fill(0));
    for (let h = 0; h < this.numHeads; h++) {
      for (let i = 0; i < seqLen; i++) {
        for (let k = 0; k < this.headDim; k++) {
          concat[i][h * this.headDim + k] = headOutputs[h][i][k];
        }
      }
    }

    // Output projection
    return matMul(concat, this.wO);
  }
}

// ============ FEEDFORWARD NETWORK ============

class FeedForward {
  w1: number[][];
  b1: number[];
  w2: number[][];
  b2: number[];
  hiddenDim: number;

  constructor(dim: number, hiddenDim?: number) {
    this.hiddenDim = hiddenDim || dim * 4;
    this.w1 = Array(dim).fill(0).map(() => Array(this.hiddenDim).fill(0).map(() => randomNormal(0.02)));
    this.b1 = Array(this.hiddenDim).fill(0);
    this.w2 = Array(this.hiddenDim).fill(0).map(() => Array(dim).fill(0).map(() => randomNormal(0.02)));
    this.b2 = Array(dim).fill(0);
  }

  forward(x: number[][]): number[][] {
    // x: [seqLen, dim] → [seqLen, hiddenDim] → [seqLen, dim]
    const hidden = matMul(x, this.w1).map((row, i) => row.map((val, j) => gelu(val + this.b1[j])));
    return matMul(hidden, this.w2).map((row, i) => row.map((val, j) => val + this.b2[j]));
  }
}

// ============ TRANSFORMER BLOCK ============

class TransformerBlock {
  attention: MultiHeadAttention;
  feedForward: FeedForward;
  ln1: LayerNorm;
  ln2: LayerNorm;

  constructor(dim: number, numHeads: number, hiddenDim?: number) {
    this.attention = new MultiHeadAttention(dim, numHeads);
    this.feedForward = new FeedForward(dim, hiddenDim);
    this.ln1 = new LayerNorm(dim);
    this.ln2 = new LayerNorm(dim);
  }

  forward(x: number[][], mask?: boolean[][]): number[][] {
    // Pre-layernorm: x = x + attn(ln1(x))
    const normed1 = this.ln1.forward(x);
    const attnOut = this.attention.forward(normed1, mask);
    const x1 = matAdd(x, attnOut);

    // x = x + ffn(ln2(x))
    const normed2 = this.ln2.forward(x1);
    const ffnOut = this.feedForward.forward(normed2);
    return matAdd(x1, ffnOut);
  }
}

// ============ TRANSFORMER MODEL ============

export interface TransformerConfig {
  vocabSize: number;
  dim: number;
  numLayers: number;
  numHeads: number;
  maxSeqLen: number;
  hiddenDim?: number;
}

export class Transformer {
  config: TransformerConfig;
  tokenEmbedding: number[][];
  posEmbedding: number[][];
  blocks: TransformerBlock[];
  lnFinal: LayerNorm;
  outputProjection: number[][];

  constructor(config: TransformerConfig) {
    this.config = config;
    const { vocabSize, dim, numLayers, numHeads, maxSeqLen } = config;
    const hiddenDim = config.hiddenDim || dim * 4;

    // Token embedding: [vocabSize, dim]
    this.tokenEmbedding = Array(vocabSize).fill(0).map(() =>
      Array(dim).fill(0).map(() => randomNormal(0.02))
    );

    // Positional embedding: [maxSeqLen, dim]
    this.posEmbedding = Array(maxSeqLen).fill(0).map(() =>
      Array(dim).fill(0).map(() => randomNormal(0.02))
    );

    // Transformer blocks
    this.blocks = Array(numLayers).fill(0).map(() =>
      new TransformerBlock(dim, numHeads, hiddenDim)
    );

    // Final layer norm
    this.lnFinal = new LayerNorm(dim);

    // Output projection (tied with token embedding)
    this.outputProjection = this.tokenEmbedding; // Weight tying
  }

  /**
   * Forward pass through the transformer.
   * Returns logits for each position.
   */
  forward(tokenIds: number[]): number[][] {
    const seqLen = Math.min(tokenIds.length, this.config.maxSeqLen);
    const dim = this.config.dim;

    // Create causal mask
    const mask: boolean[][] = Array(seqLen).fill(0).map(() => Array(seqLen).fill(false));
    for (let i = 0; i < seqLen; i++) {
      for (let j = 0; j <= i; j++) {
        mask[i][j] = true;
      }
    }

    // Embed tokens + positions
    const x: number[][] = Array(seqLen).fill(0).map((_, i) => {
      const tokenId = tokenIds[i];
      const posId = i;
      return Array(dim).fill(0).map((_, d) =>
        (this.tokenEmbedding[tokenId]?.[d] || 0) + this.posEmbedding[posId]?.[d]
      );
    });

    // Pass through transformer blocks
    let hidden = x;
    for (const block of this.blocks) {
      hidden = block.forward(hidden, mask);
    }

    // Final layer norm
    hidden = this.lnFinal.forward(hidden);

    // Project to vocabulary (get logits)
    const logits = matMul(hidden, transpose(this.outputProjection));

    return logits;
  }

  /**
   * Generate text autoregressively.
   */
  generate(
    tokenIds: number[],
    maxNewTokens: number = 100,
    options: {
      temperature?: number;
      topK?: number;
      topP?: number;
    } = {}
  ): { tokens: number[]; text: string } {
    const temperature = options.temperature ?? 0.8;
    const topK = options.topK ?? 40;
    const topP = options.topP ?? 0.9;

    const tokens = [...tokenIds];
    const maxLen = this.config.maxSeqLen;

    for (let step = 0; step < maxNewTokens; step++) {
      // Truncate to max sequence length
      const inputTokens = tokens.slice(-maxLen);

      // Forward pass
      const logits = this.forward(inputTokens);

      // Get logits for the last position
      const lastLogits = logits[logits.length - 1];

      // Apply temperature
      const scaled = lastLogits.map((x) => x / temperature);

      // Apply top-k filtering
      const indexed = scaled.map((val, idx) => ({ val, idx }));
      indexed.sort((a, b) => b.val - a.val);
      const topKIndices = indexed.slice(0, topK).map((x) => x.idx);

      // Recompute with only top-k tokens
      const filteredLogits = scaled.map((val, idx) =>
        topKIndices.includes(idx) ? val : -Infinity
      );

      // Apply top-p (nucleus) sampling
      const probs = softmax(filteredLogits);
      const sortedProbs = probs.map((p, i) => ({ p, i })).sort((a, b) => b.p - a.p);
      let cumProb = 0;
      const nucleusIndices = new Set<number>();
      for (const { p, i } of sortedProbs) {
        nucleusIndices.add(i);
        cumProb += p;
        if (cumProb >= topP) break;
      }

      // Sample from nucleus
      const nucleusProbs = probs.map((p, i) => nucleusIndices.has(i) ? p : 0);
      const sum = nucleusProbs.reduce((a, b) => a + b, 0);
      const normalized = nucleusProbs.map((p) => p / sum);

      // Sample
      let r = Math.random();
      let nextToken = 0;
      for (let i = 0; i < normalized.length; i++) {
        r -= normalized[i];
        if (r <= 0) {
          nextToken = i;
          break;
        }
      }

      // Stop on EOS
      if (nextToken === BPETokenizer.EOS) break;

      tokens.push(nextToken);
    }

    return { tokens, text: "" }; // Text is decoded by the caller using the tokenizer
  }

  /**
   * Generate text with streaming (callback for each token).
   */
  generateStream(
    tokenIds: number[],
    onToken: (tokenId: number) => void,
    maxNewTokens: number = 100,
    options: {
      temperature?: number;
      topK?: number;
      topP?: number;
    } = {}
  ): number[] {
    const temperature = options.temperature ?? 0.8;
    const topK = options.topK ?? 40;
    const topP = options.topP ?? 0.9;

    const tokens = [...tokenIds];
    const maxLen = this.config.maxSeqLen;

    for (let step = 0; step < maxNewTokens; step++) {
      const inputTokens = tokens.slice(-maxLen);
      const logits = this.forward(inputTokens);
      const lastLogits = logits[logits.length - 1];

      const scaled = lastLogits.map((x) => x / temperature);
      const indexed = scaled.map((val, idx) => ({ val, idx }));
      indexed.sort((a, b) => b.val - a.val);
      const topKIndices = indexed.slice(0, topK).map((x) => x.idx);

      const filteredLogits = scaled.map((val, idx) =>
        topKIndices.includes(idx) ? val : -Infinity
      );

      const probs = softmax(filteredLogits);
      const sortedProbs = probs.map((p, i) => ({ p, i })).sort((a, b) => b.p - a.p);
      let cumProb = 0;
      const nucleusIndices = new Set<number>();
      for (const { p, i } of sortedProbs) {
        nucleusIndices.add(i);
        cumProb += p;
        if (cumProb >= topP) break;
      }

      const nucleusProbs = probs.map((p, i) => nucleusIndices.has(i) ? p : 0);
      const sum = nucleusProbs.reduce((a, b) => a + b, 0);
      const normalized = nucleusProbs.map((p) => p / sum);

      let r = Math.random();
      let nextToken = 0;
      for (let i = 0; i < normalized.length; i++) {
        r -= normalized[i];
        if (r <= 0) { nextToken = i; break; }
      }

      if (nextToken === BPETokenizer.EOS) break;

      tokens.push(nextToken);
      onToken(nextToken);
    }

    return tokens;
  }

  /**
   * Get the embedding for a token (used for semantic search).
   */
  getTokenEmbedding(tokenId: number): number[] {
    return this.tokenEmbedding[tokenId] || [];
  }

  /**
   * Get the average embedding for a sequence of tokens (text embedding).
   */
  getSequenceEmbedding(tokenIds: number[]): number[] {
    if (tokenIds.length === 0) return [];
    const dim = this.config.dim;
    const avg = Array(dim).fill(0);
    for (const tokenId of tokenIds) {
      const emb = this.tokenEmbedding[tokenId];
      if (emb) {
        for (let i = 0; i < dim; i++) {
          avg[i] += emb[i];
        }
      }
    }
    for (let i = 0; i < dim; i++) {
      avg[i] /= tokenIds.length;
    }
    return avg;
  }

  /**
   * Serialize the model to JSON (for saving/loading).
   */
  serialize(): string {
    return JSON.stringify({
      config: this.config,
      tokenEmbedding: this.tokenEmbedding,
      posEmbedding: this.posEmbedding,
      blocks: this.blocks.map((b) => ({
        attention: {
          numHeads: b.attention.numHeads,
          headDim: b.attention.headDim,
          dim: b.attention.dim,
          wQ: b.attention.wQ,
          wK: b.attention.wK,
          wV: b.attention.wV,
          wO: b.attention.wO,
        },
        feedForward: {
          w1: b.feedForward.w1,
          b1: b.feedForward.b1,
          w2: b.feedForward.w2,
          b2: b.feedForward.b2,
          hiddenDim: b.feedForward.hiddenDim,
        },
        ln1: { gamma: b.ln1.gamma, beta: b.ln1.beta },
        ln2: { gamma: b.ln2.gamma, beta: b.ln2.beta },
      })),
      lnFinal: { gamma: this.lnFinal.gamma, beta: this.lnFinal.beta },
    });
  }

  /**
   * Deserialize the model from JSON.
   */
  static deserialize(data: string): Transformer {
    const obj = JSON.parse(data);
    const model = new Transformer(obj.config);

    model.tokenEmbedding = obj.tokenEmbedding;
    model.posEmbedding = obj.posEmbedding;

    for (let i = 0; i < model.blocks.length; i++) {
      const b = obj.blocks[i];
      model.blocks[i].attention.wQ = b.attention.wQ;
      model.blocks[i].attention.wK = b.attention.wK;
      model.blocks[i].attention.wV = b.attention.wV;
      model.blocks[i].attention.wO = b.attention.wO;
      model.blocks[i].feedForward.w1 = b.feedForward.w1;
      model.blocks[i].feedForward.b1 = b.feedForward.b1;
      model.blocks[i].feedForward.w2 = b.feedForward.w2;
      model.blocks[i].feedForward.b2 = b.feedForward.b2;
      model.blocks[i].ln1.gamma = b.ln1.gamma;
      model.blocks[i].ln1.beta = b.ln1.beta;
      model.blocks[i].ln2.gamma = b.ln2.gamma;
      model.blocks[i].ln2.beta = b.ln2.beta;
    }

    model.lnFinal.gamma = obj.lnFinal.gamma;
    model.lnFinal.beta = obj.lnFinal.beta;
    model.outputProjection = model.tokenEmbedding;

    return model;
  }
}

// ============ MODEL MANAGER ============

let modelInstance: Transformer | null = null;
let tokenizerInstance: BPETokenizer | null = null;

/**
 * Get or create the transformer model instance.
 * Uses a small model (dim=64, 4 layers, 4 heads) for speed.
 */
export function getModel(): Transformer {
  if (!modelInstance) {
    // Small model config — fast enough to run in Node.js
    modelInstance = new Transformer({
      vocabSize: 2000,
      dim: 64,
      numLayers: 4,
      numHeads: 4,
      maxSeqLen: 256,
      hiddenDim: 256,
    });
  }
  return modelInstance;
}

/**
 * Get or create the tokenizer instance.
 */
export function getTokenizer(): BPETokenizer {
  if (!tokenizerInstance) {
    tokenizerInstance = new BPETokenizer();
    tokenizerInstance.trainOnDefaultCorpus();
  }
  return tokenizerInstance;
}

/**
 * Generate text using the from-scratch transformer.
 */
export function generateText(
  prompt: string,
  options: {
    maxTokens?: number;
    temperature?: number;
    topK?: number;
    topP?: number;
  } = {}
): string {
  const model = getModel();
  const tokenizer = getTokenizer();

  const promptTokens = tokenizer.encode(prompt);
  const result = model.generate(promptTokens, options.maxTokens || 80, {
    temperature: options.temperature ?? 0.8,
    topK: options.topK ?? 40,
    topP: options.topP ?? 0.9,
  });

  return tokenizer.decode(result.tokens.slice(promptTokens.length));
}

/**
 * Generate text with streaming callback.
 */
export function generateTextStream(
  prompt: string,
  onToken: (text: string) => void,
  options: {
    maxTokens?: number;
    temperature?: number;
    topK?: number;
    topP?: number;
  } = {}
): string {
  const model = getModel();
  const tokenizer = getTokenizer();

  const promptTokens = tokenizer.encode(prompt);
  const resultTokens = model.generateStream(
    promptTokens,
    (tokenId) => {
      const text = tokenizer.decode([tokenId]);
      onToken(text);
    },
    options.maxTokens || 80,
    {
      temperature: options.temperature ?? 0.8,
      topK: options.topK ?? 40,
      topP: options.topP ?? 0.9,
    }
  );

  return tokenizer.decode(resultTokens.slice(promptTokens.length));
}

/**
 * Get text embedding using the from-scratch model.
 */
export function getTextEmbedding(text: string): number[] {
  const model = getModel();
  const tokenizer = getTokenizer();
  const tokens = tokenizer.encode(text);
  return model.getSequenceEmbedding(tokens);
}

/**
 * Cosine similarity between two vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}
