#!/usr/bin/env python3
"""Regenerate state/build-state.json from the OpenCode session database.

This is a build-receipt helper, not part of the runtime application.
Usage: python3 state/generate-build-state.py
"""
import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB = Path.home() / ".local/share/opencode/opencode.db"
SESSION_ID = "ses_e666c46d8ffezSoPNKbrg0Cbta"

con = sqlite3.connect(DB)
con.row_factory = sqlite3.Row
row = con.execute(
    """select id, title, model, agent, cost, tokens_input, tokens_output,
              tokens_reasoning, tokens_cache_read, tokens_cache_write,
              time_created, time_updated, time_busy
       from session_v2 where id = ?""",
    (SESSION_ID,),
).fetchone()
if row is None:
    raise SystemExit(f"Session {SESSION_ID} not found")

model = json.loads(row["model"]) if row["model"] else {}
created = datetime.fromtimestamp(row["time_created"] / 1000, timezone.utc)
completed = datetime.now(timezone.utc)
seconds = int((completed - created).total_seconds())
hours, rem = divmod(seconds, 3600)
minutes, secs = divmod(rem, 60)
human = (f"{hours}h " if hours else "") + f"{minutes}m {secs}s"

def stats(rel, count_lines=True):
    p = ROOT / rel
    data = p.read_bytes()
    out = {"path": rel, "bytes": len(data)}
    if count_lines:
        out["lines"] = data.decode("utf-8").count("\n")
    return out

files = [
    stats("index.html"),
    stats("style.css"),
    stats("script.js"),
    stats("README.md"),
    stats("assets/preview.png", False),
    stats("LICENSE"),
]

tokens_input = row["tokens_input"]
tokens_output = row["tokens_output"]
tokens_reasoning = row["tokens_reasoning"]
cache_read = row["tokens_cache_read"]
cache_write = row["tokens_cache_write"]
total = tokens_input + tokens_output + tokens_reasoning + cache_read + cache_write
non_cached = tokens_input + tokens_output + tokens_reasoning

state = {
    "project": "The Virtual Playhouse: AI Classic Theatre & Audience Simulator",
    "repository": "https://github.com/somphol/virtual-playhouse",
    "liveDemo": "https://somphol.github.io/virtual-playhouse/",
    "build": {
        "startedAt": created.isoformat().replace("+00:00", "Z"),
        "completedAt": completed.isoformat().replace("+00:00", "Z"),
        "wallClockSeconds": seconds,
        "wallClockHuman": human,
        "revision": 3,
        "revisionNote": "Added Acts IV–VI (A Midsummer Night's Dream, Pride and Prejudice, Dracula) with new backdrops, costumes, effects and sound cues.",
        "sessionID": row["id"],
        "sessionTitle": row["title"],
        "harness": "OpenCode",
        "agent": row["agent"],
        "model": {
            "name": "DeepSeek V4.1 Flash",
            "id": model.get("id", "deepseek-v4.1-flash"),
            "provider": model.get("providerID", "opencode-go"),
        },
        "credits": "Built with OpenCode and DeepSeek V4.1 Flash.",
    },
    "tokens": {
        "input": tokens_input,
        "output": tokens_output,
        "reasoning": tokens_reasoning,
        "cacheRead": cache_read,
        "cacheWrite": cache_write,
        "nonCachedTotal": non_cached,
        "total": total,
    },
    "costUSD": row["cost"],
    "artifacts": {
        "files": files,
        "sourceLines": sum(f.get("lines", 0) for f in files),
    },
    "notes": (
        "Token counts are read from the OpenCode session database at completion time. "
        "This revision adds Acts IV–VI and their new sets, costumes, effects and sound cues. "
        "The final assistant reply is sent after this snapshot, so the live session may be a few tokens higher. "
        "Cache-read tokens are included in total because they represent context processed by the model."
    ),
}

out = ROOT / "state" / "build-state.json"
out.write_text(json.dumps(state, indent=2) + "\n")
print(out)
print(json.dumps(state["build"], indent=2))
print(json.dumps(state["tokens"], indent=2))
