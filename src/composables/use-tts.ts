import { ref } from 'vue'
import { useTerminalStore } from '@/stores/terminal-store'

const isSpeaking = ref(false)
let currentAudio: HTMLAudioElement | null = null

/**
 * Stop any currently playing TTS audio
 */
function stop() {
  if (currentAudio) {
    currentAudio.pause()
    currentAudio.src = ''
    currentAudio = null
  }
  isSpeaking.value = false
}

/**
 * Speak text using DashScope CosyVoice TTS HTTP API
 */
async function speak(text: string) {
  const store = useTerminalStore()

  if (!store.enableVoiceAnnouncements) return
  if (!store.alibabaApiKey) return

  // Stop any current playback
  stop()

  try {
    isSpeaking.value = true

    const response = await fetch(
      'https://dashscope.aliyuncs.com/api/v1/services/aigc/text2audio/generation',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${store.alibabaApiKey}`,
        },
        body: JSON.stringify({
          model: 'cosyvoice-v2',
          input: {
            text,
            voice: store.ttsVoice,
          },
          parameters: {
            format: 'mp3',
            sample_rate: 22050,
          },
        }),
      }
    )

    if (!response.ok) {
      console.error('[TTS] API request failed:', response.status, response.statusText)
      isSpeaking.value = false
      return
    }

    // The response is binary audio data directly
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)

    const audio = new Audio(url)
    currentAudio = audio

    audio.onended = () => {
      URL.revokeObjectURL(url)
      currentAudio = null
      isSpeaking.value = false
    }

    audio.onerror = () => {
      URL.revokeObjectURL(url)
      currentAudio = null
      isSpeaking.value = false
    }

    await audio.play()
  } catch (error) {
    console.error('[TTS] Failed to speak:', error)
    isSpeaking.value = false
  }
}

/**
 * TTS composable - module-level singleton
 */
export function useTts() {
  return {
    speak,
    stop,
    isSpeaking,
  }
}
