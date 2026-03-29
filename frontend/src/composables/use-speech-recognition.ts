import { ref, computed, onUnmounted } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

// Web Speech API types
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList
  resultIndex: number
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string
  message: string
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  abort(): void
  onstart: ((this: SpeechRecognition, ev: Event) => any) | null
  onend: ((this: SpeechRecognition, ev: Event) => any) | null
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => any) | null
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any) | null
}

interface SpeechRecognitionConstructor {
  new(): SpeechRecognition
}

declare global {
  interface Window {
    SpeechRecognition: SpeechRecognitionConstructor
    webkitSpeechRecognition: SpeechRecognitionConstructor
  }
}

export function useSpeechRecognition() {
  const isListening = ref(false)
  const transcript = ref('')
  const interimTranscript = ref('')
  const isSupported = ref(false)
  const error = ref<string | null>(null)
  const isMacOS = ref(false)
  const useNativeAPI = ref(false)

  let recognition: SpeechRecognition | null = null
  let unlistenResult: UnlistenFn | null = null
  let unlistenError: UnlistenFn | null = null

  // Clean up event listeners on unmount
  onUnmounted(() => {
    if (unlistenResult) unlistenResult()
    if (unlistenError) unlistenError()
  })

  // Check if browser supports speech recognition
  const checkSupport = async () => {
    // Detect macOS
    isMacOS.value = navigator.platform.toLowerCase().includes('mac')

    // @ts-ignore
    if (window.__TAURI_INTERNALS__) {
      // Running in Tauri, check native API availability (Whisper)
      try {
        const nativeAvailable = await invoke<boolean>('speech_check_availability')
        if (nativeAvailable) {
          // Use Whisper API (cross-platform)
          useNativeAPI.value = true
          isSupported.value = true
          console.log('[Speech] Using Whisper Speech Recognition')
          return true
        }
      } catch (e) {
        console.warn('[Speech] Whisper API check failed:', e)
      }
    }

    if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
      // On macOS with Tauri, Web Speech API doesn't work
      if (isMacOS.value) {
        isSupported.value = false
        console.warn('[Speech] Running on macOS - Web Speech API not supported in WKWebView, native API not available')
        return false
      } else {
        // Use Web Speech API on other platforms
        isSupported.value = true
        useNativeAPI.value = false
        return true
      }
    }

    isSupported.value = false
    error.value = 'Speech recognition is not supported on this platform'
    return false
  }

  // Initialize speech recognition
  const initRecognition = () => {
    if (!checkSupport()) return null

    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition
    recognition = new SpeechRecognitionAPI()

    // Configuration
    recognition.continuous = true // Keep listening
    recognition.interimResults = true // Get interim results
    recognition.lang = 'zh-CN' // Chinese by default, can be changed

    // Event handlers
    recognition.onstart = () => {
      console.log('[Speech] Recognition started')
      isListening.value = true
      error.value = null
    }

    recognition.onend = () => {
      console.log('[Speech] Recognition ended')
      isListening.value = false
    }

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('[Speech] Recognition error:', event.error)

      // Provide user-friendly error messages
      switch (event.error) {
        case 'not-allowed':
          error.value = '麦克风权限被拒绝。请在系统设置中允许麦克风访问。'
          break
        case 'service-not-allowed':
          error.value = 'macOS WebView 不支持语音识别服务。请考虑使用 Chrome 浏览器或安装原生语音识别插件。'
          break
        case 'no-speech':
          error.value = '未检测到语音输入'
          break
        case 'network':
          error.value = '网络错误，请检查网络连接'
          break
        case 'aborted':
          error.value = '语音识别已中止'
          break
        default:
          error.value = `语音识别错误: ${event.error}`
      }

      isListening.value = false
    }

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = ''
      let final = ''

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const text = result[0].transcript

        if (result.isFinal) {
          final += text
        } else {
          interim += text
        }
      }

      if (final) {
        transcript.value += final
        console.log('[Speech] Final transcript:', final)
      }

      interimTranscript.value = interim
    }

    return recognition
  }

  // Start listening
  const start = async () => {
    console.log('[Speech] Start requested')
    transcript.value = ''
    interimTranscript.value = ''
    error.value = null

    if (useNativeAPI.value) {
      // Use native API
      try {
        // Listen for speech results
        if (!unlistenResult) {
          unlistenResult = await listen('speech-result', (event: any) => {
            const result = event.payload as { text: string; is_final: boolean }
            console.log('[Speech] Result received:', result)
            if (result.is_final) {
              transcript.value += result.text
              interimTranscript.value = ''
            } else {
              interimTranscript.value = result.text
            }
          })
          console.log('[Speech] Result listener installed')
        }

        // Listen for speech errors
        if (!unlistenError) {
          unlistenError = await listen('speech-error', (event: any) => {
            const err = event.payload as { error: string; message: string }
            console.error('[Speech] Error event received:', err)
            error.value = err.message
            isListening.value = false
          })
          console.log('[Speech] Error listener installed')
        }

        // @ts-ignore
        // Whisper uses 2-letter language codes: zh, en, ja, etc.
        await invoke('speech_start_recognition', {
          language: 'zh'
        })

        isListening.value = true
        console.log('[Speech] Native recognition started, isListening:', isListening.value)
      } catch (err) {
        console.error('[Speech] Failed to start native recognition:', err)
        error.value = String(err)
        isListening.value = false
      }
    } else {
      // Use Web Speech API
      if (!recognition) {
        recognition = initRecognition()
      }

      if (!recognition) {
        console.error('[Speech] Failed to initialize recognition')
        return
      }

      try {
        recognition.start()
        console.log('[Speech] Starting Web Speech API recognition...')
      } catch (err) {
        console.error('[Speech] Failed to start:', err)
        error.value = 'Failed to start speech recognition'
      }
    }
  }

  // Stop listening
  const stop = async () => {
    console.log('[Speech] Stop requested, isListening:', isListening.value)

    if (useNativeAPI.value) {
      try {
        // @ts-ignore
        await invoke('speech_stop_recognition')
        console.log('[Speech] Native recognition stopped')
      } catch (err) {
        console.error('[Speech] Failed to stop native recognition:', err)
      }
    } else {
      if (recognition && isListening.value) {
        recognition.stop()
        console.log('[Speech] Web Speech API stopped')
      }
    }

    // Clear state immediately
    error.value = null
    isListening.value = false
    console.log('[Speech] State cleared, isListening now:', isListening.value)
  }

  // Toggle listening
  const toggle = async () => {
    if (isListening.value) {
      await stop()
    } else {
      // Check support first
      await checkSupport()
      await start()
    }
  }

  // Change language
  const setLanguage = (lang: string) => {
    if (recognition) {
      recognition.lang = lang
      console.log(`[Speech] Language set to: ${lang}`)
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
    error.value = null
  }

  // Combined transcript for display
  const displayTranscript = computed(() => {
    if (interimTranscript.value) {
      return transcript.value + ' ' + interimTranscript.value
    }
    return transcript.value
  })

  return {
    isListening,
    transcript,
    interimTranscript,
    displayTranscript,
    isSupported,
    error,
    start,
    stop,
    toggle,
    setLanguage,
    getFinalTranscript,
    clear,
  }
}
