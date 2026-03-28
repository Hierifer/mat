import { ref, computed } from 'vue'

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

  let recognition: SpeechRecognition | null = null

  // Check if browser supports speech recognition
  const checkSupport = () => {
    if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
      isSupported.value = true
      return true
    }
    isSupported.value = false
    error.value = 'Speech recognition is not supported in this browser'
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
  const start = () => {
    if (!recognition) {
      recognition = initRecognition()
    }

    if (!recognition) {
      console.error('[Speech] Failed to initialize recognition')
      return
    }

    try {
      transcript.value = ''
      interimTranscript.value = ''
      recognition.start()
      console.log('[Speech] Starting recognition...')
    } catch (err) {
      console.error('[Speech] Failed to start:', err)
      error.value = 'Failed to start speech recognition'
    }
  }

  // Stop listening
  const stop = () => {
    if (recognition && isListening.value) {
      recognition.stop()
      console.log('[Speech] Stopping recognition...')
    }
  }

  // Toggle listening
  const toggle = () => {
    if (isListening.value) {
      stop()
    } else {
      start()
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
