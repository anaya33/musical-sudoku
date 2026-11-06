// builds puzzles off the main thread so the page never freezes while a hard one is made
import { generate } from './generator.js?v=16';

self.onmessage = (e) => {
  const { id, n, difficulty } = e.data;
  self.postMessage({ id, result: generate(n, difficulty) });
};
