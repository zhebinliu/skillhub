"""Skill Hub backend entry."""
import asyncio
import base64
import logging
import mimetypes
import secrets
import string
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Annotated, Optional

from fastapi import (
    Depends, FastAPI, File, Form, HTTPException, Query, UploadFile, status,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import (
    create_token, get_current_user, get_optional_user, hash_password,
    require_admin, verify_password,
)
from config import settings
from db import Base, SessionLocal, engine, get_session
from inspector import inspect_skill
from models import InviteCode, QualityReport, Skill, User
from storage import (
    UploadError, extract_tar, extract_zip, list_tree, new_storage_path,
    read_file, remove_skill, slugify, write_files,
)


logger = logging.getLogger("skillhub")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")


# ── lifespan: create tables + bootstrap admin ─────────────────────────────────
async def _bootstrap() -> None:
    async with SessionLocal() as db:
        admin = (await db.execute(select(User).where(User.is_admin == True))).scalars().first()
        if admin:
            return
        u = User(
            email=settings.bootstrap_admin_email,
            username=settings.bootstrap_admin_username,
            password_hash=hash_password(settings.bootstrap_admin_password),
            display_name="Admin",
            is_admin=True,
            is_active=True,
        )
        db.add(u)
        await db.flush()
        code = InviteCode(
            code="WELCOME-" + _rand(8).upper(),
            created_by=u.id,
            note="首次部署生成",
        )
        db.add(code)
        await db.commit()
        logger.warning("初始 admin 已创建: %s / %s", settings.bootstrap_admin_email, settings.bootstrap_admin_password)
        logger.warning("初始邀请码: %s", code.code)


def _rand(n: int) -> str:
    alphabet = string.ascii_lowercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(n))


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # 老库追加新列
        for stmt in (
            "ALTER TABLE quality_reports ADD COLUMN IF NOT EXISTS mode VARCHAR(16) NOT NULL DEFAULT 'both'",
            "ALTER TABLE quality_reports ADD COLUMN IF NOT EXISTS static_payload JSONB",
            "ALTER TABLE quality_reports ADD COLUMN IF NOT EXISTS llm_payload JSONB",
            "CREATE INDEX IF NOT EXISTS ix_quality_reports_mode ON quality_reports (mode)",
            "ALTER TABLE skills ADD COLUMN IF NOT EXISTS inspecting_started_at TIMESTAMP",
        ):
            await conn.exec_driver_sql(stmt)
    try:
        await _bootstrap()
    except Exception:
        logger.exception("bootstrap 失败")
    yield


app = FastAPI(title="Skill Hub", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://skillhub.tokenwave.cloud",
        "http://localhost:5174",
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(UploadError)
async def _upload_err(_, exc: UploadError):
    return JSONResponse({"detail": str(exc)}, status_code=400)


# ── DTOs ──────────────────────────────────────────────────────────────────────
class RegisterIn(BaseModel):
    email: EmailStr
    username: str = Field(min_length=2, max_length=64)
    password: str = Field(min_length=6, max_length=128)
    invite_code: str
    display_name: Optional[str] = None


class LoginIn(BaseModel):
    identifier: str  # email or username
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


class UserOut(BaseModel):
    id: str
    email: str
    username: str
    display_name: Optional[str]
    is_admin: bool


def _user_dict(u: User) -> dict:
    return {
        "id": str(u.id),
        "email": u.email,
        "username": u.username,
        "display_name": u.display_name,
        "is_admin": u.is_admin,
    }


def _skill_dict(s: Skill, owner: Optional[User] = None) -> dict:
    return {
        "id": str(s.id),
        "owner_id": str(s.owner_id),
        "owner_username": owner.username if owner else None,
        "owner_display_name": owner.display_name if owner else None,
        "slug": s.slug,
        "name": s.name,
        "description": s.description,
        "version": s.version,
        "tags": s.tags or [],
        "entry_file": s.entry_file,
        "size_bytes": s.size_bytes,
        "file_count": s.file_count,
        "is_published": s.is_published,
        "published_at": s.published_at.isoformat() if s.published_at else None,
        "latest_score": s.latest_score,
        "latest_verdict": s.latest_verdict,
        "inspecting": s.inspecting_started_at is not None,
        "inspecting_started_at": s.inspecting_started_at.isoformat() if s.inspecting_started_at else None,
        "view_count": s.view_count,
        "created_at": s.created_at.isoformat(),
        "updated_at": s.updated_at.isoformat(),
    }


# ── health ────────────────────────────────────────────────────────────────────
@app.get("/api/health")
async def health():
    return {"ok": True}


# ── auth ──────────────────────────────────────────────────────────────────────
@app.post("/api/auth/register", response_model=TokenOut)
async def register(body: RegisterIn, db: Annotated[AsyncSession, Depends(get_session)]):
    invite = (await db.execute(select(InviteCode).where(InviteCode.code == body.invite_code.strip()))).scalar_one_or_none()
    if not invite:
        raise HTTPException(400, "邀请码无效")
    if invite.used_by is not None:
        raise HTTPException(400, "邀请码已被使用")
    if invite.expires_at and invite.expires_at < datetime.utcnow():
        raise HTTPException(400, "邀请码已过期")

    dup = (await db.execute(
        select(User).where(or_(User.email == body.email, User.username == body.username))
    )).scalar_one_or_none()
    if dup:
        raise HTTPException(400, "邮箱或用户名已被注册")

    u = User(
        email=str(body.email),
        username=body.username,
        password_hash=hash_password(body.password),
        display_name=body.display_name or body.username,
        is_admin=invite.grants_admin,
    )
    db.add(u)
    await db.flush()
    invite.used_by = u.id
    invite.used_at = datetime.utcnow()
    await db.commit()
    await db.refresh(u)

    return TokenOut(access_token=create_token(u.id, is_admin=u.is_admin), user=_user_dict(u))


@app.post("/api/auth/login", response_model=TokenOut)
async def login(body: LoginIn, db: Annotated[AsyncSession, Depends(get_session)]):
    ident = body.identifier.strip()
    u = (await db.execute(
        select(User).where(or_(User.email == ident, User.username == ident))
    )).scalar_one_or_none()
    if not u or not verify_password(body.password, u.password_hash):
        raise HTTPException(401, "账号或密码错误")
    if not u.is_active:
        raise HTTPException(403, "账号已停用")
    return TokenOut(access_token=create_token(u.id, is_admin=u.is_admin), user=_user_dict(u))


@app.get("/api/auth/me", response_model=UserOut)
async def me(user: Annotated[User, Depends(get_current_user)]):
    return UserOut(**_user_dict(user))


# ── skills: 列表 / 详情 / 文件 ────────────────────────────────────────────────
@app.get("/api/skills")
async def list_published(
    db: Annotated[AsyncSession, Depends(get_session)],
    q: Optional[str] = None,
    sort: str = Query("recent", pattern="^(recent|score|popular)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(24, ge=1, le=100),
):
    stmt = select(Skill).where(Skill.is_published == True)
    if q:
        pat = f"%{q.strip()}%"
        stmt = stmt.where(or_(Skill.name.ilike(pat), Skill.description.ilike(pat), Skill.slug.ilike(pat)))
    if sort == "score":
        stmt = stmt.order_by(desc(Skill.latest_score.is_(None)), desc(Skill.latest_score), desc(Skill.published_at))
    elif sort == "popular":
        stmt = stmt.order_by(desc(Skill.view_count), desc(Skill.published_at))
    else:
        stmt = stmt.order_by(desc(Skill.published_at), desc(Skill.created_at))
    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    rows = (await db.execute(stmt)).scalars().all()
    owner_ids = list({r.owner_id for r in rows})
    owners = {}
    if owner_ids:
        for u in (await db.execute(select(User).where(User.id.in_(owner_ids)))).scalars():
            owners[u.id] = u
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [_skill_dict(s, owners.get(s.owner_id)) for s in rows],
    }


@app.get("/api/skills/mine")
async def list_mine(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_session)],
):
    rows = (await db.execute(
        select(Skill).where(Skill.owner_id == user.id).order_by(desc(Skill.updated_at))
    )).scalars().all()
    return {"items": [_skill_dict(s, user) for s in rows]}


@app.get("/api/skills/{skill_id}")
async def get_skill(
    skill_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_session)],
    viewer: Annotated[Optional[User], Depends(get_optional_user)],
):
    s = (await db.execute(select(Skill).where(Skill.id == skill_id))).scalar_one_or_none()
    if not s:
        raise HTTPException(404, "skill 不存在")
    if not s.is_published:
        is_owner = viewer and (viewer.id == s.owner_id or viewer.is_admin)
        if not is_owner:
            raise HTTPException(404, "skill 不存在")
    owner = (await db.execute(select(User).where(User.id == s.owner_id))).scalar_one_or_none()

    # 列文件树 + 累积阅读量(只在公开访问 + 非 owner 时计)
    tree = list_tree(s.storage_path)
    if s.is_published and (not viewer or viewer.id != s.owner_id):
        s.view_count = (s.view_count or 0) + 1
        await db.commit()
    return {
        "skill": _skill_dict(s, owner),
        "tree": tree,
    }


@app.get("/api/skills/{skill_id}/file")
async def get_skill_file(
    skill_id: uuid.UUID,
    path: str,
    db: Annotated[AsyncSession, Depends(get_session)],
    viewer: Annotated[Optional[User], Depends(get_optional_user)],
):
    s = (await db.execute(select(Skill).where(Skill.id == skill_id))).scalar_one_or_none()
    if not s:
        raise HTTPException(404, "skill 不存在")
    if not s.is_published:
        is_owner = viewer and (viewer.id == s.owner_id or viewer.is_admin)
        if not is_owner:
            raise HTTPException(404, "skill 不存在")
    try:
        text, raw, is_text, truncated, full_size = read_file(s.storage_path, path)
    except FileNotFoundError:
        raise HTTPException(404, "文件不存在")
    mime, _ = mimetypes.guess_type(path)
    return {
        "path": path,
        "mime": mime,
        "is_text": is_text,
        "text": text,
        "base64": None if is_text else base64.b64encode(raw).decode("ascii"),
        "size": len(raw),
        "full_size": full_size,
        "truncated": truncated,
    }


@app.get("/api/skills/{skill_id}/reports")
async def list_reports(
    skill_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_session)],
    viewer: Annotated[Optional[User], Depends(get_optional_user)],
):
    s = (await db.execute(select(Skill).where(Skill.id == skill_id))).scalar_one_or_none()
    if not s:
        raise HTTPException(404, "skill 不存在")
    if not s.is_published:
        is_owner = viewer and (viewer.id == s.owner_id or viewer.is_admin)
        if not is_owner:
            raise HTTPException(404, "skill 不存在")
    rows = (await db.execute(
        select(QualityReport).where(QualityReport.skill_id == skill_id).order_by(desc(QualityReport.created_at)).limit(20)
    )).scalars().all()
    return {"items": [_report_dict(r) for r in rows]}


@app.get("/api/skills/{skill_id}/raw")
async def get_skill_raw(
    skill_id: uuid.UUID,
    path: str,
    db: Annotated[AsyncSession, Depends(get_session)],
    viewer: Annotated[Optional[User], Depends(get_optional_user)],
):
    """直接返回 raw bytes,带 mime header。用于 <img> / <iframe pdf> / <video> / <audio>。"""
    from storage import skill_dir as _skill_dir
    s = (await db.execute(select(Skill).where(Skill.id == skill_id))).scalar_one_or_none()
    if not s:
        raise HTTPException(404, "skill 不存在")
    if not s.is_published:
        is_owner = viewer and (viewer.id == s.owner_id or viewer.is_admin)
        if not is_owner:
            raise HTTPException(404, "skill 不存在")

    base = _skill_dir(s.storage_path).resolve()
    target = (base / path).resolve()
    try:
        target.relative_to(base)
    except ValueError:
        raise HTTPException(404, "文件不存在")
    if not target.is_file():
        raise HTTPException(404, "文件不存在")

    mime, _ = mimetypes.guess_type(path)
    mime = mime or "application/octet-stream"

    def _iter():
        with open(target, "rb") as f:
            while chunk := f.read(64 * 1024):
                yield chunk

    return StreamingResponse(
        _iter(),
        media_type=mime,
        headers={
            "Content-Length": str(target.stat().st_size),
            "Cache-Control": "private, max-age=300",
        },
    )


@app.get("/api/skills/{skill_id}/install")
async def get_install_instructions(
    skill_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_session)],
    viewer: Annotated[Optional[User], Depends(get_optional_user)],
):
    """返回 3 种安装方式的渲染文案(对话提示词 / CLI 一行命令 / Zip 手动)。"""
    s = (await db.execute(select(Skill).where(Skill.id == skill_id))).scalar_one_or_none()
    if not s:
        raise HTTPException(404, "skill 不存在")
    if not s.is_published:
        is_owner = viewer and (viewer.id == s.owner_id or viewer.is_admin)
        if not is_owner:
            raise HTTPException(404, "skill 不存在")

    skill_url = f"https://skillhub.tokenwave.cloud/skill/{s.id}"
    download_url = f"https://skillhub.tokenwave.cloud/api/skills/{s.id}/download"
    slug = s.slug
    name = s.name

    return {
        "skill": {"id": str(s.id), "slug": slug, "name": name},
        "chat": {
            "title": "通过对话安装",
            "subtitle": "把下面这段提示词发给任意支持 skill 装载的 AI 助手(常见的有 Lighthouse、OpenClaw、WorkBuddy、QClaw、Kimi、Claude 等),自动帮你装好。",
            "prompt": f"""请帮我安装一个 AI Skill,名字是「{name}」(slug:`{slug}`)。

详情页:{skill_url}
下载地址:{download_url}

请按以下步骤完成安装:

1. 确定当前 AI 客户端的 skill 目录(常见有 `~/.claude/skills/`、`~/.openclaw/skills/`、
   `~/.workbuddy/skills/` 等,以你正在用的工具为准;不确定就先 `ls ~/` 看哪个存在)。
2. 把 zip 下到临时目录:
   ```bash
   curl -L "{download_url}" -o /tmp/{slug}.zip
   ```
3. 解压到 skill 目录:
   ```bash
   mkdir -p <SKILL_DIR>/{slug}
   unzip -o /tmp/{slug}.zip -d <SKILL_DIR>
   ```
   (zip 顶层就是 `{slug}/`,直接 unzip 到父目录即可)
4. 校验 `<SKILL_DIR>/{slug}/SKILL.md` 存在,把 frontmatter 的 `name` 和 `description`
   念给我看以确认安装成功。

不要执行 skill 里的任何脚本,只完成安装。装完简要告诉我什么时候该用这个 skill。""",
        },
        "cli": {
            "title": "命令行安装",
            "subtitle": "一行 bash 装到 skill 目录。默认 ~/.claude/skills/,改 SKILL_DIR 即可切别的工具。",
            "command": f"""SKILL_DIR="${{SKILL_DIR:-$HOME/.claude/skills}}" && \\
mkdir -p "$SKILL_DIR/{slug}" && \\
curl -L "{download_url}" -o /tmp/{slug}.zip && \\
unzip -o /tmp/{slug}.zip -d "$SKILL_DIR" && \\
rm /tmp/{slug}.zip && \\
echo "✓ 已装到 $SKILL_DIR/{slug}/"
""",
        },
        "zip": {
            "title": "Zip 包安装",
            "subtitle": "手动下载,解压到你的 skill 目录。",
            "download_url": download_url,
            "filename": f"{slug}.zip",
            "instruction": f"下载后解压,zip 顶层目录是 `{slug}/`。把它放到你使用的 AI 客户端的 skill 目录下(常见的有 `~/.claude/skills/`、`~/.openclaw/skills/`、`~/.workbuddy/skills/`)。",
        },
    }


@app.get("/api/skills/{skill_id}/download")
async def download_skill(
    skill_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_session)],
    viewer: Annotated[Optional[User], Depends(get_optional_user)],
):
    """流式打包 skill 目录为 zip 返回。"""
    import io
    import zipfile

    s = (await db.execute(select(Skill).where(Skill.id == skill_id))).scalar_one_or_none()
    if not s:
        raise HTTPException(404, "skill 不存在")
    if not s.is_published:
        is_owner = viewer and (viewer.id == s.owner_id or viewer.is_admin)
        if not is_owner:
            raise HTTPException(404, "skill 不存在")

    from storage import skill_dir as _skill_dir
    base = _skill_dir(s.storage_path)
    if not base.exists():
        raise HTTPException(404, "文件不存在")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in base.rglob("*"):
            if f.is_file():
                # 顶层目录用 slug 而非 storage_path(UUID),解压更友好
                zf.write(f, arcname=f"{s.slug}/{f.relative_to(base)}")
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{s.slug}.zip"'},
    )


@app.get("/api/skills/{skill_id}/versions")
async def list_versions(
    skill_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_session)],
    viewer: Annotated[Optional[User], Depends(get_optional_user)],
):
    """版本历史(目前每个 skill 只一版,后续支持多版本时扩展)。"""
    s = (await db.execute(select(Skill).where(Skill.id == skill_id))).scalar_one_or_none()
    if not s:
        raise HTTPException(404, "skill 不存在")
    if not s.is_published:
        is_owner = viewer and (viewer.id == s.owner_id or viewer.is_admin)
        if not is_owner:
            raise HTTPException(404, "skill 不存在")
    return {
        "items": [
            {
                "version": s.version or "—",
                "file_count": s.file_count,
                "size_bytes": s.size_bytes,
                "created_at": s.created_at.isoformat(),
                "published_at": s.published_at.isoformat() if s.published_at else None,
                "is_current": True,
            }
        ]
    }


# ── skills: 上传 / 发布 / 删除 / 质检 ────────────────────────────────────────
@app.post("/api/skills/upload")
async def upload_skill(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_session)],
    archive: UploadFile | None = File(None),
    name_hint: str | None = Form(None),
):
    """上传 zip / tar.gz 单包形式。"""
    if archive is None:
        raise HTTPException(400, "缺少 archive 文件")
    raw = await archive.read()
    if not raw:
        raise HTTPException(400, "文件为空")
    if len(raw) > settings.max_skill_size_mb * 1024 * 1024:
        raise HTTPException(413, f"压缩包超过 {settings.max_skill_size_mb}MB")

    storage_path = new_storage_path()
    fname = (archive.filename or "").lower()
    if fname.endswith(".zip") or raw[:2] == b"PK":
        summary = extract_zip(raw, storage_path)
    elif fname.endswith((".tar", ".tar.gz", ".tgz", ".tar.bz2")) or raw[:2] in (b"\x1f\x8b", b"BZ"):
        summary = extract_tar(raw, storage_path)
    else:
        remove_skill(storage_path)
        raise HTTPException(400, "仅支持 .zip / .tar.gz / .tgz")

    skill = await _create_skill(db, user, storage_path, summary, name_hint=name_hint or archive.filename)
    return {"skill": _skill_dict(skill, user)}


@app.post("/api/skills/upload-files")
async def upload_skill_files(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_session)],
    files: list[UploadFile] = File(...),
    paths: list[str] = Form(...),
    name_hint: str | None = Form(None),
):
    """多文件 + 各自相对路径(配 webkitdirectory)。"""
    if len(files) != len(paths):
        raise HTTPException(400, "files / paths 长度不匹配")
    payload: list[tuple[str, bytes]] = []
    total = 0
    max_bytes = settings.max_skill_size_mb * 1024 * 1024
    for f, p in zip(files, paths):
        b = await f.read()
        total += len(b)
        if total > max_bytes:
            raise HTTPException(413, f"总大小超过 {settings.max_skill_size_mb}MB")
        payload.append((p, b))
    storage_path = new_storage_path()
    summary = write_files(payload, storage_path)
    skill = await _create_skill(db, user, storage_path, summary, name_hint=name_hint)
    return {"skill": _skill_dict(skill, user)}


async def _create_skill(
    db: AsyncSession, user: User, storage_path: str, summary: dict, *, name_hint: Optional[str] = None,
) -> Skill:
    raw_name = summary.get("name") or (name_hint or "").rsplit(".", 1)[0] or "untitled-skill"
    base_slug = slugify(raw_name)
    slug = base_slug
    n = 2
    while (await db.execute(
        select(Skill).where(Skill.owner_id == user.id, Skill.slug == slug)
    )).scalar_one_or_none():
        slug = f"{base_slug}-{n}"
        n += 1

    s = Skill(
        owner_id=user.id,
        slug=slug,
        name=summary.get("name") or raw_name,
        description=summary.get("description"),
        version=summary.get("version"),
        storage_path=storage_path,
        entry_file=summary.get("entry_file") or "SKILL.md",
        size_bytes=summary.get("size_bytes") or 0,
        file_count=summary.get("file_count") or 0,
        is_published=False,
        inspecting_started_at=datetime.utcnow(),  # 标记后台评测中
    )
    db.add(s)
    await db.commit()
    await db.refresh(s)
    # 上传成功 → fire-and-forget 后台跑 TRACE 评测
    asyncio.create_task(_auto_inspect(s.id, s.storage_path))
    return s


async def _auto_inspect(skill_id: uuid.UUID, storage_path: str) -> None:
    """上传后台自动质检。失败时只清 inspecting flag,不抛异常。"""
    try:
        result = await asyncio.to_thread(inspect_skill, storage_path)
        async with SessionLocal() as db:
            rpt = QualityReport(
                skill_id=skill_id,
                mode="trace",
                score=result["score"],
                verdict=result["verdict"],
                dimensions=result.get("dimensions") or {},
                suggestions=result.get("suggestions") or [],
                summary=result.get("summary"),
                static_payload=result.get("clues"),
                llm_model=result.get("llm_model"),
                duration_ms=result.get("duration_ms"),
            )
            db.add(rpt)
            s = (await db.execute(select(Skill).where(Skill.id == skill_id))).scalar_one_or_none()
            if s:
                s.latest_score = result["score"]
                s.latest_verdict = result["verdict"]
                s.inspecting_started_at = None
            await db.commit()
        logger.info("auto-inspect 完成 skill=%s score=%s", skill_id, result["score"])
    except Exception:
        logger.exception("auto-inspect 失败 skill=%s", skill_id)
        # 失败也要清 flag,免得 UI 一直显示"评测中"
        try:
            async with SessionLocal() as db:
                s = (await db.execute(select(Skill).where(Skill.id == skill_id))).scalar_one_or_none()
                if s:
                    s.inspecting_started_at = None
                    await db.commit()
        except Exception:
            pass


@app.post("/api/skills/{skill_id}/publish")
async def toggle_publish(
    skill_id: uuid.UUID,
    publish: bool = Query(True),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    s = (await db.execute(select(Skill).where(Skill.id == skill_id))).scalar_one_or_none()
    if not s:
        raise HTTPException(404, "skill 不存在")
    if s.owner_id != user.id and not user.is_admin:
        raise HTTPException(403, "无权限")
    s.is_published = publish
    s.published_at = datetime.utcnow() if publish else None
    await db.commit()
    await db.refresh(s)
    return {"skill": _skill_dict(s, user)}


@app.delete("/api/skills/{skill_id}")
async def delete_skill(
    skill_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    s = (await db.execute(select(Skill).where(Skill.id == skill_id))).scalar_one_or_none()
    if not s:
        raise HTTPException(404, "skill 不存在")
    if s.owner_id != user.id and not user.is_admin:
        raise HTTPException(403, "无权限")
    storage_path = s.storage_path
    # 先删依赖的报告
    await db.execute(QualityReport.__table__.delete().where(QualityReport.skill_id == skill_id))
    await db.delete(s)
    await db.commit()
    remove_skill(storage_path)
    return {"ok": True}


def _report_dict(rpt: QualityReport) -> dict:
    return {
        "id": str(rpt.id),
        "mode": "trace",
        "score": rpt.score,
        "verdict": rpt.verdict,
        "summary": rpt.summary,
        "dimensions": rpt.dimensions,
        "suggestions": rpt.suggestions,
        "clues": (rpt.static_payload or {}),  # 复用 static_payload 字段存 clues
        "llm_model": rpt.llm_model,
        "duration_ms": rpt.duration_ms,
        "created_at": rpt.created_at.isoformat(),
    }


@app.post("/api/skills/{skill_id}/inspect")
async def run_inspect(
    skill_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """TRACE 5 维 LLM 评测 + 静态线索补充。"""
    s = (await db.execute(select(Skill).where(Skill.id == skill_id))).scalar_one_or_none()
    if not s:
        raise HTTPException(404, "skill 不存在")
    if s.owner_id != user.id and not user.is_admin:
        raise HTTPException(403, "无权限")

    result = await asyncio.to_thread(inspect_skill, s.storage_path)

    rpt = QualityReport(
        skill_id=s.id,
        mode="trace",
        score=result["score"],
        verdict=result["verdict"],
        dimensions=result.get("dimensions") or {},
        suggestions=result.get("suggestions") or [],
        summary=result.get("summary"),
        static_payload=result.get("clues"),  # 借 static_payload 字段存 clues
        llm_payload=None,
        llm_model=result.get("llm_model"),
        duration_ms=result.get("duration_ms"),
    )
    db.add(rpt)
    s.latest_score = result["score"]
    s.latest_verdict = result["verdict"]
    await db.commit()
    await db.refresh(rpt)
    return {"report": _report_dict(rpt)}


# ── admin: invite codes / users ──────────────────────────────────────────────
class InviteIn(BaseModel):
    note: Optional[str] = None
    grants_admin: bool = False
    expires_in_days: Optional[int] = None


@app.get("/api/admin/invites")
async def list_invites(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_session),
):
    rows = (await db.execute(select(InviteCode).order_by(desc(InviteCode.created_at)).limit(200))).scalars().all()
    user_ids = {r.used_by for r in rows if r.used_by} | {r.created_by for r in rows if r.created_by}
    users = {}
    if user_ids:
        for u in (await db.execute(select(User).where(User.id.in_(user_ids)))).scalars():
            users[u.id] = u
    return {
        "items": [
            {
                "id": str(r.id),
                "code": r.code,
                "note": r.note,
                "grants_admin": r.grants_admin,
                "created_at": r.created_at.isoformat(),
                "expires_at": r.expires_at.isoformat() if r.expires_at else None,
                "used_at": r.used_at.isoformat() if r.used_at else None,
                "used_by_username": users.get(r.used_by).username if r.used_by and users.get(r.used_by) else None,
                "created_by_username": users.get(r.created_by).username if r.created_by and users.get(r.created_by) else None,
            }
            for r in rows
        ]
    }


@app.post("/api/admin/invites")
async def create_invite(
    body: InviteIn,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_session),
):
    from datetime import timedelta
    code = "SH-" + _rand(10).upper()
    expires_at = datetime.utcnow() + timedelta(days=body.expires_in_days) if body.expires_in_days else None
    inv = InviteCode(
        code=code,
        note=body.note,
        grants_admin=body.grants_admin,
        expires_at=expires_at,
        created_by=admin.id,
    )
    db.add(inv)
    await db.commit()
    await db.refresh(inv)
    return {"code": inv.code, "id": str(inv.id), "expires_at": inv.expires_at.isoformat() if inv.expires_at else None}


@app.delete("/api/admin/invites/{invite_id}")
async def delete_invite(
    invite_id: uuid.UUID,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_session),
):
    inv = (await db.execute(select(InviteCode).where(InviteCode.id == invite_id))).scalar_one_or_none()
    if not inv:
        raise HTTPException(404, "邀请码不存在")
    if inv.used_by is not None:
        raise HTTPException(400, "已被使用的邀请码不能删除")
    await db.delete(inv)
    await db.commit()
    return {"ok": True}


@app.get("/api/admin/users")
async def list_users(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_session),
):
    rows = (await db.execute(select(User).order_by(desc(User.created_at)))).scalars().all()
    skill_counts = dict((await db.execute(
        select(Skill.owner_id, func.count(Skill.id)).group_by(Skill.owner_id)
    )).all())
    return {
        "items": [
            {
                **_user_dict(u),
                "is_active": u.is_active,
                "created_at": u.created_at.isoformat(),
                "skill_count": skill_counts.get(u.id, 0),
            }
            for u in rows
        ]
    }


class UserCreateIn(BaseModel):
    email: EmailStr
    username: str = Field(min_length=2, max_length=64)
    password: str = Field(min_length=6, max_length=128)
    display_name: Optional[str] = None
    is_admin: bool = False


class UserPatchIn(BaseModel):
    display_name: Optional[str] = None
    is_admin: Optional[bool] = None
    is_active: Optional[bool] = None
    password: Optional[str] = Field(default=None, min_length=6, max_length=128)


@app.post("/api/admin/users")
async def admin_create_user(
    body: UserCreateIn,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_session),
):
    """管理员直接创建用户(不需邀请码)。"""
    dup = (await db.execute(
        select(User).where(or_(User.email == str(body.email), User.username == body.username))
    )).scalar_one_or_none()
    if dup:
        raise HTTPException(400, "邮箱或用户名已被使用")
    u = User(
        email=str(body.email),
        username=body.username,
        password_hash=hash_password(body.password),
        display_name=body.display_name or body.username,
        is_admin=body.is_admin,
        is_active=True,
    )
    db.add(u)
    await db.commit()
    await db.refresh(u)
    return {
        **_user_dict(u),
        "is_active": u.is_active,
        "created_at": u.created_at.isoformat(),
        "skill_count": 0,
    }


@app.patch("/api/admin/users/{user_id}")
async def admin_patch_user(
    user_id: uuid.UUID,
    body: UserPatchIn,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_session),
):
    u = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not u:
        raise HTTPException(404, "用户不存在")

    # 不允许 admin 把自己降级 / 停用 / 改密(避免锁死自己)
    if u.id == admin.id:
        if body.is_admin is False:
            raise HTTPException(400, "不能取消自己的管理员权限")
        if body.is_active is False:
            raise HTTPException(400, "不能停用自己")

    # 系统至少留一个 active admin
    if body.is_admin is False or body.is_active is False:
        other_admins = (await db.execute(
            select(func.count(User.id)).where(
                User.id != u.id, User.is_admin == True, User.is_active == True
            )
        )).scalar_one()
        if other_admins == 0 and u.is_admin and u.is_active:
            raise HTTPException(400, "系统至少要保留一个有效管理员")

    if body.display_name is not None:
        u.display_name = body.display_name
    if body.is_admin is not None:
        u.is_admin = body.is_admin
    if body.is_active is not None:
        u.is_active = body.is_active
    if body.password:
        u.password_hash = hash_password(body.password)

    await db.commit()
    await db.refresh(u)
    return {
        **_user_dict(u),
        "is_active": u.is_active,
        "created_at": u.created_at.isoformat(),
    }


@app.delete("/api/admin/users/{user_id}")
async def admin_delete_user(
    user_id: uuid.UUID,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_session),
):
    u = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not u:
        raise HTTPException(404, "用户不存在")
    if u.id == admin.id:
        raise HTTPException(400, "不能删除自己")
    # 该用户名下还有 skill → 拒绝(避免误删数据)
    skill_count = (await db.execute(
        select(func.count(Skill.id)).where(Skill.owner_id == u.id)
    )).scalar_one()
    if skill_count > 0:
        raise HTTPException(400, f"该用户名下还有 {skill_count} 个 skill,先转移或删除后再删用户")
    # 用过的邀请码 used_by 解除关联
    await db.execute(
        InviteCode.__table__.update()
        .where(InviteCode.used_by == u.id)
        .values(used_by=None)
    )
    await db.delete(u)
    await db.commit()
    return {"ok": True}
