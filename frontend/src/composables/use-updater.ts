import { ref } from 'vue'
import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'

export interface UpdateInfo {
  version: string
  date?: string
  body?: string
}

export function useUpdater() {
  const updateAvailable = ref(false)
  const updateInfo = ref<UpdateInfo | null>(null)
  const isChecking = ref(false)
  const isDownloading = ref(false)
  const downloadProgress = ref(0)
  const error = ref<string | null>(null)

  const checkForUpdates = async (silent = false): Promise<boolean> => {
    isChecking.value = true
    error.value = null

    try {
      console.log('[Updater] Checking for updates...')
      const update = await check()

      if (update) {
        console.log('[Updater] Update available:', update.version)
        updateAvailable.value = true
        updateInfo.value = {
          version: update.version,
          date: update.date,
          body: update.body,
        }
        return true
      } else {
        console.log('[Updater] No updates available')
        updateAvailable.value = false
        updateInfo.value = null
        return false
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      console.error('[Updater] Check failed:', errorMessage)
      error.value = errorMessage

      if (!silent) {
        // Only show error if not silent
        throw err
      }
      return false
    } finally {
      isChecking.value = false
    }
  }

  const downloadAndInstall = async () => {
    const update = await check()
    if (!update) {
      throw new Error('No update available')
    }

    isDownloading.value = true
    error.value = null

    try {
      console.log('[Updater] Downloading update...')

      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            console.log('[Updater] Download started')
            downloadProgress.value = 0
            break
          case 'Progress':
            const progress = Math.round(
              (event.data.downloaded / event.data.contentLength) * 100
            )
            console.log(`[Updater] Download progress: ${progress}%`)
            downloadProgress.value = progress
            break
          case 'Finished':
            console.log('[Updater] Download finished')
            downloadProgress.value = 100
            break
        }
      })

      console.log('[Updater] Installing update and restarting...')
      await relaunch()
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      console.error('[Updater] Download/install failed:', errorMessage)
      error.value = errorMessage
      throw err
    } finally {
      isDownloading.value = false
    }
  }

  const reset = () => {
    updateAvailable.value = false
    updateInfo.value = null
    isChecking.value = false
    isDownloading.value = false
    downloadProgress.value = 0
    error.value = null
  }

  return {
    updateAvailable,
    updateInfo,
    isChecking,
    isDownloading,
    downloadProgress,
    error,
    checkForUpdates,
    downloadAndInstall,
    reset,
  }
}
