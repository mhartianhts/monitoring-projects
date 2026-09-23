import { createRouter, createWebHistory } from "vue-router";
import AppLayout from "../layouts/AppLayout.vue";
import DashboardView from "../views/DashboardView.vue";
import GitView from "../views/GitView.vue";
import DocsView from "../views/DocsView.vue";
import ConverterView from "../views/ConverterView.vue";
import LocalShareView from "../views/LocalShareView.vue";
import MobileShareView from "../views/MobileShareView.vue";
import EnvManagerView from "../views/EnvManagerView.vue";
import TelegramView from "../views/TelegramView.vue";
import WebhookInboxView from "../views/WebhookInboxView.vue";
import TerminalView from "../views/TerminalView.vue";
import ChatbotView from "../views/ChatbotView.vue";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/mobile-share",
      name: "mobile-share",
      component: MobileShareView,
    },
    {
      path: "/",
      component: AppLayout,
      children: [
        {
          path: "",
          name: "dashboard",
          component: DashboardView,
          meta: { requiresProjectSidebar: true },
        },
        {
          path: "git",
          name: "git",
          component: GitView,
          meta: { requiresProjectSidebar: true },
        },
        {
          path: "env",
          name: "env",
          component: EnvManagerView,
          meta: { requiresProjectSidebar: true },
        },
        {
          path: "terminal",
          name: "terminal",
          component: TerminalView,
          meta: { requiresProjectSidebar: true },
        },
        {
          path: "telegram",
          name: "telegram",
          component: TelegramView,
          meta: { requiresProjectSidebar: true },
        },
        {
          path: "webhook",
          name: "webhook",
          component: WebhookInboxView,
          meta: { requiresProjectSidebar: true },
        },
        {
          path: "chat",
          name: "chat",
          component: ChatbotView,
          meta: { requiresProjectSidebar: true },
        },
        {
          path: "docs",
          name: "docs",
          component: DocsView,
          meta: { requiresProjectSidebar: true },
        },
        {
          path: "converter",
          name: "converter",
          component: ConverterView,
          meta: { requiresProjectSidebar: true },
        },
        {
          path: "share",
          name: "share",
          component: LocalShareView,
          meta: { requiresProjectSidebar: true },
        },
      ],
    },
  ],
});
