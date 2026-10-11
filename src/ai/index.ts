// Public API of the on-device AI layer (SPEC §7, §10). Importing this module does not download or
// start anything: the WebLLM runtime and the model are only loaded when loadModel() is called.
export {
  MODEL_OPTIONS,
  DEFAULT_MODEL_ID,
  getModelOption,
  useLLM,
  getLLMState,
  subscribeLLM,
  isModelReady,
  probeWebGPU,
  loadModel,
  unloadModel,
  cancel,
  generateJSON,
  removeModelCache,
  isModelCached,
  LLMError,
  DEFAULT_TIMEOUT_MS,
  type ModelOption,
  type LLMState,
  type LLMStatus,
  type LLMErrorCode,
  type GenerateRequest,
  type GenerateResult,
} from "./llm";
export {
  PROMPT_VERSION,
  aiDraftBrief,
  aiAnswer,
  aiRefineExtraction,
  aiExplainFinding,
  AIValidationError,
  type DroppedSentence,
  type TaskReport,
  type RefineRejection,
} from "./tasks";
export { ADAPTER_STATUS } from "./adapters";
