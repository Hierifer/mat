<script setup lang="ts">
import { computed } from 'vue'
import { useTerminalStore } from '@/stores/terminal-store'
import { useI18n } from 'vue-i18n'
import IconFont from '@/components/ui/icon-font.vue'
import { formatTime } from '@/utils/format-time'

const store = useTerminalStore()
const { t } = useI18n()

const emit = defineEmits<{
  (e: 'open', path: string): void
  (e: 'browse'): void
}>()

const isLightTheme = computed(() => store.currentThemeName.includes('Light'))

const shortenPath = (path: string) => {
  return path
    .replace(/^\/Users\/[^/]+/, '~')
    .replace(/^\/home\/[^/]+/, '~')
}

const handleRemove = (path: string, event: Event) => {
  event.stopPropagation()
  store.removeRecentProject(path)
}
</script>

<template>
  <div class="studio-home" :class="{ 'light-theme': isLightTheme }">
    <div class="home-inner">
      <div class="home-header">
        <h2 class="home-title">{{ t('studio.recentProjects') }}</h2>
        <button class="open-project-btn" @click="emit('browse')">
          <icon-font name="folder" :size="13" />
          <span>{{ t('studio.openProject') }}</span>
        </button>
      </div>

      <div v-if="store.studioRecentProjects.length === 0" class="home-empty">
        <icon-font name="branch" :size="48" style="opacity: 0.3; margin-bottom: 12px;" />
        <p>{{ t('studio.noRecentProjects') }}</p>
      </div>

      <div v-else class="project-list">
        <div
          v-for="project in store.studioRecentProjects"
          :key="project.path"
          class="project-item"
          @click="emit('open', project.path)"
        >
          <icon-font class="project-icon" name="folder" :size="16" />
          <div class="project-info">
            <span class="project-name">{{ project.name }}</span>
            <span class="project-path">{{ shortenPath(project.path) }}</span>
          </div>
          <span class="project-time">{{ formatTime(project.lastOpenedAt) }}</span>
          <button
            class="project-remove"
            @click="handleRemove(project.path, $event)"
            :title="t('studio.removeFromRecent')"
          ><icon-font name="close" :size="10" /></button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.studio-home {
  flex: 1;
  overflow-y: auto;
  background: #1e1e1e;
  transition: background 0.3s;
}

.studio-home.light-theme {
  background: #f3f3f3;
}

.home-inner {
  max-width: 640px;
  margin: 0 auto;
  padding: 48px 24px;
}

.home-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.home-title {
  font-size: 18px;
  font-weight: 500;
  color: #e7e7e7;
  margin: 0;
}

.light-theme .home-title {
  color: #333;
}

.open-project-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #2d2d30;
  border: 1px solid #444;
  border-radius: 4px;
  color: #ccc;
  cursor: pointer;
  font-size: 12px;
  padding: 6px 12px;
  transition: all 0.15s;
}

.open-project-btn:hover {
  background: #37373d;
  border-color: #007acc;
  color: #fff;
}

.light-theme .open-project-btn {
  background: #e8e8e8;
  border-color: #ccc;
  color: #333;
}

.light-theme .open-project-btn:hover {
  background: #d8d8d8;
  border-color: #007acc;
  color: #000;
}

.home-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 64px 0;
  color: #666;
  font-size: 14px;
}

.project-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.project-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: #252526;
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
}

.project-item:hover {
  background: #2d2d30;
  border-color: #007acc;
}

.light-theme .project-item {
  background: #eaeaea;
}

.light-theme .project-item:hover {
  background: #e0e0e0;
  border-color: #007acc;
}

.project-icon {
  color: #888;
  flex-shrink: 0;
}

.project-item:hover .project-icon {
  color: #007acc;
}

.project-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.project-name {
  font-size: 14px;
  font-weight: 500;
  color: #e7e7e7;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.light-theme .project-name {
  color: #333;
}

.project-path {
  font-size: 11px;
  color: #888;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: 'SF Mono', 'Monaco', 'Menlo', monospace;
}

.light-theme .project-path {
  color: #999;
}

.project-time {
  font-size: 11px;
  color: #666;
  flex-shrink: 0;
}

.project-remove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  background: transparent;
  border: none;
  border-radius: 3px;
  color: #666;
  cursor: pointer;
  font-size: 16px;
  padding: 0;
  transition: all 0.15s;
  opacity: 0;
  flex-shrink: 0;
}

.project-item:hover .project-remove {
  opacity: 1;
}

.project-remove:hover {
  background: #e81123;
  color: white;
}
</style>
