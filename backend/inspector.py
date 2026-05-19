"""Skill 质检:静态规则 + LLM 评分。"""
import json
import re
import time
from pathlib import Path
from typing import Optional

import httpx
import yaml

from config import settings
from storage import skill_dir, list_tree


SYSTEM_PROMPT = """你是一个 Claude Code Skill 的资深审稿人。你的任务是审一份用户提交的 skill 包,
按以下 4 个维度各打 0-25 分(总分 0-100),并给出具体改进建议。

【格式合规 0-25】
- 是否有 SKILL.md;frontmatter 是否完整(name / description / 可选 allowed-tools / model)
- 文件结构是否干净(没有 .DS_Store / __MACOSX / 大体积无关物)
- 文件命名是否一致、避免 typo

【触发清晰 0-25】
- description 是否明确"何时该用这个 skill"
- 是否包含关键触发词、目标场景、能力边界
- 用户读完是否能立刻判断这个 skill 是不是自己要的

【内容质量 0-25】
- 步骤是否具体可执行(不是空话 / 套话)
- 是否包含示例 / 反例 / 边界 case
- 是否对 LLM 友好(分点 / 短句 / 明确命令式语气)

【结构组织 0-25】
- 文件层级是否合理;辅助资料(scripts / references / examples)是否归位
- 是否有冗余 / 死链 / 自相矛盾
- 整包是否"开箱即用"

输出严格 JSON,不要加 markdown 代码块标记:
{
  "score": 87,
  "verdict": "good",
  "summary": "整体一段话",
  "dimensions": {
    "format":     {"score": 22, "comments": "..."},
    "trigger":    {"score": 20, "comments": "..."},
    "content":    {"score": 24, "comments": "..."},
    "structure":  {"score": 21, "comments": "..."}
  },
  "suggestions": [
    {"severity": "high|medium|low", "area": "trigger|format|content|structure", "message": "具体怎么改"}
  ]
}

verdict 映射:
  90+ excellent / 75-89 good / 60-74 pass / 40-59 needs_work / <40 fail
"""


def _verdict(score: int) -> str:
    if score >= 90:
        return "excellent"
    if score >= 75:
        return "good"
    if score >= 60:
        return "pass"
    if score >= 40:
        return "needs_work"
    return "fail"


def static_check(storage_path: str) -> dict:
    """轻量静态检查 → 一组 issues + format 维度初始分。"""
    base = skill_dir(storage_path)
    issues = []
    score = 25

    # SKILL.md 存在性
    skill_md = base / "SKILL.md"
    if not skill_md.is_file():
        # 任意层级找一下
        found = list(base.rglob("SKILL.md"))
        if not found:
            issues.append({"severity": "high", "area": "format", "message": "缺 SKILL.md(可放 README.md 兜底但不推荐)"})
            score -= 15
        else:
            issues.append({"severity": "medium", "area": "format", "message": f"SKILL.md 不在顶层而在 {found[0].relative_to(base)}"})
            score -= 5
            skill_md = found[0]

    # frontmatter
    if skill_md.is_file():
        text = skill_md.read_text(encoding="utf-8", errors="replace")
        m = re.match(r"^---\s*\n(.*?)\n---\s*\n", text, re.DOTALL)
        if not m:
            issues.append({"severity": "high", "area": "format", "message": "SKILL.md 没有 frontmatter(--- name/description ---)"})
            score -= 10
        else:
            try:
                meta = yaml.safe_load(m.group(1)) or {}
                if not isinstance(meta, dict):
                    raise ValueError
                if not meta.get("name"):
                    issues.append({"severity": "high", "area": "format", "message": "frontmatter 缺 name"})
                    score -= 5
                if not meta.get("description"):
                    issues.append({"severity": "high", "area": "format", "message": "frontmatter 缺 description"})
                    score -= 5
                if meta.get("description") and len(str(meta["description"])) < 30:
                    issues.append({"severity": "medium", "area": "trigger", "message": "description 过短(<30 字),触发判定容易模糊"})
            except (yaml.YAMLError, ValueError):
                issues.append({"severity": "high", "area": "format", "message": "frontmatter YAML 不合法"})
                score -= 8

    # 大小 / 文件数
    files = list_tree(storage_path)
    if not files:
        issues.append({"severity": "high", "area": "format", "message": "包内没有文件"})
        score = 0
    if len(files) > 100:
        issues.append({"severity": "medium", "area": "structure", "message": f"文件数较多 ({len(files)}),考虑精简或合并辅助资源"})

    # 噪声文件
    noise = [f for f in files if f["path"].endswith((".DS_Store", "Thumbs.db")) or "__MACOSX" in f["path"]]
    if noise:
        issues.append({"severity": "low", "area": "format", "message": f"含 {len(noise)} 个系统噪声文件 (.DS_Store / __MACOSX)"})

    return {
        "format_seed_score": max(0, min(25, score)),
        "static_issues": issues,
        "skill_md_relpath": str(skill_md.relative_to(base)) if skill_md.is_file() else None,
    }


def _gather_skill_snapshot(storage_path: str, max_chars: int = 28000) -> str:
    """收集要给 LLM 看的内容:SKILL.md 全文 + 其他文本文件预览(截断)。"""
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

    # 1) SKILL.md 优先全文
    skill_md = next((f for f in files if f["path"].endswith("SKILL.md")), None) \
        or next((f for f in files if f["path"].endswith("README.md")), None)
    if skill_md:
        p = base / skill_md["path"]
        try:
            add(skill_md["path"], p.read_text(encoding="utf-8", errors="replace"))
        except Exception:
            pass

    # 2) 文件树
    tree_lines = [f["path"] for f in files]
    add("FILE_TREE", "\n".join(tree_lines))

    # 3) 其他文本文件,按大小升序
    others = [f for f in files if f["is_text"] and f["path"] != (skill_md or {}).get("path")]
    others.sort(key=lambda x: x["size"])
    for f in others:
        if used >= max_chars:
            break
        try:
            body = (base / f["path"]).read_text(encoding="utf-8", errors="replace")
        except Exception:
            continue
        # 单文件最多 6000 字符
        if len(body) > 6000:
            body = body[:6000] + "\n...[truncated]"
        ok = add(f["path"], body)
        if not ok:
            break

    return "".join(chunks)


def _call_anthropic(prompt_user: str) -> tuple[dict, str]:
    """返回 (parsed_json, raw_text)。"""
    url = settings.llm_base_url.rstrip("/") + "/v1/messages"
    headers = {
        "x-api-key": settings.llm_api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    body = {
        "model": settings.llm_model,
        "max_tokens": 2000,
        "system": SYSTEM_PROMPT,
        "messages": [{"role": "user", "content": prompt_user}],
    }
    with httpx.Client(timeout=settings.llm_timeout) as c:
        r = c.post(url, headers=headers, json=body)
        r.raise_for_status()
        data = r.json()
    text = "".join(blk.get("text", "") for blk in data.get("content", []) if blk.get("type") == "text")
    return _safe_json(text), text


def _call_openai_compat(prompt_user: str) -> tuple[dict, str]:
    # base_url 兼容:
    #   1) https://api.x.com                         → append /v1/chat/completions
    #   2) https://api.x.com/v1                      → append /chat/completions
    #   3) https://api.x.com/v1/chat/completions     → 原样用
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
            {"role": "user", "content": prompt_user + "\n\n请只输出 JSON,不要 markdown 代码块标记。"},
        ],
        "temperature": 0.2,
        "max_tokens": 2000,
    }
    with httpx.Client(timeout=settings.llm_timeout) as c:
        r = c.post(url, headers=headers, json=body)
        r.raise_for_status()
        data = r.json()
    text = data["choices"][0]["message"]["content"]
    return _safe_json(text), text


def _safe_json(text: str) -> dict:
    text = text.strip()
    # 剥 reasoning 模型(MiniMax-M*、DeepSeek-R1、QwQ 等)的 <think>...</think> 块
    text = re.sub(r"<think>.*?</think>\s*", "", text, flags=re.DOTALL | re.IGNORECASE)
    text = text.strip()
    # 剥 markdown 代码块
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*\n", "", text)
        text = re.sub(r"\n```\s*$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # 找第一个 { 到最后一个 }
        i, j = text.find("{"), text.rfind("}")
        if i != -1 and j != -1 and j > i:
            try:
                return json.loads(text[i:j+1])
            except json.JSONDecodeError:
                pass
    return {"score": 0, "verdict": "fail", "summary": "LLM 输出无法解析为 JSON", "dimensions": {}, "suggestions": []}


def inspect_static(storage_path: str) -> dict:
    """5 维静态启发式评分(参考 shaozhengmao/skill-quality-checker 思路重写)。"""
    from static_scorer import score_skill  # 延迟导入,避免 LLM-only 场景拉依赖

    t0 = time.time()
    base = skill_dir(storage_path)
    r = score_skill(base)
    return {
        "mode": "static",
        "score": r["score"],
        "verdict": r["verdict"],
        "rating": r["rating"],
        "summary": r["summary"],
        "dimensions": r["dimensions"],
        "suggestions": r["suggestions"],
        "llm_model": None,
        "duration_ms": int((time.time() - t0) * 1000),
    }


def inspect_llm(storage_path: str) -> dict:
    """LLM 4 维上下文评分(原有逻辑)。"""
    t0 = time.time()
    static = static_check(storage_path)

    if not settings.llm_api_key:
        return {
            "mode": "llm",
            "score": 0,
            "verdict": "fail",
            "summary": "未配 LLM key,跳过 LLM 评分。管理员配 SKILLHUB_LLM_API_KEY 后可开启。",
            "dimensions": {},
            "suggestions": [],
            "llm_model": None,
            "duration_ms": int((time.time() - t0) * 1000),
        }

    snapshot = _gather_skill_snapshot(storage_path)
    static_brief = "\n".join(f"- [{i['severity']}] {i['area']}: {i['message']}" for i in static["static_issues"]) or "(无)"
    user_prompt = f"""请审阅以下 skill 包。

【静态预检 issues】
{static_brief}

【skill 内容快照】(SKILL.md 全文 + 文件树 + 其他文本文件预览)
{snapshot}

请严格按上面定义的 JSON schema 返回评分。"""

    try:
        if settings.llm_provider == "anthropic":
            parsed, _ = _call_anthropic(user_prompt)
        else:
            parsed, _ = _call_openai_compat(user_prompt)
    except httpx.HTTPError as e:
        return {
            "mode": "llm",
            "score": 0,
            "verdict": "fail",
            "summary": f"LLM 调用失败: {type(e).__name__}: {e}",
            "dimensions": {},
            "suggestions": static["static_issues"],
            "llm_model": settings.llm_model,
            "duration_ms": int((time.time() - t0) * 1000),
        }

    score = max(0, min(100, int(parsed.get("score") or 0)))
    return {
        "mode": "llm",
        "score": score,
        "verdict": parsed.get("verdict") or _verdict(score),
        "summary": parsed.get("summary") or "",
        "dimensions": parsed.get("dimensions") or {},
        "suggestions": list(parsed.get("suggestions") or []),
        "llm_model": settings.llm_model,
        "duration_ms": int((time.time() - t0) * 1000),
    }


def inspect_skill(storage_path: str, mode: str = "both") -> dict:
    """mode: 'static' | 'llm' | 'both'。both 返回两份独立报告 + 综合分(均值)。"""
    if mode == "static":
        return inspect_static(storage_path)
    if mode == "llm":
        return inspect_llm(storage_path)

    # both
    static_r = inspect_static(storage_path)
    llm_r = inspect_llm(storage_path)

    if llm_r["score"] > 0:
        # 综合分:静态 40% + LLM 60%(LLM 更能识别内容质量,权重高一点)
        combined = round(static_r["score"] * 0.4 + llm_r["score"] * 0.6)
    else:
        combined = static_r["score"]

    return {
        "mode": "both",
        "score": combined,
        "verdict": _verdict(combined),
        "summary": f"静态分 {static_r['score']} / LLM 分 {llm_r['score']} → 综合 {combined}",
        "static": static_r,
        "llm": llm_r,
        "dimensions": {},   # 留空;两份报告分别看
        "suggestions": [],  # 同上
        "llm_model": llm_r.get("llm_model"),
        "duration_ms": (static_r["duration_ms"] or 0) + (llm_r["duration_ms"] or 0),
    }
