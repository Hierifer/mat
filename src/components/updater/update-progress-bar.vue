<script setup lang="ts">
import { useUpdater } from '@/composables/use-updater'
import { useI18n } from 'vue-i18n'

defineEmits(['dismiss'])

const { t } = useI18n()
const {
  updateAvailable,
  updateInfo,
  isDownloading,
  isReadyToRestart,
  downloadProgress,
  error,
  downloadAndInstall,
  restartApp,
} = useUpdater()

const handleDownload = async () => {
  try {
    await downloadAndInstall()
  } catch (err) {
    console.error('[UpdateProgressBar] Download failed:', err)
  }
}

const handleRetry = async () => {
  try {
    await downloadAndInstall()
  } catch (err) {
    console.error('[UpdateProgressBar] Retry failed:', err)
  }
}

const handleRestart = async () => {
  try {
    await restartApp()
  } catch (err) {
    console.error('[UpdateProgressBar] Restart failed:', err)
  }
}
</script>

<template>
  <transition name="progress-slide">
    <div v-if="updateAvailable || isDownloading || isReadyToRestart || error" class="update-progress-bar">
      <!-- Update available (not yet downloading) -->
      <template v-if="updateAvailable && !isDownloading && !isReadyToRestart && !error">
        <div class="bar-content">
          <span class="bar-text available-text">
            {{ t('updater.progressBar.available', { version: updateInfo?.version ?? '' }) }}
          </span>
          <button class="bar-btn primary" @click="handleDownload">
            {{ t('updater.progressBar.download') }}
          </button>
          <button class="bar-btn dismiss" @click="$emit('dismiss')">
            <span class="bar-btn-icon">&times;</span>
          </button>
        </div>
      </template>

      <!-- Downloading -->
      <template v-else-if="isDownloading">
        <div class="progress-track">
          <div class="progress-fill downloading" :style="{ width: `${downloadProgress}%` }"></div>
        </div>
        <div class="bar-content">
          <span class="bar-text">
            {{ t('updater.progressBar.downloading', { version: updateInfo?.version ?? '' }) }}
            {{ downloadProgress }}%
          </span>
          <button class="bar-btn dismiss" @click="$emit('dismiss')">
            <span class="bar-btn-icon">&times;</span>
          </button>
        </div>
      </template>

      <!-- Ready to restart -->
      <template v-else-if="isReadyToRestart">
        <div class="progress-track">
          <div class="progress-fill ready" style="width: 100%"></div>
        </div>
        <div class="bar-content">
          <span class="bar-text ready-text">{{ t('updater.progressBar.ready') }}</span>
          <button class="bar-btn primary" @click="handleRestart">
            {{ t('updater.progressBar.restartNow') }}
          </button>
          <button class="bar-btn dismiss" @click="$emit('dismiss')">
            <span class="bar-btn-icon">&times;</span>
          </button>
        </div>
      </template>

      <!-- Error -->
      <template v-else-if="error">
        <div class="bar-content">
          <span class="bar-text error-text">{{ t('updater.updateFailed', { error }) }}</span>
          <button class="bar-btn primary" @click="handleRetry">
            {{ t('updater.progressBar.retry') }}
          </button>
          <button class="bar-btn dismiss" @click="$emit('dismiss')">
            <span class="bar-btn-icon">&times;</span>
          </button>
        </div>
      </template>
    </div>
  </transition>
</template>

<style scoped>
.update-progress-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 32px;
  z-index: 600;
  background: rgba(18, 18, 18, 0.92);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(12px);
  font-size: 12px;
  font-family: "JetBrains Mono", monospace;
  color: #ccc;
  user-select: none;
  box-sizing: border-box;
  border-radius: 0 0 10px 10px;
}

.progress-track {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
}

.progress-fill {
  height: 100%;
  transition: width 0.3s ease;
}

.progress-fill.downloading {
  background: linear-gradient(90deg, #0078d4, #00bcf2);
}

.progress-fill.ready {
  background: #52c41a;
}

.bar-content {
  display: flex;
  align-items: center;
  height: 100%;
  padding: 0 12px;
  gap: 10px;
}

.bar-text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #aaa;
  font-size: 11px;
}

.available-text {
  color: #0078d4;
}

.ready-text {
  color: #52c41a;
}

.error-text {
  color: #ff6b6b;
}

.bar-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-family: inherit;
  transition: all 0.15s;
  flex-shrink: 0;
}

.bar-btn.primary {
  background: #0078d4;
  color: #fff;
  padding: 2px 10px;
}

.bar-btn.primary:hover {
  background: #006cbd;
}

.bar-btn.dismiss {
  color: #888;
  padding: 2px 4px;
  font-size: 16px;
  line-height: 1;
}

.bar-btn.dismiss:hover {
  color: #fff;
}

.bar-btn-icon {
  display: block;
}

/* Slide transition */
.progress-slide-enter-active,
.progress-slide-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.progress-slide-enter-from,
.progress-slide-leave-to {
  opacity: 0;
  transform: translateY(100%);
}
</style>
