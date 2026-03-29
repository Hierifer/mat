<script setup lang="ts">
import { useTerminalStore } from '@/stores/terminal-store'
import { themes } from '@/settings/themes'
import { availableLocales } from '@/i18n'
import { useI18n } from 'vue-i18n'
import { ref, watch, computed } from 'vue'

const store = useTerminalStore()
const { locale, t } = useI18n()
const activeCategory = ref('Appearance')

const categories = [ 'Appearance', 'General', 'View', 'Shortcuts' ]

// Sync locale with store
watch(() => store.locale, (newLocale) => {
  locale.value = newLocale
}, { immediate: true })

const changeLocale = (newLocale: string) => {
  store.setLocale(newLocale)
  locale.value = newLocale
}

// Determine if current theme is light
const isLightTheme = computed(() => {
  return store.currentThemeName.includes('Light')
})

// Dynamic colors based on theme
const themeColors = computed(() => {
  if (isLightTheme.value) {
    return {
      overlay: 'rgba(0, 0, 0, 0.3)',
      modalBg: '#ffffff',
      modalBorder: '#e0e0e0',
      sidebarBg: '#f5f5f5',
      sidebarBorder: '#e0e0e0',
      titleColor: '#666666',
      categoryColor: '#333333',
      categoryHoverBg: '#eeeeee',
      categoryActiveBg: '#e3e3e3',
      categoryActiveColor: '#000000',
      headerBorder: '#e0e0e0',
      headerColor: '#000000',
      closeBtnColor: '#666666',
      closeBtnHoverColor: '#000000',
      labelColor: '#333333',
      inputBg: '#f8f8f8',
      inputBorder: '#cccccc',
      inputBorderHover: '#999999',
      inputColor: '#333333',
      checkboxText: '#333333',
      descColor: '#666666',
      themeCardBg: '#f8f8f8',
      themeCardHoverBg: '#eeeeee',
      themeCardActiveBg: '#e3e3e3',
      themeCardBorder: '#e0e0e0',
      themeNameColor: '#333333',
      buttonBg: '#f0f0f0',
      buttonBorder: '#cccccc',
      buttonHoverBg: '#e8e8e8',
      sliderBg: '#e0e0e0',
      accentColor: '#0078d4',
      themePreviewBorder: 'rgba(0, 0, 0, 0.15)',
      categoryActiveBorder: '#0078d4',
    }
  } else {
    return {
      overlay: 'rgba(0, 0, 0, 0.5)',
      modalBg: '#252526',
      modalBorder: '#3e3e42',
      sidebarBg: '#1e1e1e',
      sidebarBorder: '#3e3e42',
      titleColor: '#bbbbbb',
      categoryColor: '#cccccc',
      categoryHoverBg: '#2a2d2e',
      categoryActiveBg: '#37373d',
      categoryActiveColor: '#ffffff',
      headerBorder: '#3e3e42',
      headerColor: '#ffffff',
      closeBtnColor: '#ccc',
      closeBtnHoverColor: '#fff',
      labelColor: '#e7e7e7',
      inputBg: '#3c3c3c',
      inputBorder: '#555',
      inputBorderHover: '#777',
      inputColor: '#e7e7e7',
      checkboxText: '#e7e7e7',
      descColor: '#999',
      themeCardBg: '#2d2d30',
      themeCardHoverBg: '#3e3e42',
      themeCardActiveBg: '#37373d',
      themeCardBorder: '#444',
      themeNameColor: '#cccccc',
      buttonBg: '#3c3c3c',
      buttonBorder: '#555',
      buttonHoverBg: '#454545',
      sliderBg: '#3c3c3c',
      accentColor: '#0078d4',
      themePreviewBorder: 'rgba(255, 255, 255, 0.15)',
      categoryActiveBorder: '#0078d4',
    }
  }
})
</script>

<template>
  <div class="settings-overlay" :style="{
    background: themeColors.overlay,
    '--accent-color': themeColors.accentColor
  }" @click.self="store.toggleSettings">
    <div class="settings-modal" :style="{
      background: themeColors.modalBg,
      borderColor: themeColors.modalBorder,
      color: themeColors.headerColor
    }">
      <div class="settings-sidebar" :style="{
        background: themeColors.sidebarBg,
        borderRightColor: themeColors.sidebarBorder
      }">
        <h2 class="settings-title" :style="{ color: themeColors.titleColor }">{{ $t('settings.title') }}</h2>
        <ul class="settings-categories">
          <li
            v-for="category in categories"
            :key="category"
            class="category-item"
            :class="{ active: activeCategory === category }"
            :style="{
              color: activeCategory === category ? themeColors.categoryActiveColor : themeColors.categoryColor,
              background: activeCategory === category ? themeColors.categoryActiveBg : 'transparent',
              borderLeftColor: activeCategory === category ? themeColors.categoryActiveBorder : 'transparent'
            }"
            @click="activeCategory = category"
          >
            {{ $t(`settings.${category.toLowerCase()}`) }}
          </li>
        </ul>
      </div>
      <div class="settings-content" :style="{ background: themeColors.modalBg }">
        <div class="settings-header" :style="{ borderBottomColor: themeColors.headerBorder }">
            <h3 :style="{ color: themeColors.headerColor }">{{ $t(`settings.${activeCategory.toLowerCase()}`) }}</h3>
            <button class="close-btn" :style="{ color: themeColors.closeBtnColor }" @click="store.toggleSettings">✕</button>
        </div>
        
        <div v-if="activeCategory === 'Appearance'" class="settings-section">
          <div class="setting-item">
            <label class="setting-label" :style="{ color: themeColors.labelColor }">{{ $t('settings.themeMode') }}</label>
            <div class="radio-group">
              <label class="radio-label">
                <input
                  type="radio"
                  name="themeMode"
                  value="auto"
                  :checked="store.themeMode === 'auto'"
                  @change="store.setThemeMode('auto')"
                  class="radio-input"
                />
                <span class="radio-text" :style="{ color: themeColors.checkboxText }">{{ $t('settings.themeModeAuto') }}</span>
              </label>
              <label class="radio-label">
                <input
                  type="radio"
                  name="themeMode"
                  value="light"
                  :checked="store.themeMode === 'light'"
                  @change="store.setThemeMode('light')"
                  class="radio-input"
                />
                <span class="radio-text" :style="{ color: themeColors.checkboxText }">{{ $t('settings.themeModeLight') }}</span>
              </label>
              <label class="radio-label">
                <input
                  type="radio"
                  name="themeMode"
                  value="dark"
                  :checked="store.themeMode === 'dark'"
                  @change="store.setThemeMode('dark')"
                  class="radio-input"
                />
                <span class="radio-text" :style="{ color: themeColors.checkboxText }">{{ $t('settings.themeModeDark') }}</span>
              </label>
            </div>
          </div>

          <div class="setting-item">
            <label class="setting-label" :style="{ color: themeColors.labelColor }">{{ $t('settings.colorTheme') }}</label>
            <div class="theme-grid">
              <div
                v-for="themeName in store.availableThemes"
                :key="themeName"
                class="theme-card"
                :class="{ active: store.currentThemeName === themeName }"
                :style="{
                  background: themeColors.themeCardBg,
                  borderColor: store.currentThemeName === themeName ? themeColors.accentColor : themeColors.themeCardBorder
                }"
                @click="store.setTheme(themeName)"
              >
                <!-- Use the colors from the specific theme, not the current one -->
                <div class="theme-preview" :style="{
                  backgroundColor: themes[themeName].background,
                  borderColor: themeColors.themePreviewBorder
                }">
                   <div class="color-swatch" :style="{ backgroundColor: themes[themeName].red }"></div>
                   <div class="color-swatch" :style="{ backgroundColor: themes[themeName].green }"></div>
                   <div class="color-swatch" :style="{ backgroundColor: themes[themeName].blue }"></div>
                </div>
                <span class="theme-name" :style="{ color: themeColors.themeNameColor }">{{ themeName }}</span>
              </div>
            </div>
          </div>

          <div class="setting-item">
            <label class="setting-label" :style="{ color: themeColors.labelColor }">{{ $t('settings.windowAppearance') }}</label>
            <div class="setting-row">
              <label class="checkbox-label">
                <input
                  type="checkbox"
                  :checked="store.dimInactivePanes"
                  @change="store.toggleDimInactivePanes"
                  class="checkbox-input"
                />
                <span class="checkbox-text" :style="{ color: themeColors.checkboxText }">{{ $t('settings.dimInactivePanes') }}</span>
              </label>
              <p class="setting-description" :style="{ color: themeColors.descColor }">
                {{ $t('settings.dimInactivePanesDesc') }}
              </p>
            </div>
          </div>
        </div>

        <div v-if="activeCategory === 'General'" class="settings-section">
          <div class="setting-item">
            <label class="setting-label" :style="{ color: themeColors.labelColor }">{{ $t('settings.language') }}</label>
            <select
              v-model="store.locale"
              @change="changeLocale(store.locale)"
              class="select-input"
              :style="{
                background: themeColors.inputBg,
                borderColor: themeColors.inputBorder,
                color: themeColors.inputColor
              }"
            >
              <option
                v-for="loc in availableLocales"
                :key="loc.code"
                :value="loc.code"
              >
                {{ loc.name }}
              </option>
            </select>
          </div>

          <div class="setting-item">
            <label class="setting-label" :style="{ color: themeColors.labelColor }">{{ $t('settings.notifications') }}</label>
            <div class="setting-row">
              <label class="checkbox-label">
                <input
                  type="checkbox"
                  :checked="store.enableCommandNotifications"
                  @change="store.toggleCommandNotifications"
                  class="checkbox-input"
                />
                <span class="checkbox-text" :style="{ color: themeColors.checkboxText }">{{ $t('settings.enableCommandNotifications') }}</span>
              </label>
              <p class="setting-description" :style="{ color: themeColors.descColor }">
                {{ $t('settings.enableCommandNotificationsDesc') }}
              </p>
            </div>
          </div>

          <div class="setting-item">
            <label class="setting-label" :style="{ color: themeColors.labelColor }">{{ $t('settings.tmux.title', 'tmux 集成') }}</label>
            <div class="setting-row">
              <label class="checkbox-label">
                <input
                  type="checkbox"
                  :checked="store.tmuxEnabled"
                  @change="store.toggleTmux(!store.tmuxEnabled)"
                  class="checkbox-input"
                />
                <span class="checkbox-text" :style="{ color: themeColors.checkboxText }">{{ $t('settings.tmux.enable') }}</span>
              </label>
              <p class="setting-description" :style="{ color: themeColors.descColor }">
                {{ $t('settings.tmux.enableDesc') }}
              </p>
            </div>

            <div v-if="store.tmuxEnabled" class="setting-row" style="margin-top: 15px;">
              <label class="checkbox-label">
                <input
                  type="checkbox"
                  v-model="store.autoRestoreSessions"
                  @change="store.saveSessionMapping()"
                  class="checkbox-input"
                />
                <span class="checkbox-text" :style="{ color: themeColors.checkboxText }">{{ $t('settings.tmux.autoRestore') }}</span>
              </label>
              <p class="setting-description" :style="{ color: themeColors.descColor }">
                {{ $t('settings.tmux.autoRestoreDesc', '重启应用时自动连接到之前的 tmux 会话') }}
              </p>
            </div>

            <button
              v-if="store.tmuxEnabled"
              @click="store.toggleSessionManager()"
              class="font-reset-btn"
              :style="{
                background: themeColors.buttonBg,
                borderColor: themeColors.buttonBorder,
                color: themeColors.inputColor,
                marginTop: '15px'
              }"
            >
              {{ $t('settings.tmux.manageSession', '管理 tmux 会话') }}
            </button>
          </div>
        </div>

        <div v-if="activeCategory === 'View'" class="settings-section">
          <div class="setting-item">
            <label class="setting-label" :style="{ color: themeColors.labelColor }">{{ $t('settings.fontSize') }}</label>
            <p class="setting-description" :style="{ color: themeColors.descColor, paddingLeft: 0, marginBottom: '15px' }">
              {{ $t('settings.fontSizeDesc') }}
            </p>
            <div class="font-size-controls">
              <button @click="store.decreaseFontSize()" class="font-btn" :style="{
                background: themeColors.buttonBg,
                borderColor: themeColors.buttonBorder,
                color: themeColors.inputColor
              }">-</button>
              <span class="font-size-value" :style="{ color: themeColors.labelColor }">{{ store.fontSize }}px</span>
              <button @click="store.increaseFontSize()" class="font-btn" :style="{
                background: themeColors.buttonBg,
                borderColor: themeColors.buttonBorder,
                color: themeColors.inputColor
              }">+</button>
              <button @click="store.resetFontSize()" class="font-reset-btn" :style="{
                background: themeColors.buttonBg,
                borderColor: themeColors.buttonBorder,
                color: themeColors.inputColor
              }">Reset</button>
            </div>
            <input
              type="range"
              min="8"
              max="32"
              :value="store.fontSize"
              @input="store.setFontSize(Number(($event.target as HTMLInputElement).value))"
              class="font-slider"
              :style="{ background: themeColors.sliderBg }"
            />
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
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  backdrop-filter: blur(2px);
  transition: background 0.3s;
}

.settings-modal {
  width: 800px;
  height: 600px;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  display: flex;
  overflow: hidden;
  border: 1px solid;
  transition: background 0.3s, border-color 0.3s, color 0.3s;
}

.settings-sidebar {
  width: 200px;
  border-right: 1px solid;
  padding: 20px 0;
  transition: background 0.3s, border-color 0.3s;
}

.settings-title {
  padding: 0 20px;
  margin-bottom: 20px;
  font-size: 14px;
  font-weight: 600;
  text-transform: uppercase;
  transition: color 0.3s;
}

.settings-categories {
  list-style: none;
  padding: 0;
  margin: 0;
}

.category-item {
  padding: 10px 20px;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
}

.category-item:hover {
  opacity: 0.8;
}

.category-item.active {
  border-left: 3px solid;
}

.settings-content {
  flex: 1;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.settings-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 30px;
    border-bottom: 1px solid;
    transition: border-color 0.3s;
}

.settings-header h3 {
    margin: 0;
    font-size: 20px;
    font-weight: 500;
    transition: color 0.3s;
}

.close-btn {
    background: none;
    border: none;
    font-size: 20px;
    cursor: pointer;
    line-height: 1;
    transition: color 0.2s;
}

.close-btn:hover {
    opacity: 0.7;
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
  transition: color 0.3s;
}

.theme-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 15px;
}

.theme-card {
  border: 2px solid;
  border-radius: 6px;
  padding: 10px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: center;
}

.theme-card:hover {
  opacity: 0.9;
  transform: translateY(-2px);
}

.theme-card.active {
  box-shadow: 0 0 0 2px var(--accent-color);
}

.theme-preview {
  height: 60px;
  border-radius: 4px;
  margin-bottom: 8px;
  border: 1px solid;
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
  transition: color 0.3s;
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
  accent-color: var(--accent-color);
}

.checkbox-text {
  user-select: none;
  transition: color 0.3s;
}

.setting-description {
  margin: 0;
  font-size: 12px;
  padding-left: 28px;
  transition: color 0.3s;
}

.radio-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.radio-label {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  font-size: 14px;
}

.radio-input {
  width: 18px;
  height: 18px;
  cursor: pointer;
  accent-color: var(--accent-color);
}

.radio-text {
  user-select: none;
  transition: color 0.3s;
}

.select-input {
  width: 100%;
  max-width: 300px;
  padding: 8px 12px;
  font-size: 14px;
  border: 1px solid;
  border-radius: 4px;
  cursor: pointer;
  outline: none;
  transition: all 0.2s;
}

.select-input:hover {
  opacity: 0.9;
}

.select-input:focus {
  border-color: var(--accent-color);
}

.font-size-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 15px;
}

.font-btn {
  width: 36px;
  height: 36px;
  border: 1px solid;
  font-size: 18px;
  font-weight: bold;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.font-btn:hover {
  opacity: 0.9;
  border-color: var(--accent-color);
}

.font-btn:active {
  opacity: 0.7;
}

.font-size-value {
  min-width: 60px;
  text-align: center;
  font-size: 16px;
  font-weight: 500;
  transition: color 0.3s;
}

.font-reset-btn {
  margin-left: auto;
  padding: 8px 16px;
  border: 1px solid;
  font-size: 13px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.font-reset-btn:hover {
  opacity: 0.9;
  border-color: var(--accent-color);
}

.font-slider {
  width: 100%;
  height: 4px;
  border-radius: 2px;
  outline: none;
  cursor: pointer;
  accent-color: var(--accent-color);
  transition: background 0.3s;
}
</style>