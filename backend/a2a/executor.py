"""A2A Agent Executor — routes incoming A2A tasks to KB services."""

import asyncio
import logging
import os
from typing import Optional

from a2a.server.agent_execution import AgentExecutor, RequestContext
from a2a.server.events import EventQueue
from a2a.utils import new_agent_text_message

logger = logging.getLogger(__name__)

# Keywords used to classify which skill a message maps to
_RESEARCH_KEYWORDS = {"research", "write an article", "deep dive", "investigate", "comprehensive article"}
_SEARCH_KEYWORDS = {"search", "find", "look up", "retrieve", "what do you have on"}


def _classify_skill(text: str) -> str:
    """Classify the user's message into one of the 3 skills."""
    lower = text.lower()
    for kw in _RESEARCH_KEYWORDS:
        if kw in lower:
            return "deep-research"
    for kw in _SEARCH_KEYWORDS:
        if kw in lower:
            return "knowledge-search"
    # Default to RAG QA for questions
    return "rag-qa"


def _get_components():
    """Import get_components at call time to avoid circular import with main.py."""
    from backend.main import get_components
    return get_components()


class PKBAgentExecutor(AgentExecutor):
    """Routes A2A tasks to the Personal Knowledge Base services."""

    def __init__(self, user_id: str = "1"):
        self.user_id = user_id

    async def execute(
        self,
        context: RequestContext,
        event_queue: EventQueue,
    ) -> None:
        """Execute an A2A task by routing to the appropriate skill."""
        user_input = context.get_user_input()
        if not user_input:
            await event_queue.enqueue_event(
                new_agent_text_message("No input provided. Please send a message.")
            )
            event_queue.task_done()
            return

        skill = _classify_skill(user_input)
        logger.info("A2A task classified as '%s': %s", skill, user_input[:100])

        try:
            if skill == "deep-research":
                result = await self._handle_research(user_input)
            elif skill == "knowledge-search":
                result = await self._handle_search(user_input)
            else:
                result = await self._handle_qa(user_input)

            await event_queue.enqueue_event(new_agent_text_message(result))
        except Exception as e:
            logger.exception("A2A task failed: %s", e)
            await event_queue.enqueue_event(
                new_agent_text_message(f"Error: {str(e)}")
            )
        finally:
            event_queue.task_done()

    async def cancel(
        self,
        context: RequestContext,
        event_queue: EventQueue,
    ) -> None:
        """Handle task cancellation."""
        await event_queue.enqueue_event(
            new_agent_text_message("Task cancelled.")
        )
        event_queue.task_done()

    async def _handle_research(self, topic: str) -> str:
        """Run the deep research pipeline."""
        from backend.research.agent import run_research_pipeline
        from backend.articles import database as articles_db
        from backend.articles.structurer import structure_to_html

        # Strip common prefixes
        clean_topic = topic
        for prefix in ["research ", "write an article about ", "deep dive into "]:
            if clean_topic.lower().startswith(prefix):
                clean_topic = clean_topic[len(prefix):]
                break

        # Get query engine for PKB search (knowledge flywheel)
        components = _get_components()
        qe = components.get("query_engine")

        # A2A mode: use env vars for API keys (no HTTP headers available)
        result = await asyncio.to_thread(
            run_research_pipeline,
            topic=clean_topic,
            tavily_api_key=os.getenv("TAVILY_API_KEY", ""),
            progress_callback=lambda phase, step, total, msg: logger.info(
                "A2A Research [%s] %d/%d: %s", phase, step, total, msg
            ),
            query_engine=qe,
            user_id=self.user_id,
        )

        # Store in vector DB + SQLite
        components = _get_components()
        doc_meta = {
            "text": result["content_markdown"],
            "source": result["title"],
            "source_type": "article",
            "article_slug": result["slug"],
        }
        chunks = components["chunker"].chunk_documents([doc_meta])
        doc_ids = components["vector_store"].add_documents(chunks, user_id=self.user_id)

        bm25 = components.get("bm25_index")
        if bm25 is not None:
            bm25_items = []
            for chunk, doc_id in zip(chunks, doc_ids):
                bm25_items.append({
                    "text": chunk["text"],
                    "id": doc_id,
                    "metadata": {
                        "source": chunk.get("source", "unknown"),
                        "source_type": "article",
                        "user_id": self.user_id,
                    },
                })
            bm25.add_chunks(bm25_items)
            bm25.save()

        content_html = await asyncio.to_thread(
            structure_to_html, result["content_markdown"], result["title"], None,
        )

        await articles_db.insert_article(
            slug=result["slug"],
            title=result["title"],
            tags=result["tags"],
            source="research",
            content_markdown=result["content_markdown"],
            user_id=int(self.user_id),
            chunks_count=len(chunks),
            conversation_length=0,
            content_html=content_html,
        )

        return (
            f"Research complete!\n\n"
            f"Title: {result['title']}\n"
            f"Word count: {result['word_count']:,}\n"
            f"Sources: {result['sources_count']}\n"
            f"Sections: {result['sections_count']}\n"
            f"Slug: {result['slug']}\n\n"
            f"The article has been stored in the knowledge base."
        )

    async def _handle_search(self, query: str) -> str:
        """Search the knowledge base."""
        components = _get_components()
        qe = components["query_engine"]

        chunks, reranked = qe.retrieve(
            question=query,
            top_k=5,
            user_id=self.user_id,
        )

        if not chunks:
            return "No results found for your query."

        results = []
        for i, chunk in enumerate(chunks, 1):
            meta = chunk.get("metadata", {})
            results.append(
                f"[{i}] (score: {chunk.get('score', 0):.3f}) "
                f"Source: {meta.get('source', 'unknown')}\n"
                f"{chunk.get('text', '')[:800]}"
            )

        return f"Found {len(chunks)} results:\n\n" + "\n\n---\n\n".join(results)

    async def _handle_qa(self, question: str) -> str:
        """Answer a question using the RAG pipeline."""
        components = _get_components()
        qe = components["query_engine"]

        result = await qe.query(
            question=question,
            user_id=self.user_id,
        )

        sources = result.get("sources", [])
        source_list = "\n".join(
            f"- {s.get('source', 'unknown')}" for s in sources
        ) if sources else "No sources cited."

        return (
            f"{result['answer']}\n\n"
            f"Sources:\n{source_list}"
        )
