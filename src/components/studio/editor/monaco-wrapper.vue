<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, shallowRef } from 'vue'
import * as monaco from 'monaco-editor'

// Configure Monaco workers using pre-built files in public/
self.MonacoEnvironment = {
  getWorkerUrl(_: unknown, label: string) {
    if (label === 'json') return '/monaco-workers/json.worker.js'
    if (label === 'css' || label === 'scss' || label === 'less') return '/monaco-workers/css.worker.js'
    if (label === 'html' || label === 'handlebars' || label === 'razor') return '/monaco-workers/html.worker.js'
    if (label === 'typescript' || label === 'javascript') return '/monaco-workers/ts.worker.js'
    return '/monaco-workers/editor.worker.js'
  },
}

const props = defineProps<{
  modelValue: string
  language: string
  filePath: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  save: []
}>()

const container = ref<HTMLDivElement>()
const editor = shallowRef<monaco.editor.IStandaloneCodeEditor>()

// Cache models per file path for independent undo history
const modelCache = new Map<string, monaco.editor.ITextModel>()

function getOrCreateModel(path: string, content: string, language: string): monaco.editor.ITextModel {
  let model = modelCache.get(path)
  if (model && !model.isDisposed()) {
    // Update language if changed
    if (model.getLanguageId() !== language) {
      monaco.editor.setModelLanguage(model, language)
    }
    return model
  }

  const uri = monaco.Uri.file(path)
  model = monaco.editor.getModel(uri) ?? monaco.editor.createModel(content, language, uri)
  modelCache.set(path, model)
  return model
}

onMounted(() => {
  if (!container.value) return

  const model = getOrCreateModel(props.filePath, props.modelValue, props.language)

  editor.value = monaco.editor.create(container.value, {
    model,
    theme: 'vs-dark',
    automaticLayout: true,
    minimap: { enabled: true },
    fontSize: 13,
    scrollBeyondLastLine: false,
    wordWrap: 'off',
    tabSize: 2,
    renderWhitespace: 'selection',
    smoothScrolling: true,
    cursorSmoothCaretAnimation: 'on',
  })

  // Emit changes
  editor.value.onDidChangeModelContent(() => {
    emit('update:modelValue', editor.value!.getValue())
  })

  // Cmd/Ctrl+S to save
  editor.value.addAction({
    id: 'save-file',
    label: 'Save File',
    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
    run: () => {
      emit('save')
    },
  })
})

watch(() => props.filePath, (newPath) => {
  if (!editor.value) return
  const model = getOrCreateModel(newPath, props.modelValue, props.language)
  editor.value.setModel(model)
})

// Update model content when modelValue changes externally (e.g. file reload)
watch(() => props.modelValue, (newVal) => {
  if (!editor.value) return
  const currentVal = editor.value.getValue()
  if (newVal !== currentVal) {
    editor.value.setValue(newVal)
  }
})

onBeforeUnmount(() => {
  editor.value?.dispose()
  // Don't dispose models — they persist for tab switching
})

defineExpose({
  focus: () => editor.value?.focus(),
})
</script>

<template>
  <div ref="container" class="monaco-container"></div>
</template>

<style scoped>
.monaco-container {
  width: 100%;
  height: 100%;
}
</style>
