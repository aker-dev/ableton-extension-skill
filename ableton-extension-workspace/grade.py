#!/usr/bin/env python3
"""Grade ableton-extension eval outputs against objective, grep-based assertions.

Writes grading.json + eval_metadata.json into each run dir. Reusable across
iterations: pass the iteration dir as argv[1] (default: iteration-1).
"""
import json
import re
import sys
from pathlib import Path

WORKSPACE = Path(__file__).resolve().parent
ITER = WORKSPACE / (sys.argv[1] if len(sys.argv) > 1 else "iteration-1")
EVALS = json.loads((WORKSPACE.parent / "evals" / "evals.json").read_text())
PROMPTS = {e["name"]: e["prompt"] for e in EVALS["evals"]}
IDS = {e["name"]: e["id"] for e in EVALS["evals"]}

# Each assertion: (text, predicate(src_text) -> (passed: bool, evidence: str))

def has(pattern, label=None, flags=0):
    rx = re.compile(pattern, flags)
    def f(src):
        m = rx.search(src)
        return (bool(m), f"matched /{pattern}/: {m.group(0)[:80]!r}" if m
                else f"no match for /{pattern}/")
    return f

def lacks(patterns, label):
    def f(src):
        hits = [p for p in patterns if re.search(p, src)]
        return (not hits, f"found hallucinated API: {hits}" if hits
                else f"none of {patterns} present")
    return f

def all_of(*preds):
    def f(src):
        results = [p(src) for p in preds]
        passed = all(r[0] for r in results)
        return (passed, "; ".join(r[1] for r in results))
    return f

INIT = has(r'initialize\(\s*\w+\s*,\s*["\']1\.0\.0["\']')
ACTIVATE = has(r'\bactivate\b')

ASSERTIONS = {
    "warp-cycle": [
        ("Entry point: exports activate and calls initialize(activation, \"1.0.0\")",
         all_of(INIT, ACTIVATE)),
        ("Registers the item via context.ui.registerContextMenuAction scoped to \"AudioClip\"",
         all_of(has(r'registerContextMenuAction'), has(r'["\']AudioClip["\']'))),
        ("Resolves the clicked clip with getObjectFromHandle",
         has(r'getObjectFromHandle')),
        ("Sets warp mode via the warpMode property (assignment, not a .set() method)",
         all_of(has(r'\.warpMode\s*='), lacks([r'\.warpMode\.set\('], "warpMode.set"))),
        ("Cycles via an explicit ordered WarpMode array (no modulo on the raw non-contiguous enum)",
         all_of(has(r'(WarpMode\.\w+[\s\S]*){4,}'), lacks([r'warpMode\s*\+\s*1\s*\)?\s*%'], "raw-enum modulo"))),
        ("Avoids a hallucinated class API (no extends Extension / onLoad / contextMenu.register / createExtension)",
         lacks([r'extends Extension', r'\bonLoad\b', r'contextMenu\.register', r'createExtension'], "class API")),
    ],
    "import-place": [
        ("Entry point: exports activate and calls initialize(activation, \"1.0.0\")",
         all_of(INIT, ACTIVATE)),
        ("Registers context-menu action scoped to \"ClipSlot\"",
         all_of(has(r'registerContextMenuAction'), has(r'["\']ClipSlot["\']'))),
        ("Resolves the clip slot with getObjectFromHandle(..., ClipSlot)",
         all_of(has(r'getObjectFromHandle'), has(r'ClipSlot'))),
        ("Writes the download into context.environment.tempDirectory (sandbox), not an arbitrary path",
         has(r'environment\.(temp|storage)Directory')),
        ("Imports via context.resources.importIntoProject(...) before creating the clip",
         has(r'importIntoProject')),
        ("Creates the clip with clipSlot.createAudioClip({ filePath, isWarped: false })",
         all_of(has(r'createAudioClip'), has(r'isWarped'))),
        ("Avoids hallucinated FS / clip API (no context.filesystem, importAudioFile, or .addAction)",
         lacks([r'\.filesystem\b', r'importAudioFile', r'\.addAction\b'], "fs/clip API")),
    ],
    "selection-undo": [
        ("Entry point: exports activate and calls initialize(activation, \"1.0.0\")",
         all_of(INIT, ACTIVATE)),
        ("Registers context-menu action scoped to \"MidiTrack.ArrangementSelection\"",
         all_of(has(r'registerContextMenuAction'), has(r'MidiTrack\.ArrangementSelection'))),
        ("Reads ArrangementSelection fields (time_selection_start/end, selected_lanes)",
         all_of(has(r'time_selection_start'), has(r'selected_lanes'))),
        ("Resolves lanes with getObjectFromHandle and narrows with instanceof",
         all_of(has(r'getObjectFromHandle'), has(r'instanceof'))),
        ("Creates clips with positional createMidiClip(startTime, duration) — not an object arg",
         all_of(has(r'createMidiClip'), lacks([r'createMidiClip\(\s*\{'], "object-arg createMidiClip"))),
        ("Single undo step via withinTransaction(() => Promise.all(...)) — no beginUndoStep/manual undo",
         all_of(has(r'withinTransaction'), has(r'Promise\.all'), lacks([r'beginUndoStep', r'endUndoStep'], "manual undo"))),
    ],
}

def grade_run(name, run_dir):
    src = (run_dir / "outputs" / "extension.ts").read_text()
    exps = []
    for text, pred in ASSERTIONS[name]:
        passed, evidence = pred(src)
        exps.append({"text": text, "passed": passed, "evidence": evidence})
    passed = sum(e["passed"] for e in exps)
    total = len(exps)
    timing = {}
    tfile = run_dir / "timing.json"
    if tfile.exists():
        t = json.loads(tfile.read_text())
        timing = {"total_duration_seconds": t.get("total_duration_seconds"),
                  "total_tokens": t.get("total_tokens")}
    grading = {
        "expectations": exps,
        "summary": {"passed": passed, "failed": total - passed, "total": total,
                    "pass_rate": round(passed / total, 4)},
        "timing": timing,
    }
    (run_dir / "grading.json").write_text(json.dumps(grading, indent=2))
    (run_dir / "eval_metadata.json").write_text(json.dumps({
        "eval_id": IDS[name], "eval_name": name, "prompt": PROMPTS[name],
        "assertions": [t for t, _ in ASSERTIONS[name]],
    }, indent=2))
    return passed, total

def main():
    print(f"Grading {ITER}\n")
    by_cfg = {"with_skill": [], "without_skill": []}
    for eval_dir in sorted(ITER.glob("eval-*")):
        name = eval_dir.name.split("-", 2)[2]  # eval-0-warp-cycle -> warp-cycle
        for cfg in ("with_skill", "without_skill"):
            run = eval_dir / cfg / "run-1"
            if not (run / "outputs" / "extension.ts").exists():
                print(f"  MISSING {eval_dir.name}/{cfg}")
                continue
            p, t = grade_run(name, run)
            by_cfg[cfg].append(p / t)
            print(f"  {eval_dir.name:24} {cfg:14} {p}/{t}  ({p/t:.0%})")
    print()
    for cfg, rates in by_cfg.items():
        if rates:
            print(f"  {cfg:14} mean pass_rate = {sum(rates)/len(rates):.1%}")

if __name__ == "__main__":
    main()
