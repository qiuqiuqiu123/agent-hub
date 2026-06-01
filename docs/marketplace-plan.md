# Pipeline 模板市场方案

## 定位

官网 = 产品介绍 + 文档 + 轻量模板市场。Agent-Hub 作为客户端，连接官网进行模板的浏览/下载/上传。

## 整体架构

```
┌─────────────────────────────────────────────────────┐
│  官网 (Next.js 全栈, Vercel)                          │
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐ │
│  │ 产品介绍  │  │ 文档中心  │  │ 模板市场           │ │
│  │ Landing  │  │ /docs    │  │ /marketplace      │ │
│  └──────────┘  └──────────┘  └───────────────────┘ │
│                                                     │
│  ┌──────────────────────────────────────────────┐   │
│  │ API Layer (/api/v1/*)                         │   │
│  │  - /auth     用户认证                          │   │
│  │  - /templates  模板 CRUD + 搜索                │   │
│  │  - /users     用户信息                         │   │
│  │  - /admin     审核管理                         │   │
│  └──────────────────────────────────────────────┘   │
│                                                     │
│  ┌──────────────────────────────────────────────┐   │
│  │ Database (PostgreSQL / Supabase)              │   │
│  │  - users, templates, reviews, downloads      │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
          ↕ HTTPS API
┌─────────────────────────────────────────────────────┐
│  Agent-Hub 客户端 (本地运行)                          │
│                                                     │
│  ┌──────────────────────────────────────────────┐   │
│  │ Marketplace Tab                               │   │
│  │  - 浏览/搜索模板（无需登录）                     │   │
│  │  - 下载安装模板（需登录）                        │   │
│  │  - 发布自己的 pipeline（需登录）                 │   │
│  └──────────────────────────────────────────────┘   │
│                                                     │
│  ┌──────────────────────────────────────────────┐   │
│  │ Settings → 账号绑定                            │   │
│  │  - 登录/注册                                   │   │
│  │  - Token 管理                                  │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

---

## 一、官网功能模块

### 1.1 产品介绍 (Landing Page)

- Hero：一句话定位 + 动画演示
- 功能亮点：Pipeline 编排、多 Agent 协作、触发器、模板市场
- 快速开始：安装命令 + 3 步上手
- 定价（如果有）/ 开源说明

### 1.2 文档中心 (/docs)

- 快速开始
- Pipeline 配置语法（引用 JSON Schema）
- Agent/Provider 开发指南
- API 参考
- 用 MDX + 静态生成

### 1.3 模板市场 (/marketplace)

**浏览页面（无需登录）：**
- 分类筛选：开发流程 / 内容创作 / 数据处理 / 运维自动化
- 搜索（全文 + 标签）
- 排序：最新 / 最热 / 官方推荐
- 卡片展示：名称、描述、作者、下载量、标签

**模板详情页：**
- Pipeline 可视化预览（步骤流程图）
- 配置说明（需要哪些 agent、哪些 key）
- 版本历史
- 评分/评论（后期）
- "安装到 Agent-Hub" 按钮（deeplink 或复制安装命令）

**上传/管理（需登录）：**
- 提交模板（填写元信息 + 上传 bundle JSON）
- 查看自己的模板列表
- 查看审核状态

---

## 二、用户系统

### 2.1 认证方式

- 邮箱 + 密码注册/登录
- GitHub OAuth 登录（可选，方便开发者）
- 登录后颁发 JWT（access_token + refresh_token）
- 客户端存储 token 到本地配置文件

### 2.2 用户角色

| 角色 | 权限 |
|------|------|
| visitor | 浏览模板、查看文档 |
| user | 下载模板、上传模板、评论 |
| admin | 审核模板、管理用户、发布官方模板 |

### 2.3 客户端登录流程

```
用户在 Agent-Hub 点击"登录"
    → 打开浏览器跳转官网 /auth/device
    → 用户在浏览器登录授权
    → 回调写入 token 到客户端
    → 客户端后续请求带 Authorization: Bearer <token>
```

或简化方案：用户在官网生成 Personal Access Token，手动粘贴到客户端设置。

---

## 三、模板数据模型

### 3.1 Template 表

```sql
CREATE TABLE templates (
  id            UUID PRIMARY KEY,
  slug          VARCHAR(100) UNIQUE NOT NULL,  -- URL 友好标识
  name          VARCHAR(200) NOT NULL,
  description   TEXT,
  category      VARCHAR(50) NOT NULL,          -- dev/content/data/ops
  tags          TEXT[],                         -- 标签数组
  author_id     UUID REFERENCES users(id),

  -- 模板内容
  bundle        JSONB NOT NULL,                -- Pipeline Bundle JSON
  version       VARCHAR(20) NOT NULL,          -- semver

  -- 审核
  status        VARCHAR(20) DEFAULT 'pending', -- pending/approved/rejected
  reviewer_id   UUID REFERENCES users(id),
  review_note   TEXT,
  reviewed_at   TIMESTAMP,

  -- 统计
  downloads     INTEGER DEFAULT 0,
  stars         INTEGER DEFAULT 0,

  -- 元信息
  is_official   BOOLEAN DEFAULT FALSE,         -- 官方模板标记
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW()
);
```

### 3.2 Template Versions 表（支持版本历史）

```sql
CREATE TABLE template_versions (
  id            UUID PRIMARY KEY,
  template_id   UUID REFERENCES templates(id),
  version       VARCHAR(20) NOT NULL,
  bundle        JSONB NOT NULL,
  changelog     TEXT,
  created_at    TIMESTAMP DEFAULT NOW(),
  UNIQUE(template_id, version)
);
```

### 3.3 Downloads 表（追踪下载记录）

```sql
CREATE TABLE template_downloads (
  id            UUID PRIMARY KEY,
  template_id   UUID REFERENCES templates(id),
  user_id       UUID REFERENCES users(id),
  version       VARCHAR(20),
  downloaded_at TIMESTAMP DEFAULT NOW()
);
```

---

## 四、API 设计

### 4.1 认证

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/v1/auth/register` | POST | 注册 |
| `/api/v1/auth/login` | POST | 登录，返回 JWT |
| `/api/v1/auth/refresh` | POST | 刷新 token |
| `/api/v1/auth/github` | GET | GitHub OAuth 入口 |
| `/api/v1/auth/github/callback` | GET | OAuth 回调 |

### 4.2 模板（公开）

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/v1/templates` | GET | 列表（分页、筛选、搜索） |
| `/api/v1/templates/:slug` | GET | 详情 |
| `/api/v1/templates/:slug/download` | GET | 下载 bundle（需登录） |
| `/api/v1/templates/categories` | GET | 分类列表 |

### 4.3 模板（用户操作，需登录）

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/v1/templates` | POST | 提交新模板 |
| `/api/v1/templates/:slug` | PUT | 更新模板（新版本） |
| `/api/v1/templates/:slug` | DELETE | 删除自己的模板 |
| `/api/v1/my/templates` | GET | 我的模板列表 |

### 4.4 管理（admin）

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/v1/admin/reviews` | GET | 待审核列表 |
| `/api/v1/admin/reviews/:id` | POST | 审核操作（approve/reject） |
| `/api/v1/admin/templates/:id/feature` | POST | 设为推荐 |

---

## 五、客户端集成

### 5.1 Agent-Hub 新增模块

**新增 Tab：Marketplace**

```
┌─────────────────────────────────────────┐
│ [Agents] [Pipelines] [Schedules] [Market] │
├─────────────────────────────────────────┤
│ 🔍 搜索模板...          [分类▾] [排序▾]  │
├─────────────────────────────────────────┤
│ ┌─────────┐ ┌─────────┐ ┌─────────┐    │
│ │ 代码审查  │ │ 热梗漫画 │ │ 日报生成 │    │
│ │ ⭐ 官方   │ │ 👤 user │ │ ⭐ 官方  │    │
│ │ ↓ 1.2k  │ │ ↓ 356  │ │ ↓ 890  │    │
│ │ [安装]   │ │ [安装]  │ │ [安装]  │    │
│ └─────────┘ └─────────┘ └─────────┘    │
├─────────────────────────────────────────┤
│ [发布我的 Pipeline]                       │
└─────────────────────────────────────────┘
```

### 5.2 客户端 API Client

```typescript
// src/lib/marketplace/client.ts

interface MarketplaceClient {
  // 公开
  search(query: string, filters: SearchFilters): Promise<TemplateListing[]>
  getDetail(slug: string): Promise<TemplateDetail>
  getCategories(): Promise<Category[]>

  // 需登录
  download(slug: string): Promise<PipelineBundle>
  publish(bundle: PipelineBundle, meta: TemplateMeta): Promise<void>
  getMyTemplates(): Promise<TemplateListing[]>

  // 认证
  login(email: string, password: string): Promise<void>
  logout(): void
  isAuthenticated(): boolean
}
```

### 5.3 安装流程

```
用户点击"安装"
  → 调用 download API 获取 bundle JSON
  → 调用本地 importBundle() 逻辑（复用导入/导出功能）
  → 创建 agents（如果不存在）
  → 创建 pipeline
  → 提示用户配置缺失的 API Key
  → 完成
```

### 5.4 发布流程

```
用户选择一个本地 pipeline，点击"发布"
  → 调用本地 exportBundle() 生成 bundle JSON
  → 弹出表单：填写名称、描述、分类、标签
  → POST 到官网 /api/v1/templates
  → 状态变为 pending，等待审核
  → 审核通过后上架
```

---

## 六、审核机制

### 审核流程

```
用户提交 → pending → 管理员审核 → approved / rejected
                                      ↓
                                 上架可见 / 通知用户修改原因
```

### 审核检查项

- [ ] bundle JSON 格式合法（schema validation）
- [ ] 不含敏感信息（apiKey、密码等）
- [ ] 描述清晰，有实际使用价值
- [ ] 无恶意 prompt（prompt injection 检测）
- [ ] 分类和标签准确

### 管理后台

- 待审核队列
- 一键 approve / reject（附理由）
- 模板下架/删除
- 用户管理

---

## 七、官方模板计划

你提到会定时做一些 pipeline，这些作为官方模板的种子内容：

| 分类 | 模板示例 |
|------|---------|
| 开发流程 | 代码审查 Pipeline、PR 自动摘要、Bug 修复工作流 |
| 内容创作 | 热梗漫画 → 公众号、技术博客生成、社媒内容批量生产 |
| 数据处理 | 竞品监控 → 报告生成、数据清洗 Pipeline |
| 运维自动化 | 日报/周报生成、告警处理、文档同步 |

---

## 八、技术栈总结

| 层 | 选型 |
|----|------|
| 官网前端 | Next.js 15 + Tailwind + MDX (文档) |
| 官网后端 | Next.js API Routes |
| 数据库 | PostgreSQL (Supabase 或 Neon) |
| 认证 | NextAuth.js (JWT + GitHub OAuth) |
| 存储 | 模板 bundle 存 JSONB；大文件用 S3/R2 |
| 部署 | Vercel |
| 客户端 | Agent-Hub 现有 Next.js 项目新增 marketplace 模块 |

---

## 九、MVP 范围（第一版）

先做最小闭环：

1. ✅ 官网 Landing + 文档（静态页面）
2. ✅ 用户注册/登录（邮箱 + 密码）
3. ✅ 模板列表/详情/搜索（公开浏览）
4. ✅ 模板下载（需登录）
5. ✅ 模板上传 + 人工审核
6. ✅ 客户端 Marketplace Tab（搜索 + 安装）
7. ✅ 客户端发布功能
8. ✅ 5-10 个官方种子模板

**后期迭代：**
- GitHub OAuth
- 评分/评论系统
- 模板版本管理
- 推荐算法
- 付费模板
