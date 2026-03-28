import { ref, computed, onUnmounted } from 'vue'

// Type definitions for tauri-plugin-stt-api
interface SttResult {
  transcript: string
  isFinal: boolean
  confidence?: number
}

interface SttState {
  state: 'idle' | 'listening' | 'processing'
}

interface SttError {
  code: string
  message: string
}

interface StartListeningOptions {
  language?: string
  interimResults?: boolean
  continuous?: boolean
  maxDuration?: number
  onDevice?: boolean
}

// API functions - will be imported from tauri-plugin-stt-api
let sttApi: {
  isAvailable: () => Promise<{ available: boolean }>
  getSupportedLanguages: () => Promise<Array<{ code: string; name: string; installed: boolean }>>
  startListening: (options: StartListeningOptions) => Promise<void>
  stopListening: () => Promise<void>
  onResult: (callback: (result: SttResult) => void) => Promise<() => void>
  onStateChange: (callback: (state: SttState) => void) => Promise<() => void>
  onError: (callback: (error: SttError) => void) => Promise<() => void>
} | null = null

// Lazy load the API
async function loadSttApi() {
  if (!sttApi) {
    try {
      sttApi = await import('tauri-plugin-stt-api')
    } catch (error) {
      console.error('[NativeSpeech] Failed to load STT API:', error)
      return null
    }
  }
  return sttApi
}

export function useNativeSpeech() {
  const isListening = ref(false)
  const transcript = ref('')
  const interimTranscript = ref('')
  const isSupported = ref(false)
  const error = ref<string | null>(null)
  const state = ref<'idle' | 'listening' | 'processing'>('idle')

  let unlistenResult: (() => void) | null = null
  let unlistenState: (() => void) | null = null
  let unlistenError: (() => void) | null = null

  // Check if speech recognition is available
  const checkSupport = async () => {
    const api = await loadSttApi()
    if (!api) {
      isSupported.value = false
      error.value = '无法加载语音识别插件'
      return false
    }

    try {
      const result = await api.isAvailable()
      isSupported.value = result.available
      if (!result.available) {
        error.value = '此平台不支持语音识别'
      }
      return result.available
    } catch (err) {
      console.error('[NativeSpeech] Failed to check availability:', err)
      isSupported.value = false
      error.value = '检查语音识别可用性失败'
      return false
    }
  }

  // Initialize event listeners
  const initListeners = async () => {
    const api = await loadSttApi()
    if (!api) return false

    try {
      // Listen for results
      unlistenResult = await api.onResult((result: SttResult) => {
        console.log('[NativeSpeech] Result:', result.transcript, 'isFinal:', result.isFinal)

        if (result.isFinal) {
          transcript.value += result.transcript
          interimTranscript.value = ''
        } else {
          interimTranscript.value = result.transcript
        }
      })

      // Listen for state changes
      unlistenState = await api.onStateChange((stateEvent: SttState) => {
        console.log('[NativeSpeech] State changed:', stateEvent.state)
        state.value = stateEvent.state
        isListening.value = stateEvent.state === 'listening'
      })

      // Listen for errors
      unlistenError = await api.onError((errorEvent: SttError) => {
        console.error('[NativeSpeech] Error:', errorEvent.code, errorEvent.message)

        // Provide user-friendly error messages
        switch (errorEvent.code) {
          case 'PERMISSION_DENIED':
            error.value = '麦克风权限被拒绝。请在系统设置中允许访问。'
            break
          case 'NOT_AVAILABLE':
            error.value = '语音识别服务不可用'
            break
          case 'NO_SPEECH':
            error.value = '未检测到语音输入'
            break
          case 'TIMEOUT':
            error.value = '语音识别超时'
            break
          default:
            error.value = `语音识别错误: ${errorEvent.message}`
        }

        isListening.value = false
      })

      return true
    } catch (err) {
      console.error('[NativeSpeech] Failed to initialize listeners:', err)
      return false
    }
  }

  // Start listening
  const start = async () => {
    const api = await loadSttApi()
    if (!api) {
      error.value = '无法加载语音识别插件'
      return
    }

    // Initialize listeners if not already done
    if (!unlistenResult) {
      const success = await initListeners()
      if (!success) {
        error.value = '初始化语音识别失败'
        return
      }
    }

    try {
      transcript.value = ''
      interimTranscript.value = ''
      error.value = null

      await api.startListening({
        language: 'zh-CN', // Chinese by default
        interimResults: true,
        continuous: true,
        maxDuration: 0, // unlimited
      })

      console.log('[NativeSpeech] Started listening...')
    } catch (err) {
      console.error('[NativeSpeech] Failed to start:', err)
      error.value = '启动语音识别失败'
      isListening.value = false
    }
  }

  // Stop listening
  const stop = async () => {
    const api = await loadSttApi()
    if (!api) return

    try {
      await api.stopListening()
      console.log('[NativeSpeech] Stopped listening')
    } catch (err) {
      console.error('[NativeSpeech] Failed to stop:', err)
    }
  }

  // Toggle listening
  const toggle = async () => {
    if (isListening.value) {
      await stop()
    } else {
      await start()
    }
  }

  // Get final transcript (for use in terminal)
  const getFinalTranscript = () => {
    return transcript.value
  }

  // Clear transcript
  const clear = () => {
    transcript.value = ''
    interimTranscript.value = ''
  }

  // Combined transcript for display
  const displayTranscript = computed(() => {
    if (interimTranscript.value) {
      return transcript.value + ' ' + interimTranscript.value
    }
    return transcript.value
  })

  // Cleanup on unmount
  onUnmounted(() => {
    if (unlistenResult) unlistenResult()
    if (unlistenState) unlistenState()
    if (unlistenError) unlistenError()
  })

  // Check support on initialization
  checkSupport()

  return {
    isListening,
    transcript,
    interimTranscript,
    displayTranscript,
    isSupported,
    error,
    state,
    start,
    stop,
    toggle,
    getFinalTranscript,
    clear,
  }
}
