import { ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification'

// ============================================================================
// Singleton state — shared across all useNotification() callers
// ============================================================================
const permissionGranted = ref(false)
const nativeWorks = ref(true)
const useOsascript = ref(false)
let probePromise: Promise<void> | null = null

// Send via macOS osascript (always works, no signing required)
async function sendOsascriptNotification(title: string, body: string): Promise<boolean> {
  try {
    await invoke('send_macos_notification', { title, body })
    console.log('[Notification] Sent via osascript:', title)
    return true
  } catch (error) {
    console.error('[Notification] osascript failed:', error)
    return false
  }
}

// Probe once: detect if Tauri native notifications actually work.
// macOS dev builds (ad-hoc signed) silently swallow notifications —
// sendNotification() resolves OK but nothing appears. We detect this
// by checking if isPermissionGranted() returns something other than true.
async function probeOnce(): Promise<void> {
  try {
    const granted = await isPermissionGranted()
    console.log('[Notification] isPermissionGranted:', granted)
    if (granted !== true) {
      const perm = await requestPermission()
      console.log('[Notification] requestPermission result:', perm)
      if (perm !== 'granted') {
        nativeWorks.value = false
      } else {
        const recheck = await isPermissionGranted()
        console.log('[Notification] recheck after grant:', recheck)
        if (recheck !== true) {
          nativeWorks.value = false
        } else {
          permissionGranted.value = true
        }
      }
    } else {
      permissionGranted.value = true
    }
  } catch (e) {
    console.error('[Notification] probe error:', e)
    nativeWorks.value = false
  }

  // In dev mode, Tauri native notifications silently fail on macOS (ad-hoc signed).
  // Force osascript fallback regardless of permission probe result.
  const isDev = import.meta.env.DEV
  if (isDev) {
    console.log('[Notification] Dev mode detected, forcing osascript fallback')
    nativeWorks.value = false
  }

  console.log('[Notification] probe result: nativeWorks =', nativeWorks.value, ', permissionGranted =', permissionGranted.value)

  // If native doesn't work, try osascript fallback (macOS)
  if (!nativeWorks.value) {
    try {
      // @ts-ignore — check if Tauri runtime is available
      if (window.__TAURI_INTERNALS__) {
        await invoke('send_macos_notification', { title: 'Materm', body: 'Notifications enabled' })
        useOsascript.value = true
        console.log('[Notification] Using osascript fallback for macOS')
      }
    } catch {
      // Not macOS or osascript not available
    }
  }
}

// Start probe immediately at module load (runs once)
function ensureProbed(): Promise<void> {
  if (!probePromise) {
    // @ts-ignore
    if (typeof window !== 'undefined' && window.__TAURI_INTERNALS__) {
      probePromise = probeOnce()
    } else {
      probePromise = Promise.resolve()
    }
  }
  return probePromise
}

// Kick off probe at import time
ensureProbed()

// ============================================================================
// Composable — returns methods that use the shared singleton state
// ============================================================================
export function useNotification() {
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

  const notify = async (options: {
    title: string
    body?: string
    icon?: string
    sound?: string
  }) => {
    // Wait for probe to complete before deciding which path to use
    await ensureProbed()

    // macOS osascript fallback
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

    // Final fallback: try osascript
    return sendOsascriptNotification(options.title, options.body || '')
  }

  const notifyTaskComplete = async (taskName: string, details?: string) => {
    return notify({ title: 'Task Complete', body: details || taskName })
  }

  const notifyError = async (message: string, details?: string) => {
    return notify({ title: 'Error', body: details || message })
  }

  const notifySuccess = async (message: string, details?: string) => {
    return notify({ title: 'Success', body: details || message })
  }

  const notifyInfo = async (message: string, details?: string) => {
    return notify({ title: 'Info', body: details || message })
  }

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
