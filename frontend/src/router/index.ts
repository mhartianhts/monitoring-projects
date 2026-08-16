import { createRouter, createWebHistory } from "vue-router";
import AppLayout from "../layouts/AppLayout.vue";
import DashboardView from "../views/DashboardView.vue";
import GitView from "../views/GitView.vue";
import TracesView from "../views/TracesView.vue";
import CodeGraphView from "../views/CodeGraphView.vue";
import OpenApiView from "../views/OpenApiView.vue";

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
          meta: { requiresProjectSidebar: true },
        },
        {
          path: "git",
          name: "git",
          component: GitView,
          meta: { requiresProjectSidebar: true },
        },
        {
          path: "traces",
          name: "traces",
          component: TracesView,
          meta: { requiresProjectSidebar: true },
        },
        {
          path: "graph",
          name: "graph",
          component: CodeGraphView,
          meta: { requiresProjectSidebar: true },
        },
        {
          path: "api-docs",
          name: "api-docs",
          component: OpenApiView,
          meta: { requiresProjectSidebar: true },
        },
      ],
    },
  ],
});
