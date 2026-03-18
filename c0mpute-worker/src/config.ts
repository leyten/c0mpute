import { homedir } from 'os';
import { join } from 'path';

/** Default orchestrator URL */
export const DEFAULT_ORCHESTRATOR_URL = 'https://c0mpute.ai';

/** Directory for storing models and config */
export const DATA_DIR = join(homedir(), '.c0mpute');

/** Ollama API base URL */
export const OLLAMA_URL = 'http://127.0.0.1:11434';

/** Ollama model name (custom model created from Modelfile) */
export const OLLAMA_MODEL = 'c0mpute-max';

/** Base model to pull from ollama registry */
export const OLLAMA_BASE_MODEL = 'huihui_ai/qwen3-abliterated:14b';

/** Human-readable model name sent to orchestrator */
export const DEFAULT_MODEL_NAME = 'qwen3-14b-abliterated';

/** Number of tokens to generate during benchmark */
export const BENCHMARK_TOKENS = 32;

/** Minimum tok/s to register with orchestrator */
export const MIN_TOK_PER_SEC = 5;

/** Maximum output tokens per job */
export const MAX_OUTPUT_TOKENS = 1024;

/** System prompt baked into the model */
export const SYSTEM_PROMPT = 'You are c0mpute, an AI assistant built for the c0mpute.ai decentralized inference network. Your name is c0mpute. Be direct and concise. Always respond in English. Do not use emojis.';

/** Ollama Modelfile template (official qwen3 thinking-aware template) */
export const MODELFILE_TEMPLATE = `FROM ${OLLAMA_BASE_MODEL}
TEMPLATE """{{- $lastUserIdx := -1 -}}{{- range $idx, $msg := .Messages -}}{{- if eq $msg.Role "user" }}{{ $lastUserIdx = $idx }}{{ end -}}{{- end }}{{- if or .System .Tools }}<|im_start|>system{{ if .System }} {{ .System }}{{- end }}{{- if .Tools }}
# Tools
You may call one or more functions to assist with the user query.
You are provided with function signatures within <tools></tools> XML tags:
<tools>{{- range .Tools }}
{"type": "function", "function": {{ .Function }}}{{- end }}
</tools>
For each function call, return a json object with function name and arguments within <tool_call></tool_call> XML tags:
<tool_call>
{"name": <function-name>, "arguments": <args-json-object>}
</tool_call>{{- end -}}<|im_end|>
{{ end }}{{- range $i, $_ := .Messages }}{{- $last := eq (len (slice $.Messages $i)) 1 -}}{{- if eq .Role "user" }}<|im_start|>user
{{ .Content }}{{- if and $.IsThinkSet (eq $i $lastUserIdx) }}{{- if $.Think -}}{{- " "}}/think{{- else -}}{{- " "}}/no_think{{- end -}}{{- end }}<|im_end|>
{{ else if eq .Role "assistant" }}<|im_start|>assistant
{{ if (and $.IsThinkSet (and .Thinking (or $last (gt $i $lastUserIdx)))) -}}<think>{{ .Thinking }}</think>
{{ end -}}{{ if .Content }}{{ .Content }}{{- else if .ToolCalls }}<tool_call>
{{ range .ToolCalls }}{"name": "{{ .Function.Name }}", "arguments": {{ .Function.Arguments }}}
{{ end }}</tool_call>{{- end }}{{ if not $last }}<|im_end|>
{{ end }}{{- else if eq .Role "tool" }}<|im_start|>user
<tool_response>
{{ .Content }}
</tool_response><|im_end|>
{{ end }}{{- if and (ne .Role "assistant") $last }}<|im_start|>assistant
{{ if and $.IsThinkSet (not $.Think) -}}<think>
</think>
{{ end -}}{{ end }}{{- end }}"""
SYSTEM "${SYSTEM_PROMPT}"
PARAMETER stop <|im_start|>
PARAMETER stop <|im_end|>
PARAMETER temperature 0.6
PARAMETER top_k 20
PARAMETER top_p 0.95`;
