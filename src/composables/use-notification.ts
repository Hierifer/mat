import { ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification'

export function useNotification() {
  const permissionGranted = ref(false)
  // Track whether Tauri native notifications actually work (they don't in dev mode on macOS)
  const nativeWorks = ref(true)
  // Whether to use osascript fallback (macOS only)
  const useOsascript = ref(false)

  // Check and request permission
  const checkPermission = async () => {
    try {
      let granted = await isPermissionGranted()

      if (!granted) {
        const permission = await requestPermission()
        granted = permission === 'granted'
      }

      permissionGranted.value = granted
      return granted
    } catch (error) {
      console.error('[Notification] Failed to check permission:', error)
      return false
    }
  }

  // Send via macOS osascript (always works, no signing required)
  const sendOsascriptNotification = async (title: string, body: string) => {
    try {
      await invoke('send_macos_notification', { title, body })
      console.log('[Notification] Sent via osascript:', title)
      return true
    } catch (error) {
      console.error('[Notification] osascript failed:', error)
      return false
    }
  }

  // Send a notification (Tauri native → osascript fallback on macOS)
  const notify = async (options: {
    title: string
    body?: string
    icon?: string
    sound?: string
  }) => {
    // macOS fallback: osascript
    if (useOsascript.value) {
      return sendOsascriptNotification(options.title, options.body || '')
    }

    // Try Tauri native notification
    if (nativeWorks.value) {
      try {
        if (!permissionGranted.value) {
          const granted = await checkPermission()
          if (!granted) {
            nativeWorks.value = false
          }
        }

        if (nativeWorks.value) {
          await sendNotification({
            title: options.title,
            body: options.body,
            icon: options.icon,
            sound: options.sound,
          })
          console.log('[Notification] Sent via Tauri:', options.title)
          return true
        }
      } catch (error) {
        console.warn('[Notification] Tauri native failed:', error)
        nativeWorks.value = false
      }
    }

    // Final fallback: try osascript (might fail on non-macOS)
    return sendOsascriptNotification(options.title, options.body || '')
  }

  // Convenience methods
  const notifyTaskComplete = async (taskName: string, details?: string) => {
    return notify({
      title: 'Task Complete',
      body: details || `${taskName}`,
    })
  }

  const notifyError = async (message: string, details?: string) => {
    return notify({
      title: 'Error',
      body: details || message,
    })
  }

  const notifySuccess = async (message: string, details?: string) => {
    return notify({
      title: 'Success',
      body: details || message,
    })
  }

  const notifyInfo = async (message: string, details?: string) => {
    return notify({
      title: 'Info',
      body: details || message,
    })
  }

  // Detect if Tauri native notifications actually work.
  // macOS dev builds (ad-hoc signed) return undefined from isPermissionGranted()
  // and silently swallow notifications. Detect this and switch to osascript.
  const probeNativeNotification = async () => {
    try {
      const granted = await isPermissionGranted()
      // macOS dev mode returns undefined instead of true/false
      if (granted !== true) {
        const perm = await requestPermission()
        if (perm !== 'granted') {
          nativeWorks.value = false
          return
        }
        const recheck = await isPermissionGranted()
        if (recheck !== true) {
          nativeWorks.value = false
          return
        }
      }
      permissionGranted.value = true
    } catch {
      nativeWorks.value = false
    }
  }

  // Initialize
  probeNativeNotification().then(async () => {
    if (!nativeWorks.value) {
      // Test if osascript works (macOS)
      try {
        await invoke('send_macos_notification', { title: '', body: '' }).catch(() => {})
        useOsascript.value = true
        console.log('[Notification] Using osascript fallback for macOS')
      } catch {
        // Not macOS or osascript not available
      }
    }
  })

  return {
    permissionGranted,
    checkPermission,
    notify,
    notifyTaskComplete,
    notifyError,
    notifySuccess,
    notifyInfo,
  }
}
