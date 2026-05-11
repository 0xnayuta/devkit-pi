import { defineConfig } from "vitepress";

export default defineConfig({
  title: "devkit-pi",
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
  ignoreDeadLinks: ["./../README", "./../README.zh", "./../../CHANGELOG"],
  themeConfig: {
    nav: [
      { text: "Guide", link: "/" },
      { text: "Reference", link: "/reference/" },
      { text: "Development", link: "/development/docs-restructure-plan" },
      { text: "ADRs", link: "/adr/" },
      { text: "GitHub", link: "https://github.com/0xnayuta/devkit-pi" },
    ],
    search: {
      provider: "local",
    },
    sidebar: {
      "/reference/": [
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
      ],
      "/development/": [
        {
          text: "Development",
          items: [
            { text: "Docs Restructure Plan", link: "/development/docs-restructure-plan" },
            {
              text: "Pre-VitePress Audit",
              link: "/development/docs-audit-before-vitepress",
            },
            { text: "VitePress IA Plan", link: "/development/vitepress-ia-plan" },
            { text: "Issue Log", link: "/issues/issue-log" },
          ],
        },
      ],
      "/issues/": [
        {
          text: "Development",
          items: [
            { text: "Docs Restructure Plan", link: "/development/docs-restructure-plan" },
            {
              text: "Pre-VitePress Audit",
              link: "/development/docs-audit-before-vitepress",
            },
            { text: "VitePress IA Plan", link: "/development/vitepress-ia-plan" },
            { text: "Issue Log", link: "/issues/issue-log" },
          ],
        },
      ],
      "/adr/": [
        {
          text: "ADRs — Historical Decisions",
          items: [
            { text: "ADR Overview", link: "/adr/" },
            { text: "0001 Lightweight Foreground Subagents", link: "/adr/0001-lightweight-foreground-subagents" },
            { text: "0002 MVP Boundary Decisions", link: "/adr/0002-mvp-boundary-decisions" },
            { text: "0003 Autonomous Subagent Triggering", link: "/adr/0003-autonomous-subagent-triggering" },
            { text: "0004 Bundled Readonly Web Tools", link: "/adr/0004-bundled-readonly-web-tools" },
            { text: "0005 Evolve Into devkit-pi", link: "/adr/0005-evolve-into-devkit-pi" },
          ],
        },
      ],
      "/": [
        {
          text: "Guide",
          items: [
            { text: "Overview", link: "/" },
            { text: "Goals and Scope", link: "/guides/goals-and-scope" },
            { text: "Architecture", link: "/guides/architecture" },
            { text: "Extension API", link: "/guides/extension-api" },
            { text: "Security Model", link: "/guides/security-model" },
            { text: "Testing", link: "/guides/testing" },
            { text: "Release Checklist", link: "/guides/release-checklist" },
            { text: "fetch_content Enhancement", link: "/guides/fetch_content-enhancement" },
          ],
        },
      ],
    },
  },
});
