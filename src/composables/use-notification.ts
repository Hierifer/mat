import { ref } from 'vue'
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification'

export function useNotification() {
  const permissionGranted = ref(false)

  // Check and request permission
  const checkPermission = async () => {
    try {
      // Check if permission is already granted
      let granted = await isPermissionGranted()

      if (!granted) {
        // Request permission if not granted
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

  // Send a notification
  const notify = async (options: {
    title: string
    body?: string
    icon?: string
    sound?: string
  }) => {
    try {
      // Ensure we have permission
      if (!permissionGranted.value) {
        const granted = await checkPermission()
        if (!granted) {
          console.warn('[Notification] Permission not granted')
          return false
        }
      }

      // Send the notification
      await sendNotification({
        title: options.title,
        body: options.body,
        icon: options.icon,
        sound: options.sound,
      })

      console.log('[Notification] Sent:', options.title)
      return true
    } catch (error) {
      console.error('[Notification] Failed to send:', error)
      return false
    }
  }

  // Convenience methods for common notifications
  const notifyTaskComplete = async (taskName: string, details?: string) => {
    return notify({
      title: '✅ 任务完成',
      body: details || `${taskName} 已完成`,
    })
  }

  const notifyError = async (message: string, details?: string) => {
    return notify({
      title: '❌ 错误',
      body: details || message,
    })
  }

  const notifySuccess = async (message: string, details?: string) => {
    return notify({
      title: '✨ 成功',
      body: details || message,
    })
  }

  const notifyInfo = async (message: string, details?: string) => {
    return notify({
      title: 'ℹ️ 提示',
      body: details || message,
    })
  }

  // Initialize permission check on first use
  checkPermission()

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
