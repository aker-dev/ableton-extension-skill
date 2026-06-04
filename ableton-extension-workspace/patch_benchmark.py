#!/usr/bin/env python3
"""Enrich benchmark.json: backfill tokens from timing.json, fix metadata, add
analyst notes; regenerate benchmark.md. Idempotent."""
import json
import statistics as st
from pathlib import Path

ITER = Path(__file__).resolve().parent / "iteration-1"
bj = ITER / "benchmark.json"
data = json.loads(bj.read_text())

EVAL_DIR = {0: "eval-0-warp-cycle", 1: "eval-1-import-place", 2: "eval-2-selection-undo"}

# Backfill per-run tokens from each run's timing.json
for run in data["runs"]:
    t = ITER / EVAL_DIR[run["eval_id"]] / run["configuration"] / "run-1" / "timing.json"
    if t.exists():
        run["result"]["tokens"] = json.loads(t.read_text()).get("total_tokens", 0)

# Recompute token stats per configuration + delta
def stats(vals):
    return {"mean": round(st.mean(vals), 1), "stddev": round(st.pstdev(vals), 1),
            "min": min(vals), "max": max(vals)}

tok = {}
for cfg in ("with_skill", "without_skill"):
    vals = [r["result"]["tokens"] for r in data["runs"] if r["configuration"] == cfg]
    data["run_summary"][cfg]["tokens"] = stats(vals)
    tok[cfg] = data["run_summary"][cfg]["tokens"]["mean"]
data["run_summary"]["delta"]["tokens"] = f"+{int(tok['with_skill'] - tok['without_skill'])}"

# Metadata
data["metadata"]["executor_model"] = "claude-sonnet-4-6 (Agent model: sonnet)"
data["metadata"]["analyzer_model"] = "claude-opus-4-8"
data["metadata"]["skill_path"] = "/Users/zak/Desktop/ableton-extension-skill/ableton-extension"
data["metadata"]["runs_per_configuration"] = 1

data["notes"] = [
    "Decisive separation: with-skill passes 19/19 SDK-usage assertions (100%); baseline passes 1/19 (5.6%). Every API-shape assertion discriminates perfectly.",
    "The single assertion the baseline passes (warp-cycle: explicit WarpMode array) is the least discriminating — the baseline happened to list the modes, but still wrapped them in a fully hallucinated class API.",
    "Baseline failures are systematic API hallucination: extends Extension / createExtension, context.filesystem.write, clipSlot.importAudioFile, song.beginUndoStep, clip.warpMode.set(). None exist in the real SDK — expected, since this SDK is a private beta absent from training data, which is exactly when a reference skill pays off.",
    "Cost of the skill: ~+20s and ~+13k tokens per task (reading SKILL.md + references). A reasonable price for moving from non-compiling code to correct, idiomatic code.",
    "Grading is static: outputs were checked with regex assertions for correct SDK API usage and the specific gotchas the skill targets (non-contiguous WarpMode, importIntoProject-first, async withinTransaction) — not compiled or run inside Live.",
    "Single run per cell. The with-skill cell is saturated at 100%; additional runs would mainly probe baseline variance, and baseline failures are systematic rather than flaky.",
]

bj.write_text(json.dumps(data, indent=2))

# Regenerate benchmark.md
s = data["run_summary"]
def row(label, key, unit="", scale=1, pct=False):
    w, wo = s["with_skill"][key], s["without_skill"][key]
    if pct:
        return f"| {label} | {w['mean']:.0%} ± {w['stddev']:.0%} | {wo['mean']:.0%} ± {wo['stddev']:.0%} | {s['delta'][key]} |"
    return f"| {label} | {w['mean']:.0f}{unit} ± {w['stddev']:.0f} | {wo['mean']:.0f}{unit} ± {wo['stddev']:.0f} | {s['delta'][key]} |"

lines = [
    f"# Skill Benchmark: {data['metadata']['skill_name']}",
    "",
    f"**Model**: {data['metadata']['executor_model']}",
    f"**Date**: {data['metadata']['timestamp']}",
    f"**Evals**: warp-cycle, import-place, selection-undo (1 run each per configuration)",
    "",
    "## Summary",
    "",
    "| Metric | With Skill | Without Skill | Delta |",
    "|--------|------------|---------------|-------|",
    row("Pass Rate", "pass_rate", pct=True),
    row("Time", "time_seconds", unit="s"),
    row("Tokens", "tokens"),
    "",
    "## Per-eval pass rate",
    "",
    "| Eval | With Skill | Without Skill |",
    "|------|------------|---------------|",
]
for eid in (0, 1, 2):
    w = next(r for r in data["runs"] if r["eval_id"] == eid and r["configuration"] == "with_skill")
    wo = next(r for r in data["runs"] if r["eval_id"] == eid and r["configuration"] == "without_skill")
    nm = EVAL_DIR[eid].split("-", 2)[2]
    lines.append(f"| {nm} | {w['result']['passed']}/{w['result']['total']} | {wo['result']['passed']}/{wo['result']['total']} |")
lines += ["", "## Analyst notes", ""]
lines += [f"- {n}" for n in data["notes"]]
lines.append("")
(ITER / "benchmark.md").write_text("\n".join(lines))
print("Patched benchmark.json + benchmark.md")
print(f"  with_skill tokens mean={tok['with_skill']:.0f}, without={tok['without_skill']:.0f}")
