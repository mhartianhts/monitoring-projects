<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { useProjectStore } from "../../stores/project.store";
import StatusDot from "../project/StatusDot.vue";

const store = useProjectStore();
const { filtered, selectedId, search, loading } = storeToRefs(store);

const favorites = computed(() => filtered.value.filter((p) => p.favorite));
const others = computed(() => filtered.value.filter((p) => !p.favorite));
const showFavoriteSection = computed(() => favorites.value.length > 0);
const showOtherSection = computed(
  () => others.value.length > 0 && showFavoriteSection.value,
);

const onToggleFavorite = (event: Event, projectId: string) => {
  event.stopPropagation();
  void store.toggleFavorite(projectId);
};
</script>

<template>
  <aside class="flex h-full w-72 shrink-0 flex-col border-r border-line bg-panel">
    <div class="border-b border-line px-4 py-3">
      <input
        v-model="search"
        type="search"
        placeholder="Search project..."
        class="w-full rounded-md border border-line bg-base px-3 py-2 text-sm text-ink outline-none placeholder:text-muted focus:border-accent"
      />
    </div>

    <div class="flex-1 overflow-y-auto p-2">
      <p v-if="loading" class="px-2 py-3 text-sm text-muted">Loading...</p>
      <p v-else-if="filtered.length === 0" class="px-2 py-3 text-sm text-muted">
        No projects found
      </p>

      <template v-else>
        <div v-if="showFavoriteSection" class="mb-1 px-2 pb-1 pt-1">
          <div class="flex items-center gap-2">
            <span class="text-[10px] font-semibold uppercase tracking-[0.18em] text-warn"
              >Favorites</span
            >
            <span class="h-px flex-1 bg-gradient-to-r from-warn/40 to-transparent" />
            <span class="font-mono text-[10px] text-muted">{{ favorites.length }}</span>
          </div>
        </div>

        <button
          v-for="project in favorites"
          :key="`fav-${project.id}`"
          type="button"
          class="mb-1 flex w-full items-center gap-2 rounded-md border border-transparent px-3 py-2.5 text-left transition"
          :class="
            selectedId === project.id
              ? 'border-warn/20 bg-elevated text-ink'
              : 'text-muted hover:bg-elevated/60 hover:text-ink'
          "
          @click="store.selectProject(project.id)"
        >
          <StatusDot :status="project.status" />
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm font-medium">{{ project.name }}</span>
            <span class="block truncate text-xs text-muted"
              >{{ project.type }} · {{ project.id }}</span
            >
          </span>
          <span
            role="button"
            tabindex="0"
            class="shrink-0 px-1 text-base leading-none text-warn transition hover:scale-110"
            title="Hapus favorit"
            @click="onToggleFavorite($event, project.id)"
            @keydown.enter.prevent="onToggleFavorite($event, project.id)"
          >
            ★
          </span>
        </button>

        <div v-if="showOtherSection" class="my-3 px-2">
          <div class="flex items-center gap-2">
            <span class="h-px flex-1 bg-gradient-to-r from-transparent via-line to-transparent" />
            <span class="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted"
              >All projects</span
            >
            <span class="h-px flex-1 bg-gradient-to-r from-transparent via-line to-transparent" />
          </div>
        </div>

        <div
          v-else-if="!showFavoriteSection && others.length > 0"
          class="mb-1 px-2 pb-1 pt-1"
        >
          <div class="flex items-center gap-2">
            <span class="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted"
              >All projects</span
            >
            <span class="h-px flex-1 bg-gradient-to-r from-line to-transparent" />
          </div>
        </div>

        <button
          v-for="project in others"
          :key="`all-${project.id}`"
          type="button"
          class="mb-1 flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left transition"
          :class="
            selectedId === project.id
              ? 'bg-elevated text-ink'
              : 'text-muted hover:bg-elevated/60 hover:text-ink'
          "
          @click="store.selectProject(project.id)"
        >
          <StatusDot :status="project.status" />
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm font-medium">{{ project.name }}</span>
            <span class="block truncate text-xs text-muted"
              >{{ project.type }} · {{ project.id }}</span
            >
          </span>
          <span
            role="button"
            tabindex="0"
            class="shrink-0 px-1 text-base leading-none text-muted/50 transition hover:text-warn"
            title="Jadikan favorit"
            @click="onToggleFavorite($event, project.id)"
            @keydown.enter.prevent="onToggleFavorite($event, project.id)"
          >
            ☆
          </span>
        </button>
      </template>
    </div>

    <div class="border-t border-line px-4 py-3 text-xs text-muted">
      {{ filtered.length }} project(s)
      <button
        type="button"
        class="ml-2 text-accent hover:underline"
        @click="store.fetchProjects()"
      >
        Rescan
      </button>
    </div>
  </aside>
</template>
