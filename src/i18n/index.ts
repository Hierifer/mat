import { createI18n } from 'vue-i18n'
import en from './locales/en'
import zhCN from './locales/zh-CN'

// 检测系统语言
function getDefaultLocale(): string {
  const browserLang = navigator.language.toLowerCase()

  if (browserLang.startsWith('zh')) {
    return 'zh-CN'
  }
  return 'en'
}

export const i18n = createI18n({
  legacy: false,
  locale: getDefaultLocale(),
  fallbackLocale: 'en',
  messages: {
    en,
    'zh-CN': zhCN,
  },
})

export type LocaleType = 'en' | 'zh-CN'

export const availableLocales = [
  { code: 'en', name: 'English' },
  { code: 'zh-CN', name: '简体中文' },
] as const
