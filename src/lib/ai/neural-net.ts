/**
 * Neural Network - Built from scratch (no libraries)
 * A simple feedforward neural network with:
 *  - Forward propagation
 *  - Backpropagation training
 *  - Sigmoid activation
 *  - Configurable layer sizes
 *
 * Used by the AI brain for pattern recognition and response selection.
 */

export type Matrix = number[][];

export interface NNConfig {
  inputSize: number;
  hiddenSizes: number[];
  outputSize: number;
  learningRate: number;
}

export interface TrainingPair {
  input: number[];
  target: number[];
}

function sigmoid(x: number): number {
  if (x < -100) return 0;
  if (x > 100) return 1;
  return 1 / (1 + Math.exp(-x));
}

function sigmoidDerivative(output: number): number {
  return output * (1 - output);
}

function randomWeight(): number {
  // Xavier/Glorot-ish initialization
  return (Math.random() * 2 - 1) * 0.5;
}

export class NeuralNetwork {
  config: NNConfig;
  weights: number[][][] = []; // weights[layer][neuronInNextLayer][neuronInCurrentLayer]
  biases: number[][] = []; // biases[layer][neuron]
  layers: number[] = [];

  constructor(config: NNConfig) {
    this.config = config;
    this.layers = [config.inputSize, ...config.hiddenSizes, config.outputSize];
    this.initialize();
  }

  private initialize(): void {
    this.weights = [];
    this.biases = [];
    for (let l = 0; l < this.layers.length - 1; l++) {
      const rows = this.layers[l + 1];
      const cols = this.layers[l];
      const layerW: number[][] = [];
      const layerB: number[] = [];
      for (let r = 0; r < rows; r++) {
        const w: number[] = [];
        for (let c = 0; c < cols; c++) {
          w.push(randomWeight());
        }
        layerW.push(w);
        layerB.push(randomWeight() * 0.1);
      }
      this.weights.push(layerW);
      this.biases.push(layerB);
    }
  }

  forward(input: number[]): { activations: number[][]; zs: number[][] } {
    const activations: number[][] = [input.slice()];
    const zs: number[][] = [];

    let current = input;
    for (let l = 0; l < this.weights.length; l++) {
      const w = this.weights[l];
      const b = this.biases[l];
      const z: number[] = new Array(w.length).fill(0);
      for (let r = 0; r < w.length; r++) {
        let sum = b[r];
        for (let c = 0; c < w[r].length; c++) {
          sum += w[r][c] * current[c];
        }
        z[r] = sum;
      }
      zs.push(z);
      const a = z.map(sigmoid);
      activations.push(a);
      current = a;
    }

    return { activations, zs };
  }

  predict(input: number[]): number[] {
    const { activations } = this.forward(input);
    return activations[activations.length - 1];
  }

  train(pairs: TrainingPair[], epochs: number = 100): number[] {
    const losses: number[] = [];
    for (let epoch = 0; epoch < epochs; epoch++) {
      let totalLoss = 0;
      for (const pair of pairs) {
        totalLoss += this.trainOne(pair.input, pair.target);
      }
      losses.push(totalLoss / pairs.length);
    }
    return losses;
  }

  private trainOne(input: number[], target: number[]): number {
    const { activations, zs } = this.forward(input);

    // Calculate output layer error
    const output = activations[activations.length - 1];
    let errors: number[] = output.map((o, i) => (o - target[i]) * sigmoidDerivative(o));

    // Calculate loss (MSE)
    let loss = 0;
    for (let i = 0; i < target.length; i++) {
      loss += 0.5 * (output[i] - target[i]) ** 2;
    }

    // Backpropagate
    const lr = this.config.learningRate;
    for (let l = this.weights.length - 1; l >= 0; l--) {
      const a = activations[l];
      const newErrors: number[] = new Array(a.length).fill(0);

      // Update weights and biases for this layer
      for (let r = 0; r < this.weights[l].length; r++) {
        for (let c = 0; c < this.weights[l][r].length; c++) {
          this.weights[l][r][c] -= lr * errors[r] * a[c];
          newErrors[c] += this.weights[l][r][c] * errors[r];
        }
        this.biases[l][r] -= lr * errors[r];
      }

      // Compute errors for previous layer
      if (l > 0) {
        const prevA = activations[l];
        errors = newErrors.map((e, i) => e * sigmoidDerivative(prevA[i]));
      }
    }

    return loss;
  }

  serialize(): string {
    return JSON.stringify({
      config: this.config,
      weights: this.weights,
      biases: this.biases,
      layers: this.layers,
    });
  }

  static deserialize(data: string): NeuralNetwork | null {
    try {
      const obj = JSON.parse(data);
      const nn = new NeuralNetwork(obj.config);
      nn.weights = obj.weights;
      nn.biases = obj.biases;
      nn.layers = obj.layers;
      return nn;
    } catch {
      return null;
    }
  }
}
