import { ref } from 'vue'
import { check, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { getVersion } from '@tauri-apps/api/app'
import { useTerminalStore } from '@/stores/terminal-store'

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
  const isReadyToRestart = ref(false)
  const downloadProgress = ref(0)
  const error = ref<string | null>(null)

  let pendingUpdate: Update | null = null

  const checkForUpdates = async (silent = false): Promise<boolean> => {
    console.log('[Updater] ========================================')
    console.log('[Updater] checkForUpdates called, silent:', silent)
    isChecking.value = true
    error.value = null

    try {
      console.log('[Updater] Calling Tauri updater check()...')
      const update = await check()
      console.log('[Updater] check() returned:', update)

      if (update) {
        // Compare with current version to avoid false positives
        let currentVersion = ''
        try {
          currentVersion = await getVersion()
        } catch (_) {}

        if (currentVersion && update.version === currentVersion) {
          console.log(`[Updater] Remote version ${update.version} matches current version, skipping`)
          updateAvailable.value = false
          pendingUpdate = null
          updateInfo.value = null
          return false
        }

        console.log('[Updater] Update available!')
        console.log('[Updater] Current:', currentVersion, '→ Remote:', update.version)
        updateAvailable.value = true
        pendingUpdate = update
        updateInfo.value = {
          version: update.version,
          date: update.date,
          body: update.body,
        }
        console.log('[Updater] ========================================')
        return true
      } else {
        console.log('[Updater] No updates available (already on latest)')
        updateAvailable.value = false
        pendingUpdate = null
        updateInfo.value = null
        console.log('[Updater] ========================================')
        return false
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      console.error('[Updater] ========================================')
      console.error('[Updater] Check FAILED!')
      console.error('[Updater] Error message:', errorMessage)
      console.error('[Updater] ========================================')
      error.value = errorMessage

      if (!silent) {
        throw err
      }
      return false
    } finally {
      isChecking.value = false
    }
  }

  const downloadAndInstall = async () => {
    if (!pendingUpdate) {
      const update = await check()
      if (!update) {
        throw new Error('No update available')
      }
      pendingUpdate = update
    }

    isDownloading.value = true
    error.value = null
    let totalLength = 0
    let downloaded = 0

    try {
      console.log('[Updater] Downloading update...')

      await pendingUpdate.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            console.log('[Updater] Download started, contentLength:', event.data.contentLength)
            totalLength = event.data.contentLength ?? 0
            downloaded = 0
            downloadProgress.value = 0
            break
          case 'Progress':
            downloaded += event.data.chunkLength
            if (totalLength > 0) {
              const progress = Math.min(Math.round((downloaded / totalLength) * 100), 100)
              console.log(`[Updater] Download progress: ${progress}%`)
              downloadProgress.value = progress
            }
            break
          case 'Finished':
            console.log('[Updater] Download finished')
            downloadProgress.value = 100
            break
        }
      })

      console.log('[Updater] Update downloaded and installed. Waiting for user to restart.')
      isReadyToRestart.value = true
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      console.error('[Updater] Download/install failed:', errorMessage)
      error.value = errorMessage
      throw err
    } finally {
      isDownloading.value = false
    }
  }

  const restartApp = async () => {
    // Save terminal state before restarting
    console.log('[Updater] Saving terminal state before relaunch...')
    try {
      const store = useTerminalStore()
      store.saveTerminalState()
    } catch (err) {
      console.warn('[Updater] Failed to save terminal state:', err)
    }

    console.log('[Updater] Restarting app...')
    await relaunch()
  }

  const reset = () => {
    updateAvailable.value = false
    updateInfo.value = null
    isChecking.value = false
    isDownloading.value = false
    isReadyToRestart.value = false
    downloadProgress.value = 0
    error.value = null
  }

  return {
    updateAvailable,
    updateInfo,
    isChecking,
    isDownloading,
    isReadyToRestart,
    downloadProgress,
    error,
    checkForUpdates,
    downloadAndInstall,
    restartApp,
    reset,
  }
}
