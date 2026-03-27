# Context & Token Optimisation

---

## 5-Zone Context Budget Model

Every LLM request has a fixed context window. Allocate it intentionally — the most common mistake is letting the output zone shrink to under 6%, causing truncation.

| Zone | Purpose | Typical allocation | Hard limit |
|---|---|---|---|
| **System** | Persona, rules, format instructions | 5–15% | Keep under 2K tokens |
| **Few-shot** | Examples to demonstrate format/behaviour | 10–20% | 3–5 examples max |
| **User input** | Current user message | 5–10% | 512–1K tokens |
| **Retrieval** | Context chunks from RAG / tool results | 40–60% | Budget this explicitly |
| **Output** | Reserved for model response | 15–25% | Never below 512 tokens |

```python
def plan_context_budget(
    model: str,
    system_tokens: int,
    few_shot_tokens: int,
    user_input_tokens: int,
    min_output_tokens: int = 1024,
) -> dict:
    MODEL_LIMITS = {
        "gpt-4o": 128_000,
        "gpt-4o-mini": 128_000,
        "claude-sonnet-4-5": 200_000,
        "claude-haiku-4-5-20251001": 200_000,
    }
    total = MODEL_LIMITS.get(model, 128_000)
    fixed = system_tokens + few_shot_tokens + user_input_tokens + min_output_tokens
    retrieval_budget = total - fixed

    if retrieval_budget < 0:
        raise ValueError(f"Fixed zones exceed context window by {abs(retrieval_budget)} tokens. "
                         f"Reduce system prompt or few-shot examples.")

    return {
        "total_context": total,
        "system": system_tokens,
        "few_shot": few_shot_tokens,
        "user_input": user_input_tokens,
        "retrieval_budget": retrieval_budget,
        "output_reserved": min_output_tokens,
        "utilisation_pct": round(fixed / total * 100, 1)
    }
```

---

## Compression Decision Tree

Apply compression strategies from cheapest to most expensive.

```
Is the zone over budget?
├── System prompt → Rewrite to remove redundancy; move reference docs to retrieval
├── Few-shot examples → Reduce to 1–2 most representative; use dynamic few-shot
├── Retrieval chunks → Apply reranking + context compression (see below)
└── User input → Summarise if >1K tokens; reject if nonsensical padding
```

### Context Compression (LLMLingua / selective extraction)

```python
# Option 1: LLMLingua — token-level compression
from llmlingua import PromptCompressor

compressor = PromptCompressor(
    model_name="microsoft/llmlingua-2-bert-base-multilingual-cased-meetingbank",
    use_llmlingua2=True
)

compressed = compressor.compress_prompt(
    context_chunks,
    rate=0.5,            # Compress to 50% of original length
    force_tokens=["\n"], # Preserve line breaks
)
print(f"Original: {compressed['origin_tokens']} tokens → "
      f"Compressed: {compressed['compressed_tokens']} tokens")

# Option 2: Extractive compression via LLM
def compress_context(query: str, chunks: list[str], max_tokens: int = 2000) -> str:
    combined = "\n\n".join(chunks)
    response = client.chat.completions.create(
        model="gpt-4o-mini",  # Use cheap model for compression
        messages=[{
            "role": "user",
            "content": f"""Extract only the sentences relevant to this query.
Remove all irrelevant content. Preserve exact wording.

Query: {query}

Content:
{combined}

Return only the relevant extracted sentences."""
        }],
        max_tokens=max_tokens
    )
    return response.choices[0].message.content
```

---

## Token Counting

Count tokens before sending. Never assume — models have hard limits and charge per token.

```python
import tiktoken

def count_tokens(text: str, model: str = "gpt-4o") -> int:
    enc = tiktoken.encoding_for_model(model)
    return len(enc.encode(text))

def count_messages_tokens(messages: list[dict], model: str = "gpt-4o") -> int:
    enc = tiktoken.encoding_for_model(model)
    total = 0
    for message in messages:
        total += 4  # Per-message overhead
        for key, value in message.items():
            total += len(enc.encode(str(value)))
    total += 2  # Reply priming
    return total

# Truncate retrieval context to fit budget
def fit_chunks_to_budget(
    chunks: list[str], budget_tokens: int, model: str = "gpt-4o"
) -> list[str]:
    selected = []
    used = 0
    for chunk in chunks:
        chunk_tokens = count_tokens(chunk, model)
        if used + chunk_tokens > budget_tokens:
            break
        selected.append(chunk)
        used += chunk_tokens
    return selected
```

---

## Semantic Caching

Cache responses by semantic similarity of the query — not exact string match. Reduces cost and latency by 30–60% for repetitive queries.

```python
import hashlib
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity

class SemanticCache:
    def __init__(self, vector_store, embedding_model, similarity_threshold: float = 0.95):
        self.store = vector_store
        self.embedder = embedding_model
        self.threshold = similarity_threshold
        self._cache: dict[str, dict] = {}  # In-memory for hot entries

    def get(self, query: str) -> str | None:
        query_embedding = self.embedder.embed(query)
        results = self.store.similarity_search_with_score(query, k=1)

        if not results:
            return None

        doc, score = results[0]
        # Qdrant returns distance (lower = more similar); OpenAI cosine returns similarity (higher = more similar)
        if score >= self.threshold:
            return doc.metadata.get("response")
        return None

    def set(self, query: str, response: str):
        self.store.add_texts(
            [query],
            metadatas=[{"response": response, "query_hash": hashlib.md5(query.encode()).hexdigest()}]
        )

    async def get_or_compute(self, query: str, compute_fn) -> str:
        cached = self.get(query)
        if cached:
            return cached
        result = await compute_fn(query)
        self.set(query, result)
        return result
```

---

## Embedding Caching

Embedding the same text repeatedly wastes time and money. Cache at the text level.

```python
import hashlib
import json
from pathlib import Path

class EmbeddingCache:
    def __init__(self, cache_path: str = ".embedding_cache.json"):
        self.path = Path(cache_path)
        self._cache = json.loads(self.path.read_text()) if self.path.exists() else {}

    def _key(self, text: str, model: str) -> str:
        return hashlib.sha256(f"{model}:{text}".encode()).hexdigest()

    def get(self, text: str, model: str) -> list[float] | None:
        return self._cache.get(self._key(text, model))

    def set(self, text: str, model: str, embedding: list[float]):
        self._cache[self._key(text, model)] = embedding
        self.path.write_text(json.dumps(self._cache))

    def embed(self, text: str, model: str = "text-embedding-3-small") -> list[float]:
        cached = self.get(text, model)
        if cached:
            return cached
        response = client.embeddings.create(input=text, model=model)
        embedding = response.data[0].embedding
        self.set(text, model, embedding)
        return embedding
```

---

## Common Budget Anti-Patterns

| Anti-pattern | Symptom | Fix |
|---|---|---|
| Output zone squeezed to <6% | Truncated responses | Explicitly set `max_tokens` and plan retrieval budget around it |
| Inserting entire documents | Context overflow, irrelevant noise | Chunk and retrieve; don't stuff raw docs |
| Static few-shot for all queries | Wastes tokens on irrelevant examples | Dynamic few-shot: select examples by similarity |
| Repeating system prompt in user turn | Doubles system token cost | Keep instructions in system turn only |
| Ignoring chat history growth | Context window fills over long conversations | Apply sliding window or episodic summarisation |
