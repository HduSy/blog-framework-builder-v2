---
name: blog-framework-builder-v2
description: "从用户提供参考站点 URL 或者用户给定话题方向出发,搭建一个可部署的 Next.js 博客类站点框架(只搭框架,不写文章)。当用户需要建站、搭建博客、做个博客站、提供 URL 建站时触发本技能"
---

# 博客框架搭建器(Blog Framework Builder)

用户提供参考站点URL或垂直领域站点描述, 搭建出可部署Vercel的**博客类站点**项目框架

## Input

两种模式:

- **模式 A — 参考 URL**: 一个参考站点 URL
- **模式 B — 主题/方向**: 用自然语言描述站点垂直领域(如 "家居装饰博客"、"宠物护理杂志")

- **可选**: 目标站点名 `{site}`。未提供时, 模式 A 从参考域名派生,模式 B 从主题 slug 派生

## Output

完整可运行 Next.js 项目，可直接部署到 Vercel

## Workflow

### 第 1 步 — 定位站点风格

1.1 调用 `/ui-ux-pro-max` 分析参考站点(或主题方向)的设计语言
1.2 调用 `/frontend-design` 把设计语言落地为可实现的 UI 规范(组件层级、布局栅格、交互细节)

### 第 2 步 — 初始化 Next.js 项目

自适应 PC/Mobile 双端

2.1 基于[nextjs-spec.md](./references/nextjs-spec.md)规范初始化

2.2 套用 `template/` 基线文件。每个文件都是必须的;缺文件或占位符未替换都视为初始化失败:

| 来源(本技能内) | 目标 | 必要操作 |
|---|---|---|
| `template/.env.local` | `{site}/.env.local` | 原样拷贝 |
| `template/.gitignore` | `{site}/.gitignore` | 覆盖脚手架版本 |
| `template/.vercel/README.md` | `{site}/.vercel/README.md` | 原样拷贝 |
| `template/.vercel/project.json` | `{site}/.vercel/project.json` | 拷贝后,把 `projectName` 中的 `{site}` 替换为真实站点名字面量。**注意**：`projectId` 是预建槽位，若模板 projectId 已被其他站点占用，需先 `vercel link` 获取新 projectId 再填入，否则会覆盖已有项目。 |
| `template/lib/db.ts` | `{site}/lib/db.ts` | 拷贝后,把 `const SITE = "{site}"` 替换为真实站点名字面量(如 `"myblog"`)。**这是唯一一个需要替换站点名的文件。** |
| `template/lib/init-db.ts` | `{site}/lib/init-db.ts` | **原样拷贝**。文件中的字面量 `site` 是所有站点共用的 SQL 列名,**不是占位符**。 |
| `template/package.json` | `{site}/package.json` | 不要直接覆盖。合并: 追加 `scripts.init-db`,确保 `dependencies` 中包含 `@neondatabase/serverless`。 |

2.5 安装依赖 & 初始化数据库:

```bash
cd {site} && pnpm install
# sharp 和 unrs-resolver 都需要批准，缺一不可，否则 pnpm install 报 ERR_PNPM_IGNORED_BUILDS
pnpm approve-builds sharp
pnpm approve-builds unrs-resolver
pnpm install
```

**init-db 必须用 Python 加载 .env.local，tsx 不会自动读取：**
```bash
python3 -c "
import subprocess, os
with open('.env.local') as f:
    for line in f:
        line = line.strip()
        if '=' in line and not line.startswith('#'):
            k, v = line.split('=', 1)
            os.environ[k] = v
result = subprocess.run(['npx', 'tsx', 'lib/init-db.ts'], env=os.environ, capture_output=True, text=True)
print(result.stdout or result.stderr)
"
```
成功输出：`Schema OK: articles + authors tables ensured.`

2.6 **路由渲染策略（建站时必须遵守）**：

| 路由类型 | 判断标准 | 实现方式 |
|---|---|---|
| 动态路由（含 DB 数据） | `[slug]` 路由，数据来自数据库 | `generateStaticParams` 取最近 10 条 + `dynamicParams = true` + `export const revalidate = 3600` |
| 静态路由（无 DB / 静态数组） | `[slug]` 路由，数据来自静态配置（如 CATEGORIES 数组） | `generateStaticParams` 全量枚举，**不设 revalidate**（纯 SSG） |
| 列表页 / 含 DB 查询的非动态页 | `blog/page.tsx`、`authors/page.tsx` 等 | `export const revalidate = 3600`，**禁止** `force-dynamic` |
| 纯静态页 | `about`、`contact`、无 DB 查询的页面 | 无需任何配置，Next.js 默认 SSG |

2.7 手动安装 lucide-react（脚手架不自动安装）：
```bash
pnpm add lucide-react
```

**⛔ pnpm 虚拟 store 陷阱**：`pnpm add` 有时因 store 版本冲突把包装入虚拟 store 而非 node_modules，导致 `node` 直接运行脚本时报 `ERR_MODULE_NOT_FOUND`。如遇此问题，改用：
1. 手动在 `package.json` 的 `dependencies` 中加入所需包及版本
2. `CI=true pnpm install --no-frozen-lockfile`
3. 验证：`ls node_modules/<package>` 有输出才算成功

---

### 第 3 步 — 自检

任何一条不达标都视为未交付。

**3.1 图片**:临时用 `images.unsplash.com` 或 `placehold.co`占位;禁用 emoji/渐变块/base64/`<img>`;一律走 `next/image`,`alt` 写真实主体;`next.config.ts` 白名单必须包含以下三个域名，缺一不可：
```ts
remotePatterns: [
  { protocol: "https", hostname: "images.unsplash.com" },
  { protocol: "https", hostname: "placehold.co" },
  { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
],
```
`curl -I` 确保图片 URL 可访问

**3.2 导航**: 站点上所有路由导航可达。`pnpm dev` 后逐条 `curl` 确保 200 可访问;缺路由的修复方式是补 `page.tsx` + `<EmptyState>`,**不要删导航**。

**3.3 SSR 可见性**(SEO/无 JS 用户必过):
- `test ! -f {site}/app/loading.tsx` —— root `loading.tsx` 不允许存在(详见 P12)
- `pnpm build && PORT=3099 pnpm start` 起 prod server（端口 3000 常被占用，用 3099；`pnpm start -- -p PORT` 语法错误，必须用环境变量），对至少首页 + 一条详情页执行:
  ```bash
  curl -s http://localhost:3000/ | python3 -c "
  import sys, re
  h = sys.stdin.read()
  m = re.search(r'<main[^>]*>(.*?)</main>', h, re.S)
  c = m.group(1) if m else ''
  assert '<!--\$?-->' not in c, 'streaming Suspense fallback shell detected'
  assert len(c) > 1000, f'main too small ({len(c)}B), real content not inlined'
  print('ok', len(c))
  "
  ```
  失败即视为 SSR 退化,必须按 P12 修复后重测。

**3.4 最终验收**: 无以下问题

1. 动态路由目录名必须用方括号，禁止用花括号
2. public/index.html 缺失导致首页 500
3. 页面内容较少时，Footer 也应该始终页面底部
4. 移动端 Header 响应式优化，默认关闭，以浮层打开不占用主文档流空间，层级最高不被任何元素遮挡
5. 所有页面主体内容严格遵循响应式规范，应参考 [responsive-breakpoint.md](./references/responsive-breakpoint.md)
6. 文章主体中可能包含table元素，始终为 table 编写符合站点样式规范的样式代码
7. 浏览器禁用JS后页面主体内容处在loading态或为空，不符合SSR SEO友好，禁用 root 下 `app/loading.tsx`，[nextjs-spec.md](./references/nextjs-spec.md) §9、§12 已禁
8. Modal / Drawer / 全屏 overlay 默认用 `createPortal(node, document.body)`，避免 bug
9. 文章正文一律用 dangerouslySetInnerHTML 渲染，body 在 DB 里统一以 HTML 形式存在，否则正文中会出现 HTML 标签
    - 正文容器必须用 `[&_tag]:` arbitrary variants 为所有常见 HTML 标签设置符合站点设计变量的样式，禁止裸用 `prose` class 了事。必须覆盖：`h2`、`h3`、`h4`、`p`、`a`、`ul`、`ol`、`li`、`blockquote`、`table/thead/th/td`、`code`、`pre`、`hr`、`strong`、`em`。颜色一律引用 `var(--color-*)` 设计变量，字体引用 `var(--font-*)`。
10. 作者文章列表查询必须用 author slug（路由参数）匹配 articles.author 字段，禁止用 author.name；articles 表的 author 列存的是 slug，用 name 匹配永远查不到文章
11. authors 表的 img 字段存 Unsplash URL 时，禁止带固定尺寸参数（w=、h=）；应使用 `?auto=format&fit=crop&crop=face`，让 next/image 自己控制尺寸，否则列表页与详情页因 sizes 不同导致裁剪区域偏移，头像看起来不一致

12. **TypeScript 严格类型陷阱**：`lib/db.ts` 中所有字段均为 `string | null`，页面组件中凡是传给需要 `string` 的 prop（`alt`、`dateTime`、`new Date()`、Metadata 的 `title`/`description`）都必须加 `?? ""` 或 `?? undefined`。高频出错点：
    - `<Image alt={x}>` → `alt={x ?? ""}`
    - `<time dateTime={x}>` → `dateTime={x ?? ""}`
    - `new Date(x)` → `new Date(x ?? Date.now())`
    - Metadata `title: x` → `title: x ?? undefined`
    - `ArticleCard` 等共用组件应直接 `import { type Article } from "@/lib/db"` 而非自定义局部 interface，避免类型不兼容

13. **Author.bio 字段**：authors 表实际列名是 `description`，页面若需要 `bio` 字段，在查询时加 `description AS bio`，并在 `Author` interface 中补充 `bio: string | null`。`getAuthorBySlug` 和 `getAllAuthors` 都需要加这个别名。`getArticlesByAuthor` 按 author slug 查询（`WHERE author = ${slug}`），template db.ts 已包含此函数，直接使用即可。

---

## 已建站审查清单（常见违规项）

当用户要求"检查是否符合规范"时，逐条核查以下高频违规点：

| 项 | 检查命令/方式 | 正确做法 |
|---|---|---|
| `experimental.*` 选项 | `grep -n experimental next.config.ts` | 完全删除，规范明确禁止 |
| `force-dynamic` 滥用 | `grep -rn force-dynamic app/` | DB-driven 页改为 `revalidate = 3600`，见上方路由渲染策略规范 |
| 正文用裸 `prose` class | `grep -n prose app/**/page.tsx` | 改为 `[&_h2]:` 等 arbitrary variants |
| author 查询全量 filter | `grep -n getAllArticles app/authors` | 用 `getArticlesByAuthor(slug)` DB 层过滤 |
| `generateStaticParams` 返回空数组或缺失 | 检查所有 `[slug]/page.tsx` | 见上方路由渲染策略规范 |
| `app/loading.tsx` root 级 | `test -f app/loading.tsx` | 必须删除 |
| `next.config.ts` remotePatterns 缺域名 | 检查三个必须域名 | unsplash + placehold.co + *.public.blob.vercel-storage.com |

### `getArticlesByAuthor` 标准实现

`lib/db.ts` 中若无此函数，直接追加：

```ts
export async function getArticlesByAuthor(slug: string): Promise<Article[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT id, site, type, short_title, language, published_time, modified_time,
           author, img, title, description, url
    FROM articles
    WHERE site = ${SITE} AND author = ${slug}
    ORDER BY modified_time DESC NULLS LAST, id DESC
  `;
  return rows as Article[];
}
```

---

## 部署节奏（用户偏好）

**不要在每次修改后自动 build + deploy。** 用户通常会连续提多个修改需求，等用户明确说"部署"再统一执行 `npm run build` + `vercel --prod --yes`。自动部署会浪费 Vercel build 配额，也会打断用户的修改节奏。

---

## Header 下拉菜单 hover 修复

下拉菜单与触发元素之间若有 `mt-1`（4px 间隙），鼠标从触发文字移向子菜单时会短暂离开父容器，触发 `onMouseLeave` 导致菜单关闭。

**修复方式**：去掉 `mt-1`，改用 `marginTop: '-1px'` 让子菜单覆盖 header 底部边框，鼠标路径全程在父容器内：

```tsx
<div className="absolute top-full left-0 w-56 ... py-2 z-50" style={{marginTop: '-1px'}}>
```

不要用 `paddingTop` + `border-t` 组合——会产生一条多余的分隔线。

---

## Next.js 注入自定义 meta 标签

用 `metadata.other` 字段，支持任意 `name/content` 组合：

```ts
export const metadata: Metadata = {
  // ...
  other: { "aplus-core": "aplus.js", "aplus-waiting": "MAN" },
};
```

生成：`<meta name="aplus-core" content="aplus.js">` 等。

## Next.js 注入第三方脚本到 `<head>`

用 `next/script` 的 `<Script>` 组件，`strategy="beforeInteractive"` 确保在页面交互前执行：

```tsx
import Script from "next/script";

// 在 RootLayout 的 <html> 内显式写 <head>：
<html>
  <head>
    <Script id="aplus" strategy="beforeInteractive">{`/* 脚本内容 */`}</Script>
  </head>
  <body>...</body>
</html>
```

---

## 本流水线调用的技能，找不到时先安装

- ui-ux-pro-max： `npx skills add https://github.com/nextlevelbuilder/ui-ux-pro-max-skill --skill ui-ux-pro-max`
- frontend-design：`npx skills add https://github.com/anthropics/skills --skill frontend-design`
- vercel-react-best-practices：`npx skills add https://github.com/vercel-labs/agent-skills --skill vercel-react-best-practices`
