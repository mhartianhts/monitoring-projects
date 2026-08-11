import { createRouter, createWebHistory } from "vue-router";
import AppLayout from "../layouts/AppLayout.vue";
import DashboardView from "../views/DashboardView.vue";
import GitView from "../views/GitView.vue";
import AiChatView from "../views/AiChatView.vue";
import AiAgentView from "../views/AiAgentView.vue";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      component: AppLayout,
      children: [
        {
          path: "",
          name: "dashboard",
          component: DashboardView,
        },
        {
          path: "git",
          name: "git",
          component: GitView,
        },
        {
          path: "agent",
          name: "agent",
          component: AiAgentView,
        },
        {
          path: "ai",
          name: "ai",
          component: AiChatView,
        },
      ],
    },
  ],
});
