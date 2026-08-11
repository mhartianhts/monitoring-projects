<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useProjectStore } from "../stores/project.store";
import ProjectHeader from "../components/project/ProjectHeader.vue";
import ProcessStats from "../components/project/ProcessStats.vue";
import LogViewer from "../components/log/LogViewer.vue";

const store = useProjectStore();
const { selected, logs, actionLoading, availableEditors } = storeToRefs(store);
</script>

<template>
  <main class="flex min-w-0 flex-1 flex-col">
    <template v-if="selected">
      <ProjectHeader
        :project="selected"
        :busy="actionLoading"
        :editors="availableEditors"
        @start="store.runAction('start')"
        @stop="store.runAction('stop')"
        @restart="store.runAction('restart')"
        @open-folder="store.openFolder()"
        @open-browser="store.openBrowser()"
        @open-editor="store.openEditor"
      />
      <ProcessStats
        :stats="selected.stats"
        :running="selected.status === 'running'"
      />
      <LogViewer :logs="logs" @clear="store.clearLogs()" />
    </template>

    <div v-else class="flex flex-1 items-center justify-center text-muted">
      Pilih project dari sidebar
    </div>
  </main>
</template>
