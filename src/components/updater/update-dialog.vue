<script setup lang="ts">
import { useUpdater } from '@/composables/use-updater'
import type { UpdateInfo } from '@/composables/use-updater'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  updateInfo: UpdateInfo | null
  isChecking: boolean
}>()

const emit = defineEmits(['close'])

const { t } = useI18n()
const { isDownloading, isReadyToRestart, downloadProgress, downloadAndInstall, restartApp, error } = useUpdater()

const handleUpdate = async () => {
  try {
    await downloadAndInstall()
  } catch (err) {
    console.error('Update failed:', err)
  }
}

const handleRestart = async () => {
  try {
    await restartApp()
  } catch (err) {
    console.error('Restart failed:', err)
  }
}
</script>

<template>
  <div class="update-overlay" @click.self="!isChecking && emit('close')">
    <div class="update-dialog">
      <div class="update-header">
        <h2>{{ isChecking ? $t('updater.checkingTitle') : (updateInfo ? $t('updater.title') : $t('updater.noUpdateTitle')) }}</h2>
        <button class="close-btn" @click="emit('close')" :disabled="isDownloading || isChecking">✕</button>
      </div>

      <!-- Checking state -->
      <div v-if="isChecking" class="update-content">
        <div class="checking-state">
          <div class="spinner"></div>
          <p class="checking-text">{{ $t('updater.checkingDesc') }}</p>
        </div>
      </div>

      <!-- No update available -->
      <div v-else-if="!updateInfo" class="update-content">
        <div class="no-update-state">
          <div class="no-update-icon">&#10003;</div>
          <p class="no-update-text">{{ $t('updater.noUpdateDesc') }}</p>
        </div>

        <div v-if="error" class="error-message">
          <p>{{ $t('updater.updateFailed', { error }) }}</p>
        </div>
      </div>

      <!-- Update available -->
      <div v-else class="update-content">
        <div class="version-info">
          <p class="version">{{ $t('updater.version') }} {{ updateInfo.version }}</p>
          <p v-if="updateInfo.date" class="date">{{ updateInfo.date }}</p>
        </div>

        <div v-if="updateInfo.body" class="release-notes">
          <h3>{{ $t('updater.releaseNotes') }}</h3>
          <div class="notes-content" v-html="updateInfo.body"></div>
        </div>

        <div v-if="error" class="error-message">
          <p>{{ $t('updater.updateFailed', { error }) }}</p>
        </div>

        <div v-if="isDownloading" class="progress-section">
          <div class="progress-bar">
            <div
              class="progress-fill"
              :style="{ width: `${downloadProgress}%` }"
            ></div>
          </div>
          <p class="progress-text">{{ $t('updater.downloadProgress', { progress: downloadProgress }) }}</p>
        </div>

        <div v-if="isReadyToRestart" class="ready-to-restart">
          <p>{{ $t('updater.readyToRestart') }}</p>
        </div>
      </div>

      <div class="update-actions">
        <button
          @click="emit('close')"
          :disabled="isDownloading"
          class="btn-secondary"
        >
          {{ updateInfo ? $t('updater.remindLater') : $t('common.close') }}
        </button>
        <button
          v-if="updateInfo && isReadyToRestart"
          @click="handleRestart"
          class="btn-primary"
        >
          {{ $t('updater.restartNow') }}
        </button>
        <button
          v-else-if="updateInfo"
          @click="handleUpdate"
          :disabled="isDownloading"
          class="btn-primary"
        >
          {{ isDownloading ? $t('updater.downloading') : $t('updater.updateNow') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.update-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 2000;
  backdrop-filter: blur(3px);
}

.update-dialog {
  width: 500px;
  max-height: 80vh;
  background: #252526;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
  border: 1px solid #3e3e42;
  overflow: hidden;
}

.update-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid #3e3e42;
  background: linear-gradient(135deg, #1e1e1e 0%, #2d2d30 100%);
}

.update-header h2 {
  margin: 0;
  font-size: 20px;
  color: #fff;
}

.close-btn {
  background: none;
  border: none;
  color: #ccc;
  font-size: 20px;
  cursor: pointer;
  width: 32px;
  height: 32px;
  border-radius: 4px;
  transition: all 0.2s;
}

.close-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.close-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.update-content {
  padding: 24px;
  max-height: 400px;
  overflow-y: auto;
}

/* Checking state */
.checking-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 24px 0;
}

.spinner {
  width: 36px;
  height: 36px;
  border: 3px solid #3e3e42;
  border-top-color: #0078d4;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.checking-text {
  margin: 0;
  color: #aaa;
  font-size: 15px;
}

/* No update state */
.no-update-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 24px 0;
}

.no-update-icon {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: rgba(82, 196, 26, 0.15);
  color: #52c41a;
  font-size: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.no-update-text {
  margin: 0;
  color: #ccc;
  font-size: 15px;
}

.version-info {
  margin-bottom: 20px;
}

.version {
  font-size: 24px;
  font-weight: 600;
  color: #0078d4;
  margin: 0 0 8px 0;
}

.date {
  font-size: 14px;
  color: #999;
  margin: 0;
}

.release-notes {
  margin-bottom: 20px;
}

.release-notes h3 {
  font-size: 16px;
  color: #e7e7e7;
  margin: 0 0 12px 0;
}

.notes-content {
  color: #ccc;
  font-size: 14px;
  line-height: 1.6;
}

.notes-content :deep(h1),
.notes-content :deep(h2),
.notes-content :deep(h3) {
  color: #e7e7e7;
  margin-top: 16px;
  margin-bottom: 8px;
}

.notes-content :deep(ul),
.notes-content :deep(ol) {
  margin: 8px 0;
  padding-left: 20px;
}

.notes-content :deep(li) {
  margin: 4px 0;
}

.notes-content :deep(code) {
  background: #1e1e1e;
  padding: 2px 6px;
  border-radius: 3px;
  font-family: monospace;
  font-size: 13px;
}

.error-message {
  margin-top: 16px;
  padding: 12px;
  background: rgba(232, 17, 35, 0.1);
  border: 1px solid rgba(232, 17, 35, 0.3);
  border-radius: 6px;
}

.error-message p {
  margin: 0;
  color: #ff6b6b;
  font-size: 14px;
}

.progress-section {
  margin-top: 20px;
}

.progress-bar {
  height: 8px;
  background: #3e3e42;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 8px;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #0078d4, #00bcf2);
  transition: width 0.3s ease;
}

.progress-text {
  text-align: center;
  color: #0078d4;
  font-size: 14px;
  font-weight: 500;
  margin: 0;
}

.ready-to-restart {
  margin-top: 16px;
  padding: 12px;
  background: rgba(82, 196, 26, 0.1);
  border: 1px solid rgba(82, 196, 26, 0.3);
  border-radius: 6px;
  text-align: center;
}

.ready-to-restart p {
  margin: 0;
  color: #52c41a;
  font-size: 14px;
  font-weight: 500;
}

.update-actions {
  display: flex;
  gap: 12px;
  padding: 20px 24px;
  border-top: 1px solid #3e3e42;
  background: #1e1e1e;
}

.btn-secondary,
.btn-primary {
  flex: 1;
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-secondary {
  background: #3e3e42;
  color: #ccc;
}

.btn-secondary:hover:not(:disabled) {
  background: #4e4e52;
}

.btn-primary {
  background: #0078d4;
  color: #fff;
}

.btn-primary:hover:not(:disabled) {
  background: #006cbd;
}

.btn-secondary:disabled,
.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
