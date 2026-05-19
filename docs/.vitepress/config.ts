import { defineConfig } from "vitepress";

const nav = [
  { text: "Guide", link: "/" },
  { text: "Reference", link: "/reference/" },
  { text: "GitHub", link: "https://github.com/0xnayuta/devkit-pi" },
];

const zhNav = [
  { text: "指南", link: "/zh/" },
  { text: "参考", link: "/zh/reference/" },
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
      { text: "Convert Tools", link: "/reference/convert-tools" },
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
      { text: "Convert 工具", link: "/zh/reference/convert-tools" },
      { text: "Toolkit 命令", link: "/zh/reference/toolkit-commands" },
    ],
  },
];

const guideSidebar = [
  {
    text: "Guide",
    items: [
      { text: "Overview", link: "/" },
      { text: "Goals and Scope", link: "/guides/goals-and-scope" },
      { text: "Agent Workflow", link: "/guides/agent-workflow" },
      { text: "Security Model", link: "/guides/security-model" },
    ],
  },
];

const zhGuideSidebar = [
  {
    text: "指南",
    items: [
      { text: "概览", link: "/zh/" },
      { text: "目标与范围", link: "/zh/guides/goals-and-scope" },
      { text: "Agent Workflow", link: "/zh/guides/agent-workflow" },
      { text: "安全模型", link: "/zh/guides/security-model" },
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
    ["meta", { property: "og:description", content: "Personal pi coding toolkit for subagents, Web tools, content conversion, LSP code intelligence, developer commands, and workflow reminders." }],
    ["meta", { property: "og:url", content: "https://devkit-pi.wangyan.life/" }],
    ["meta", { property: "og:image", content: "https://devkit-pi.wangyan.life/social-preview.png" }],
    ["meta", { name: "twitter:card", content: "summary_large_image" }],
    ["meta", { name: "twitter:title", content: "devkit-pi" }],
    ["meta", { name: "twitter:description", content: "Personal pi coding toolkit for subagents, Web tools, content conversion, LSP code intelligence, developer commands, and workflow reminders." }],
    ["meta", { name: "twitter:image", content: "https://devkit-pi.wangyan.life/social-preview.png" }],
  ],
  description:
    "A personal pi coding toolkit for subagents, Web tools, content conversion, LSP code intelligence, developer commands, and workflow reminders.",
  base: "/",
  cleanUrls: true,
  ignoreDeadLinks: ["./../README", "./../README.zh", "./../../CHANGELOG", "./../../../CHANGELOG"],
  locales: {
    root: {
      label: "English",
      lang: "en",
      themeConfig: {
        nav,
        sidebar: {
          "/reference/": referenceSidebar,
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
