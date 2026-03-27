# RAG Systems

---

## Architecture Patterns

### Naive RAG
Simplest pipeline. Good for PoC; rarely sufficient for production.
```
User query → Embed query → ANN search → Top-K chunks → Prompt + chunks → LLM → Answer
```

### Advanced RAG
Adds pre-retrieval (query transformation) and post-retrieval (reranking, filtering).
```
User query
    ↓ Query transformation (expansion / decomposition / HyDE)
    ↓ Hybrid search (vector + BM25)
    ↓ Reranking (cross-encoder)
    ↓ Context compression
    ↓ LLM generation
    ↓ Answer + citations
```

### Modular RAG
Composable components — swap any stage without rebuilding the pipeline.

```python
from dataclasses import dataclass
from typing import Protocol

class Retriever(Protocol):
    def retrieve(self, query: str, top_k: int) -> list[Document]: ...

class Reranker(Protocol):
    def rerank(self, query: str, docs: list[Document]) -> list[Document]: ...

class Generator(Protocol):
    def generate(self, query: str, context: list[Document]) -> str: ...

@dataclass
class RAGPipeline:
    retriever: Retriever
    reranker: Reranker | None
    generator: Generator

    def run(self, query: str, top_k: int = 10) -> str:
        docs = self.retriever.retrieve(query, top_k)
        if self.reranker:
            docs = self.reranker.rerank(query, docs)[:5]
        return self.generator.generate(query, docs)
```

---

## Chunking Strategies

| Strategy | Best for | Chunk size | Overlap |
|---|---|---|---|
| Fixed-size | Simple prose, uniform docs | 512–1024 tokens | 10–20% |
| Recursive | Mixed content, nested structure | 256–512 tokens | 10% |
| Semantic | Thematic coherence matters | Variable | None |
| Document-structure aware | Markdown, HTML, PDFs with headers | Section-based | None |
| Sentence-window | High precision Q&A | 1–3 sentences | ±2 sentences |

```python
from langchain.text_splitter import RecursiveCharacterTextSplitter

# Recursive splitter — good default
splitter = RecursiveCharacterTextSplitter(
    chunk_size=512,
    chunk_overlap=64,
    separators=["\n\n", "\n", ". ", " ", ""]
)
chunks = splitter.split_text(document)

# Semantic splitter (requires embedding model)
from langchain_experimental.text_splitter import SemanticChunker
from langchain_openai import OpenAIEmbeddings

semantic_splitter = SemanticChunker(
    OpenAIEmbeddings(),
    breakpoint_threshold_type="percentile",
    breakpoint_threshold_amount=95
)
chunks = semantic_splitter.split_text(document)
```

---

## Vector Database Selection

| DB | Best for | Hosting | Notes |
|---|---|---|---|
| Pinecone | Managed, fast start, scale | Cloud only | Simple API, no infra ops |
| Qdrant | Performance, filtering, self-host | Cloud + self-host | Best filtering support |
| Weaviate | Hybrid search built-in, GraphQL | Cloud + self-host | Multi-tenancy support |
| pgvector | Already on Postgres, small-medium scale | Self-host | No extra infra if on PG |
| Chroma | Local dev, prototyping | Embedded | Not for production scale |
| Milvus | Very large scale (billions) | Self-host | Complex ops overhead |

```python
# Qdrant production setup
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct

client = QdrantClient(url="http://localhost:6333")

client.create_collection(
    collection_name="knowledge_base",
    vectors_config=VectorParams(size=1536, distance=Distance.COSINE),
)

# Upsert with payload for filtering
client.upsert(
    collection_name="knowledge_base",
    points=[
        PointStruct(
            id=chunk_id,
            vector=embedding,
            payload={"text": chunk_text, "source": source, "date": date}
        )
        for chunk_id, embedding, chunk_text, source, date in batch
    ]
)

# Search with metadata filter
results = client.search(
    collection_name="knowledge_base",
    query_vector=query_embedding,
    query_filter={"must": [{"key": "source", "match": {"value": "docs"}}]},
    limit=10
)
```

---

## Hybrid Search (Vector + BM25)

Combine dense retrieval (semantic) with sparse retrieval (keyword). Improves recall for exact-match queries.

```python
from rank_bm25 import BM25Okapi
import numpy as np

class HybridRetriever:
    def __init__(self, vector_store, documents: list[str], alpha: float = 0.5):
        self.vector_store = vector_store
        self.alpha = alpha  # 0 = pure BM25, 1 = pure vector
        tokenised = [doc.split() for doc in documents]
        self.bm25 = BM25Okapi(tokenised)
        self.documents = documents

    def retrieve(self, query: str, top_k: int = 10) -> list[dict]:
        # Vector scores
        vector_results = self.vector_store.similarity_search_with_score(query, k=top_k * 2)
        vector_scores = {doc.page_content: score for doc, score in vector_results}

        # BM25 scores
        bm25_scores = self.bm25.get_scores(query.split())
        bm25_scores = bm25_scores / (bm25_scores.max() + 1e-8)  # Normalise

        # Reciprocal Rank Fusion
        combined = {}
        for i, doc in enumerate(self.documents):
            rank_v = next((j for j, (d, _) in enumerate(vector_results) if d.page_content == doc), top_k * 2)
            rank_b = np.argsort(-bm25_scores).tolist().index(i) if i < len(bm25_scores) else top_k * 2
            combined[doc] = (1 / (60 + rank_v)) + (1 / (60 + rank_b))

        return sorted(combined.items(), key=lambda x: x[1], reverse=True)[:top_k]
```

---

## Reranking

Reranking with a cross-encoder significantly improves precision. Run after initial retrieval.

```python
# Cohere rerank
import cohere

co = cohere.Client("your-api-key")

def rerank(query: str, documents: list[str], top_n: int = 5) -> list[dict]:
    results = co.rerank(
        model="rerank-english-v3.0",
        query=query,
        documents=documents,
        top_n=top_n,
        return_documents=True
    )
    return [{"text": r.document.text, "score": r.relevance_score} for r in results.results]

# BGE reranker (local, free)
from sentence_transformers import CrossEncoder

reranker = CrossEncoder("BAAI/bge-reranker-large")

def rerank_local(query: str, documents: list[str], top_n: int = 5) -> list[str]:
    pairs = [(query, doc) for doc in documents]
    scores = reranker.predict(pairs)
    ranked = sorted(zip(documents, scores), key=lambda x: x[1], reverse=True)
    return [doc for doc, _ in ranked[:top_n]]
```

---

## Advanced RAG Patterns

### HyDE (Hypothetical Document Embeddings)
Generate a hypothetical answer, embed it, and use that embedding for retrieval. Improves recall for complex queries.

```python
def hyde_retrieve(query: str, retriever, top_k: int = 5) -> list[Document]:
    # Generate hypothetical answer
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{
            "role": "user",
            "content": f"Write a short passage that would answer: {query}"
        }]
    )
    hypothetical_doc = response.choices[0].message.content

    # Embed hypothetical doc and retrieve
    return retriever.retrieve(hypothetical_doc, top_k)
```

### Query Decomposition
Break complex queries into sub-questions, retrieve for each, merge results.

```python
def decompose_and_retrieve(query: str, retriever) -> list[Document]:
    decomp_prompt = f"""Break this question into 2-4 simpler sub-questions.
Return as JSON: {{"sub_questions": ["q1", "q2", ...]}}

Question: {query}"""

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": decomp_prompt}],
        response_format={"type": "json_object"}
    )
    sub_questions = json.loads(response.choices[0].message.content)["sub_questions"]

    all_docs = []
    for sub_q in sub_questions:
        all_docs.extend(retriever.retrieve(sub_q, top_k=3))

    # Deduplicate by content hash
    seen = set()
    unique_docs = []
    for doc in all_docs:
        h = hash(doc.page_content)
        if h not in seen:
            seen.add(h)
            unique_docs.append(doc)
    return unique_docs
```

### RAG-Fusion
Run multiple query variants, retrieve for each, fuse with Reciprocal Rank Fusion.

```python
def rag_fusion(query: str, retriever, num_variants: int = 4) -> list[Document]:
    # Generate query variants
    variants_prompt = f"""Generate {num_variants} different phrasings of this query.
Return as JSON: {{"variants": ["v1", "v2", ...]}}

Query: {query}"""

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": variants_prompt}],
        response_format={"type": "json_object"}
    )
    variants = json.loads(response.choices[0].message.content)["variants"]

    # Retrieve for each variant
    all_results = [retriever.retrieve(v, top_k=10) for v in [query] + variants]

    # Reciprocal Rank Fusion
    scores: dict[str, float] = {}
    doc_map: dict[str, Document] = {}
    for results in all_results:
        for rank, doc in enumerate(results):
            key = doc.page_content
            scores[key] = scores.get(key, 0) + 1 / (60 + rank)
            doc_map[key] = doc

    return [doc_map[k] for k in sorted(scores, key=scores.get, reverse=True)[:10]]
```

---

## RAG Evaluation

Use RAGAS or a custom eval harness. Measure all three components.

| Metric | Measures | Target |
|---|---|---|
| Faithfulness | Does the answer contain only information from the context? | >0.85 |
| Answer Relevancy | Is the answer relevant to the question? | >0.80 |
| Context Precision | Are retrieved chunks relevant? (signal-to-noise) | >0.75 |
| Context Recall | Are all necessary chunks retrieved? | >0.70 |

```python
from ragas import evaluate
from ragas.metrics import faithfulness, answer_relevancy, context_precision, context_recall
from datasets import Dataset

eval_dataset = Dataset.from_dict({
    "question": questions,
    "answer": answers,
    "contexts": contexts,         # list of lists of retrieved chunks
    "ground_truth": ground_truths
})

results = evaluate(
    eval_dataset,
    metrics=[faithfulness, answer_relevancy, context_precision, context_recall]
)
print(results)
```
