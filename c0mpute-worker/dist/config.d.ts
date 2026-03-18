/** Default orchestrator URL */
export declare const DEFAULT_ORCHESTRATOR_URL = "https://c0mpute.ai";
/** Directory for storing models and config */
export declare const DATA_DIR: string;
/** Ollama API base URL */
export declare const OLLAMA_URL = "http://127.0.0.1:11434";
/** Ollama model name (custom model created from Modelfile) */
export declare const OLLAMA_MODEL = "c0mpute-max";
/** Base model to pull from ollama registry */
export declare const OLLAMA_BASE_MODEL = "huihui_ai/qwen3-abliterated:14b";
/** Human-readable model name sent to orchestrator */
export declare const DEFAULT_MODEL_NAME = "qwen3-14b-abliterated";
/** Number of tokens to generate during benchmark */
export declare const BENCHMARK_TOKENS = 32;
/** Minimum tok/s to register with orchestrator */
export declare const MIN_TOK_PER_SEC = 5;
/** Maximum output tokens per job */
export declare const MAX_OUTPUT_TOKENS = 1024;
/** System prompt baked into the model */
export declare const SYSTEM_PROMPT = "You are c0mpute, an AI assistant built for the c0mpute.ai decentralized inference network. Your name is c0mpute. Be direct and concise. Always respond in English. Do not use emojis.";
/** Ollama Modelfile template (official qwen3 thinking-aware template) */
export declare const MODELFILE_TEMPLATE = "FROM huihui_ai/qwen3-abliterated:14b\nTEMPLATE \"\"\"{{- $lastUserIdx := -1 -}}{{- range $idx, $msg := .Messages -}}{{- if eq $msg.Role \"user\" }}{{ $lastUserIdx = $idx }}{{ end -}}{{- end }}{{- if or .System .Tools }}<|im_start|>system{{ if .System }} {{ .System }}{{- end }}{{- if .Tools }}\n# Tools\nYou may call one or more functions to assist with the user query.\nYou are provided with function signatures within <tools></tools> XML tags:\n<tools>{{- range .Tools }}\n{\"type\": \"function\", \"function\": {{ .Function }}}{{- end }}\n</tools>\nFor each function call, return a json object with function name and arguments within <tool_call></tool_call> XML tags:\n<tool_call>\n{\"name\": <function-name>, \"arguments\": <args-json-object>}\n</tool_call>{{- end -}}<|im_end|>\n{{ end }}{{- range $i, $_ := .Messages }}{{- $last := eq (len (slice $.Messages $i)) 1 -}}{{- if eq .Role \"user\" }}<|im_start|>user\n{{ .Content }}{{- if and $.IsThinkSet (eq $i $lastUserIdx) }}{{- if $.Think -}}{{- \" \"}}/think{{- else -}}{{- \" \"}}/no_think{{- end -}}{{- end }}<|im_end|>\n{{ else if eq .Role \"assistant\" }}<|im_start|>assistant\n{{ if (and $.IsThinkSet (and .Thinking (or $last (gt $i $lastUserIdx)))) -}}<think>{{ .Thinking }}</think>\n{{ end -}}{{ if .Content }}{{ .Content }}{{- else if .ToolCalls }}<tool_call>\n{{ range .ToolCalls }}{\"name\": \"{{ .Function.Name }}\", \"arguments\": {{ .Function.Arguments }}}\n{{ end }}</tool_call>{{- end }}{{ if not $last }}<|im_end|>\n{{ end }}{{- else if eq .Role \"tool\" }}<|im_start|>user\n<tool_response>\n{{ .Content }}\n</tool_response><|im_end|>\n{{ end }}{{- if and (ne .Role \"assistant\") $last }}<|im_start|>assistant\n{{ if and $.IsThinkSet (not $.Think) -}}<think>\n</think>\n{{ end -}}{{ end }}{{- end }}\"\"\"\nSYSTEM \"You are c0mpute, an AI assistant built for the c0mpute.ai decentralized inference network. Your name is c0mpute. Be direct and concise. Always respond in English. Do not use emojis.\"\nPARAMETER stop <|im_start|>\nPARAMETER stop <|im_end|>\nPARAMETER temperature 0.6\nPARAMETER top_k 20\nPARAMETER top_p 0.95";
