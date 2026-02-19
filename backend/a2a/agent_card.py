"""Build the A2A Agent Card for the Personal Knowledge Base."""

import os

from a2a.types import AgentCard, AgentSkill, AgentCapabilities


BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")


def build_agent_card() -> AgentCard:
    """Construct the AgentCard with 3 skills: deep-research, knowledge-search, rag-qa."""
    return AgentCard(
        name="Personal Knowledge Base",
        description=(
            "An AI-powered knowledge base agent that can search stored articles "
            "and documents, answer questions using RAG, and conduct autonomous "
            "deep research on any topic to produce comprehensive articles."
        ),
        url=f"{BACKEND_URL}/a2a",
        version="1.0.0",
        capabilities=AgentCapabilities(
            streaming=False,
            push_notifications=False,
        ),
        default_input_modes=["text"],
        default_output_modes=["text"],
        skills=[
            AgentSkill(
                id="deep-research",
                name="Deep Research",
                description=(
                    "Conduct autonomous deep research on any topic. "
                    "Searches the web, analyzes findings, and produces a "
                    "comprehensive long-form article (10,000-20,000 words). "
                    "The article is automatically stored in the knowledge base."
                ),
                tags=["research", "writing", "web-search", "article"],
                examples=[
                    "Research the transformer architecture in deep learning",
                    "Write a comprehensive article about the history of stoicism",
                    "Research quantum computing current state and future prospects",
                ],
            ),
            AgentSkill(
                id="knowledge-search",
                name="Knowledge Search",
                description=(
                    "Search the knowledge base using semantic and hybrid retrieval. "
                    "Returns relevant chunks from stored articles and documents."
                ),
                tags=["search", "retrieval", "knowledge-base"],
                examples=[
                    "Search for information about neural networks",
                    "Find articles related to machine learning optimization",
                ],
            ),
            AgentSkill(
                id="rag-qa",
                name="RAG Question Answering",
                description=(
                    "Answer questions using the RAG pipeline. Retrieves relevant "
                    "context from the knowledge base and generates a comprehensive "
                    "answer with source citations."
                ),
                tags=["question-answering", "rag", "knowledge-base"],
                examples=[
                    "What are the key differences between transformers and RNNs?",
                    "Explain the concept of attention mechanisms based on stored articles",
                ],
            ),
        ],
    )
