<script setup lang="ts">
import { useTerminalStore } from '@/stores/terminal-store'
import { themes } from '@/settings/themes'
import { ref } from 'vue'

const store = useTerminalStore()
const activeCategory = ref('Appearance')

const categories = [ 'Appearance', 'General', 'Shortcuts' ]
</script>

<template>
  <div class="settings-overlay" @click.self="store.toggleSettings">
    <div class="settings-modal">
      <div class="settings-sidebar">
        <h2 class="settings-title">Preferences</h2>
        <ul class="settings-categories">
          <li
            v-for="category in categories"
            :key="category"
            class="category-item"
            :class="{ active: activeCategory === category }"
            @click="activeCategory = category"
          >
            {{ category }}
          </li>
        </ul>
      </div>
      <div class="settings-content">
        <div class="settings-header">
            <h3>{{ activeCategory }}</h3>
            <button class="close-btn" @click="store.toggleSettings">✕</button>
        </div>
        
        <div v-if="activeCategory === 'Appearance'" class="settings-section">
          <div class="setting-item">
            <label class="setting-label">Color Theme</label>
            <div class="theme-grid">
              <div
                v-for="themeName in store.availableThemes"
                :key="themeName"
                class="theme-card"
                :class="{ active: store.currentThemeName === themeName }"
                @click="store.setTheme(themeName)"
              >
                <!-- Use the colors from the specific theme, not the current one -->
                <div class="theme-preview" :style="{ backgroundColor: themes[themeName].background }">
                   <div class="color-swatch" :style="{ backgroundColor: themes[themeName].red }"></div>
                   <div class="color-swatch" :style="{ backgroundColor: themes[themeName].green }"></div>
                   <div class="color-swatch" :style="{ backgroundColor: themes[themeName].blue }"></div>
                </div>
                <span class="theme-name">{{ themeName }}</span>
              </div>
            </div>
          </div>

          <div class="setting-item">
            <label class="setting-label">Window Appearance</label>
            <div class="setting-row">
              <label class="checkbox-label">
                <input
                  type="checkbox"
                  :checked="store.dimInactivePanes"
                  @change="store.toggleDimInactivePanes"
                  class="checkbox-input"
                />
                <span class="checkbox-text">Dim inactive panes</span>
              </label>
              <p class="setting-description">
                Apply grayscale effect to unfocused terminal panes
              </p>
            </div>
          </div>
        </div>

        <div v-if="activeCategory === 'General'" class="settings-section">
          <div class="setting-item">
            <label class="setting-label">Notifications</label>
            <div class="setting-row">
              <label class="checkbox-label">
                <input
                  type="checkbox"
                  :checked="store.enableCommandNotifications"
                  @change="store.toggleCommandNotifications"
                  class="checkbox-input"
                />
                <span class="checkbox-text">Enable command completion notifications</span>
              </label>
              <p class="setting-description">
                Send system notifications when Claude commands finish executing
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-overlay {
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

.settings-modal {
  width: 800px;
  height: 600px;
  background: #252526;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  display: flex;
  overflow: hidden;
  border: 1px solid #3e3e42;
}

.settings-sidebar {
  width: 200px;
  background: #1e1e1e;
  border-right: 1px solid #3e3e42;
  padding: 20px 0;
}

.settings-title {
  padding: 0 20px;
  margin-bottom: 20px;
  font-size: 14px;
  font-weight: 600;
  color: #bbbbbb;
  text-transform: uppercase;
}

.settings-categories {
  list-style: none;
  padding: 0;
  margin: 0;
}

.category-item {
  padding: 10px 20px;
  font-size: 14px;
  color: #cccccc;
  cursor: pointer;
  transition: background 0.2s;
}

.category-item:hover {
  background: #2a2d2e;
}

.category-item.active {
  background: #37373d;
  color: #ffffff;
  border-left: 3px solid #0078d4;
}

.settings-content {
  flex: 1;
  padding: 0;
  display: flex; /* Make it flex to use full height */
  flex-direction: column;
}

.settings-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 30px;
    border-bottom: 1px solid #3e3e42;
}

.settings-header h3 {
    margin: 0;
    font-size: 20px;
    font-weight: 500;
}

.close-btn {
    background: none;
    border: none;
    color: #ccc;
    font-size: 20px;
    cursor: pointer;
    line-height: 1;
}

.close-btn:hover {
    color: #fff;
}

.settings-section {
  padding: 30px;
  overflow-y: auto; /* Scrollable content */
  flex: 1;
}

.setting-item {
  margin-bottom: 30px;
}

.setting-label {
  display: block;
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 15px;
  color: #e7e7e7;
}

.theme-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 15px;
}

.theme-card {
  border: 2px solid transparent;
  border-radius: 6px;
  padding: 10px;
  cursor: pointer;
  background: #2d2d30;
  transition: all 0.2s;
  text-align: center;
}

.theme-card:hover {
  background: #3e3e42;
}

.theme-card.active {
  background: #37373d;
  border-color: #0078d4;
}

.theme-preview {
  height: 60px;
  border-radius: 4px;
  margin-bottom: 8px;
  border: 1px solid #444;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 5px;
}
.color-swatch {
    width: 12px;
    height: 12px;
    border-radius: 50%;
}

.theme-name {
  font-size: 12px;
  color: #cccccc;
}

.setting-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  font-size: 14px;
}

.checkbox-input {
  width: 18px;
  height: 18px;
  cursor: pointer;
  accent-color: #0078d4;
}

.checkbox-text {
  color: #e7e7e7;
  user-select: none;
}

.setting-description {
  margin: 0;
  font-size: 12px;
  color: #999;
  padding-left: 28px;
}
</style>