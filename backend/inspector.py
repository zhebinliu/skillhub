"""TRACE 5 维 LLM 评测 + 静态线索补充。

维度(各 0-20,总分 0-100):
  T (Trust)         信任性  — 来源透明度 / 安全风险 / 引用真实可验证 / 无 prompt 注入
  R (Reliability)   可靠性  — 步骤幂等 / 错误处理 / 边界 case / 失败 fallback
  A (Adaptability)  适用性  — 触发场景清晰 / 边界明确 / 多 case 覆盖
  C (Convention)    规范性  — frontmatter / 命名 / 文件结构 / 文档完整
  E (Effectiveness) 有效性  — 用户读完能否上手 / 步骤可执行 / 实际效果

评级 = 综合分 ÷ 20 → 1..5 星(支持 0.5 半星显示)。

静态层(`trace_clues.py` 提供):格式检查 + 文件统计 + 安全启发,作为给 LLM 的「线索」附在 prompt 里。
不直接打分,避免静态规则压住 LLM 的真实评估。
"""
import json
import re
import time
from pathlib import Path
from typing import Optional

import httpx

from config import settings
from storage import skill_dir, list_tree


# ──────────────────────────────────────────────────────────────────────────────
SYSTEM_PROMPT = """你是 Skill Hub 平台的 TRACE 评测官,负责对用户上传的 Claude Skill 包做质量审查。

【TRACE 5 维度】每项 0-20 分,总分 0-100。

T · Trust(信任性):
  - 来源是否透明、可验证
  - 是否含安全风险(网络下载、shell 注入、敏感词、外链)
  - 引用 / URL 是否真实
  - 有无 prompt injection 嫌疑

R · Reliability(可靠性):
  - 步骤是否幂等可重复
  - 错误处理 / 异常路径覆盖
  - 边界 case 是否考虑
  - 失败 fallback 是否到位

A · Adaptability(适用性):
  - 触发场景是否清晰(description 让人能立刻判断要不要用)
  - 边界 / 不适用场景是否明确
  - 覆盖多种使用 case

C · Convention(规范性):
  - frontmatter 字段完整(name / description / 可选 allowed-tools / model)
  - 文件命名 / 目录结构是否规范
  - 文档完整度(README / 示例 / 引用)

E · Effectiveness(有效性):
  - 用户读完能否快速上手
  - 步骤是否真的可执行
  - 是否能产生预期效果

【综合评级】
  90-100 优秀 ★★★★★;75-89 良好 ★★★★;60-74 合格 ★★★;40-59 待打磨 ★★;0-39 不通过 ★

返回严格 JSON,不要 markdown 代码块,不要 <think> 标签后续注释:
{
  "score": 87,
  "verdict": "good",
  "summary": "一段话:整体水平 + 最大亮点 + 最大短板(80-200 字,中文)",
  "dimensions": {
    "trust":         {"score": 18, "comments": "一句话评语(40-120 字)"},
    "reliability":   {"score": 16, "comments": "..."},
    "adaptability":  {"score": 18, "comments": "..."},
    "convention":    {"score": 19, "comments": "..."},
    "effectiveness": {"score": 16, "comments": "..."}
  },
  "suggestions": [
    {"severity": "high|medium|low", "area": "trust|reliability|adaptability|convention|effectiveness", "message": "具体怎么改(包含行动建议)"}
  ]
}
"""


VERDICT_LABELS = {
    "excellent": "优秀",
    "good": "良好",
    "pass": "合格",
    "needs_work": "待打磨",
    "fail": "不通过",
}

TRACE_LABELS = {
    "trust":         "T · 信任性",
    "reliability":   "R · 可靠性",
    "adaptability":  "A · 适用性",
    "convention":    "C · 规范性",
    "effectiveness": "E · 有效性",
}


def _verdict(score: int) -> str:
    if score >= 90: return "excellent"
    if score >= 75: return "good"
    if score >= 60: return "pass"
    if score >= 40: return "needs_work"
    return "fail"


def _stars(score: int) -> float:
    return round(score / 20.0 * 2) / 2  # 0..5,0.5 步进


# ──────────────────────────────────────────────────────────────────────────────
# 静态线索(给 LLM 看,不直接打分)
def collect_clues(storage_path: str) -> dict:
    """收集结构化线索:frontmatter / 文件统计 / 安全启发。"""
    from static_scorer import _parse_frontmatter, _list_files, _read_text  # 借用工具

    base = skill_dir(storage_path)
    skill_md = base / "SKILL.md"
    if not skill_md.is_file():
        found = list(base.rglob("SKILL.md"))
        if found:
            skill_md = found[0]

    text = _read_text(skill_md) if skill_md.is_file() else ""
    meta, body = _parse_frontmatter(text) if text else (None, "")
    files = _list_files(base)

    # 抓外链
    full_blob = ""
    for f in files:
        if f.suffix.lower() in {".md", ".py", ".sh", ".json", ".yml", ".yaml", ".txt"}:
            try:
                full_blob += "\n" + f.read_text(encoding="utf-8", errors="replace")[:10_000]
            except OSError:
                pass
    urls = list(set(re.findall(r"https?://[^\s<>\"']+", full_blob)))[:20]

    # 安全启发
    risk = []
    if re.search(r"\bcurl\b.*\|\s*(bash|sh)\b", full_blob, re.IGNORECASE):
        risk.append("脚本里出现 `curl ... | bash` 模式,需要审外部下载来源")
    if re.search(r"\beval\s*\(", full_blob):
        risk.append("代码里出现 `eval()`,审是否拼接了用户输入")
    if re.search(r"(api[_-]?key|secret|token)\s*[=:]\s*['\"][A-Za-z0-9_-]{16,}", full_blob, re.IGNORECASE):
        risk.append("代码 / 文档里可能硬编码了凭证")
    if re.search(r"\b(rm\s+-rf\s+/|rm\s+-rf\s+~)", full_blob):
        risk.append("脚本含 `rm -rf /` 或 `rm -rf ~`,极高风险")

    return {
        "has_skill_md": skill_md.is_file(),
        "skill_md_relpath": str(skill_md.relative_to(base)) if skill_md.is_file() else None,
        "frontmatter": meta,
        "frontmatter_complete": bool(meta and meta.get("name") and meta.get("description")),
        "file_count": len(files),
        "size_bytes": sum(f.stat().st_size for f in files),
        "has_scripts": (base / "scripts").is_dir() and bool(_list_files(base / "scripts")),
        "has_references": (base / "references").is_dir() and bool(_list_files(base / "references")),
        "has_examples": (base / "examples").is_dir() and bool(_list_files(base / "examples")),
        "external_urls": urls,
        "security_risks": risk,
    }


# ──────────────────────────────────────────────────────────────────────────────
# LLM 调用
def _safe_json(text: str) -> dict:
    text = text.strip()
    # 剥 reasoning 模型(MiniMax-M*、DeepSeek-R1、QwQ 等)的 <think>...</think>
    text = re.sub(r"<think>.*?</think>\s*", "", text, flags=re.DOTALL | re.IGNORECASE)
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*\n", "", text)
        text = re.sub(r"\n```\s*$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        i, j = text.find("{"), text.rfind("}")
        if i != -1 and j != -1 and j > i:
            try:
                return json.loads(text[i:j+1])
            except json.JSONDecodeError:
                pass
    # 解析失败,把原文前 400 字塞进 summary 方便排查
    head = (text or "").strip()[:400]
    return {
        "score": 0, "verdict": "fail",
        "summary": f"LLM 输出无法解析为 JSON(可能被 max_tokens 截断)。原文头部:{head}",
        "dimensions": {}, "suggestions": [],
    }


def _gather_snapshot(storage_path: str, max_chars: int = 28000) -> str:
    base = skill_dir(storage_path)
    files = list_tree(storage_path)
    chunks: list[str] = []
    used = 0

    def add(label: str, body: str):
        nonlocal used
        chunk = f"\n\n===== {label} =====\n{body}"
        if used + len(chunk) > max_chars:
            allow = max(0, max_chars - used - 50)
            if allow > 200:
                chunks.append(chunk[:allow] + "\n...[truncated]")
                used = max_chars
            return False
        chunks.append(chunk)
        used += len(chunk)
        return True

    skill_md = next((f for f in files if f["path"].endswith("SKILL.md")), None) \
        or next((f for f in files if f["path"].endswith("README.md")), None)
    if skill_md:
        try:
            add(skill_md["path"], (base / skill_md["path"]).read_text(encoding="utf-8", errors="replace"))
        except Exception:
            pass

    add("FILE_TREE", "\n".join(f["path"] for f in files))

    others = [f for f in files if f["is_text"] and f["path"] != (skill_md or {}).get("path")]
    others.sort(key=lambda x: x["size"])
    for f in others:
        if used >= max_chars:
            break
        try:
            body = (base / f["path"]).read_text(encoding="utf-8", errors="replace")
        except Exception:
            continue
        if len(body) > 6000:
            body = body[:6000] + "\n...[truncated]"
        if not add(f["path"], body):
            break

    return "".join(chunks)


def _call_anthropic(prompt_user: str) -> tuple[dict, str]:
    url = settings.llm_base_url.rstrip("/") + "/v1/messages"
    headers = {
        "x-api-key": settings.llm_api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    body = {
        "model": settings.llm_model,
        "max_tokens": 8000,  # reasoning 模型 <think> 块可能吃 1500-3000,留余量给 JSON 输出
        "system": SYSTEM_PROMPT,
        "messages": [{"role": "user", "content": prompt_user}],
    }
    with httpx.Client(timeout=settings.llm_timeout) as c:
        r = c.post(url, headers=headers, json=body)
        r.raise_for_status()
        data = r.json()
    text = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text")
    return _safe_json(text), text


def _call_openai_compat(prompt_user: str) -> tuple[dict, str]:
    base = settings.llm_base_url.rstrip("/")
    if base.endswith("/chat/completions"):
        url = base
    elif base.endswith("/v1"):
        url = base + "/chat/completions"
    else:
        url = base + "/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {settings.llm_api_key}",
        "Content-Type": "application/json",
    }
    body = {
        "model": settings.llm_model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt_user + "\n\n只输出 JSON,不要 markdown 代码块。"},
        ],
        "temperature": 0.2,
        "max_tokens": 8000,  # reasoning 模型 <think> 块可能吃 1500-3000,留余量给 JSON 输出
    }
    with httpx.Client(timeout=settings.llm_timeout) as c:
        r = c.post(url, headers=headers, json=body)
        r.raise_for_status()
        data = r.json()
    text = data["choices"][0]["message"]["content"]
    return _safe_json(text), text


# ──────────────────────────────────────────────────────────────────────────────
def inspect_skill(storage_path: str, **_ignore) -> dict:
    """TRACE 5 维 LLM 评测,静态线索作为给 LLM 的辅助证据。

    返回入库 dict:
      {score, verdict, rating, stars, summary, dimensions, suggestions,
       clues, llm_model, duration_ms}
    """
    t0 = time.time()
    clues = collect_clues(storage_path)

    if not settings.llm_api_key:
        return {
            "score": 0,
            "verdict": "fail",
            "rating": "未评估",
            "stars": 0,
            "summary": "未配置 LLM API key,无法生成 TRACE 评测报告。请联系管理员配置 SKILLHUB_LLM_API_KEY。",
            "dimensions": {},
            "suggestions": [],
            "clues": clues,
            "llm_model": None,
            "duration_ms": int((time.time() - t0) * 1000),
        }

    snapshot = _gather_snapshot(storage_path)
    clues_brief = _format_clues_for_prompt(clues)
    user_prompt = f"""请按 TRACE 5 维度审阅以下 skill。

【静态线索(已自动收集,可作为评估依据)】
{clues_brief}

【skill 全文快照】(SKILL.md / 文件树 / 其他文本)
{snapshot}

请严格按 system 中定义的 JSON schema 输出。
"""

    try:
        if settings.llm_provider == "anthropic":
            parsed, _ = _call_anthropic(user_prompt)
        else:
            parsed, _ = _call_openai_compat(user_prompt)
    except httpx.HTTPError as e:
        return {
            "score": 0,
            "verdict": "fail",
            "rating": "评估失败",
            "stars": 0,
            "summary": f"LLM 调用失败: {type(e).__name__}: {e}",
            "dimensions": {},
            "suggestions": [],
            "clues": clues,
            "llm_model": settings.llm_model,
            "duration_ms": int((time.time() - t0) * 1000),
        }

    score = max(0, min(100, int(parsed.get("score") or 0)))
    verdict = parsed.get("verdict") or _verdict(score)
    dims = parsed.get("dimensions") or {}
    sugg = list(parsed.get("suggestions") or [])

    # 把安全启发(高危)以 high 严重度自动塞进 suggestions(LLM 可能漏)
    for risk in clues.get("security_risks", []):
        if not any(risk in (s.get("message") or "") for s in sugg):
            sugg.insert(0, {"severity": "high", "area": "trust", "message": risk})

    # 给每维加 label,方便前端展示
    for key in list(dims.keys()):
        if isinstance(dims[key], dict):
            dims[key]["label"] = TRACE_LABELS.get(key, key)
            dims[key]["score"] = max(0, min(20, int(dims[key].get("score") or 0)))

    return {
        "score": score,
        "verdict": verdict,
        "verdict_label": VERDICT_LABELS.get(verdict, verdict),
        "rating": VERDICT_LABELS.get(verdict, verdict),
        "stars": _stars(score),
        "summary": (parsed.get("summary") or "").strip(),
        "dimensions": dims,
        "suggestions": sugg,
        "clues": clues,
        "llm_model": settings.llm_model,
        "duration_ms": int((time.time() - t0) * 1000),
    }


def _format_clues_for_prompt(c: dict) -> str:
    lines = []
    lines.append(f"- SKILL.md 存在: {c['has_skill_md']} / frontmatter 完整: {c['frontmatter_complete']}")
    if c.get("frontmatter"):
        for k in ("name", "description", "version", "allowed-tools", "model"):
            v = c["frontmatter"].get(k)
            if v:
                v = str(v).strip()
                if len(v) > 200:
                    v = v[:200] + "..."
                lines.append(f"  · {k}: {v}")
    lines.append(f"- 文件数: {c['file_count']} / 总大小: {c['size_bytes']} bytes")
    lines.append(f"- scripts/: {c['has_scripts']} · references/: {c['has_references']} · examples/: {c['has_examples']}")
    if c.get("external_urls"):
        lines.append(f"- 外链({len(c['external_urls'])}): " + ", ".join(c["external_urls"][:8]))
    if c.get("security_risks"):
        lines.append("- 安全启发(请重点评估 Trust 维度):")
        for r in c["security_risks"]:
            lines.append(f"  ⚠ {r}")
    return "\n".join(lines)
