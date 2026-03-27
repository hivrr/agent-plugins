# Multimodal AI

---

## Vision Models

### Image Understanding (GPT-4o / Claude Vision)

```python
import base64
from pathlib import Path

def encode_image(image_path: str) -> str:
    with open(image_path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")

# OpenAI vision
def analyse_image(image_path: str, prompt: str) -> str:
    image_data = encode_image(image_path)
    ext = Path(image_path).suffix.lstrip(".")
    media_type = f"image/{ext}" if ext != "jpg" else "image/jpeg"

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[{
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {
                    "url": f"data:{media_type};base64,{image_data}",
                    "detail": "high"  # high | low | auto
                }},
                {"type": "text", "text": prompt}
            ]
        }],
        max_tokens=1024
    )
    return response.choices[0].message.content

# Claude vision
def analyse_image_claude(image_path: str, prompt: str) -> str:
    image_data = encode_image(image_path)
    ext = Path(image_path).suffix.lstrip(".")
    media_type = f"image/{ext}" if ext != "jpg" else "image/jpeg"

    response = anthropic_client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=1024,
        messages=[{
            "role": "user",
            "content": [
                {"type": "image", "source": {
                    "type": "base64",
                    "media_type": media_type,
                    "data": image_data
                }},
                {"type": "text", "text": prompt}
            ]
        }]
    )
    return response.content[0].text

# Batch image analysis
async def analyse_images_batch(
    image_paths: list[str], prompt: str
) -> list[str]:
    tasks = [asyncio.create_task(
        asyncio.to_thread(analyse_image, path, prompt)
    ) for path in image_paths]
    return await asyncio.gather(*tasks)
```

---

## CLIP — Zero-Shot Image Classification & Similarity

```python
from PIL import Image
import torch
import clip

model, preprocess = clip.load("ViT-B/32", device="cuda" if torch.cuda.is_available() else "cpu")

def classify_image_zero_shot(image_path: str, labels: list[str]) -> dict:
    image = preprocess(Image.open(image_path)).unsqueeze(0)
    text = clip.tokenize(labels)

    with torch.no_grad():
        image_features = model.encode_image(image)
        text_features = model.encode_text(text)

        logits_per_image, _ = model(image, text)
        probs = logits_per_image.softmax(dim=-1).numpy()[0]

    return {label: float(prob) for label, prob in zip(labels, probs)}

def image_similarity(image_path_1: str, image_path_2: str) -> float:
    """Returns cosine similarity between two images using CLIP embeddings."""
    def embed(path: str):
        img = preprocess(Image.open(path)).unsqueeze(0)
        with torch.no_grad():
            return model.encode_image(img)

    emb1, emb2 = embed(image_path_1), embed(image_path_2)
    return torch.nn.functional.cosine_similarity(emb1, emb2).item()
```

---

## Audio Processing

### Speech-to-Text (Whisper)

```python
from openai import OpenAI

client = OpenAI()

def transcribe_audio(audio_path: str, language: str = "en") -> dict:
    with open(audio_path, "rb") as audio_file:
        transcript = client.audio.transcriptions.create(
            model="whisper-1",
            file=audio_file,
            language=language,
            response_format="verbose_json",  # Includes word-level timestamps
            timestamp_granularities=["word"]
        )
    return {
        "text": transcript.text,
        "language": transcript.language,
        "duration": transcript.duration,
        "words": [{"word": w.word, "start": w.start, "end": w.end} for w in transcript.words]
    }

# Local Whisper (no API cost)
import whisper

local_model = whisper.load_model("large-v3")  # tiny | base | small | medium | large

def transcribe_local(audio_path: str) -> str:
    result = local_model.transcribe(audio_path, fp16=False)
    return result["text"]
```

### Text-to-Speech

```python
# OpenAI TTS
def text_to_speech(text: str, output_path: str, voice: str = "alloy") -> None:
    """Voices: alloy, echo, fable, onyx, nova, shimmer"""
    response = client.audio.speech.create(
        model="tts-1-hd",
        voice=voice,
        input=text
    )
    response.stream_to_file(output_path)

# ElevenLabs (more realistic, voice cloning)
import elevenlabs

elevenlabs.set_api_key("your-api-key")

def elevenlabs_tts(text: str, voice_id: str, output_path: str) -> None:
    audio = elevenlabs.generate(
        text=text,
        voice=elevenlabs.Voice(voice_id=voice_id),
        model="eleven_multilingual_v2"
    )
    elevenlabs.save(audio, output_path)
```

---

## Document AI

### PDF Extraction

```python
import pdfplumber
from PIL import Image
import io

def extract_pdf_content(pdf_path: str) -> dict:
    """Extract text, tables, and metadata from PDF."""
    pages = []
    with pdfplumber.open(pdf_path) as pdf:
        metadata = pdf.metadata
        for i, page in enumerate(pdf.pages):
            page_data = {
                "page_number": i + 1,
                "text": page.extract_text() or "",
                "tables": page.extract_tables(),
                "width": page.width,
                "height": page.height
            }
            pages.append(page_data)

    return {"metadata": metadata, "pages": pages, "total_pages": len(pages)}

def extract_tables_from_pdf(pdf_path: str) -> list[list[list]]:
    """Extract all tables from a PDF, returned as nested lists."""
    all_tables = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            tables = page.extract_tables()
            all_tables.extend(tables)
    return all_tables

# Vision-based extraction for complex layouts
def extract_pdf_via_vision(pdf_path: str, pages: list[int] = None) -> list[str]:
    """Use GPT-4o vision to extract content from complex/scanned PDFs."""
    import fitz  # PyMuPDF

    doc = fitz.open(pdf_path)
    results = []
    target_pages = pages or range(len(doc))

    for page_num in target_pages:
        page = doc[page_num]
        pix = page.get_pixmap(dpi=200)
        img_bytes = pix.tobytes("png")
        img_base64 = base64.b64encode(img_bytes).decode()

        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{img_base64}"}},
                    {"type": "text", "text": "Extract all text content from this document page. Preserve tables as markdown tables. Preserve headings and structure."}
                ]
            }],
            max_tokens=4096
        )
        results.append(response.choices[0].message.content)

    return results
```

---

## Cross-Modal Embeddings

Embed both text and images in the same vector space for unified search.

```python
# ImageBind — unified embedding space for text, image, audio, video
# (Meta's model; use via HuggingFace)
from imagebind import data as imagebind_data
from imagebind.models import imagebind_model
from imagebind.models.imagebind_model import ModalityType
import torch

model = imagebind_model.imagebind_huge(pretrained=True).eval()

def embed_multimodal(
    texts: list[str] | None = None,
    image_paths: list[str] | None = None
) -> dict:
    inputs = {}
    if texts:
        inputs[ModalityType.TEXT] = imagebind_data.load_and_transform_text(texts, "cpu")
    if image_paths:
        inputs[ModalityType.VISION] = imagebind_data.load_and_transform_vision_data(image_paths, "cpu")

    with torch.no_grad():
        embeddings = model(inputs)

    return {k.value: v.numpy() for k, v in embeddings.items()}

# Cross-modal search: find images by text query
def search_images_by_text(query: str, image_paths: list[str], top_k: int = 5) -> list[str]:
    embeddings = embed_multimodal(texts=[query], image_paths=image_paths)
    query_emb = embeddings["text"][0]
    image_embs = embeddings["vision"]

    similarities = image_embs @ query_emb  # Cosine similarity (embeddings are normalised)
    top_indices = similarities.argsort()[-top_k:][::-1]
    return [image_paths[i] for i in top_indices]
```

---

## Multimodal Pipeline Example

Document analysis + Q&A system combining OCR, vision, and text retrieval.

```python
class DocumentQASystem:
    def __init__(self, vector_store, embedding_model):
        self.store = vector_store
        self.embedder = embedding_model

    def ingest_document(self, pdf_path: str, doc_id: str):
        """Extract content from PDF and index for retrieval."""
        # Try text extraction first (fast + cheap)
        content = extract_pdf_content(pdf_path)
        chunks = []

        for page in content["pages"]:
            if page["text"].strip():
                chunks.append({
                    "text": page["text"],
                    "source": doc_id,
                    "page": page["page_number"],
                    "type": "text"
                })
            # Tables as structured text
            for table in page["tables"]:
                if table:
                    table_text = "\n".join([" | ".join(str(c) for c in row if c) for row in table])
                    chunks.append({
                        "text": table_text,
                        "source": doc_id,
                        "page": page["page_number"],
                        "type": "table"
                    })

        self.store.add_texts(
            [c["text"] for c in chunks],
            metadatas=chunks
        )

    def answer(self, question: str, top_k: int = 5) -> str:
        # Retrieve relevant chunks
        docs = self.store.similarity_search(question, k=top_k)
        context = "\n\n".join([f"[Page {d.metadata['page']}] {d.page_content}" for d in docs])

        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "Answer questions based on the provided document context. Cite page numbers."},
                {"role": "user", "content": f"Context:\n{context}\n\nQuestion: {question}"}
            ]
        )
        return response.choices[0].message.content
```
