import { defineConfig } from "vitepress";

const nav = [
  { text: "Guide", link: "/" },
  { text: "Development", link: "/maintain" },
  { text: "Reference", link: "/reference/" },
  { text: "ADRs", link: "/adr/" },
  { text: "GitHub", link: "https://github.com/0xnayuta/devkit-pi" },
];

const zhNav = [
  { text: "指南", link: "/zh/" },
  { text: "开发参考", link: "/zh/maintain" },
  { text: "参考", link: "/zh/reference/" },
  { text: "ADRs", link: "/zh/adr/" },
  { text: "GitHub", link: "https://github.com/0xnayuta/devkit-pi" },
];

const referenceSidebar = [
  {
    text: "Reference",
    items: [
      { text: "Reference Overview", link: "/reference/" },
      { text: "Configuration", link: "/reference/configuration" },
      { text: "Subagents", link: "/reference/subagents" },
      { text: "Subagent Tool", link: "/reference/subagent-tool" },
      { text: "Agent Definition", link: "/reference/agent-definition" },
      { text: "Result Schema", link: "/reference/result-schema" },
      { text: "Web Tools", link: "/reference/web-tools" },
      { text: "Web Providers", link: "/reference/web-providers" },
      { text: "Web Error Codes", link: "/reference/web-tools-error-codes" },
      { text: "LSP Tools", link: "/reference/lsp-tools" },
      { text: "Toolkit Commands", link: "/reference/toolkit-commands" },
    ],
  },
];

const zhReferenceSidebar = [
  {
    text: "参考",
    items: [
      { text: "参考概览", link: "/zh/reference/" },
      { text: "配置", link: "/zh/reference/configuration" },
      { text: "Subagents", link: "/zh/reference/subagents" },
      { text: "Subagent 工具", link: "/zh/reference/subagent-tool" },
      { text: "Agent 定义", link: "/zh/reference/agent-definition" },
      { text: "结果 Schema", link: "/zh/reference/result-schema" },
      { text: "Web 工具", link: "/zh/reference/web-tools" },
      { text: "Web Providers", link: "/zh/reference/web-providers" },
      { text: "Web 错误码", link: "/zh/reference/web-tools-error-codes" },
      { text: "LSP 工具", link: "/zh/reference/lsp-tools" },
      { text: "Toolkit 命令", link: "/zh/reference/toolkit-commands" },
    ],
  },
];

const adrSidebar = [
  {
    text: "ADRs — Historical Decisions",
    items: [
      { text: "ADR Overview", link: "/adr/" },
      { text: "ADR 0001 — Lightweight Foreground Subagents", link: "/adr/0001-lightweight-foreground-subagents" },
      { text: "ADR 0002 — MVP Boundary Decisions", link: "/adr/0002-mvp-boundary-decisions" },
      { text: "ADR 0003 — Autonomous Subagent Triggering", link: "/adr/0003-autonomous-subagent-triggering" },
      { text: "ADR 0004 — Bundled Readonly Web Tools", link: "/adr/0004-bundled-readonly-web-tools" },
      { text: "ADR 0005 — Evolve into devkit-pi", link: "/adr/0005-evolve-into-devkit-pi" },
      { text: "ADR 0006 — Architecture Consistency over Legacy Layout", link: "/adr/0006-architecture-consistency-over-legacy-layout" },
    ],
  },
];

const zhAdrSidebar = [
  {
    text: "ADRs — 历史决策记录",
    items: [
      { text: "ADR 概述", link: "/zh/adr/" },
      { text: "ADR 0001 — 采用轻量 foreground subagent 设计", link: "/zh/adr/0001-lightweight-foreground-subagents" },
      { text: "ADR 0002 — MVP 边界决策", link: "/zh/adr/0002-mvp-boundary-decisions" },
      { text: "ADR 0003 — 自主触发子代理的改进方案", link: "/zh/adr/0003-autonomous-subagent-triggering" },
      { text: "ADR 0004 — 内置极简 readonly web tools", link: "/zh/adr/0004-bundled-readonly-web-tools" },
      { text: "ADR 0005 — 从 pi-subagents 演进为 devkit-pi", link: "/zh/adr/0005-evolve-into-devkit-pi" },
      { text: "ADR 0006 — 架构一致性优先于遗留布局", link: "/zh/adr/0006-architecture-consistency-over-legacy-layout" },
    ],
  },
];

const guideSidebar = [
  {
    text: "Guide",
    items: [
      { text: "Overview", link: "/" },
      { text: "Goals and Scope", link: "/guides/goals-and-scope" },
      { text: "Security Model", link: "/guides/security-model" },
      { text: "fetch_content Enhancement", link: "/guides/fetch_content-enhancement" },
    ],
  },
];

const zhGuideSidebar = [
  {
    text: "指南",
    items: [
      { text: "概览", link: "/zh/" },
      { text: "目标与范围", link: "/zh/guides/goals-and-scope" },
      { text: "安全模型", link: "/zh/guides/security-model" },
      { text: "fetch_content 增强", link: "/zh/guides/fetch_content-enhancement" },
    ],
  },
];

const maintainSidebar = [
  {
    text: "Development",
    items: [
      { text: "Overview", link: "/maintain" },
      { text: "Architecture", link: "/guides/architecture" },
      { text: "Extension API", link: "/guides/extension-api" },
      { text: "Testing", link: "/guides/testing" },
      { text: "Release Checklist", link: "/guides/release-checklist" },
      { text: "Issue Log", link: "/issues/" },
      { text: "Planning", link: "/planning/" },
      { text: "Archive", link: "/archive/" },
    ],
  },
];

const zhMaintainSidebar = [
  {
    text: "开发参考",
    items: [
      { text: "概览", link: "/zh/maintain" },
      { text: "架构", link: "/zh/guides/architecture" },
      { text: "扩展 API", link: "/zh/guides/extension-api" },
      { text: "测试", link: "/zh/guides/testing" },
      { text: "发布清单", link: "/zh/guides/release-checklist" },
      { text: "问题日志", link: "/zh/issues/" },
      { text: "规划文档", link: "/zh/planning/" },
      { text: "归档文档", link: "/zh/archive/" },
    ],
  },
];

export default defineConfig({
  title: "devkit-pi",
  head: [
    ["link", { rel: "icon", type: "image/png", href: "/favicon.png" }],
    ["link", { rel: "apple-touch-icon", href: "/apple-touch-icon.png" }],
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:title", content: "devkit-pi" }],
    ["meta", { property: "og:description", content: "Personal pi coding toolkit for subagents, Web tools, LSP code intelligence, and developer commands." }],
    ["meta", { property: "og:url", content: "https://devkit-pi.wangyan.life/" }],
    ["meta", { property: "og:image", content: "https://devkit-pi.wangyan.life/social-preview.png" }],
    ["meta", { name: "twitter:card", content: "summary_large_image" }],
    ["meta", { name: "twitter:title", content: "devkit-pi" }],
    ["meta", { name: "twitter:description", content: "Personal pi coding toolkit for subagents, Web tools, LSP code intelligence, and developer commands." }],
    ["meta", { name: "twitter:image", content: "https://devkit-pi.wangyan.life/social-preview.png" }],
  ],
  description:
    "A personal pi coding toolkit for subagents, Web tools, LSP code intelligence, and developer commands.",
  // Current deployment target: custom subdomain https://devkit-pi.wangyan.life/.
  // Custom subdomain deployments should use base: "/".
  // If this site later moves back to a GitHub Pages repository path,
  // such as https://www.wangyan.life/devkit-pi/ or https://0xnayuta.github.io/devkit-pi/,
  // change this back to base: "/devkit-pi/".
  base: "/",
  cleanUrls: true,
  // These links intentionally point outside the VitePress docs root for GitHub rendering.
  // Keep them in Markdown and ignore them during VitePress dead-link checks.
  ignoreDeadLinks: ["./../README", "./../README.zh", "./../../CHANGELOG", "./../../../CHANGELOG"],
  locales: {
    root: {
      label: "English",
      lang: "en",
      themeConfig: {
        nav,
        sidebar: {
          "/reference/": referenceSidebar,
          "/adr/": adrSidebar,
          "/maintain/": maintainSidebar,
          "/": guideSidebar,
        },
      },
    },
    zh: {
      label: "简体中文",
      lang: "zh-CN",
      title: "devkit-pi",
      description: "面向个人工作流的一体化 pi coding 工具包。",
      themeConfig: {
        nav: zhNav,
        sidebar: {
          "/zh/reference/": zhReferenceSidebar,
          "/zh/adr/": zhAdrSidebar,
          "/zh/maintain/": zhMaintainSidebar,
          "/zh/": zhGuideSidebar,
        },
      },
    },
  },
  themeConfig: {
    search: {
      provider: "local",
    },
  },
});
