# LLM Integration & Model Management

---

## Model Selection Guide

| Model | Best for | Context | Notes |
|---|---|---|---|
| GPT-4o | General reasoning, multimodal, function calling | 128K | Best balance of capability/cost |
| GPT-4o-mini | High-volume, latency-sensitive tasks | 128K | ~15× cheaper than GPT-4o |
| o1 / o1-mini | Complex multi-step reasoning, math, code | 128K | High latency, no streaming |
| Claude Sonnet 4.5 | Long context, instruction following, tool use | 200K | Strong for agents and coding |
| Claude Haiku 4.5 | Fast, cheap, classification, extraction | 200K | Best cost/latency in class |
| Claude Opus 4.6 | Hardest reasoning tasks, research | 200K | Highest capability, highest cost |
| Llama 3.1 70B | Private data, on-prem, fine-tuning | 128K | Open weights, strong open-source |
| Mixtral 8x7B | MoE, good at reasoning, lower cost | 32K | Fast on multi-GPU |

**Decision rule:** Classify the task first (extraction / reasoning / generation / coding), then select the cheapest model that meets your quality bar. Always benchmark before committing.

---

## Structured Outputs

Use structured outputs to guarantee parseable responses. Never regex-parse free-form LLM output in production.

```python
from openai import OpenAI
from pydantic import BaseModel

client = OpenAI()

class ExtractionResult(BaseModel):
    entities: list[str]
    sentiment: str  # positive | negative | neutral
    confidence: float

response = client.beta.chat.completions.parse(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "Extract entities from: 'Apple launched the iPhone 16 in September.'"}],
    response_format=ExtractionResult,
)
result: ExtractionResult = response.choices[0].message.parsed
```

```python
# Anthropic structured output via tool use
import anthropic
import json

client = anthropic.Anthropic()

tools = [{
    "name": "extract_entities",
    "description": "Extract structured entities from text",
    "input_schema": {
        "type": "object",
        "properties": {
            "entities": {"type": "array", "items": {"type": "string"}},
            "sentiment": {"type": "string", "enum": ["positive", "negative", "neutral"]},
            "confidence": {"type": "number"}
        },
        "required": ["entities", "sentiment", "confidence"]
    }
}]

response = client.messages.create(
    model="claude-haiku-4-5-20251001",
    max_tokens=1024,
    tools=tools,
    tool_choice={"type": "tool", "name": "extract_entities"},
    messages=[{"role": "user", "content": "Extract entities from: 'Apple launched the iPhone 16 in September.'"}]
)
result = response.content[0].input
```

---

## Function Calling / Tool Use

```python
# OpenAI function calling pattern
tools = [
    {
        "type": "function",
        "function": {
            "name": "search_knowledge_base",
            "description": "Search the internal knowledge base for relevant documents",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search query"},
                    "top_k": {"type": "integer", "default": 5}
                },
                "required": ["query"]
            }
        }
    }
]

response = client.chat.completions.create(
    model="gpt-4o",
    messages=messages,
    tools=tools,
    tool_choice="auto"
)

# Handle tool call
if response.choices[0].message.tool_calls:
    tool_call = response.choices[0].message.tool_calls[0]
    args = json.loads(tool_call.function.arguments)
    result = search_knowledge_base(**args)
    # Append tool result and continue conversation
    messages.append(response.choices[0].message)
    messages.append({
        "role": "tool",
        "tool_call_id": tool_call.id,
        "content": json.dumps(result)
    })
```

---

## Streaming Responses

```python
# OpenAI streaming
async def stream_response(prompt: str):
    stream = await client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        stream=True
    )
    async for chunk in stream:
        delta = chunk.choices[0].delta.content
        if delta:
            yield delta

# FastAPI SSE endpoint
from fastapi import FastAPI
from fastapi.responses import StreamingResponse

@app.post("/chat/stream")
async def chat_stream(request: ChatRequest):
    return StreamingResponse(
        stream_response(request.message),
        media_type="text/event-stream"
    )
```

---

## Multi-Model Routing

Route requests to the cheapest model that can handle the task. Fall back on failure.

```python
from enum import Enum
from dataclasses import dataclass

class TaskComplexity(Enum):
    SIMPLE = "simple"      # extraction, classification
    MODERATE = "moderate"  # summarisation, Q&A
    COMPLEX = "complex"    # multi-step reasoning, code generation

@dataclass
class ModelRoute:
    primary: str
    fallback: str
    max_tokens: int

ROUTES = {
    TaskComplexity.SIMPLE:   ModelRoute("gpt-4o-mini",  "claude-haiku-4-5-20251001", 512),
    TaskComplexity.MODERATE: ModelRoute("gpt-4o",       "claude-sonnet-4-5",          2048),
    TaskComplexity.COMPLEX:  ModelRoute("o1",            "claude-opus-4-6",            4096),
}

async def routed_completion(prompt: str, complexity: TaskComplexity) -> str:
    route = ROUTES[complexity]
    try:
        return await call_model(route.primary, prompt, route.max_tokens)
    except (RateLimitError, ServiceUnavailableError):
        return await call_model(route.fallback, prompt, route.max_tokens)
```

---

## Local Deployment

```bash
# Ollama — simplest local serving
ollama pull llama3.2
ollama run llama3.2

# vLLM — production-grade, OpenAI-compatible API
pip install vllm
python -m vllm.entrypoints.openai.api_server \
    --model meta-llama/Llama-3.1-8B-Instruct \
    --tensor-parallel-size 2 \
    --gpu-memory-utilization 0.9

# Point existing OpenAI client at local server
local_client = OpenAI(
    base_url="http://localhost:8000/v1",
    api_key="not-needed"
)
```

---

## Cost Optimisation

| Strategy | Typical saving | Notes |
|---|---|---|
| Downgrade model (GPT-4o → 4o-mini) | 80–95% | Only after quality benchmarking |
| Semantic response caching | 30–60% | Cache by embedding similarity |
| Prompt compression | 20–40% | Remove redundant context |
| Batching requests | 50% | OpenAI Batch API — 24h turnaround |
| Output length control | Variable | Set `max_tokens` tightly |
| Prompt caching (Anthropic) | 90% on cached tokens | Requires `cache_control` header |

```python
# Anthropic prompt caching for large system prompts
response = client.messages.create(
    model="claude-sonnet-4-5",
    max_tokens=1024,
    system=[
        {
            "type": "text",
            "text": large_system_prompt,  # Cached after first call
            "cache_control": {"type": "ephemeral"}
        }
    ],
    messages=[{"role": "user", "content": user_message}]
)
```

```python
# Track costs per request
def estimate_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    PRICING = {
        "gpt-4o":           (0.0025, 0.010),   # per 1K tokens (in, out)
        "gpt-4o-mini":      (0.00015, 0.0006),
        "claude-sonnet-4-5": (0.003, 0.015),
        "claude-haiku-4-5-20251001":  (0.00025, 0.00125),
    }
    in_price, out_price = PRICING.get(model, (0, 0))
    return (input_tokens * in_price + output_tokens * out_price) / 1000
```
