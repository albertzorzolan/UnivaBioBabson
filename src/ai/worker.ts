// Dedicated Web Worker that hosts the WebLLM engine, so model loading and token generation never block
// the UI thread. All inference happens here, on this device's GPU via WebGPU.
import { WebWorkerMLCEngineHandler } from "@mlc-ai/web-llm";

const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (msg: MessageEvent) => {
  handler.onmessage(msg);
};
