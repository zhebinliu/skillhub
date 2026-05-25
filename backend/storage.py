"""Skill 文件存储 + 解包 + 文件树构造。"""
import io
import os
import re
import shutil
import tarfile
import uuid
import zipfile
from pathlib import Path
from typing import Optional

import yaml

from config import settings


STORAGE_ROOT = Path(settings.storage_root)

# 拒绝的文件名 / 扩展(防偷渡)
DENY_FILENAMES = {".env", "id_rsa", "id_dsa", ".git"}
DENY_EXT = {".exe", ".dll", ".so", ".dylib", ".bin"}

# 文本预览 mime 启发式
TEXT_EXTS = {
    ".md", ".txt", ".markdown", ".rst", ".json", ".yaml", ".yml", ".toml",
    ".py", ".js", ".jsx", ".ts", ".tsx", ".sh", ".bash", ".zsh",
    ".html", ".css", ".scss", ".sass", ".xml", ".csv", ".sql",
    ".go", ".rs", ".rb", ".php", ".java", ".kt", ".c", ".cc", ".cpp", ".h", ".hpp",
    ".swift", ".m", ".mm", ".lua", ".pl", ".r", ".jl",
    ".gitignore", ".dockerignore", ".editorconfig",
    ".conf", ".cfg", ".ini", ".env.example", ".lock",
}


class UploadError(Exception):
    pass


def skill_dir(storage_path: str) -> Path:
    return STORAGE_ROOT / storage_path


def new_storage_path() -> str:
    return uuid.uuid4().hex


def _decode_tar_name(name: str) -> str:
    """tar 文件名编码修复(对应 surrogateescape encoded bytes)。"""
    try:
        raw = name.encode("utf-8", errors="surrogateescape")
    except UnicodeEncodeError:
        return name
    # 已经是合法 UTF-8 就直接返回
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        pass
    for enc in ("gbk", "gb18030", "big5", "shift_jis"):
        try:
            decoded = raw.decode(enc)
            if "�" not in decoded:
                return decoded
        except UnicodeDecodeError:
            continue
    return name


def _decode_zip_filename(member: "zipfile.ZipInfo") -> str:
    """zip member 的 filename 编码修复。

    zip 规范:flag_bits 第 11 位(0x800)= 1 表示 UTF-8;否则历史上是 CP437,
    但中文 Windows / Mac 用的中文 zip 工具(WinRAR / 7z / Mac 自带归档)默认用
    本地编码(GBK / CP936 / GB18030)而不会设 UTF-8 flag。

    Python zipfile 拿到无 flag 的 filename 时,会先用 CP437 解出来一串"乱码"。
    我们把它 encode 回 bytes,再依次试 utf-8 / gbk / gb18030 / big5 解码。
    """
    name = member.filename
    if member.flag_bits & 0x800:
        return name  # 已经是 UTF-8
    try:
        raw = name.encode("cp437")
    except UnicodeEncodeError:
        return name
    for enc in ("utf-8", "gbk", "gb18030", "big5", "shift_jis"):
        try:
            decoded = raw.decode(enc)
            # 多重判断:解码出来不能再有"明显是另一种乱码"的字符
            if "�" not in decoded:
                return decoded
        except UnicodeDecodeError:
            continue
    return name  # 实在猜不出来,沿用 cp437 解的结果


def _safe_member_path(base: Path, member_name: str) -> Optional[Path]:
    """归一化压缩包成员路径,拦截 zip-slip。"""
    # 干掉 macOS 元数据 / 隐藏特殊目录
    parts = [p for p in member_name.replace("\\", "/").split("/") if p and p != "."]
    if not parts or any(p == ".." for p in parts):
        return None
    if any(p.startswith("__MACOSX") or p == ".DS_Store" for p in parts):
        return None
    name = parts[-1]
    if name in DENY_FILENAMES or any(name.endswith(ext) for ext in DENY_EXT):
        return None
    out = base.joinpath(*parts).resolve()
    try:
        out.relative_to(base.resolve())
    except ValueError:
        return None
    return out


def _strip_single_top(files: list[Path], base: Path) -> None:
    """如果解压后只有一个顶层目录,把它内部内容上提一层(常见 zip 习惯)。"""
    tops = {p.relative_to(base).parts[0] for p in files if p != base}
    if len(tops) != 1:
        return
    top = list(tops)[0]
    top_dir = base / top
    if not top_dir.is_dir():
        return
    for child in list(top_dir.iterdir()):
        target = base / child.name
        if target.exists():
            return  # 撞名就放弃
        shutil.move(str(child), str(target))
    try:
        top_dir.rmdir()
    except OSError:
        pass


def extract_zip(data: bytes, storage_path: str) -> dict:
    base = skill_dir(storage_path)
    base.mkdir(parents=True, exist_ok=True)
    extracted: list[Path] = []
    total_size = 0
    max_bytes = settings.max_skill_size_mb * 1024 * 1024

    try:
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            for member in zf.infolist():
                if member.is_dir():
                    continue
                # 修中文 zip 文件名乱码(WinRAR/7z/Mac 归档默认 GBK,不设 UTF-8 flag)
                decoded_name = _decode_zip_filename(member)
                if len(extracted) >= settings.max_file_count:
                    raise UploadError(f"文件数超过上限 {settings.max_file_count}")
                target = _safe_member_path(base, decoded_name)
                if target is None:
                    continue  # 跳过非法/系统文件
                if member.file_size > max_bytes:
                    raise UploadError(f"单文件 {decoded_name} 超过 {settings.max_skill_size_mb}MB")
                total_size += member.file_size
                if total_size > max_bytes:
                    raise UploadError(f"skill 总大小超过 {settings.max_skill_size_mb}MB")
                target.parent.mkdir(parents=True, exist_ok=True)
                # zf.open(member) 用 member 的内部偏移读取数据,跟 filename 字符串无关 → 安全
                with zf.open(member) as src, open(target, "wb") as dst:
                    shutil.copyfileobj(src, dst)
                extracted.append(target)
    except zipfile.BadZipFile:
        raise UploadError("不是合法的 zip 文件")

    _strip_single_top(extracted, base)

    return _summarize(base)


def extract_tar(data: bytes, storage_path: str) -> dict:
    base = skill_dir(storage_path)
    base.mkdir(parents=True, exist_ok=True)
    extracted: list[Path] = []
    total_size = 0
    max_bytes = settings.max_skill_size_mb * 1024 * 1024

    try:
        # encoding="utf-8" + errors="surrogateescape" 让 tarfile 把非 UTF-8 字节
        # 保留为 surrogate,后面在 _decode_tar_name 里反向修复
        with tarfile.open(fileobj=io.BytesIO(data), mode="r:*",
                          encoding="utf-8", errors="surrogateescape") as tf:
            for member in tf.getmembers():
                if not member.isfile():
                    continue
                if len(extracted) >= settings.max_file_count:
                    raise UploadError(f"文件数超过上限 {settings.max_file_count}")
                decoded_name = _decode_tar_name(member.name)
                target = _safe_member_path(base, decoded_name)
                if target is None:
                    continue
                if member.size > max_bytes:
                    raise UploadError(f"单文件 {member.name} 超过 {settings.max_skill_size_mb}MB")
                total_size += member.size
                if total_size > max_bytes:
                    raise UploadError(f"skill 总大小超过 {settings.max_skill_size_mb}MB")
                target.parent.mkdir(parents=True, exist_ok=True)
                f = tf.extractfile(member)
                if f is None:
                    continue
                with open(target, "wb") as dst:
                    shutil.copyfileobj(f, dst)
                extracted.append(target)
    except tarfile.TarError as e:
        raise UploadError(f"不是合法的 tar 文件: {e}")

    _strip_single_top(extracted, base)
    return _summarize(base)


def write_files(files: list[tuple[str, bytes]], storage_path: str) -> dict:
    """多文件接口(webkitdirectory 上传)。files: [(relative_path, content_bytes), ...]"""
    base = skill_dir(storage_path)
    base.mkdir(parents=True, exist_ok=True)
    if len(files) > settings.max_file_count:
        raise UploadError(f"文件数超过上限 {settings.max_file_count}")
    total_size = 0
    max_bytes = settings.max_skill_size_mb * 1024 * 1024
    written: list[Path] = []

    for rel_path, content in files:
        target = _safe_member_path(base, rel_path)
        if target is None:
            continue
        sz = len(content)
        if sz > max_bytes:
            raise UploadError(f"单文件 {rel_path} 超过 {settings.max_skill_size_mb}MB")
        total_size += sz
        if total_size > max_bytes:
            raise UploadError(f"skill 总大小超过 {settings.max_skill_size_mb}MB")
        target.parent.mkdir(parents=True, exist_ok=True)
        with open(target, "wb") as f:
            f.write(content)
        written.append(target)

    _strip_single_top(written, base)
    return _summarize(base)


def _summarize(base: Path) -> dict:
    """统计 + 找 SKILL.md + 解 frontmatter。"""
    files: list[Path] = []
    total = 0
    for p in base.rglob("*"):
        if p.is_file():
            files.append(p)
            total += p.stat().st_size

    if not files:
        raise UploadError("压缩包内没有可用文件")

    skill_md = _find_skill_md(base, files)

    name = None
    description = None
    version = None
    display_name = None
    if skill_md:
        meta = _parse_frontmatter(skill_md)
        name = meta.get("name") or None
        description = meta.get("description") or None
        version = str(meta.get("version")) if meta.get("version") else None
        # 多个字段名都接受作为「显示名」:display_name / title / chinese_name / cn_name
        for k in ("display_name", "title", "chinese_name", "cn_name"):
            v = meta.get(k)
            if v:
                display_name = str(v).strip()
                break

    rel_entry = str(skill_md.relative_to(base)) if skill_md else None
    return {
        "file_count": len(files),
        "size_bytes": total,
        "entry_file": rel_entry,
        "name": name,
        "display_name": display_name,
        "description": description,
        "version": version,
    }


def _find_skill_md(base: Path, files: list[Path]) -> Optional[Path]:
    """优先取 base/SKILL.md;退一步任意层级 SKILL.md;再退 README.md。"""
    primary = base / "SKILL.md"
    if primary.is_file():
        return primary
    for f in files:
        if f.name == "SKILL.md":
            return f
    readme = base / "README.md"
    if readme.is_file():
        return readme
    for f in files:
        if f.name == "README.md":
            return f
    return None


_FM_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)


def _parse_frontmatter(p: Path) -> dict:
    try:
        text = p.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return {}
    m = _FM_RE.match(text)
    if not m:
        return {}
    try:
        data = yaml.safe_load(m.group(1)) or {}
        return data if isinstance(data, dict) else {}
    except yaml.YAMLError:
        return {}


def list_tree(storage_path: str) -> list[dict]:
    """返回扁平化文件列表 [{path, size, is_text}, ...] 排序后。"""
    base = skill_dir(storage_path)
    out = []
    if not base.exists():
        return out
    for p in sorted(base.rglob("*")):
        if p.is_file():
            rel = str(p.relative_to(base))
            out.append({
                "path": rel,
                "size": p.stat().st_size,
                "is_text": _is_text_file(p),
            })
    return out


def _is_text_file(p: Path) -> bool:
    name = p.name.lower()
    if name in {"skill.md", "readme.md", "license", "license.md", "license.txt", "makefile", "dockerfile"}:
        return True
    ext = p.suffix.lower()
    if not ext:
        return True  # 无扩展按文本试
    return ext in TEXT_EXTS


def read_file(storage_path: str, rel_path: str) -> tuple[Optional[str], bytes, bool, bool, int]:
    """返回 (text_or_none, raw_bytes, is_text, truncated, full_size)。

    超过 max_text_preview_kb 时:文本文件截前 max_bytes,truncated=True;
    binary 文件直接返回前 max_bytes(界面会显示 binary 不预览)。
    路径越界或不存在 → FileNotFoundError。
    """
    base = skill_dir(storage_path).resolve()
    target = (base / rel_path).resolve()
    try:
        target.relative_to(base)
    except ValueError:
        raise FileNotFoundError(rel_path)
    if not target.is_file():
        raise FileNotFoundError(rel_path)
    full_size = target.stat().st_size
    max_bytes = settings.max_text_preview_kb * 1024
    truncated = full_size > max_bytes
    with open(target, "rb") as f:
        data = f.read(max_bytes if truncated else full_size)
    if _is_text_file(target):
        try:
            return data.decode("utf-8"), data, True, truncated, full_size
        except UnicodeDecodeError:
            try:
                return data.decode("utf-8", errors="replace"), data, True, truncated, full_size
            except Exception:
                return None, data, False, truncated, full_size
    return None, data, False, truncated, full_size


def remove_skill(storage_path: str) -> None:
    base = skill_dir(storage_path)
    if base.exists():
        shutil.rmtree(base, ignore_errors=True)


def slugify(name: str) -> str:
    name = (name or "").strip().lower()
    name = re.sub(r"[^a-z0-9一-鿿]+", "-", name)
    name = re.sub(r"-+", "-", name).strip("-")
    return name or uuid.uuid4().hex[:8]
