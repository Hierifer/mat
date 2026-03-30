import { ref, computed } from 'vue'

interface PerformanceMetrics {
  bytesReceived: number
  bytesDropped: number
  bytesBuffered: number
  fps: number
  renderTime: number
}

export function useTerminalPerformance() {
  const metrics = ref<PerformanceMetrics>({
    bytesReceived: 0,
    bytesDropped: 0,
    bytesBuffered: 0,
    fps: 0,
    renderTime: 0,
  })

  const isHighLoad = computed(() => metrics.value.bytesBuffered > 512 * 1024) // 512KB
  const isOverloaded = computed(() => metrics.value.bytesDropped > 0)

  let lastFrameTime = performance.now()
  let frameCount = 0
  let fpsInterval: number | null = null

  const startMonitoring = () => {
    // 每秒计算一次 FPS
    fpsInterval = setInterval(() => {
      const now = performance.now()
      const elapsed = now - lastFrameTime
      metrics.value.fps = Math.round((frameCount * 1000) / elapsed)
      frameCount = 0
      lastFrameTime = now
    }, 1000) as unknown as number
  }

  const stopMonitoring = () => {
    if (fpsInterval !== null) {
      clearInterval(fpsInterval)
      fpsInterval = null
    }
  }

  const recordFrame = () => {
    frameCount++
  }

  const updateMetrics = (partial: Partial<PerformanceMetrics>) => {
    Object.assign(metrics.value, partial)
  }

  const reset = () => {
    metrics.value = {
      bytesReceived: 0,
      bytesDropped: 0,
      bytesBuffered: 0,
      fps: 0,
      renderTime: 0,
    }
    frameCount = 0
    lastFrameTime = performance.now()
  }

  const getRecommendations = (): string[] => {
    const recommendations: string[] = []

    if (isOverloaded.value) {
      recommendations.push('输出速度过快，已丢弃部分数据。建议暂停输出或增大缓冲区。')
    }

    if (isHighLoad.value) {
      recommendations.push('缓冲区负载较高，可能会出现延迟。')
    }

    if (metrics.value.fps < 30 && metrics.value.fps > 0) {
      recommendations.push('渲染性能较低，建议减少输出或降低字体大小。')
    }

    if (metrics.value.bytesReceived > 10 * 1024 * 1024) {
      recommendations.push(`已接收 ${(metrics.value.bytesReceived / 1024 / 1024).toFixed(1)}MB 数据，建议清屏以释放内存。`)
    }

    return recommendations
  }

  return {
    metrics,
    isHighLoad,
    isOverloaded,
    startMonitoring,
    stopMonitoring,
    recordFrame,
    updateMetrics,
    reset,
    getRecommendations,
  }
}
