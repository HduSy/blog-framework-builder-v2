# Next.js 站点生成规范

**目标**：稳定 + 一次成功 + 节省 token。每条约束服务于让生成阶段少做选择、不踩坑

---

## 1. 技术栈与版本

| 类别 | 包 | 最低版本 | 说明 |
|---|---|---|---|
| Runtime | Node.js | ≥ 20 LTS | Next 16 要求 |
| 包管理 | pnpm | ≥ 9 | Vercel lockfile 兼容 |
| 框架 | next | ≥ 16.2 | App Router only |
| UI 库 | react / react-dom | 19.2（与 Next 16 配套） | RSC + use() hook |
| 类型 | typescript | ≥ 5 | strict 模式 |
| 样式 | tailwindcss | ≥ 4 | v4 是 CSS-first 配置 |
| 样式 | @tailwindcss/postcss | ≥ 4 | v4 必装 |
| 样式 | sass | latest | `.module.scss` 用 |
| 图标 | lucide-react | latest | **唯一允许**的图标库 |
| 数据库 | @neondatabase/serverless | ≥ 1.1 | Postgres 驱动，Edge 兼容 |
| Lint | eslint + eslint-config-next | ≥ 9 / 与 next 同版本 | 脚手架自带 |

> **写代码前先核对实际版本**：`pnpm list <pkg>` / `cat node_modules/<pkg>/package.json | grep version`,以仓库实际版本为准。

---

## 2. 初始化

必须使用**初始化脚手架命令**进行初始化：

```bash
pnpm create next-app@latest {site} \
  --typescript --tailwind --app \
  --no-src-dir --import-alias "@/*"
```

**Next.js 自动识别以下文件，禁止硬编码 `<link>` / `<meta>`**：

| 文件 | 自动行为 |
|---|---|
| `app/icon.{ico,png,svg,tsx}` | `<link rel="icon">` — **必须提供**，用站点主色 + 与站点主题相符的 SVG 图形生成 32×32 favicon（`next/og` ImageResponse），禁止用 emoji 或文字字母，build 后 Route 列表出现 `○ /icon` |
| `app/apple-icon.{png,jpg}` | `<link rel="apple-touch-icon">` |
| `app/opengraph-image.{png,tsx}` | `<meta property="og:image">` |
| `app/twitter-image.{png,tsx}` | `<meta name="twitter:image">` |
| `app/sitemap.ts` | `/sitemap.xml` |
| `app/robots.ts` | `/robots.txt` |
| `app/manifest.ts` | `/manifest.webmanifest` |

---

## 3. SEO（Metadata API + JSON-LD）

**所有 SEO 元数据走 Metadata API**，禁止 JSX 里硬编码 `<title>` / `<meta>` / `<link rel="canonical">`。

### 站点级（`app/layout.tsx`）

```ts
import type { Metadata } from 'next'

export const metadata: Metadata = {
  metadataBase: new URL('https://example.com'),
  title: { default: 'Site Name', template: '%s | Site Name' },
  description: '...',
  openGraph: { type: 'website', siteName: 'Site Name', locale: 'en_US' },
  twitter: { card: 'summary_large_image' },
  alternates: { canonical: '/' },
  robots: { index: true, follow: true },
}
```

### 页面级（动态）

```ts
// app/blog/[slug]/page.tsx
export async function generateMetadata({ params }): Promise<Metadata> {
  const { slug } = await params
  const post = await getPost(slug)
  return {
    title: post.title,
    description: post.excerpt,
    alternates: { canonical: `/blog/${slug}` },
    openGraph: { title: post.title, description: post.excerpt, images: [post.coverImage] },
  }
}
```

### sitemap / robots（允许常见 AI Bots爬取）

```ts
// app/sitemap.ts
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await getAllPosts()
  return [
    { url: 'https://example.com', lastModified: new Date(), priority: 1 },
    ...posts.map(p => ({ url: `https://example.com/blog/${p.slug}`, lastModified: p.updatedAt })),
  ]
}

// app/robots.ts
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: 'https://example.com/sitemap.xml',
  }
}
```

### JSON-LD 结构化数据

在 Server Component 内联 `<script type="application/ld+json">`，**禁止用 `next/script`**：

```tsx
const schema = { '@context': 'https://schema.org', '@type': 'Article', ... }

<script
  type="application/ld+json"
  dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
/>
```

约束：
- `metadataBase` 必填（影响相对 URL 解析）
- `alternates.canonical` 每页都要显式声明
- 多个 schema 用多个 `<script>` 标签，不要合并成数组

---

## 4. 图片优化（`next/image`）

```tsx
import Image from 'next/image'

// 首屏 hero —— priority 必加
<Image src="/hero.jpg" alt="..." width={1920} height={1080} priority />

// 容器自适应
<div className="relative aspect-video">
  <Image src={url} alt="..." fill sizes="(max-width: 768px) 100vw, 50vw" />
</div>
```

约束：
- 禁止裸 `<img>`
- `alt` 必填（TS 类型强制）且值为图片内容相关
- 首屏图加 `priority`，非首屏默认 lazy
- `fill` 模式必配 `sizes`
- 远程图必须在 `next.config.ts` 白名单（**仅这两个域名**）：

```ts
images: {
  remotePatterns: [
    { protocol: 'https', hostname: 'images.unsplash.com' },
    { protocol: 'https', hostname: 'placehold.co' },
  ],
}
```

### 素材策略（强制）

- **真实图优先**：能从 Unsplash 找到合适图就用真实图，确实没有再 `placehold.co`
- **禁止 emoji / 渐变色块作为图片占位**
- **每个图片 URL 写入代码前 `curl -I` 验证 200**：

```bash
for url in $URLS; do
  code=$(curl -o /dev/null -s -w "%{http_code}" -I "$url")
  [ "$code" = "200" ] || echo "DEAD: $url"
done
```

---

## 5. 字体优化（`next/font`）

```tsx
// app/layout.tsx
import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })

export default function RootLayout({ children }) {
  return <html lang="en" className={inter.variable}>...</html>
}
```

约束：
- 禁止 `<link href="fonts.googleapis.com">` 或 `@import url('fonts.googleapis.com')` —— 会引入额外 RTT 和 CLS
- `next/font` 自动 self-host + preload + 零 CLS
- 本地字体用 `next/font/local`
- font-family 通过 CSS 变量在 `globals.css` 引用：`body { font-family: var(--font-inter), system-ui, sans-serif; }`

---

## 6. 渲染与性能

### 渲染策略（按页面类型选）

| 页面类型 | 策略 | 写法 |
|---|---|---|
| 首页 / about / 静态页 | SSG（默认） | 不写任何 export |
| 文章列表 / 文章详情 / DB-driven | **ISR**（默认） | `export const revalidate = 3600` |
| 个性化（用户态、A/B） | force-dynamic（慎用） | `export const dynamic = 'force-dynamic'` |

```ts
// app/blog/[slug]/page.tsx
export const revalidate = 3600

export async function generateStaticParams() {
  const posts = await getAllArticles()
  return posts.map(p => ({ slug: p.short_title }))
}
```

约束：
- 内容站默认 ISR，**不要无脑 SSG**（DB 更新看不到）
- **不要无脑 force-dynamic**（每次请求打 DB → Vercel 函数费用爆炸）
- 动态路由必须 `generateStaticParams` 预生成

### 性能要点

| 关注点 | 做法 |
|---|---|
| Server Components 默认 | 只在需要交互/状态/浏览器 API 时才 `'use client'` |
| 重组件按需加载 | `next/dynamic` 包裹 chart / editor / map 等 |
| 第三方脚本 | `next/script` + `strategy="afterInteractive"`（默认）/ `lazyOnload`（chat widget 等非关键） |
| 内部跳转 | `next/link` 自动 prefetch；外部链接才用裸 `<a>` |
| 静态资源缓存 | Vercel 自动 CDN，无需手配 |

---

## 7. 样式（Tailwind v4 + Sass）

Tailwind v4 是 CSS-first 配置:theme 写在 CSS 的 `@theme` 块里,入口用 `@import "tailwindcss"`,没有 `tailwind.config.ts` 的 `theme.extend`,也没有 `@tailwind base/components/utilities` 三行。

### globals.css

```css
@import "tailwindcss";

@theme {
  --color-primary: #e91e63;       /* 来自 design.md token */
  --color-bg: #ffffff;
  --color-fg: #111111;
  --radius-md: 0.5rem;
  --font-sans: var(--font-inter), system-ui, sans-serif;
}

body { font-family: var(--font-sans); background: var(--color-bg); color: var(--color-fg); }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
```

### 组件样式选择

- 简单：Tailwind 原子类
- 复杂/嵌套/有计算：`Button.module.scss` + `import styles from './Button.module.scss'`
- 不再用纯 CSS Module（Sass module 是超集）

约束：
- 全局 CSS 只在 `app/layout.tsx` import 一次
- 设计 token 在 `@theme` 内定义（来源是 `{site}-design.md`）
- 禁止 inline `<style>` 做主题
- 不写 `tailwind.config.ts` 的 `theme.extend`,token 一律走 `@theme`

---

## 8. 数据库（Neon Postgres）

```ts
// lib/db.ts
import { neon } from "@neondatabase/serverless"

let _sql: ReturnType<typeof neon> | null = null
function getSql() {
  if (!_sql) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error("DATABASE_URL is not set")
    _sql = neon(url)
  }
  return _sql
}

export async function getArticleBySlug(slug: string) {
  const sql = getSql()
  const rows = await sql`SELECT * FROM articles WHERE short_title = ${slug} LIMIT 1`
  return rows[0] ?? null
}
```

约束：
- `DATABASE_URL` 在 `.env.local` + Vercel env（production + preview 都要加）
- `@neondatabase/serverless` 是 HTTP fetch-based，**Edge runtime 兼容**
- 模板查询函数已在 `lib/db.ts` —— 不要重写、按需扩展即可

---

## 9. 错误、加载、空状态

| 文件 | 用途 | 约束 |
|---|---|---|
| `app/not-found.tsx` | 全站 404 | 用 design.md token 写品牌化 404，不允许默认 |
| `app/error.tsx` | 错误边界 | 必须 `'use client'`，至少显示"出错了，请刷新" |
| `app/loading.tsx` | Suspense fallback | **禁止放 root**,只允许子 segment(如 `app/blog/[slug]/loading.tsx`)。root loading 把整站变成 streaming shell,JS 禁用/爬虫只见 skeleton。详见 SKILL.md P12 |
| `<EmptyState>` 组件 | 列表为空 | 友好提示 + 引导链接，不允许返回空 JSX |

```tsx
// 列表页空数据示例
const articles = await getArticlesByType(type)
if (articles.length === 0) {
  return <EmptyState message="暂无内容" cta={{ label: '回到首页', href: '/' }} />
}

// 详情页 not found
import { notFound } from 'next/navigation'
const post = await getArticleBySlug(slug)
if (!post) notFound()
```

约束：
- 路由暴露 = 数据已写入；不要先开空路由占坑
- 404 必须 `notFound()` 触发，不要手动渲染 404 UI

---

## 10. 无障碍：颜色对比度

在 `{site}-design.md` 调色板内组合，每对前/背景色满足 WCAG 2.1：

| 元素层级 | 对比度 | 适用 |
|---|---|---|
| 重要 | **AAA ≥ 7:1** | h1/h2、CTA 文字、活跃 nav |
| 普通 | **AA ≥ 4.5:1** | body、默认 nav、表单 label |
| 弱化 | **A ≥ 2.5:1** | caption、placeholder、disabled |

不达标时挑调色板里另一对组合，**不要临时新加色**。验证：https://webaim.org/resources/contrastchecker/ 或 Chrome DevTools styles 面板 hover 颜色值。

---

## 11. 路由约束

内容驱动的博客类型站点，不应包含任何依赖后端服务的交互与路由，例如:

- 下单 / 购买 / 加入购物车 / 立即结算 / Order / Buy / Add to Cart / Checkout
- 登录 / 注册 / 我的账户 / Sign in / Sign up / Login / Register / My Account
- 订阅(付费) / 会员 / 升级 / Subscribe(paid) / Membership / Upgrade / Pricing
- 支付 / 充值 / 钱包 / Pay / Billing / Wallet
- 客服工单 / 退换货 / 售后 / 联系我们 / Support Ticket / RMA / Concat
- 任何强依赖第三方业务后端的功能页(如"预约面诊"、"在线咨询"、"立即定制")

无参考站 URL 时:
1. **由行业确定 4–8 个主题**
2. 每个主题在导航中以**分类入口**形式出现,而不是把每个主题做成顶级独立菜单
3. 顶级导航固定骨架:`Home / Blog / Categories(下挂 4–8 主题) / Authors / About`,其余移到 Footer
4. 同样适用通用过滤红线:**不出现** Pricing / Sign in / Subscribe(paid) 等条目

最终清单形态(示例,主题由行业决定):
```
- /                       首页
- /blog                   文章列表(ISR)
- /blog/[slug]            文章详情
- /categories             分类索引
- /categories/[slug]      分类下文章列表(slug ∈ {主题1, 主题2, …})
- /authors                作者索引(8–10 位作者,见 site-build Step 1)
- /authors/[slug]         作者主页
- /about                  关于
- /contact                联系(纯展示)
```

## 12. 反模式（禁止清单）

| 禁止 | 改用 | 章节 |
|---|---|---|
| `npm` / `yarn` / `npx create-next-app` | `pnpm create next-app` | §2 |
| 手写基础配置（package.json / tsconfig / next.config） | 脚手架生成后只编辑 | §2 |
| `pages/` Router | `app/` Router | §2 |
| JSX 里手写 `<title>` `<meta>` `<link rel=canonical>` | Metadata API | §3 |
| 手写 `<link rel="icon">` `apple-touch-icon` | `app/icon.*` 文件约定 | §2 |
| 手写 `/sitemap.xml` `/robots.txt` 静态文件 | `app/sitemap.ts` `app/robots.ts` | §3 |
| `next/script` 加载 JSON-LD | Server Component 内联 `<script>` | §3 |
| 裸 `<img>` | `next/image` | §4 |
| emoji / 渐变色块作图片占位 | Unsplash 真实图 + curl 200 | §4 |
| `<link href="fonts.googleapis.com">` | `next/font` | §5 |
| DB-driven 页用 SSG | `revalidate=3600` ISR | §6 |
| 无脑 `force-dynamic` | 仅真个性化场景 | §6 |
| 内部跳转 `<a href="/...">` | `next/link` | §6 |
| 裸 `<script src="...">`（非 JSON-LD） | `next/script` + strategy | §6 |
| `tailwind.config.ts` 的 `theme.extend` 写 token | CSS `@theme` 块 | §7 |
| 全局 CSS 多次 import | 仅 `app/layout.tsx` import 一次 | §7 |
| react-icons / heroicons | `lucide-react` | §1 |
| 多个 lockfile 共存（package-lock + pnpm-lock） | 仅 `pnpm-lock.yaml` | §2 |
| 手写 404 UI | `app/not-found.tsx` + `notFound()` | §9 |
| 空数据返回空 JSX | `<EmptyState>` 组件 | §9 |
| root `app/loading.tsx` | 不放,或下沉到具体 segment;root loading 会让所有 async page 变 streaming shell,JS 禁用看不到内容 | §9 |
| 调色板外临时新加色凑对比度 | 调色板内换组合 | §10 |
| 未跑 §11 验证就交付 | 三类 curl 检查全过 | §11 |
| `experimental.*` 选项 | 不使用 |  |
| `NEXT_PUBLIC_*` 放 secret | 服务器端变量 |  |
