"""5 维静态启发式评分,纯标准库 + PyYAML。

参考 shaozhengmao/skill-quality-checker(MIT licensed)的思路重写:
  - 问题-方案匹配度(20):description 任务类型 vs 是否有 scripts/
  - 完成度        (20):YAML frontmatter / 脚本非空 / shebang & exec / 辅助目录 / TODO 检测
  - 容错性        (20):try/except 覆盖率 / shell set -e / Prompt fallback 关键词密度
  - Description 精度(20):长度 / 触发词数 / 泛化词扣分
  - Token 效率    (20):SKILL.md 大小 / 是否渐进式披露(references/templates)

总分 100,5 维 × 20。
"""
import os
import re
import stat
from pathlib import Path
from typing import Optional

import yaml


EXEC_KEYWORDS = [
    "自动化", "脚本", "执行", "运行", "部署", "扫描", "生成", "创建",
    "解析", "转换", "上传", "下载", "调用", "请求",
    "automat", "script", "execute", "run", "deploy", "scan", "generate",
    "create", "upload", "download", "install", "fetch", "post", "send",
    "convert", "extract", "build", "compile", "parse",
]

VAGUE_WORDS = [
    "所有", "任何", "任意", "一切", "全部", "通用",
    "everything", "anything", "all kinds", "any kind", "whatever", "general purpose",
]

FALLBACK_KEYWORDS = [
    "如果失败", "fallback", "降级", "备选", "出错时", "错误处理", "异常",
    "if fail", "error handling", "retry", "重试", "回退",
]

TRIGGER_HINTS = [
    "触发词", "use when", "用于", "适用于", "当用户", "when the user",
    "关键词", "trigger",
]


def get_rating(score: int) -> str:
    if score >= 90:
        return "⭐⭐⭐⭐⭐"
    if score >= 75:
        return "⭐⭐⭐⭐"
    if score >= 60:
        return "⭐⭐⭐"
    if score >= 40:
        return "⭐⭐"
    return "⭐"


# ── helpers ───────────────────────────────────────────────────────────────────

def _read_text(p: Path, limit: int = 200_000) -> str:
    try:
        return p.read_text(encoding="utf-8", errors="replace")[:limit]
    except OSError:
        return ""


def _list_files(d: Path) -> list[Path]:
    if not d.is_dir():
        return []
    return [p for p in d.rglob("*") if p.is_file()]


def _is_text(p: Path) -> bool:
    return p.suffix.lower() in {
        ".md", ".txt", ".py", ".sh", ".bash", ".js", ".ts", ".tsx", ".jsx",
        ".json", ".yaml", ".yml", ".toml", ".html", ".css",
    }


def _parse_frontmatter(text: str) -> tuple[Optional[dict], str]:
    if not text.startswith("---"):
        return None, text
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n(.*)", text, re.DOTALL)
    if not m:
        return None, text
    try:
        meta = yaml.safe_load(m.group(1)) or {}
        if not isinstance(meta, dict):
            return None, m.group(2)
        return meta, m.group(2)
    except yaml.YAMLError:
        return None, m.group(2)


def _count(pat: str, s: str, flags: int = re.IGNORECASE) -> int:
    return len(re.findall(pat, s, flags))


def _is_exec_task(desc: str) -> bool:
    low = desc.lower()
    return sum(1 for kw in EXEC_KEYWORDS if kw.lower() in low) >= 2


# ── 5 维评分 ──────────────────────────────────────────────────────────────────

def _score_matching(skill_dir: Path, meta: dict, body: str, has_scripts: bool) -> tuple[int, str]:
    desc = (meta or {}).get("description", "") or ""
    exec_task = _is_exec_task(desc)
    if has_scripts and exec_task:
        return 19, "执行类任务且配 scripts/,方案匹配"
    if not has_scripts and not exec_task:
        return 19, "指导类任务且纯 Prompt,方案匹配"
    if has_scripts and not exec_task:
        return 14, "有 scripts/ 但任务偏指导,略过度工程化"
    return 8, "执行类任务但缺 scripts/,方案不匹配"


def _score_completeness(skill_dir: Path, meta: dict, body: str, has_scripts: bool) -> tuple[int, str]:
    score = 0
    reasons = []

    if meta is not None:
        score += 5
        reasons.append("YAML frontmatter 完整")
    else:
        reasons.append("缺 YAML frontmatter")

    scripts_dir = skill_dir / "scripts"
    if has_scripts:
        files = _list_files(scripts_dir)
        non_empty = [f for f in files if f.stat().st_size > 10]
        if non_empty:
            score += 5
            reasons.append(f"{len(non_empty)} 个非空脚本")
        else:
            reasons.append("scripts/ 内文件为空")

        shebang_ok = 0
        exec_ok = 0
        for f in non_empty:
            txt = _read_text(f, 200)
            if txt.startswith("#!"):
                shebang_ok += 1
            if f.stat().st_mode & (stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH):
                exec_ok += 1
        if non_empty:
            ratio = (shebang_ok + exec_ok) / (len(non_empty) * 2)
            sub = int(5 * ratio)
            score += sub
            if sub >= 4:
                reasons.append("脚本带 shebang + 可执行权限")
            elif sub > 0:
                reasons.append("部分脚本缺 shebang / 可执行")
            else:
                reasons.append("脚本缺 shebang + 可执行")
    else:
        score += 5
        reasons.append("纯 Prompt,无需脚本")

    if (skill_dir / "references").is_dir() and _list_files(skill_dir / "references"):
        score += 3
        reasons.append("有 references/ 辅助文件")
    for sub in ("templates", "examples", "assets", "config"):
        if (skill_dir / sub).is_dir() and _list_files(skill_dir / sub):
            score += 1
            reasons.append(f"有 {sub}/ 辅助")
            break

    # 真 TODO 标记(跳过字符串、表格行、引用)
    todo_count = 0
    for f in _list_files(skill_dir):
        if not _is_text(f):
            continue
        for line in _read_text(f).splitlines():
            ln = line.strip()
            if re.search(r"['\"].*\b(TODO|FIXME)\b.*['\"]", ln):
                continue
            if ln.startswith("|") and ln.endswith("|"):
                continue
            if re.search(r"#\s*(TODO|FIXME|HACK|XXX)\b", ln, re.IGNORECASE):
                todo_count += 1
            elif re.match(r"^(TODO|FIXME|HACK|XXX)\b", ln, re.IGNORECASE):
                todo_count += 1
    if todo_count > 0:
        deduct = min(todo_count * 2, 5)
        score -= deduct
        reasons.append(f"发现 {todo_count} 个 TODO 标记(-{deduct})")

    return max(0, min(score, 20)), "; ".join(reasons)


def _score_error_handling(skill_dir: Path, meta: dict, body: str, has_scripts: bool) -> tuple[int, str]:
    if not has_scripts:
        full = (body or "") + " " + ((meta or {}).get("description") or "")
        full += "\n" + _read_text(skill_dir / "SKILL.md")
        hits = sum(1 for kw in FALLBACK_KEYWORDS if kw.lower() in full.lower())
        if hits >= 3:
            return 16, f"Prompt 中 {hits} 处容错指导"
        if hits >= 1:
            return 12, f"Prompt 中 {hits} 处容错指导,建议加多"
        return 6, "纯 Prompt 且无容错指导"

    scripts_dir = skill_dir / "scripts"
    total_funcs, total_try = 0, 0
    for f in _list_files(scripts_dir):
        text = _read_text(f)
        if f.suffix == ".py":
            total_funcs += _count(r"^\s*def\s+", text, re.MULTILINE)
            total_try += _count(r"^\s*try\s*:", text, re.MULTILINE)
            if "ImportError" in text:
                total_try += 1
        elif f.suffix in (".sh", ".bash"):
            total_funcs += max(_count(r"^\s*\w+\s*\(\)\s*\{", text, re.MULTILINE), 1)
            if "set -e" in text:
                total_try += 3
            total_try += _count(r"\|\|\s", text)
            total_try += _count(r"if\s+\[", text)

    denom = max(total_funcs, 1)
    coverage = total_try / denom
    if coverage > 0.7:
        return min(16 + int(coverage * 4), 20), f"错误处理覆盖率 {coverage:.0%}"
    if coverage > 0.3:
        return 10 + int((coverage - 0.3) / 0.4 * 5), f"错误处理覆盖率 {coverage:.0%},建议加强"
    if coverage > 0:
        return 5 + int(coverage / 0.3 * 5), f"错误处理覆盖率低 {coverage:.0%}"
    return 3, "未发现错误处理代码"


def _score_description(skill_dir: Path, meta: dict, body: str, has_scripts: bool) -> tuple[int, str]:
    if not meta:
        return 0, "无 frontmatter,无法评估"
    desc = (meta.get("description") or "").strip()
    if not desc:
        return 0, "frontmatter 没 description"
    score = 0
    reasons = []

    n = len(desc)
    if 80 <= n <= 400:
        score += 8
        reasons.append(f"长度 {n} 字,适中")
    elif 40 <= n < 80 or 400 < n <= 600:
        score += 5
        reasons.append(f"长度 {n} 字,偏短/偏长")
    else:
        score += 2
        reasons.append(f"长度 {n} 字,不合理")

    has_cn = any(0x4e00 <= ord(c) <= 0x9fff for c in desc)
    has_en = any(c.isascii() and c.isalpha() for c in desc)
    if has_cn and has_en:
        score += 3
        reasons.append("中英文触发词都有")
    elif has_cn or has_en:
        score += 2
    else:
        score += 0

    trigger_hits = sum(1 for kw in TRIGGER_HINTS if kw.lower() in desc.lower())
    if trigger_hits >= 2:
        score += 5
        reasons.append("含明确触发提示")
    elif trigger_hits == 1:
        score += 3
    else:
        score += 1
        reasons.append("缺触发提示(『触发词』『use when』等)")

    vague_hits = sum(1 for kw in VAGUE_WORDS if kw.lower() in desc.lower())
    if vague_hits == 0:
        score += 4
        reasons.append("无泛化词")
    elif vague_hits <= 1:
        score += 2
        reasons.append(f"含 {vague_hits} 个泛化词")
    else:
        reasons.append(f"含 {vague_hits} 个泛化词(高风险触发面太广)")

    return min(score, 20), "; ".join(reasons)


def _score_efficiency(skill_dir: Path, meta: dict, body: str, has_scripts: bool) -> tuple[int, str]:
    skill_md = skill_dir / "SKILL.md"
    if not skill_md.is_file():
        # 任意层级找
        candidates = list(skill_dir.rglob("SKILL.md"))
        skill_md = candidates[0] if candidates else None
    score = 0
    reasons = []

    if skill_md and skill_md.is_file():
        size_kb = skill_md.stat().st_size / 1024
        if size_kb <= 5:
            score += 10
            reasons.append(f"SKILL.md {size_kb:.1f}KB,精简")
        elif size_kb <= 10:
            score += 7
            reasons.append(f"SKILL.md {size_kb:.1f}KB,正常")
        elif size_kb <= 20:
            score += 4
            reasons.append(f"SKILL.md {size_kb:.1f}KB,偏大")
        else:
            score += 1
            reasons.append(f"SKILL.md {size_kb:.1f}KB,过大(考虑外移)")
    else:
        reasons.append("缺 SKILL.md")

    # 渐进式披露:把详细资料放在 references/templates/ 而不是堆 SKILL.md
    has_progressive = False
    for sub in ("references", "templates", "examples"):
        if (skill_dir / sub).is_dir() and _list_files(skill_dir / sub):
            has_progressive = True
            break
    if has_progressive:
        score += 6
        reasons.append("有渐进式披露(references/ 或 templates/)")
    else:
        score += 2
        reasons.append("无外部资料目录")

    # 总包大小预算
    total = sum(f.stat().st_size for f in _list_files(skill_dir))
    total_kb = total / 1024
    if total_kb <= 50:
        score += 4
        reasons.append(f"总大小 {total_kb:.1f}KB,健康")
    elif total_kb <= 200:
        score += 2
        reasons.append(f"总大小 {total_kb:.1f}KB,可接受")
    else:
        reasons.append(f"总大小 {total_kb:.1f}KB,偏臃肿")

    return min(score, 20), "; ".join(reasons)


# ── 入口 ──────────────────────────────────────────────────────────────────────

DIM_LABELS = {
    "matching":    "问题-方案匹配度",
    "completeness":"完成度",
    "error_handling": "容错性",
    "description": "Description 精度",
    "efficiency":  "Token 效率",
}


def score_skill(skill_dir: str | Path) -> dict:
    """返回 {score, verdict, rating, summary, dimensions, suggestions}。"""
    skill_dir = Path(skill_dir)

    # 找 SKILL.md(顶层优先)
    skill_md = skill_dir / "SKILL.md"
    if not skill_md.is_file():
        found = list(skill_dir.rglob("SKILL.md"))
        if found:
            skill_md = found[0]

    text = _read_text(skill_md) if skill_md.is_file() else ""
    meta, body = _parse_frontmatter(text) if text else (None, "")

    has_scripts = (skill_dir / "scripts").is_dir() and bool(_list_files(skill_dir / "scripts"))

    dims = {
        "matching":       _score_matching(skill_dir, meta, body, has_scripts),
        "completeness":   _score_completeness(skill_dir, meta, body, has_scripts),
        "error_handling": _score_error_handling(skill_dir, meta, body, has_scripts),
        "description":    _score_description(skill_dir, meta, body, has_scripts),
        "efficiency":     _score_efficiency(skill_dir, meta, body, has_scripts),
    }
    total = sum(s for s, _ in dims.values())

    suggestions = []
    for key, (sc, comment) in dims.items():
        if sc < 12:
            suggestions.append({
                "severity": "high" if sc < 8 else "medium",
                "area": key,
                "message": f"[{DIM_LABELS[key]} {sc}/20] {comment}",
            })

    return {
        "score": total,
        "verdict": _verdict(total),
        "rating": get_rating(total),
        "summary": f"{DIM_LABELS['matching']} {dims['matching'][0]} / {DIM_LABELS['completeness']} {dims['completeness'][0]} / "
                   f"{DIM_LABELS['error_handling']} {dims['error_handling'][0]} / "
                   f"{DIM_LABELS['description']} {dims['description'][0]} / {DIM_LABELS['efficiency']} {dims['efficiency'][0]}",
        "dimensions": {
            key: {"score": sc, "comments": cm, "label": DIM_LABELS[key]}
            for key, (sc, cm) in dims.items()
        },
        "suggestions": suggestions,
    }


def _verdict(score: int) -> str:
    if score >= 90: return "excellent"
    if score >= 75: return "good"
    if score >= 60: return "pass"
    if score >= 40: return "needs_work"
    return "fail"
