# Production AI Systems

---

## FastAPI Serving Pattern

Production-grade async API with health checks, timeouts, and cost tracking.

```python
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import asyncio
import time
import logging

app = FastAPI(title="LLM API", version="1.0.0")
logger = logging.getLogger(__name__)

class ChatRequest(BaseModel):
    message: str
    session_id: str
    model: str = "gpt-4o-mini"
    stream: bool = False

class ChatResponse(BaseModel):
    response: str
    model: str
    input_tokens: int
    output_tokens: int
    cost_usd: float
    latency_ms: float

@app.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": time.time()}

@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest, background_tasks: BackgroundTasks):
    start = time.time()

    try:
        response = await asyncio.wait_for(
            call_llm_async(request),
            timeout=30.0  # Always set a timeout
        )
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="LLM request timed out")
    except RateLimitError:
        raise HTTPException(status_code=429, detail="Rate limit exceeded")
    except Exception as e:
        logger.exception(f"LLM call failed: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

    latency_ms = (time.time() - start) * 1000

    # Log metrics in background (non-blocking)
    background_tasks.add_task(
        log_metrics,
        model=request.model,
        input_tokens=response.usage.prompt_tokens,
        output_tokens=response.usage.completion_tokens,
        latency_ms=latency_ms,
        session_id=request.session_id
    )

    return ChatResponse(
        response=response.choices[0].message.content,
        model=request.model,
        input_tokens=response.usage.prompt_tokens,
        output_tokens=response.usage.completion_tokens,
        cost_usd=estimate_cost(request.model, response.usage.prompt_tokens, response.usage.completion_tokens),
        latency_ms=latency_ms
    )

@app.post("/chat/stream")
async def chat_stream(request: ChatRequest):
    async def generate():
        async with client.beta.chat.completions.stream(
            model=request.model,
            messages=[{"role": "user", "content": request.message}]
        ) as stream:
            async for text in stream.text_stream:
                yield f"data: {text}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
```

---

## Rate Limiting & Quota Management

```python
import asyncio
from collections import defaultdict
from datetime import datetime, timedelta

class RateLimiter:
    def __init__(self, requests_per_minute: int, tokens_per_minute: int):
        self.rpm = requests_per_minute
        self.tpm = tokens_per_minute
        self._request_counts: dict[str, list] = defaultdict(list)
        self._token_counts: dict[str, list] = defaultdict(list)

    def _clean_window(self, timestamps: list, window_seconds: int = 60):
        cutoff = datetime.utcnow() - timedelta(seconds=window_seconds)
        return [t for t in timestamps if t[0] > cutoff]

    async def check_and_record(self, client_id: str, token_count: int):
        now = datetime.utcnow()

        self._request_counts[client_id] = self._clean_window(self._request_counts[client_id])
        self._token_counts[client_id] = self._clean_window(self._token_counts[client_id])

        if len(self._request_counts[client_id]) >= self.rpm:
            raise RateLimitExceeded(f"Request rate limit exceeded: {self.rpm} RPM")

        current_tokens = sum(t[1] for t in self._token_counts[client_id])
        if current_tokens + token_count > self.tpm:
            raise RateLimitExceeded(f"Token rate limit exceeded: {self.tpm} TPM")

        self._request_counts[client_id].append((now, 1))
        self._token_counts[client_id].append((now, token_count))

# Exponential backoff for provider rate limits
import random

async def call_with_backoff(fn, max_retries: int = 5):
    for attempt in range(max_retries):
        try:
            return await fn()
        except RateLimitError:
            if attempt == max_retries - 1:
                raise
            wait = (2 ** attempt) + random.uniform(0, 1)
            logger.warning(f"Rate limited. Retrying in {wait:.2f}s (attempt {attempt + 1})")
            await asyncio.sleep(wait)
```

---

## Circuit Breaker

Prevent cascading failures when the LLM provider is degraded.

```python
from enum import Enum
import time

class CircuitState(Enum):
    CLOSED = "closed"       # Normal operation
    OPEN = "open"           # Failing — reject requests fast
    HALF_OPEN = "half_open" # Testing recovery

class CircuitBreaker:
    def __init__(
        self,
        failure_threshold: int = 5,
        reset_timeout: float = 60.0,
        half_open_attempts: int = 2
    ):
        self.failure_threshold = failure_threshold
        self.reset_timeout = reset_timeout
        self.half_open_attempts = half_open_attempts
        self.state = CircuitState.CLOSED
        self.failures = 0
        self.last_failure_time = None
        self.half_open_successes = 0

    async def call(self, fn, fallback=None):
        if self.state == CircuitState.OPEN:
            if time.time() - self.last_failure_time > self.reset_timeout:
                self.state = CircuitState.HALF_OPEN
                self.half_open_successes = 0
            else:
                if fallback:
                    return await fallback()
                raise CircuitOpenError("Circuit breaker is open")

        try:
            result = await fn()
            self._on_success()
            return result
        except Exception as e:
            self._on_failure()
            raise

    def _on_success(self):
        if self.state == CircuitState.HALF_OPEN:
            self.half_open_successes += 1
            if self.half_open_successes >= self.half_open_attempts:
                self.state = CircuitState.CLOSED
                self.failures = 0
        else:
            self.failures = 0

    def _on_failure(self):
        self.failures += 1
        self.last_failure_time = time.time()
        if self.failures >= self.failure_threshold:
            self.state = CircuitState.OPEN
            logger.error(f"Circuit breaker opened after {self.failures} failures")
```

---

## Caching Strategies

```python
import redis
import hashlib
import json

class ResponseCache:
    """Exact-match cache for deterministic prompts (temperature=0)."""
    def __init__(self, redis_client: redis.Redis, ttl_seconds: int = 3600):
        self.redis = redis_client
        self.ttl = ttl_seconds

    def _key(self, model: str, messages: list[dict]) -> str:
        payload = json.dumps({"model": model, "messages": messages}, sort_keys=True)
        return f"llm:response:{hashlib.sha256(payload.encode()).hexdigest()}"

    def get(self, model: str, messages: list[dict]) -> str | None:
        value = self.redis.get(self._key(model, messages))
        return value.decode() if value else None

    def set(self, model: str, messages: list[dict], response: str):
        self.redis.setex(self._key(model, messages), self.ttl, response)
```

---

## A/B Testing for Model Comparison

```python
import random
from dataclasses import dataclass, field
from collections import defaultdict

@dataclass
class ModelVariant:
    name: str
    model: str
    system_prompt: str
    weight: float = 0.5  # Traffic split

@dataclass
class ABTestResult:
    variant: str
    score: float
    latency_ms: float
    cost_usd: float

class ModelABTest:
    def __init__(self, variant_a: ModelVariant, variant_b: ModelVariant):
        self.variants = {"a": variant_a, "b": variant_b}
        self.results: dict[str, list[ABTestResult]] = defaultdict(list)

    def select_variant(self) -> tuple[str, ModelVariant]:
        roll = random.random()
        if roll < self.variants["a"].weight:
            return "a", self.variants["a"]
        return "b", self.variants["b"]

    def record(self, result: ABTestResult):
        self.results[result.variant].append(result)

    def summary(self) -> dict:
        def stats(results: list[ABTestResult]) -> dict:
            if not results:
                return {}
            scores = [r.score for r in results]
            return {
                "n": len(results),
                "mean_score": sum(scores) / len(scores),
                "mean_latency_ms": sum(r.latency_ms for r in results) / len(results),
                "mean_cost_usd": sum(r.cost_usd for r in results) / len(results),
            }
        return {
            "variant_a": stats(self.results["a"]),
            "variant_b": stats(self.results["b"]),
        }
```

---

## Observability & Tracing

```python
# LangSmith tracing
import os
os.environ["LANGCHAIN_TRACING_V2"] = "true"
os.environ["LANGCHAIN_PROJECT"] = "my-rag-app"

# Prometheus metrics
from prometheus_client import Counter, Histogram, start_http_server

llm_requests = Counter("llm_requests_total", "Total LLM requests", ["model", "status"])
llm_latency = Histogram("llm_latency_seconds", "LLM request latency", ["model"])
llm_tokens = Counter("llm_tokens_total", "Total tokens used", ["model", "type"])
llm_cost = Counter("llm_cost_usd_total", "Total LLM cost in USD", ["model"])

def instrument_llm_call(model: str, fn):
    with llm_latency.labels(model=model).time():
        try:
            result = fn()
            llm_requests.labels(model=model, status="success").inc()
            llm_tokens.labels(model=model, type="input").inc(result.usage.prompt_tokens)
            llm_tokens.labels(model=model, type="output").inc(result.usage.completion_tokens)
            llm_cost.labels(model=model).inc(
                estimate_cost(model, result.usage.prompt_tokens, result.usage.completion_tokens)
            )
            return result
        except Exception as e:
            llm_requests.labels(model=model, status="error").inc()
            raise

# Structured logging for every LLM call
import structlog

log = structlog.get_logger()

def log_llm_call(
    model: str,
    session_id: str,
    input_tokens: int,
    output_tokens: int,
    latency_ms: float,
    cost_usd: float,
    error: str | None = None
):
    log.info(
        "llm_call",
        model=model,
        session_id=session_id,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        latency_ms=round(latency_ms, 2),
        cost_usd=round(cost_usd, 6),
        error=error
    )
```

---

## Graceful Degradation

Always define what happens when the LLM is unavailable.

```python
FALLBACK_RESPONSES = {
    "search": "I'm unable to search right now. Please try again in a moment.",
    "summarise": "The summarisation service is temporarily unavailable.",
    "classify": None,  # Return None and handle upstream
}

async def safe_llm_call(
    task: str,
    prompt: str,
    model: str = "gpt-4o-mini",
    fallback_model: str = "claude-haiku-4-5-20251001"
) -> str | None:
    # Try primary model
    try:
        return await call_model(model, prompt)
    except (RateLimitError, ServiceUnavailableError):
        pass

    # Try fallback model
    try:
        logger.warning(f"Primary model {model} failed, trying {fallback_model}")
        return await call_model(fallback_model, prompt)
    except Exception as e:
        logger.error(f"All models failed for task {task}: {e}")

    # Return static fallback
    return FALLBACK_RESPONSES.get(task)
```
