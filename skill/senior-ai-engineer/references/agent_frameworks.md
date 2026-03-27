# Agent Frameworks & Orchestration

---

## When to Use Which Framework

| Framework | Best for | Complexity |
|---|---|---|
| LangGraph | Stateful multi-step workflows, branching, cycles | Medium–High |
| LangChain | Simple chains, well-supported integrations | Low–Medium |
| LlamaIndex | Data-centric agents, complex retrieval | Medium |
| CrewAI | Role-based multi-agent collaboration | Medium |
| AutoGen | Conversational multi-agent systems | Medium–High |
| OpenAI Assistants API | Managed threads, file search, code interpreter | Low (managed) |

**Decision rule:** Single agent + tools → LangGraph. Multi-agent with roles → CrewAI. Heavy retrieval → LlamaIndex. Want managed infra → OpenAI Assistants API.

---

## LangGraph — Stateful Agent Workflows

LangGraph models agents as state machines with typed state, nodes (functions), and edges (transitions).

```python
from langgraph.graph import StateGraph, END
from langgraph.prebuilt import ToolNode
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, AIMessage
from typing import TypedDict, Annotated
import operator

class AgentState(TypedDict):
    messages: Annotated[list, operator.add]
    tool_calls_count: int

llm = ChatOpenAI(model="gpt-4o", temperature=0)
llm_with_tools = llm.bind_tools(tools)

def call_model(state: AgentState) -> AgentState:
    response = llm_with_tools.invoke(state["messages"])
    return {"messages": [response]}

def should_continue(state: AgentState) -> str:
    last_message = state["messages"][-1]
    if last_message.tool_calls:
        if state["tool_calls_count"] >= 10:  # Safety limit
            return "end"
        return "tools"
    return "end"

# Build graph
workflow = StateGraph(AgentState)
workflow.add_node("agent", call_model)
workflow.add_node("tools", ToolNode(tools))
workflow.set_entry_point("agent")
workflow.add_conditional_edges("agent", should_continue, {"tools": "tools", "end": END})
workflow.add_edge("tools", "agent")

agent = workflow.compile()

result = agent.invoke({
    "messages": [HumanMessage(content="Research the latest AI papers and summarise the top 3")],
    "tool_calls_count": 0
})
```

---

## Memory Systems

### Short-term (in-context)
Pass conversation history directly in messages. Limit with a sliding window.

```python
from collections import deque

class ConversationMemory:
    def __init__(self, max_messages: int = 20):
        self.history = deque(maxlen=max_messages)

    def add(self, role: str, content: str):
        self.history.append({"role": role, "content": content})

    def get_messages(self) -> list[dict]:
        return list(self.history)
```

### Long-term (vector store)
Store and retrieve relevant past interactions by semantic similarity.

```python
from langchain_community.vectorstores import Qdrant
from langchain_openai import OpenAIEmbeddings

class LongTermMemory:
    def __init__(self, qdrant_client, collection_name: str):
        self.store = Qdrant(
            client=qdrant_client,
            collection_name=collection_name,
            embeddings=OpenAIEmbeddings()
        )

    def save(self, content: str, metadata: dict):
        self.store.add_texts([content], metadatas=[metadata])

    def recall(self, query: str, top_k: int = 5) -> list[str]:
        docs = self.store.similarity_search(query, k=top_k)
        return [doc.page_content for doc in docs]
```

### Episodic memory
Summarise and compress older context to prevent context overflow.

```python
def summarise_history(messages: list[dict], keep_last: int = 5) -> list[dict]:
    if len(messages) <= keep_last:
        return messages

    to_summarise = messages[:-keep_last]
    recent = messages[-keep_last:]

    summary_response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "Summarise this conversation concisely, preserving key facts and decisions."},
            {"role": "user", "content": str(to_summarise)}
        ]
    )
    summary = summary_response.choices[0].message.content

    return [{"role": "system", "content": f"Conversation summary: {summary}"}] + recent
```

---

## Tool Integration Patterns

Define tools with clear descriptions — the model routes based on description quality.

```python
from langchain.tools import tool
from pydantic import BaseModel, Field

class SearchInput(BaseModel):
    query: str = Field(description="Search query for the knowledge base")
    max_results: int = Field(default=5, description="Number of results to return")

@tool("search_knowledge_base", args_schema=SearchInput)
def search_knowledge_base(query: str, max_results: int = 5) -> str:
    """Search the internal knowledge base for relevant documents.
    Use when the user asks about company policies, procedures, or product information."""
    results = retriever.retrieve(query, top_k=max_results)
    return "\n\n".join([f"[{i+1}] {doc.page_content}" for i, doc in enumerate(results)])

@tool
def execute_python(code: str) -> str:
    """Execute Python code and return the output.
    Use for data analysis, calculations, or generating charts.

    WARNING: This example is NOT sandboxed. For production use, run inside
    a proper sandbox — e.g. Docker with --network none --read-only --memory 256m,
    or a dedicated sandboxing tool (nsjail, firejail, gVisor). Restricting PATH
    alone does not prevent file access, network calls, or subprocess spawning."""
    import subprocess
    result = subprocess.run(
        ["python", "-c", code],
        capture_output=True, text=True, timeout=30
    )
    return result.stdout or result.stderr
```

---

## CrewAI Multi-Agent Collaboration

```python
from crewai import Agent, Task, Crew, Process
from crewai_tools import SerperDevTool, WebsiteSearchTool

search_tool = SerperDevTool()

researcher = Agent(
    role="Senior Research Analyst",
    goal="Find accurate, up-to-date information on the given topic",
    backstory="Expert researcher with deep domain knowledge in technology and business",
    tools=[search_tool],
    verbose=True,
    llm="gpt-4o"
)

writer = Agent(
    role="Technical Writer",
    goal="Synthesise research into clear, concise reports",
    backstory="Experienced technical writer who makes complex topics accessible",
    verbose=True,
    llm="gpt-4o"
)

research_task = Task(
    description="Research the current state of {topic}. Find key developments, players, and trends.",
    agent=researcher,
    expected_output="Bullet-point research notes with sources"
)

write_task = Task(
    description="Write a 500-word executive summary based on the research notes.",
    agent=writer,
    expected_output="Executive summary in markdown format",
    context=[research_task]
)

crew = Crew(
    agents=[researcher, writer],
    tasks=[research_task, write_task],
    process=Process.sequential,
    verbose=True
)

result = crew.kickoff(inputs={"topic": "enterprise LLM adoption in 2025"})
```

---

## Agent Evaluation

Evaluate agents on task completion, tool efficiency, and correctness.

```python
from dataclasses import dataclass

@dataclass
class AgentEvalResult:
    task_completed: bool
    steps_taken: int
    correct_tools_used: bool
    answer_quality: float  # 0–1 LLM-judged score
    cost_usd: float
    latency_ms: float

def evaluate_agent_run(
    task: str,
    expected_outcome: str,
    agent_output: str,
    steps: list[dict],
    cost: float,
    latency: float
) -> AgentEvalResult:
    # LLM judge for answer quality
    judge_response = client.chat.completions.create(
        model="gpt-4o",
        messages=[{
            "role": "user",
            "content": f"""Rate the answer quality from 0.0 to 1.0.
Task: {task}
Expected outcome: {expected_outcome}
Agent answer: {agent_output}

Return JSON: {{"score": 0.0, "reason": "..."}}"""
        }],
        response_format={"type": "json_object"}
    )
    score_data = json.loads(judge_response.choices[0].message.content)

    return AgentEvalResult(
        task_completed=score_data["score"] > 0.7,
        steps_taken=len(steps),
        correct_tools_used=all(s["tool"] in EXPECTED_TOOLS for s in steps),
        answer_quality=score_data["score"],
        cost_usd=cost,
        latency_ms=latency
    )
```

---

## OpenAI Assistants API

Use when you want managed threads, file search, and code interpreter without building retrieval yourself.

```python
from openai import OpenAI

client = OpenAI()

# Create assistant once
assistant = client.beta.assistants.create(
    name="Support Agent",
    instructions="You are a helpful support agent. Use the knowledge base to answer questions accurately.",
    model="gpt-4o",
    tools=[
        {"type": "file_search"},
        {"type": "code_interpreter"}
    ]
)

# Upload files to a vector store
vector_store = client.beta.vector_stores.create(name="Knowledge Base")
with open("docs.pdf", "rb") as f:
    client.beta.vector_stores.file_batches.upload_and_poll(
        vector_store_id=vector_store.id,
        files=[f]
    )

# Attach vector store to assistant
client.beta.assistants.update(
    assistant.id,
    tool_resources={"file_search": {"vector_store_ids": [vector_store.id]}}
)

# Run conversation
thread = client.beta.threads.create()
client.beta.threads.messages.create(thread.id, role="user", content="What is our refund policy?")
run = client.beta.threads.runs.create_and_poll(thread_id=thread.id, assistant_id=assistant.id)
messages = client.beta.threads.messages.list(thread_id=thread.id)
print(messages.data[0].content[0].text.value)
```
