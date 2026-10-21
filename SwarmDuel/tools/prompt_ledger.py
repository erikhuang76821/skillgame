#!/usr/bin/env python3
"""Prompt version history for every generated image.

Writes:
  art/prompts/_history/<kind>/<output stem>.txt   exact prompt text that produced each raw output
  art/prompts/PROMPT_LOG.md                       ledger: output -> prompt snapshot (sha), take, status

Prompt sources, most to least trustworthy:
  1. snapshot already in _history/   (written by gen_anim.sh / gen_image.sh at generation time)
  2. the prompt echoed in the Codex log (art/raw/**/logs/*.log, between "user" and "codex")
  3. the current prompt file, only if it was last modified BEFORE the output; otherwise the
     generation-time text is unknown and the ledger says so.
Safe to re-run: existing snapshots are never overwritten.
"""
import hashlib, json, re
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW, PROMPTS = ROOT / "art/raw", ROOT / "art/prompts"
HIST = PROMPTS / "_history"
PROV_FILE = HIST / "provenance.json"   # snapshots backfilled after the fact; absent = frozen at generation time
PROV = json.loads(PROV_FILE.read_text(encoding="utf-8")) if PROV_FILE.exists() else {}

# Accept / reject decisions are human judgement; keep them here so the ledger is reproducible.
# Key = raw output stem. Outputs not listed: accepted if the shipped copy has the same bytes.
NOTES = {
    "sasq_Idle_up_right_t1": "拒絕：第 2 格轉成正背面且縮小；改寫 up_right 方向描述後重生",
    "sasq_Idle_up_right_t3": "未採用：與 t2 同 prompt 的重生備選（文件未記錄取捨原因；t2 採用）",
    "sasq_Walk_up_right_t1": "未採用：懷疑圍巾換邊（複查後同側）；prompt 加圍巾同側句後重生 t2、t3",
    "sasq_Walk_up_right_t3": "未採用：與 t2 同 prompt，t2 步幅較清楚",
    "greyling_Walk_up_right_t1": "拒絕：與 up 幾乎相同（只有天線偏右）",
    "icon_p_speed_2": "未採用：同一 session 產出的第 2 張；atlas 只讀 _1",
}

sha = lambda text: hashlib.sha256(text.encode("utf-8")).hexdigest()[:12]
md5 = lambda p: hashlib.md5(p.read_bytes()).hexdigest()
mtime = lambda p: datetime.fromtimestamp(p.stat().st_mtime)


def prompt_from_log(log):
    lines = log.read_text(encoding="utf-8", errors="replace").splitlines()
    try:
        start = lines.index("user") + 1
        end = lines.index("codex", start)
    except ValueError:
        return None
    return "\n".join(lines[start:end]).rstrip() + "\n"


def snapshot(kind, stem, text, source):
    path = HIST / kind / f"{stem}.txt"
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
        PROV[f"{kind}/{stem}"] = source
    return path.read_text(encoding="utf-8")


def provenance(kind, stem):
    return PROV.get(f"{kind}/{stem}", "snapshot")


def anim_rows():
    rows = []
    for out in sorted((RAW / "anim").glob("*_t*.png")):
        m = re.match(r"(.+)_t(\d+)$", out.stem)
        base, take = m.group(1), m.group(2)
        hist = HIST / "anim" / f"{out.stem}.txt"
        log = RAW / "anim/logs" / f"{base}_{take}.log"
        text = hist.read_text(encoding="utf-8") if hist.exists() else (prompt_from_log(log) if log.exists() else None)
        source = provenance("anim", out.stem) if hist.exists() else ("log 回填" if text else "—")
        if text:
            text = snapshot("anim", out.stem, text, source)
        shipped = RAW / "anim" / f"{base}.png"
        accepted = shipped.exists() and md5(shipped) == md5(out)
        current = PROMPTS / "anim" / f"{base}.txt"
        drift = text and current.exists() and current.read_text(encoding="utf-8").rstrip() != text.rstrip()
        rows.append(dict(
            output=out.relative_to(ROOT).as_posix(), take=take, snap=out.stem, prompt=current.relative_to(ROOT).as_posix(),
            sha=sha(text) if text else "—", source=source,
            status="採用" if accepted else NOTES.get(out.stem, "未採用（未記錄原因）"),
            drift="現行檔已改" if drift else "",
        ))
    return rows


def static_rows():
    rows = []
    for out in sorted(RAW.glob("*_*.png")):
        m = re.match(r"(.+)_(\d+)([a-z]?)$", out.stem)   # gen_image.sh: <stem>_<take>[b|c…]
        if not m:
            continue
        stem, n = m.group(1), m.group(2)
        current = PROMPTS / f"{stem}.txt"
        if not current.exists():
            continue
        hist = HIST / "static" / f"{stem}_{n}.txt"         # one snapshot per take, shared by its images
        if hist.exists():
            text, source = hist.read_text(encoding="utf-8"), provenance("static", f"{stem}_{n}")
        elif mtime(current) <= mtime(out):
            source = "prompt 檔回填（早於產出）"
            text = snapshot("static", f"{stem}_{n}", current.read_text(encoding="utf-8"), source)
        else:
            text, source = None, f"未知：prompt 檔 {mtime(current):%H:%M} 晚於產出 {mtime(out):%H:%M}"
        drift = text and current.read_text(encoding="utf-8").rstrip() != text.rstrip()
        rows.append(dict(
            output=out.relative_to(ROOT).as_posix(), take=n, snap=f"{stem}_{n}", prompt=current.relative_to(ROOT).as_posix(),
            sha=sha(text) if text else "—", source=source,
            status=NOTES.get(out.stem, "採用"), drift="現行檔已改" if drift else "",
        ))
    return rows


def table(rows):
    out = ["| 產出 | take | prompt 檔 | 快照 sha | 快照來源 | 狀態 | 備註 |", "|---|---|---|---|---|---|---|"]
    for r in rows:
        kind = "anim" if "/anim/" in r["output"] else "static"
        snap = r["snap"]
        link = f"[{r['sha']}](_history/{kind}/{snap}.txt)" if r["sha"] != "—" else "—"
        out.append(f"| `{r['output'][8:]}` | {r['take']} | `{r['prompt'][12:]}` | {link} | {r['source']} | {r['status']} | {r['drift']} |")
    return out


if __name__ == "__main__":
    anim, static = anim_rows(), static_rows()
    doc = [
        "# Prompt 版本紀錄（自動產生：`python tools/prompt_ledger.py`）",
        "",
        "每張原始產出對應「產生它的那份 prompt 原文」快照（`_history/`）。`art/prompts/` 下的檔案是**現行版**，"
        "重生會用它；快照不會被覆寫。新產出請用 `tools/gen_anim.sh`（動畫）或 `tools/gen_image.sh`（靜態），"
        "兩者在生成前自動存快照。",
        "",
        "- **快照來源**：`snapshot` = 生成時由腳本凍結；`log 回填` = 從 Codex log 取回（log 原樣保留了送出的 prompt，可信）；"
        "`prompt 檔回填（早於產出）` = 依修改時間推定為同一份；`未知` = prompt 檔在產出後被改過，生成當時的原文已無法取得。"
        "回填來源記在 `_history/provenance.json`。",
        "- **備註「現行檔已改」**：現行 prompt 與該次產出用的不同，重生不會得到同樣的條件。",
        "",
        "## 動畫條（`art/raw/anim/`）",
        "",
        *table(anim),
        "",
        "## 靜態圖（`art/raw/`）",
        "",
        *table(static),
        "",
    ]
    PROV_FILE.write_text(json.dumps(dict(sorted(PROV.items())), ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    (PROMPTS / "PROMPT_LOG.md").write_text("\n".join(doc), encoding="utf-8")
    unknown = sum(r["sha"] == "—" for r in anim + static)
    print(f"{len(anim)} anim + {len(static)} static outputs; {unknown} without a recoverable prompt")
