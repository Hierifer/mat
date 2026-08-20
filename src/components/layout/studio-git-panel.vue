<script setup lang="ts">
import { ref, computed } from 'vue'
import { useTerminalStore } from '@/stores/terminal-store'
import { useI18n } from 'vue-i18n'
import IconFont from '@/components/ui/icon-font.vue'
import { formatTime } from '@/utils/format-time'

const store = useTerminalStore()
const { t } = useI18n()

const isLightTheme = computed(() => store.currentThemeName.includes('Light'))

// Section collapse state
const changesOpen = ref(true)
const stashesOpen = ref(true)
const commitsOpen = ref(false)

// Stash input
const stashMessage = ref('')
const stashIncludeUntracked = ref(false)

// Grouped status
const stagedFiles = computed(() => store.studioGitStatus.filter(f => f.staged))
const modifiedFiles = computed(() => store.studioGitStatus.filter(f => !f.staged && f.status !== 'new'))
const untrackedFiles = computed(() => store.studioGitStatus.filter(f => !f.staged && f.status === 'new'))

// Actions
const handleSaveStash = async () => {
  try {
    await store.saveStash(stashMessage.value || undefined, stashIncludeUntracked.value)
    stashMessage.value = ''
  } catch (error) {
    console.error('Failed to save stash:', error)
  }
}

const handlePopStash = async (index: number) => {
  try {
    await store.popStash(index)
  } catch (error) {
    console.error('Failed to pop stash:', error)
  }
}

const handleApplyStash = async (index: number) => {
  try {
    await store.applyStash(index)
  } catch (error) {
    console.error('Failed to apply stash:', error)
  }
}

const handleDropStash = async (index: number) => {
  const msg = t('studio.gitPanel.stashConfirmDrop')
  if (confirm(msg)) {
    try {
      await store.dropStash(index)
    } catch (error) {
      console.error('Failed to drop stash:', error)
    }
  }
}


// Status dot color
const statusColor = (status: string, staged: boolean): string => {
  if (staged) return '#73c991'      // green
  if (status === 'new') return '#888'   // gray
  return '#e2a052'                      // orange
}
</script>

<template>
  <div class="git-panel" :class="{ 'light-theme': isLightTheme }">
    <!-- Changes section -->
    <div class="section">
      <div class="section-header" @click="changesOpen = !changesOpen">
        <icon-font class="chevron" :class="{ open: changesOpen }" name="fold" :size="10" />
        <span class="section-title">{{ t('studio.gitPanel.status') }}</span>
        <span v-if="store.studioGitStatus.length" class="section-badge">{{ store.studioGitStatus.length }}</span>
      </div>
      <div v-if="changesOpen" class="section-content">
        <template v-if="store.studioGitStatus.length === 0">
          <div class="empty-state">{{ t('studio.gitPanel.noChanges') }}</div>
        </template>
        <template v-else>
          <!-- Staged -->
          <template v-if="stagedFiles.length">
            <div class="group-label">{{ t('studio.gitPanel.staged') }}</div>
            <div v-for="file in stagedFiles" :key="'s-' + file.path" class="file-item">
              <span class="status-dot" :style="{ background: statusColor(file.status, true) }"></span>
              <span class="file-path">{{ file.path }}</span>
            </div>
          </template>
          <!-- Modified -->
          <template v-if="modifiedFiles.length">
            <div class="group-label">{{ t('studio.gitPanel.modified') }}</div>
            <div v-for="file in modifiedFiles" :key="'m-' + file.path" class="file-item">
              <span class="status-dot" :style="{ background: statusColor(file.status, false) }"></span>
              <span class="file-path">{{ file.path }}</span>
            </div>
          </template>
          <!-- Untracked -->
          <template v-if="untrackedFiles.length">
            <div class="group-label">{{ t('studio.gitPanel.untracked') }}</div>
            <div v-for="file in untrackedFiles" :key="'u-' + file.path" class="file-item">
              <span class="status-dot" :style="{ background: statusColor(file.status, false) }"></span>
              <span class="file-path">{{ file.path }}</span>
            </div>
          </template>
        </template>
      </div>
    </div>

    <!-- Stashes section -->
    <div class="section">
      <div class="section-header" @click="stashesOpen = !stashesOpen">
        <icon-font class="chevron" :class="{ open: stashesOpen }" name="fold" :size="10" />
        <span class="section-title">{{ t('studio.gitPanel.stash') }}</span>
        <span v-if="store.studioGitStashes.length" class="section-badge">{{ store.studioGitStashes.length }}</span>
      </div>
      <div v-if="stashesOpen" class="section-content">
        <!-- Stash save input -->
        <div class="stash-input-row">
          <input
            v-model="stashMessage"
            class="stash-input"
            :placeholder="t('studio.gitPanel.stashMessagePlaceholder')"
            @keydown.enter="handleSaveStash"
          />
          <button class="stash-save-btn" @click="handleSaveStash">{{ t('studio.gitPanel.stashSave') }}</button>
        </div>
        <label class="stash-untracked-label">
          <input type="checkbox" v-model="stashIncludeUntracked" />
          <span>{{ t('studio.gitPanel.stashIncludeUntracked') }}</span>
        </label>

        <!-- Stash list -->
        <template v-if="store.studioGitStashes.length === 0">
          <div class="empty-state">{{ t('studio.gitPanel.stashEmpty') }}</div>
        </template>
        <div v-else v-for="stash in store.studioGitStashes" :key="stash.index" class="stash-item">
          <div class="stash-info">
            <span class="stash-message">{{ stash.message }}</span>
            <span class="stash-time">{{ formatTime(stash.timestamp, 's') }}</span>
          </div>
          <div class="stash-actions">
            <button class="stash-action-btn" @click="handlePopStash(stash.index)" :title="t('studio.gitPanel.stashPop')">Pop</button>
            <button class="stash-action-btn" @click="handleApplyStash(stash.index)" :title="t('studio.gitPanel.stashApply')">Apply</button>
            <button class="stash-action-btn danger" @click="handleDropStash(stash.index)" :title="t('studio.gitPanel.stashDrop')">Drop</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Commits section -->
    <div class="section">
      <div class="section-header" @click="commitsOpen = !commitsOpen">
        <icon-font class="chevron" :class="{ open: commitsOpen }" name="fold" :size="10" />
        <span class="section-title">{{ t('studio.gitPanel.log') }}</span>
        <span v-if="store.studioGitLog.length" class="section-badge">{{ store.studioGitLog.length }}</span>
      </div>
      <div v-if="commitsOpen" class="section-content commits-scroll">
        <template v-if="store.studioGitLog.length === 0">
          <div class="empty-state">{{ t('studio.gitPanel.logEmpty') }}</div>
        </template>
        <div v-else v-for="commit in store.studioGitLog" :key="commit.hash" class="commit-item">
          <span class="commit-hash">{{ commit.short_hash }}</span>
          <span class="commit-message">{{ commit.message }}</span>
          <span class="commit-time">{{ formatTime(commit.timestamp, 's') }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.git-panel {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  max-height: 60%;
  overflow-y: auto;
  overflow-x: hidden;
  border-top: 1px solid #333;
}

.light-theme.git-panel {
  border-top-color: #d4d4d4;
}

.git-panel::-webkit-scrollbar {
  width: 4px;
}

.git-panel::-webkit-scrollbar-track {
  background: transparent;
}

.git-panel::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 2px;
}

.light-theme .git-panel::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.15);
}

/* Section */
.section {
  border-bottom: 1px solid #2d2d30;
}

.light-theme .section {
  border-bottom-color: #e0e0e0;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  cursor: pointer;
  user-select: none;
  transition: background 0.15s;
}

.section-header:hover {
  background: #2a2d2e;
}

.light-theme .section-header:hover {
  background: #e8e8e8;
}

.chevron {
  color: #888;
  transition: transform 0.15s;
  flex-shrink: 0;
  /* fold icon points up; closed = right, open = down */
  transform: rotate(90deg);
}

.chevron.open {
  transform: rotate(180deg);
}

.section-title {
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #aaa;
}

.light-theme .section-title {
  color: #666;
}

.section-badge {
  font-size: 10px;
  background: #3c3c3c;
  color: #ccc;
  padding: 0 5px;
  border-radius: 8px;
  min-width: 16px;
  text-align: center;
}

.light-theme .section-badge {
  background: #d4d4d4;
  color: #555;
}

.section-content {
  padding: 4px 12px 8px;
}

/* File status items */
.group-label {
  font-size: 10px;
  color: #666;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 6px 0 2px;
}

.light-theme .group-label {
  color: #999;
}

.file-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 0;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.file-path {
  font-size: 12px;
  color: #ccc;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: 'SF Mono', 'Monaco', 'Menlo', monospace;
}

.light-theme .file-path {
  color: #333;
}

/* Stash input */
.stash-input-row {
  display: flex;
  gap: 4px;
  margin-bottom: 4px;
}

.stash-input {
  flex: 1;
  background: #2d2d30;
  border: 1px solid #444;
  color: #e7e7e7;
  padding: 4px 6px;
  font-size: 12px;
  border-radius: 3px;
  outline: none;
  min-width: 0;
}

.stash-input:focus {
  border-color: #007acc;
}

.light-theme .stash-input {
  background: #fff;
  border-color: #ccc;
  color: #333;
}

.stash-save-btn {
  background: #2d2d30;
  border: 1px solid #555;
  color: #ccc;
  padding: 4px 8px;
  font-size: 11px;
  border-radius: 3px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s;
}

.stash-save-btn:hover {
  background: #3c3c3c;
  border-color: #007acc;
  color: #fff;
}

.light-theme .stash-save-btn {
  background: #e8e8e8;
  border-color: #ccc;
  color: #333;
}

.light-theme .stash-save-btn:hover {
  background: #d8d8d8;
  border-color: #007acc;
}

.stash-untracked-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #888;
  margin-bottom: 6px;
  cursor: pointer;
}

.stash-untracked-label input[type="checkbox"] {
  margin: 0;
}

/* Stash list items */
.stash-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0;
  gap: 4px;
}

.stash-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.stash-message {
  font-size: 12px;
  color: #ccc;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.light-theme .stash-message {
  color: #333;
}

.stash-time {
  font-size: 10px;
  color: #666;
}

.stash-actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s;
  flex-shrink: 0;
}

.stash-item:hover .stash-actions {
  opacity: 1;
}

.stash-action-btn {
  background: transparent;
  border: 1px solid #555;
  color: #aaa;
  padding: 2px 5px;
  font-size: 10px;
  border-radius: 2px;
  cursor: pointer;
  transition: all 0.15s;
}

.stash-action-btn:hover {
  background: #3c3c3c;
  color: #fff;
  border-color: #007acc;
}

.stash-action-btn.danger:hover {
  background: #5a1d1d;
  border-color: #e81123;
  color: #ff6b6b;
}

.light-theme .stash-action-btn {
  border-color: #ccc;
  color: #666;
}

.light-theme .stash-action-btn:hover {
  background: #e0e0e0;
  color: #000;
}

.light-theme .stash-action-btn.danger:hover {
  background: #fdd;
  border-color: #e81123;
  color: #c00;
}

/* Commits */
.commits-scroll {
  max-height: 300px;
  overflow-y: auto;
}

.commits-scroll::-webkit-scrollbar {
  width: 4px;
}

.commits-scroll::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
}

.commit-item {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 3px 0;
}

.commit-hash {
  font-size: 11px;
  font-family: 'SF Mono', 'Monaco', 'Menlo', monospace;
  color: #569cd6;
  flex-shrink: 0;
}

.light-theme .commit-hash {
  color: #0066cc;
}

.commit-message {
  font-size: 12px;
  color: #ccc;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}

.light-theme .commit-message {
  color: #333;
}

.commit-time {
  font-size: 10px;
  color: #666;
  flex-shrink: 0;
}

/* Empty state */
.empty-state {
  font-size: 12px;
  color: #666;
  padding: 8px 0;
  text-align: center;
}
</style>
