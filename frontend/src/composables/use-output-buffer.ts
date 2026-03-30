import { ref } from 'vue'
import type { Terminal } from 'xterm'

interface OutputBufferOptions {
  /** 批处理间隔（毫秒） */
  batchInterval?: number
  /** 最大缓冲区大小（字节） */
  maxBufferSize?: number
  /** 每批次最大字节数 */
  maxBatchSize?: number
  /** 是否启用输出限流 */
  enabled?: boolean
}

export function useOutputBuffer(terminal: Terminal, options: OutputBufferOptions = {}) {
  const {
    batchInterval = 16, // ~60fps
    maxBufferSize = 1024 * 1024, // 1MB
    maxBatchSize = 64 * 1024, // 64KB per batch
    enabled = true,
  } = options

  const isPaused = ref(false)
  const droppedBytes = ref(0)
  const bufferedBytes = ref(0)

  let buffer: Uint8Array[] = []
  let totalBufferSize = 0
  let flushTimer: number | null = null
  let isProcessing = false

  // 合并多个 Uint8Array
  const mergeArrays = (arrays: Uint8Array[]): Uint8Array => {
    const totalLength = arrays.reduce((acc, arr) => acc + arr.length, 0)
    const result = new Uint8Array(totalLength)
    let offset = 0
    for (const arr of arrays) {
      result.set(arr, offset)
      offset += arr.length
    }
    return result
  }

  // 刷新缓冲区到终端
  const flush = () => {
    if (buffer.length === 0 || isProcessing || isPaused.value) {
      return
    }

    isProcessing = true

    try {
      // 合并所有缓冲的数据
      const merged = mergeArrays(buffer)

      // 如果数据太大，分批写入
      if (merged.length > maxBatchSize) {
        let offset = 0
        while (offset < merged.length && !isPaused.value) {
          const chunk = merged.slice(offset, offset + maxBatchSize)
          terminal.write(chunk)
          offset += maxBatchSize

          // 给浏览器一些时间渲染
          if (offset < merged.length) {
            // 使用 setTimeout 0 让浏览器有机会渲染
            setTimeout(() => {}, 0)
          }
        }
      } else {
        terminal.write(merged)
      }

      // 清空缓冲区
      buffer = []
      totalBufferSize = 0
      bufferedBytes.value = 0
    } finally {
      isProcessing = false
    }
  }

  // 添加数据到缓冲区
  const write = (data: Uint8Array) => {
    if (!enabled) {
      // 直接写入，不缓冲
      terminal.write(data)
      return
    }

    // 检查缓冲区是否过大
    if (totalBufferSize + data.length > maxBufferSize) {
      // 缓冲区满了，丢弃旧数据或直接刷新
      console.warn('[OutputBuffer] Buffer overflow, flushing...')
      flush()

      // 如果还是太大，开始丢弃数据
      if (totalBufferSize + data.length > maxBufferSize) {
        droppedBytes.value += data.length
        console.warn(`[OutputBuffer] Dropped ${data.length} bytes`)
        return
      }
    }

    // 添加到缓冲区
    buffer.push(data)
    totalBufferSize += data.length
    bufferedBytes.value = totalBufferSize

    // 设置刷新定时器
    if (flushTimer === null) {
      flushTimer = setTimeout(() => {
        flushTimer = null
        flush()
      }, batchInterval) as unknown as number
    }
  }

  // 暂停输出
  const pause = () => {
    isPaused.value = true
    console.log('[OutputBuffer] Output paused')
  }

  // 恢复输出
  const resume = () => {
    isPaused.value = false
    console.log('[OutputBuffer] Output resumed')
    flush()
  }

  // 清除缓冲区
  const clear = () => {
    if (flushTimer !== null) {
      clearTimeout(flushTimer)
      flushTimer = null
    }
    buffer = []
    totalBufferSize = 0
    bufferedBytes.value = 0
    droppedBytes.value = 0
  }

  // 立即刷新
  const forceFlush = () => {
    if (flushTimer !== null) {
      clearTimeout(flushTimer)
      flushTimer = null
    }
    flush()
  }

  // 清理
  const dispose = () => {
    clear()
    isPaused.value = false
  }

  return {
    write,
    pause,
    resume,
    clear,
    forceFlush,
    dispose,
    isPaused,
    bufferedBytes,
    droppedBytes,
  }
}
