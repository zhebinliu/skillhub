# Skill Hub

> 一个让人愿意逛的 Claude Skill 仓库:上传、预览、质检、发布,清清爽爽。

[![Live](https://img.shields.io/badge/live-skillhub.tokenwave.cloud-blueviolet)](https://skillhub.tokenwave.cloud)
![License](https://img.shields.io/badge/license-MIT-green)
![Stack](https://img.shields.io/badge/stack-FastAPI%20%2B%20React-orange)

把 skill 当艺术品搭,而不是当一坨 prompt 凑。

## 它做了什么

- **管理员邀请码注册 + JWT 登录** — 独立用户库,管控可控
- **Skill 上传** — zip / tar.gz 拖拽,或浏览器 `webkitdirectory` 整个文件夹一次传
- **在线文件树 + markdown 渲染** — 进站读完整 SKILL.md,代码块自动高亮
- **草稿默认 → 手动发布** — 上传完先存底,改到满意再亮相
- **双层质检评分** — 5 维静态启发式(秒级)+ LLM 上下文评分(深度),综合分入库
- **后台邀请码 + 用户管理**(admin only)

## 双层质检长什么样

### 静态评分(5 维 × 20 = 100,纯 Python,秒级)
| 维度 | 检查点 |
|---|---|
| 问题-方案匹配度 | description 任务类型 vs 是否有 scripts/ |
| 完成度 | YAML frontmatter / 脚本非空 / shebang & exec / TODO 标记 |
| 容错性 | try/except 覆盖率 / shell `set -e` / Prompt fallback 关键词 |
| Description 精度 | 长度 / 触发词 / 泛化词扣分 |
| Token 效率 | SKILL.md 大小 / 渐进式披露(references/ 目录) |

> 5 维启发式参考了 [shaozhengmao/skill-quality-checker](https://github.com/shaozhengmao/skill-quality-checker)
> 的评分思路。

### LLM 评分(4 维 × 25 = 100,10–60 秒)
4 维:格式合规 / 触发清晰 / 内容质量 / 结构组织。供应商可选 Anthropic Claude 或任何
OpenAI 兼容接口(qwen / DeepSeek / MiniMax / Doubao / one-api 中转都行)。

**综合分** = 静态 40% + LLM 60%(LLM 更能识别内容质量,权重高一点)。

## 一键起

```bash
git clone https://github.com/zhebinliu/skillhub.git
cd skillhub
cp .env.example .env
# 编辑 .env:至少改 POSTGRES_PASSWORD / SKILLHUB_JWT_SECRET / SKILLHUB_BOOTSTRAP_ADMIN_PASSWORD
docker compose up -d --build
docker compose logs -f backend   # 看初始 admin + 邀请码
```

容器:
- `skillhub-backend` — FastAPI :8001(内网)
- `skillhub-frontend` — nginx + React dist :80(内网)
- `postgres` — 独立 postgres:16

默认这套**不持有 80/443 端口**。生产里挂到既有 nginx 上反代:
```nginx
server {
    listen 443 ssl;
    server_name skillhub.example.com;
    # ssl_certificate ...

    location ~ ^/api(/|$) { proxy_pass http://skillhub-backend:8001; }
    location /            { proxy_pass http://skillhub-frontend:80; }
}
```

想让它自己持 443?把 `docker-compose.yml` 里 `standalone-frontend` 注释打开。

## 技术栈

- **后端**:Python 3.11 + FastAPI 0.115 + SQLAlchemy 2.0 (async) + asyncpg + Pydantic v2
- **前端**:React 18 + TypeScript + Vite + TailwindCSS + TanStack Query + react-markdown
- **存储**:Postgres(metadata + reports) + 本地 docker volume(skill 文件)
- **质检**:静态走纯标准库 + PyYAML;LLM 走 httpx(支持 Anthropic 原生 + OpenAI 兼容)

## 目录

```
skillhub/
├── backend/
│   ├── main.py             FastAPI 路由 + lifespan
│   ├── models.py           SQLAlchemy(users / invite_codes / skills / quality_reports)
│   ├── auth.py             JWT + bcrypt + 依赖项
│   ├── storage.py          zip/tar 解包 + 文件树 + frontmatter 解析
│   ├── inspector.py        质检调度(static / llm / both)
│   ├── static_scorer.py    5 维静态评分
│   ├── config.py           SettingsConfigDict(env_prefix='SKILLHUB_')
│   └── db.py               URL.create 显式构造 DSN(避免密码含 @ 问题)
├── frontend/
│   └── src/
│       ├── pages/          Landing / Explore / SkillDetail / Login / Register
│       │                   / Dashboard / Upload / MySkill / Admin
│       ├── components/     Layout / SkillCard / FileTree / FilePreview
│       └── lib/            api / auth / toast / format
├── docker-compose.yml
└── .env.example
```

## API 摘要

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/auth/register` | 邀请码注册 → 直接返回 JWT |
| POST | `/api/auth/login` | 邮箱或用户名 + 密码 |
| GET  | `/api/skills` | 已发布列表(公开,可 `?q=&sort=recent|score|popular`) |
| GET  | `/api/skills/{id}` | 详情 + 文件树 |
| GET  | `/api/skills/{id}/file?path=...` | 单文件预览(text 直返 / binary base64) |
| POST | `/api/skills/upload` | zip / tar.gz 上传(multipart) |
| POST | `/api/skills/upload-files` | 多文件上传(配 webkitdirectory) |
| POST | `/api/skills/{id}/publish?publish=true|false` | 发布开关 |
| POST | `/api/skills/{id}/inspect?mode=static|llm|both` | 跑质检(默认 both) |
| GET  | `/api/skills/{id}/reports` | 历史报告 |
| POST | `/api/admin/invites` | 生成邀请码(admin) |
| GET  | `/api/admin/users` | 用户列表(admin) |

## 安全提示

- `.env` 是机密,千万别提交。生产部署后第一时间改 `SKILLHUB_JWT_SECRET` + `SKILLHUB_BOOTSTRAP_ADMIN_PASSWORD`
- LLM key 写 `.env` 后,只在容器内可见
- 上传默认上限 50MB / 500 文件,容器内自动拦截 zip slip / 系统噪声文件(.DS_Store / __MACOSX 等)
- 文件预览拒绝超过 512KB 的单文件,防内存撑爆

## 致谢

- 5 维静态评分思路来自 [shaozhengmao/skill-quality-checker](https://github.com/shaozhengmao/skill-quality-checker)
- UI 灵感:暗色 + 紫粉橙渐变 + 玻璃质感,致敬 [21st.dev](https://21st.dev) / [usefulskills.app](https://usefulskills.app)

## License

MIT — 见 [LICENSE](LICENSE)
