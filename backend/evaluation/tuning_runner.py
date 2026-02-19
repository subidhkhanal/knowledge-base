"""
Parameter tuning script: tests different retrieval parameter combinations
and compares metrics to find optimal configuration.

Usage:
    python -m backend.evaluation.tuning_runner
    python -m backend.evaluation.tuning_runner --quick
    python -m backend.evaluation.tuning_runner --save tuning_results.json
"""

import json
import sys
import time
import argparse
from pathlib import Path
from typing import Dict, Any, List

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from backend.storage.vector_store import VectorStore
from backend.retrieval.query_engine import QueryEngine
from backend.evaluation.eval_runner import (
    load_test_cases, run_rag_pipeline, compute_retrieval_metrics
)


PARAM_GRID_FULL = [
    {"top_k": 3, "threshold": 0.3},
    {"top_k": 5, "threshold": 0.3},
    {"top_k": 7, "threshold": 0.3},
    {"top_k": 10, "threshold": 0.3},
    {"top_k": 5, "threshold": 0.2},
    {"top_k": 5, "threshold": 0.25},
    {"top_k": 5, "threshold": 0.35},
    {"top_k": 5, "threshold": 0.4},
    {"top_k": 7, "threshold": 0.25},
    {"top_k": 10, "threshold": 0.25},
]

PARAM_GRID_QUICK = [
    {"top_k": 3, "threshold": 0.3},
    {"top_k": 5, "threshold": 0.3},
    {"top_k": 7, "threshold": 0.3},
    {"top_k": 5, "threshold": 0.25},
]


def run_config(qe: QueryEngine, test_cases: List[Dict], params: Dict) -> Dict[str, Any]:
    """Run evaluation for a single parameter combination."""
    import backend.config as cfg
    original_top_k = cfg.TOP_K
    original_threshold = cfg.SIMILARITY_THRESHOLD

    cfg.TOP_K = params["top_k"]
    cfg.SIMILARITY_THRESHOLD = params["threshold"]

    all_metrics = []
    for tc in test_cases:
        result = run_rag_pipeline(qe, tc["question"])
        metrics = compute_retrieval_metrics(result, tc)
        all_metrics.append(metrics)
        time.sleep(1.5)  # Rate limit for free tier

    # Compute averages
    def safe_avg(key):
        vals = [m[key] for m in all_metrics if m.get(key) is not None]
        return sum(vals) / len(vals) if vals else None

    avg_metrics = {
        "source_hit_rate": safe_avg("source_hit"),
        "avg_precision_at_k": safe_avg("precision_at_k"),
        "avg_ndcg_at_10": safe_avg("ndcg_at_10"),
        "avg_similarity": safe_avg("avg_similarity"),
        "avg_latency": safe_avg("latency"),
    }

    # Composite score: weighted combination
    composite = 0.0
    if avg_metrics["source_hit_rate"] is not None:
        composite += avg_metrics["source_hit_rate"] * 0.3
    if avg_metrics["avg_ndcg_at_10"] is not None:
        composite += avg_metrics["avg_ndcg_at_10"] * 0.3
    if avg_metrics["avg_precision_at_k"] is not None:
        composite += avg_metrics["avg_precision_at_k"] * 0.2
    if avg_metrics["avg_similarity"] is not None:
        composite += avg_metrics["avg_similarity"] * 0.2
    avg_metrics["composite_score"] = round(composite, 4)

    # Restore original config
    cfg.TOP_K = original_top_k
    cfg.SIMILARITY_THRESHOLD = original_threshold

    return avg_metrics


def main():
    parser = argparse.ArgumentParser(description="RAG Parameter Tuning")
    parser.add_argument("--save", type=str, default="tuning_results.json")
    parser.add_argument("--quick", action="store_true", help="Test fewer combinations")
    args = parser.parse_args()

    test_cases = load_test_cases()
    print(f"Loaded {len(test_cases)} test cases")

    print("Initializing RAG pipeline...")
    vs = VectorStore()
    qe = QueryEngine(vector_store=vs)

    grid = PARAM_GRID_QUICK if args.quick else PARAM_GRID_FULL
    results = []

    for i, params in enumerate(grid, start=1):
        print(f"\n[{i}/{len(grid)}] Testing: top_k={params['top_k']}, threshold={params['threshold']}")
        metrics = run_config(qe, test_cases, params)
        results.append({"params": params, "metrics": metrics})
        print(f"  -> composite={metrics['composite_score']:.4f}, hit_rate={metrics.get('source_hit_rate', 'N/A')}, ndcg@10={metrics.get('avg_ndcg_at_10', 'N/A')}")

    # Sort by composite score
    results.sort(key=lambda r: r["metrics"].get("composite_score", 0), reverse=True)

    print("\n" + "=" * 60)
    print("  TOP CONFIGURATIONS (ranked by composite score)")
    print("=" * 60)
    for i, r in enumerate(results[:5], start=1):
        p = r["params"]
        m = r["metrics"]
        print(f"  #{i}: top_k={p['top_k']}, threshold={p['threshold']}")
        print(f"       composite={m['composite_score']:.4f} | hit_rate={m.get('source_hit_rate', 'N/A')} | ndcg@10={m.get('avg_ndcg_at_10', 'N/A')}")

    with open(args.save, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nResults saved to: {args.save}")


if __name__ == "__main__":
    main()
