import { ref, onMounted } from 'vue'

export type Platform = 'macos' | 'windows' | 'linux' | 'web'

const platform = ref<Platform>('web')

export function usePlatform() {
  onMounted(() => {
    // Check if running in Tauri
    // @ts-ignore - Tauri internals check
    if (window.__TAURI_INTERNALS__) {
      // Dynamic import for Tauri plugin (only loads in Tauri context)
      import('@tauri-apps/plugin-os')
        .then((module) => {
          return module.platform()
        })
        .then((platformName) => {
          if (platformName === 'macos') {
            platform.value = 'macos'
          } else if (platformName === 'windows') {
            platform.value = 'windows'
          } else if (platformName === 'linux') {
            platform.value = 'linux'
          }
        })
        .catch((error) => {
          console.error('Failed to detect platform:', error)
          // Fallback to user agent detection
          detectFromUserAgent()
        })
    } else {
      detectFromUserAgent()
    }
  })

  const detectFromUserAgent = () => {
    const ua = navigator.userAgent.toLowerCase()
    if (ua.includes('mac')) {
      platform.value = 'macos'
    } else if (ua.includes('win')) {
      platform.value = 'windows'
    } else if (ua.includes('linux')) {
      platform.value = 'linux'
    }
  }

  const isMacOS = () => platform.value === 'macos'
  const isWindows = () => platform.value === 'windows'
  const isLinux = () => platform.value === 'linux'
  const isWeb = () => platform.value === 'web'

  return {
    platform,
    isMacOS,
    isWindows,
    isLinux,
    isWeb,
  }
}
