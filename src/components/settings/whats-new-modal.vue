<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getVersion } from '@tauri-apps/api/app'
import { useI18n } from 'vue-i18n'
import { changelog } from '@/data/changelog'

const emit = defineEmits(['close'])
const { t } = useI18n()

const version = ref('')
const entries = ref<Array<{ version: string; date: string; features: string[]; fixes: string[] }>>([])

onMounted(async () => {
  try {
    version.value = await getVersion()
  } catch {
    version.value = 'unknown'
  }

  // Collect current version and a few previous versions
  const allVersions = Object.keys(changelog)
  const currentIdx = allVersions.indexOf(version.value)
  const versionsToShow = currentIdx >= 0
    ? allVersions.slice(currentIdx, currentIdx + 3)
    : allVersions.slice(0, 3)

  entries.value = versionsToShow.map((v) => ({
    version: v,
    ...changelog[v],
  }))
})
</script>

<template>
  <div class="whats-new-overlay" @click.self="emit('close')">
    <div class="whats-new-modal">
      <div class="whats-new-header">
        <div class="header-icon">
          <img src="/favicon.svg" alt="Materm" class="header-icon-img" />
        </div>
        <div class="header-text">
          <h1>{{ $t('whatsNew.title') }}</h1>
          <p class="header-version">v{{ version }}</p>
        </div>
        <button class="close-btn" @click="emit('close')">✕</button>
      </div>

      <div class="whats-new-content">
        <div v-for="entry in entries" :key="entry.version" class="version-block">
          <div class="version-header">
            <span class="version-badge">v{{ entry.version }}</span>
            <span class="version-date">{{ entry.date }}</span>
          </div>

          <div v-if="entry.features.length > 0" class="change-section">
            <h3 class="section-label section-features">{{ $t('whatsNew.features') }}</h3>
            <ul>
              <li v-for="(feat, i) in entry.features" :key="i">{{ feat }}</li>
            </ul>
          </div>

          <div v-if="entry.fixes.length > 0" class="change-section">
            <h3 class="section-label section-fixes">{{ $t('whatsNew.fixes') }}</h3>
            <ul>
              <li v-for="(fix, i) in entry.fixes" :key="i">{{ fix }}</li>
            </ul>
          </div>
        </div>
      </div>

      <div class="whats-new-footer">
        <button class="btn-primary" @click="emit('close')">
          {{ $t('common.ok') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.whats-new-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  backdrop-filter: blur(2px);
}

.whats-new-modal {
  width: 500px;
  max-height: 80vh;
  background: #252526;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
  overflow: hidden;
  border: 1px solid #3e3e42;
  display: flex;
  flex-direction: column;
}

.whats-new-header {
  background: linear-gradient(135deg, #1e1e1e 0%, #2d2d30 100%);
  padding: 30px 30px 24px;
  display: flex;
  align-items: center;
  gap: 16px;
  position: relative;
  border-bottom: 1px solid #3e3e42;
}

.header-icon {
  width: 48px;
  height: 48px;
  flex-shrink: 0;
}

.header-icon-img {
  width: 48px;
  height: 48px;
  display: block;
}

.header-text h1 {
  margin: 0 0 4px;
  font-size: 22px;
  font-weight: 600;
  color: #ffffff;
}

.header-version {
  margin: 0;
  font-size: 14px;
  color: #999;
}

.close-btn {
  position: absolute;
  top: 15px;
  right: 15px;
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

.close-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.whats-new-content {
  padding: 24px 30px;
  overflow-y: auto;
  flex: 1;
}

.version-block {
  margin-bottom: 24px;
}

.version-block:last-child {
  margin-bottom: 0;
}

.version-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.version-badge {
  background: #0078d4;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: 10px;
}

.version-date {
  font-size: 13px;
  color: #888;
}

.change-section {
  margin-bottom: 12px;
}

.section-label {
  font-size: 13px;
  font-weight: 600;
  margin: 0 0 6px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.section-features {
  color: #4ec9b0;
}

.section-fixes {
  color: #dcdcaa;
}

.change-section ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.change-section li {
  padding: 4px 0;
  color: #ccc;
  font-size: 14px;
  line-height: 1.5;
  padding-left: 16px;
  position: relative;
}

.change-section li::before {
  content: "\2022";
  position: absolute;
  left: 0;
  color: #666;
}

.whats-new-footer {
  padding: 16px 30px;
  border-top: 1px solid #3e3e42;
  background: #1e1e1e;
  display: flex;
  justify-content: flex-end;
}

.btn-primary {
  padding: 8px 24px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  background: #0078d4;
  color: #fff;
  transition: all 0.2s;
}

.btn-primary:hover {
  background: #006cbd;
}
</style>
