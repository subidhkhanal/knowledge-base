"""
RAG Evaluation Runner using RAGAS + Gemini 2.5 Flash as judge.

Usage:
    python -m backend.evaluation.eval_runner
    python -m backend.evaluation.eval_runner --save results.json
    python -m backend.evaluation.eval_runner --compare old_results.json
    python -m backend.evaluation.eval_runner --retrieval-only   (skip RAGAS, free)

Requires:
    - GOOGLE_API_KEY env var (free: https://aistudio.google.com/apikey)
    - Your existing Pinecone/Cohere/Groq env vars for the RAG pipeline
"""

import json
import os
import sys
import time
import argparse
from pathlib import Path
from typing import Dict, Any, List

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from backend.storage.vector_store import VectorStore
from backend.retrieval.query_engine import QueryEngine
from backend.config import GROQ_MODEL, SIMILARITY_THRESHOLD, TOP_K, USE_RERANKING


def load_test_cases() -> List[Dict[str, Any]]:
    """Load test cases from JSON file."""
    test_cases_path = Path(__file__).parent / "test_cases.json"
    if not test_cases_path.exists():
        print("ERROR: test_cases.json not found. Create it in backend/evaluation/")
        sys.exit(1)

    with open(test_cases_path, "r", encoding="utf-8") as f:
        cases = json.load(f)

    if not cases:
        print("ERROR: test_cases.json is empty. Add at least one test case.")
        sys.exit(1)

    return cases


def run_rag_pipeline(qe: QueryEngine, question: str) -> Dict[str, Any]:
    """Run a single question through the RAG pipeline."""
    start = time.time()

    # Retrieve chunks
    chunks, reranked = qe.retrieve(question=question)

    # Generate answer
    result = qe.query_sync(question=question)

    elapsed = time.time() - start

    # Extract context texts from chunks
    contexts = [chunk.get("text", "") for chunk in chunks]

    # Extract source names
    sources = [
        chunk.get("metadata", {}).get("source", "Unknown")
        for chunk in chunks
    ]

    # Similarity scores
    similarities = [chunk.get("similarity", 0) for chunk in chunks]

    return {
        "answer": result.get("answer", ""),
        "contexts": contexts,
        "sources": sources,
        "similarities": similarities,
        "chunks_used": len(chunks),
        "reranked": reranked,
        "latency": elapsed,
    }


def compute_retrieval_metrics(
    rag_result: Dict[str, Any],
    test_case: Dict[str, Any],
) -> Dict[str, Any]:
    """Compute free retrieval metrics (no LLM needed)."""
    expected_source = test_case.get("expected_source", "")
    sources = rag_result["sources"]
    similarities = rag_result["similarities"]

    # Source hit: is expected source in any retrieved chunk?
    source_hit = any(
        expected_source.lower() in s.lower() for s in sources
    ) if expected_source else None

    # Precision@k: fraction of chunks from expected source
    if expected_source and sources:
        matching = sum(
            1 for s in sources if expected_source.lower() in s.lower()
        )
        precision = matching / len(sources)
    else:
        precision = None

    # Average similarity score
    avg_sim = sum(similarities) / len(similarities) if similarities else 0

    return {
        "source_hit": source_hit,
        "precision_at_k": precision,
        "avg_similarity": round(avg_sim, 4),
        "chunks_used": rag_result["chunks_used"],
        "latency": round(rag_result["latency"], 2),
    }


def run_ragas_evaluation(
    questions: List[str],
    answers: List[str],
    contexts: List[List[str]],
    ground_truths: List[str],
) -> Dict[str, float]:
    """Run RAGAS evaluation using Gemini 2.5 Flash as judge."""
    google_api_key = os.getenv("GOOGLE_API_KEY", "")
    if not google_api_key:
        print("\nWARNING: GOOGLE_API_KEY not set. Skipping RAGAS metrics.")
        print("  Get a free key at: https://aistudio.google.com/apikey")
        print("  Then set: GOOGLE_API_KEY=your_key_here\n")
        return {}

    try:
        from datasets import Dataset
        from google import genai
        from ragas import evaluate
        from ragas.llms import llm_factory
        from ragas.metrics import Faithfulness, AnswerCorrectness
    except ImportError as e:
        print(f"\nWARNING: Missing dependency: {e}")
        print("  Run: pip install ragas google-genai datasets")
        return {}

    # Initialize Gemini as RAGAS judge
    client = genai.Client(api_key=google_api_key)
    llm = llm_factory("gemini-2.5-flash", provider="google", client=client)

    # Build dataset
    has_ground_truth = all(gt for gt in ground_truths)

    data = {
        "question": questions,
        "answer": answers,
        "contexts": contexts,
    }

    # Metrics that don't need ground truth
    metrics = [Faithfulness(llm=llm)]

    # Add ground-truth metrics if available
    if has_ground_truth:
        data["ground_truth"] = ground_truths
        metrics.append(AnswerCorrectness(llm=llm))

    dataset = Dataset.from_dict(data)

    print("\nRunning RAGAS evaluation (Gemini 2.5 Flash judge)...")
    try:
        results = evaluate(dataset, metrics=metrics)
        return dict(results)
    except Exception as e:
        print(f"  RAGAS evaluation failed: {e}")
        return {}


def print_report(
    test_cases: List[Dict[str, Any]],
    rag_results: List[Dict[str, Any]],
    retrieval_metrics: List[Dict[str, Any]],
    ragas_scores: Dict[str, float],
):
    """Print the evaluation report."""
    print("\n" + "=" * 60)
    print("  RAG EVALUATION REPORT")
    print("=" * 60)
    print(f"  Model: {GROQ_MODEL}")
    print(f"  Threshold: {SIMILARITY_THRESHOLD} | Top-K: {TOP_K} | Reranking: {'ON' if USE_RERANKING else 'OFF'}")
    print(f"  Test cases: {len(test_cases)}")
    print("=" * 60)

    # Per-question results
    for i, (tc, rr, rm) in enumerate(
        zip(test_cases, rag_results, retrieval_metrics), start=1
    ):
        print(f"\nQ{i}: \"{tc['question']}\"")

        if rm["source_hit"] is not None:
            hit_str = "YES" if rm["source_hit"] else "NO"
            print(f"  Source Hit:      {hit_str} (expected: {tc.get('expected_source', 'N/A')})")

        if rm["precision_at_k"] is not None:
            print(f"  Precision@{rm['chunks_used']}:    {rm['precision_at_k']:.2f}")

        print(f"  Avg Similarity:  {rm['avg_similarity']:.4f}")
        print(f"  Chunks Used:     {rm['chunks_used']}")
        print(f"  Latency:         {rm['latency']}s")

        # Show retrieved sources
        unique_sources = list(dict.fromkeys(rr["sources"]))
        print(f"  Sources Found:   {', '.join(unique_sources[:3])}")

    # Summary
    print("\n" + "-" * 60)
    print("  SUMMARY")
    print("-" * 60)

    # Retrieval summary
    hits = [rm["source_hit"] for rm in retrieval_metrics if rm["source_hit"] is not None]
    if hits:
        hit_rate = sum(hits) / len(hits)
        print(f"  Source Hit Rate:     {hit_rate:.0%} ({sum(hits)}/{len(hits)})")

    precisions = [rm["precision_at_k"] for rm in retrieval_metrics if rm["precision_at_k"] is not None]
    if precisions:
        print(f"  Avg Precision@k:    {sum(precisions)/len(precisions):.2f}")

    sims = [rm["avg_similarity"] for rm in retrieval_metrics]
    if sims:
        print(f"  Avg Similarity:     {sum(sims)/len(sims):.4f}")

    latencies = [rm["latency"] for rm in retrieval_metrics]
    if latencies:
        print(f"  Avg Latency:        {sum(latencies)/len(latencies):.2f}s")

    # RAGAS scores
    if ragas_scores:
        print("\n  RAGAS Scores (Gemini 2.5 Flash judge):")
        for metric, score in ragas_scores.items():
            if isinstance(score, (int, float)):
                print(f"    {metric}: {score:.4f}")

    print("\n" + "=" * 60)


def save_results(
    filepath: str,
    test_cases: List[Dict[str, Any]],
    retrieval_metrics: List[Dict[str, Any]],
    ragas_scores: Dict[str, float],
):
    """Save results to JSON for later comparison."""
    output = {
        "config": {
            "model": GROQ_MODEL,
            "threshold": SIMILARITY_THRESHOLD,
            "top_k": TOP_K,
            "reranking": USE_RERANKING,
        },
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "per_question": [
            {
                "question": tc["question"],
                **rm,
            }
            for tc, rm in zip(test_cases, retrieval_metrics)
        ],
        "ragas_scores": ragas_scores,
    }

    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2)

    print(f"\nResults saved to: {filepath}")


def compare_results(current_file: str, old_file: str):
    """Compare current results with a previous run."""
    with open(old_file, "r", encoding="utf-8") as f:
        old = json.load(f)
    with open(current_file, "r", encoding="utf-8") as f:
        new = json.load(f)

    print("\n" + "=" * 60)
    print("  BEFORE / AFTER COMPARISON")
    print("=" * 60)
    print(f"  Old: {old.get('timestamp', '?')} | New: {new.get('timestamp', '?')}")
    print(f"  Old config: {old.get('config', {})}")
    print(f"  New config: {new.get('config', {})}")

    # Compare RAGAS scores
    old_ragas = old.get("ragas_scores", {})
    new_ragas = new.get("ragas_scores", {})

    if old_ragas or new_ragas:
        print("\n  RAGAS Scores:")
        all_metrics = set(list(old_ragas.keys()) + list(new_ragas.keys()))
        for metric in sorted(all_metrics):
            old_val = old_ragas.get(metric, "N/A")
            new_val = new_ragas.get(metric, "N/A")
            if isinstance(old_val, (int, float)) and isinstance(new_val, (int, float)):
                diff = new_val - old_val
                arrow = "+" if diff > 0 else ""
                print(f"    {metric}: {old_val:.4f} -> {new_val:.4f} ({arrow}{diff:.4f})")
            else:
                print(f"    {metric}: {old_val} -> {new_val}")

    # Compare retrieval averages
    def avg_metric(results, key):
        vals = [r.get(key) for r in results.get("per_question", []) if r.get(key) is not None]
        return sum(vals) / len(vals) if vals else None

    print("\n  Retrieval Metrics:")
    for key in ["source_hit", "precision_at_k", "avg_similarity", "latency"]:
        old_avg = avg_metric(old, key)
        new_avg = avg_metric(new, key)
        if old_avg is not None and new_avg is not None:
            diff = new_avg - old_avg
            arrow = "+" if diff > 0 else ""
            print(f"    {key}: {old_avg:.4f} -> {new_avg:.4f} ({arrow}{diff:.4f})")

    print("\n" + "=" * 60)


def main():
    parser = argparse.ArgumentParser(description="RAG Evaluation Runner")
    parser.add_argument("--save", type=str, help="Save results to JSON file")
    parser.add_argument("--compare", type=str, help="Compare with previous results JSON")
    parser.add_argument(
        "--retrieval-only",
        action="store_true",
        help="Only run retrieval metrics (no RAGAS, no API cost)",
    )
    args = parser.parse_args()

    # Load test cases
    test_cases = load_test_cases()
    print(f"Loaded {len(test_cases)} test cases")

    # Initialize RAG pipeline
    print("Initializing RAG pipeline...")
    vs = VectorStore()
    qe = QueryEngine(vector_store=vs)

    # Run each test case through RAG
    rag_results = []
    retrieval_metrics = []

    for i, tc in enumerate(test_cases, start=1):
        question = tc["question"]
        print(f"  [{i}/{len(test_cases)}] {question[:60]}...")

        result = run_rag_pipeline(qe, question)
        rag_results.append(result)

        metrics = compute_retrieval_metrics(result, tc)
        retrieval_metrics.append(metrics)

        # Rate limit: Cohere free tier allows 40 calls/min
        if i < len(test_cases):
            time.sleep(2)

    # Run RAGAS evaluation (unless --retrieval-only)
    ragas_scores = {}
    if not args.retrieval_only:
        questions = [tc["question"] for tc in test_cases]
        answers = [rr["answer"] for rr in rag_results]
        contexts = [rr["contexts"] for rr in rag_results]
        ground_truths = [tc.get("ground_truth", "") for tc in test_cases]

        ragas_scores = run_ragas_evaluation(
            questions, answers, contexts, ground_truths
        )

    # Print report
    print_report(test_cases, rag_results, retrieval_metrics, ragas_scores)

    # Save if requested
    if args.save:
        save_results(args.save, test_cases, retrieval_metrics, ragas_scores)

    # Compare if requested
    if args.compare and args.save:
        compare_results(args.save, args.compare)
    elif args.compare:
        print("NOTE: --compare requires --save to create current results first")
        print("  Usage: python -m backend.evaluation.eval_runner --save new.json --compare old.json")


if __name__ == "__main__":
    main()
