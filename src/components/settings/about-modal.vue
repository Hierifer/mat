<script setup lang="ts">
import { useTerminalStore } from '@/stores/terminal-store'
import { ref, computed, onMounted } from 'vue'
import { getVersion } from '@tauri-apps/api/app'
import { useI18n } from 'vue-i18n'

const store = useTerminalStore()
const { t } = useI18n()
const version = ref('0.1.17')
const currentYear = computed(() => new Date().getFullYear())

onMounted(async () => {
  try {
    version.value = await getVersion()
  } catch (error) {
    console.error('Failed to get app version:', error)
  }
})
</script>

<template>
  <div class="about-overlay" @click.self="store.toggleAbout">
    <div class="about-modal">
      <div class="about-header">
        <div class="app-icon">
          <img src="/favicon.svg" alt="Mat icon" class="app-icon-img" />
        </div>
        <h1 class="app-name">Mat</h1>
        <p class="app-version">Version {{ version }}</p>
        <button class="close-btn" @click="store.toggleAbout">✕</button>
      </div>

      <div class="about-content">
        <p class="app-description">
          {{ $t('about.description') }}
        </p>

        <div class="about-section">
          <h3>{{ $t('about.featuresTitle') }}</h3>
          <ul class="feature-list">
            <li>{{ $t('about.features.splitPanes') }}</li>
            <li>{{ $t('about.features.multipleTabs') }}</li>
            <li>{{ $t('about.features.customThemes') }}</li>
            <li>{{ $t('about.features.nativePerf') }}</li>
          </ul>
        </div>

        <div class="about-section">
          <h3>{{ $t('about.creditsTitle') }}</h3>
          <p>{{ $t('about.builtWith') }}</p>
          <ul class="tech-list">
            <li><strong>Tauri</strong> - Cross-platform desktop framework</li>
            <li><strong>Vue.js</strong> - Progressive JavaScript framework</li>
            <li><strong>Xterm.js</strong> - Terminal emulator library</li>
            <li><strong>Rust</strong> - Systems programming language</li>
          </ul>
        </div>

        <div class="about-footer">
          <p class="copyright">{{ $t('about.copyright', { year: currentYear }) }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.about-overlay {
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

.about-modal {
  width: 500px;
  max-height: 80vh;
  background: #252526;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
  overflow: hidden;
  border: 1px solid #3e3e42;
}

.about-header {
  background: linear-gradient(135deg, #1e1e1e 0%, #2d2d30 100%);
  padding: 40px 30px 30px;
  text-align: center;
  position: relative;
  border-bottom: 1px solid #3e3e42;
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

.app-icon {
  margin: 0 auto 20px;
  width: 64px;
  height: 64px;
}

.app-icon-img {
  width: 64px;
  height: 64px;
  display: block;
}

.app-name {
  margin: 0 0 8px;
  font-size: 32px;
  font-weight: 600;
  color: #ffffff;
  letter-spacing: -0.5px;
}

.app-version {
  margin: 0;
  font-size: 14px;
  color: #999;
}

.about-content {
  padding: 30px;
  overflow-y: auto;
  max-height: calc(80vh - 200px);
}

.app-description {
  margin: 0 0 30px;
  font-size: 15px;
  color: #ccc;
  text-align: center;
  line-height: 1.6;
}

.about-section {
  margin-bottom: 30px;
}

.about-section:last-of-type {
  margin-bottom: 20px;
}

.about-section h3 {
  margin: 0 0 15px;
  font-size: 16px;
  font-weight: 600;
  color: #e7e7e7;
  border-bottom: 1px solid #3e3e42;
  padding-bottom: 8px;
}

.feature-list,
.tech-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.feature-list li,
.tech-list li {
  padding: 8px 0;
  color: #ccc;
  font-size: 14px;
  line-height: 1.5;
}

.feature-list li:before {
  content: "✓";
  color: #0078d4;
  font-weight: bold;
  margin-right: 10px;
}

.tech-list li {
  padding: 6px 0;
}

.tech-list strong {
  color: #0078d4;
}

.about-footer {
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid #3e3e42;
}

.copyright {
  margin: 0;
  font-size: 12px;
  color: #888;
  text-align: center;
}
</style>
