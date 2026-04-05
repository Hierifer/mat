<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  isListening: boolean
  transcript: string
  error: string | null
}>()

const emit = defineEmits(['stop'])

const statusText = computed(() => {
  if (props.error) return props.error
  if (props.isListening) return '正在聆听...'
  return '已停止'
})
</script>

<template>
  <div v-if="isListening || error" class="speech-indicator">
    <div class="indicator-content">
      <div class="indicator-header">
        <div class="status-icon" :class="{ active: isListening, error: error }">
          <svg v-if="!error" width="20" height="20" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="10" r="4" fill="currentColor">
              <animate
                v-if="isListening"
                attributeName="r"
                values="4;6;4"
                dur="1.5s"
                repeatCount="indefinite"
              />
            </circle>
            <circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="1" opacity="0.3">
              <animate
                v-if="isListening"
                attributeName="r"
                values="8;10;8"
                dur="1.5s"
                repeatCount="indefinite"
              />
            </circle>
          </svg>
          <svg v-else width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M10 2L18 18H2L10 2Z" stroke="currentColor" fill="none" stroke-width="2"/>
            <text x="10" y="15" text-anchor="middle" fill="currentColor" font-size="12" font-weight="bold">!</text>
          </svg>
        </div>
        <span class="status-text">{{ statusText }}</span>
        <button @click="emit('stop')" class="stop-btn" title="停止录音 (Ctrl+Shift+V)">
          ✕
        </button>
      </div>

      <div v-if="transcript && !error" class="transcript-preview">
        <p>{{ transcript }}</p>
      </div>

      <div class="indicator-footer">
        <span class="hint">按 <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>V</kbd> 停止</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.speech-indicator {
  position: fixed;
  top: 60px;
  right: 20px;
  z-index: 1500;
  animation: slideIn 0.3s ease-out;
}

@keyframes slideIn {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

.indicator-content {
  background: linear-gradient(135deg, #1e1e1e 0%, #2d2d30 100%);
  border: 1px solid #3e3e42;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
  overflow: hidden;
  min-width: 300px;
  max-width: 400px;
}

.indicator-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border-bottom: 1px solid #3e3e42;
}

.status-icon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(0, 120, 212, 0.2);
  color: #0078d4;
  transition: all 0.3s;
}

.status-icon.active {
  background: rgba(0, 120, 212, 0.3);
  box-shadow: 0 0 20px rgba(0, 120, 212, 0.4);
}

.status-icon.error {
  background: rgba(232, 17, 35, 0.2);
  color: #e81123;
}

.status-text {
  flex: 1;
  font-size: 14px;
  font-weight: 500;
  color: #e7e7e7;
}

.stop-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: #ccc;
  font-size: 18px;
  cursor: pointer;
  transition: all 0.2s;
}

.stop-btn:hover {
  background: rgba(232, 17, 35, 0.2);
  color: #e81123;
}

.transcript-preview {
  padding: 16px;
  max-height: 150px;
  overflow-y: auto;
  background: rgba(0, 0, 0, 0.2);
}

.transcript-preview p {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: #ccc;
  word-break: break-word;
}

.transcript-preview::-webkit-scrollbar {
  width: 6px;
}

.transcript-preview::-webkit-scrollbar-track {
  background: transparent;
}

.transcript-preview::-webkit-scrollbar-thumb {
  background: #3e3e42;
  border-radius: 3px;
}

.indicator-footer {
  padding: 12px 16px;
  background: rgba(0, 0, 0, 0.1);
  border-top: 1px solid #3e3e42;
}

.hint {
  font-size: 12px;
  color: #999;
}

kbd {
  display: inline-block;
  padding: 2px 6px;
  background: #3e3e42;
  border: 1px solid #555;
  border-radius: 3px;
  font-family: monospace;
  font-size: 11px;
  color: #e7e7e7;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}
</style>
