<script setup lang="ts">
import { ref, computed } from 'vue'
import { useTerminalStore } from '@/stores/terminal-store'
import { useI18n } from 'vue-i18n'
import StudioGitPanel from './studio-git-panel.vue'

const store = useTerminalStore()
const { t } = useI18n()

const isLightTheme = computed(() => {
  return store.currentThemeName.includes('Light')
})

// New branch input
const isCreatingBranch = ref(false)
const newBranchName = ref('')
const createError = ref('')

const startCreatingBranch = () => {
  isCreatingBranch.value = true
  newBranchName.value = ''
  createError.value = ''
}

const cancelCreateBranch = () => {
  isCreatingBranch.value = false
  newBranchName.value = ''
  createError.value = ''
}

const confirmCreateBranch = async () => {
  const name = newBranchName.value.trim()
  if (!name) return

  createError.value = ''
  try {
    await store.createStudioBranch(name)
    isCreatingBranch.value = false
    newBranchName.value = ''
  } catch (error: any) {
    createError.value = String(error)
  }
}

const handleBranchInputKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter') {
    confirmCreateBranch()
  } else if (e.key === 'Escape') {
    cancelCreateBranch()
  }
}

// Branch actions
const handleBranchClick = (branchId: string) => {
  store.setActiveStudioBranch(branchId)
}

const handleDeleteBranch = async (branchId: string, event: Event) => {
  event.stopPropagation()
  const branch = store.studioBranches.find(b => b.id === branchId)
  if (!branch) return

  const msg = t('studio.confirmDelete', { name: branch.name })
  if (confirm(msg)) {
    await store.removeStudioBranch(branchId)
  }
}

const isRefreshing = ref(false)
const handleRefresh = async () => {
  isRefreshing.value = true
  try {
    await store.refreshAllGitInfo()
  } finally {
    setTimeout(() => { isRefreshing.value = false }, 400)
  }
}

// Format relative time
const formatTime = (timestamp: number) => {
  const diff = Date.now() - timestamp
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return t('common.justNow')
  if (minutes < 60) return t('common.minutesAgo', { minutes })
  if (hours < 24) return t('common.hoursAgo', { hours })
  return t('common.daysAgo', { days })
}
</script>

<template>
  <div class="studio-sidebar" :class="{ 'light-theme': isLightTheme }">
    <!-- Header spacer -->
    <div class="sidebar-header"></div>

    <!-- Project info -->
    <div class="project-info" v-if="store.studioProject">
      <div class="project-name">{{ store.studioProject.name }}</div>
      <div class="project-meta">
        <span class="default-branch">{{ store.studioProject.defaultBranch }}</span>
      </div>
    </div>

    <!-- Branch list -->
    <div class="branch-list">
      <div
        v-for="branch in store.studioBranches"
        :key="branch.id"
        class="branch-item"
        :class="{ active: branch.id === store.activeStudioBranchId }"
        @click="handleBranchClick(branch.id)"
      >
        <svg class="branch-icon" width="14" height="14" viewBox="0 0 16 16" fill="none">
          <circle cx="5" cy="4" r="2" stroke="currentColor" stroke-width="1.2"/>
          <circle cx="5" cy="12" r="2" stroke="currentColor" stroke-width="1.2"/>
          <circle cx="12" cy="8" r="2" stroke="currentColor" stroke-width="1.2"/>
          <path d="M5 6V10M7 4H10C11.1 4 12 4.9 12 6" stroke="currentColor" stroke-width="1.2"/>
        </svg>
        <div class="branch-info">
          <span class="branch-name">{{ branch.name }}</span>
          <span class="branch-time">{{ formatTime(branch.createdAt) }}</span>
        </div>
        <button
          class="branch-delete"
          @click="handleDeleteBranch(branch.id, $event)"
          :title="t('studio.deleteBranch')"
        >&times;</button>
      </div>

      <!-- Empty state -->
      <div v-if="store.studioBranches.length === 0 && !isCreatingBranch" class="empty-branches">
        <p>{{ t('studio.newBranch') }}</p>
      </div>
    </div>

    <!-- Git panel -->
    <studio-git-panel v-if="store.activeStudioBranchId" />

    <!-- Footer -->
    <div class="sidebar-footer">
      <!-- New branch input -->
      <div v-if="isCreatingBranch" class="new-branch-input-container">
        <input
          v-model="newBranchName"
          class="new-branch-input"
          :placeholder="t('studio.branchNamePlaceholder')"
          @keydown="handleBranchInputKeydown"
          @blur="cancelCreateBranch"
          autofocus
        />
        <div v-if="createError" class="create-error">{{ createError }}</div>
      </div>

      <div v-else class="footer-buttons">
        <button class="footer-btn primary" @click="startCreatingBranch" :title="t('studio.newBranch')">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 1V13M1 7H13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <span>{{ t('studio.newBranch') }}</span>
        </button>
      </div>

      <div class="footer-actions">
        <!-- Refresh git info -->
        <button class="footer-btn" :class="{ spinning: isRefreshing }" @click="handleRefresh" :title="t('studio.gitPanel.refresh')">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M12 7A5 5 0 1 1 7 2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
            <path d="M7 2L10 2L10 5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.studio-sidebar {
  display: flex;
  flex-direction: column;
  width: 240px;
  min-width: 180px;
  max-width: 400px;
  background: #1e1e1e;
  border-right: 1px solid #333;
  user-select: none;
  transition: background 0.3s, border-color 0.3s;
}

.studio-sidebar.light-theme {
  background: #f3f3f3;
  border-right-color: #d4d4d4;
}

/* Header spacer */
.sidebar-header {
  height: 8px;
  flex-shrink: 0;
}

/* Project info */
.project-info {
  padding: 12px 16px;
  border-bottom: 1px solid #333;
  flex-shrink: 0;
}

.light-theme .project-info {
  border-bottom-color: #d4d4d4;
}

.project-name {
  font-size: 14px;
  font-weight: 600;
  color: #e7e7e7;
  margin-bottom: 4px;
}

.light-theme .project-name {
  color: #333;
}

.project-meta {
  display: flex;
  align-items: center;
  gap: 6px;
}

.default-branch {
  font-size: 11px;
  color: #888;
  background: #2d2d30;
  padding: 1px 6px;
  border-radius: 3px;
}

.light-theme .default-branch {
  color: #666;
  background: #e0e0e0;
}

/* Branch list */
.branch-list {
  flex-shrink: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 4px 0;
}

.branch-list::-webkit-scrollbar {
  width: 4px;
}

.branch-list::-webkit-scrollbar-track {
  background: transparent;
}

.branch-list::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 2px;
}

.light-theme .branch-list::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.15);
}

.branch-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  cursor: pointer;
  transition: background 0.15s;
  border-left: 3px solid transparent;
  position: relative;
}

.branch-item:hover {
  background: #2a2d2e;
}

.light-theme .branch-item:hover {
  background: #e8e8e8;
}

.branch-item.active {
  background: #37373d;
  border-left-color: #007acc;
}

.light-theme .branch-item.active {
  background: #e0e0e0;
  border-left-color: #007acc;
}

.branch-icon {
  color: #888;
  flex-shrink: 0;
}

.branch-item.active .branch-icon {
  color: #007acc;
}

.branch-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.branch-name {
  font-size: 13px;
  color: #ccc;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.light-theme .branch-name {
  color: #333;
}

.branch-item.active .branch-name {
  color: #fff;
  font-weight: 500;
}

.light-theme .branch-item.active .branch-name {
  color: #000;
  font-weight: 500;
}

.branch-time {
  font-size: 11px;
  color: #666;
}

.light-theme .branch-time {
  color: #999;
}

.branch-delete {
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

.branch-item:hover .branch-delete {
  opacity: 1;
}

.branch-delete:hover {
  background: #e81123;
  color: white;
}

.empty-branches {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
  color: #666;
  font-size: 13px;
  text-align: center;
}

/* Footer */
.sidebar-footer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 12px;
  border-top: 1px solid #333;
  flex-shrink: 0;
}

.light-theme .sidebar-footer {
  border-top-color: #d4d4d4;
}

.new-branch-input-container {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.new-branch-input {
  width: 100%;
  background: #2d2d30;
  border: 1px solid #007acc;
  color: #e7e7e7;
  padding: 6px 8px;
  font-size: 13px;
  border-radius: 4px;
  outline: none;
  box-sizing: border-box;
}

.light-theme .new-branch-input {
  background: #fff;
  color: #333;
  border-color: #007acc;
}

.create-error {
  font-size: 11px;
  color: #f44;
  padding: 0 4px;
}

.footer-buttons {
  display: flex;
  gap: 4px;
}

.footer-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 32px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  color: #999;
  cursor: pointer;
  transition: all 0.15s;
  padding: 0 8px;
  font-size: 12px;
}

.light-theme .footer-btn {
  color: #666;
}

.footer-btn:hover {
  background: #37373d;
  border-color: #555;
  color: #fff;
}

.light-theme .footer-btn:hover {
  background: #e0e0e0;
  border-color: #ccc;
  color: #000;
}

.footer-btn.primary {
  flex: 1;
  background: #2d2d30;
  border-color: #444;
}

.light-theme .footer-btn.primary {
  background: #e8e8e8;
  border-color: #ccc;
}

.footer-btn.primary:hover {
  background: #37373d;
  border-color: #007acc;
  color: #fff;
}

.light-theme .footer-btn.primary:hover {
  background: #d8d8d8;
  border-color: #007acc;
  color: #000;
}

.footer-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.footer-btn.spinning svg {
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
