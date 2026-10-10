<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { invoke } from '@tauri-apps/api/core'

interface FsEntry {
  name: string
  path: string
  is_dir: boolean
  size: number
  extension: string | null
}

interface TreeNode extends FsEntry {
  children?: TreeNode[]
  expanded: boolean
  loading: boolean
  depth: number
}

const props = defineProps<{
  rootPath: string
  lightTheme?: boolean
}>()

const emit = defineEmits<{
  'open-file': [path: string]
}>()

const tree = ref<TreeNode[]>([])
const rootLoading = ref(false)

async function loadDir(path: string, depth: number): Promise<TreeNode[]> {
  try {
    const entries: FsEntry[] = await invoke('fs_read_dir', { path })
    return entries.map(e => ({
      ...e,
      expanded: false,
      loading: false,
      depth,
    }))
  } catch (err) {
    console.error('Failed to read directory:', err)
    return []
  }
}

async function loadRoot() {
  rootLoading.value = true
  tree.value = await loadDir(props.rootPath, 0)
  rootLoading.value = false
}

// Flatten tree for rendering
const flatList = computed(() => {
  const result: TreeNode[] = []
  function walk(nodes: TreeNode[]) {
    for (const node of nodes) {
      result.push(node)
      if (node.is_dir && node.expanded && node.children) {
        walk(node.children)
      }
    }
  }
  walk(tree.value)
  return result
})

async function handleClick(node: TreeNode) {
  if (node.is_dir) {
    if (node.expanded) {
      node.expanded = false
      return
    }
    if (!node.children) {
      node.loading = true
      node.children = await loadDir(node.path, node.depth + 1)
      node.loading = false
    }
    node.expanded = true
  } else {
    emit('open-file', node.path)
  }
}

interface FileIcon {
  label: string
  color: string
}

function getFileIcon(node: TreeNode): FileIcon | null {
  if (node.is_dir) return null
  const ext = node.extension?.toLowerCase()
  const name = node.name.toLowerCase()
  // Match by full filename first
  switch (name) {
    case '.gitignore': case '.gitattributes': return { label: '', color: '#f54d27' }
    case '.env': case '.env.local': case '.env.production': return { label: '', color: '#ecd53f' }
    case 'dockerfile': return { label: '', color: '#2496ed' }
    case 'license': case 'licence': return { label: '', color: '#d4af37' }
    case 'eslint.config.js': case '.eslintrc.js': case '.eslintrc.json': return { label: '', color: '#4b32c3' }
  }
  // Match by extension
  switch (ext) {
    case 'ts': return { label: 'TS', color: '#3178c6' }
    case 'tsx': return { label: 'TS', color: '#3178c6' }
    case 'js': return { label: 'JS', color: '#f1e05a' }
    case 'jsx': return { label: 'JS', color: '#f1e05a' }
    case 'mjs': case 'cjs': return { label: 'JS', color: '#f1e05a' }
    case 'vue': return { label: 'V', color: '#41b883' }
    case 'rs': return { label: 'RS', color: '#dea584' }
    case 'json': return { label: '{ }', color: '#a8b1c2' }
    case 'md': return { label: 'M', color: '#519aba' }
    case 'css': return { label: '#', color: '#563d7c' }
    case 'scss': case 'sass': return { label: '#', color: '#c6538c' }
    case 'less': return { label: '#', color: '#1d365d' }
    case 'html': case 'htm': return { label: '<>', color: '#e34c26' }
    case 'svg': return { label: 'SVG', color: '#ffb13b' }
    case 'toml': return { label: 'T', color: '#9c4221' }
    case 'yaml': case 'yml': return { label: 'Y', color: '#cb171e' }
    case 'py': return { label: 'PY', color: '#3572a5' }
    case 'go': return { label: 'GO', color: '#00add8' }
    case 'sh': case 'bash': case 'zsh': return { label: '$', color: '#89e051' }
    case 'lock': return { label: '', color: '#888' }
    case 'png': case 'jpg': case 'jpeg': case 'gif': case 'webp': case 'ico': return { label: '', color: '#a074c4' }
    case 'woff': case 'woff2': case 'ttf': case 'otf': return { label: 'F', color: '#888' }
    case 'xml': return { label: '<>', color: '#f26522' }
    default: return { label: '', color: '#888' }
  }
}

watch(() => props.rootPath, loadRoot, { immediate: true })
</script>

<template>
  <div class="file-tree" :class="{ 'light-theme': lightTheme }">
    <div class="file-tree-header">
      <span class="file-tree-title">EXPLORER</span>
      <button class="refresh-btn" @click="loadRoot" title="Refresh">⟳</button>
    </div>
    <div v-if="rootLoading" class="file-tree-loading">Loading...</div>
    <div v-else class="file-tree-list">
      <div
        v-for="node in flatList"
        :key="node.path"
        class="tree-item"
        :style="{ paddingLeft: node.depth * 16 + 8 + 'px' }"
        @click="handleClick(node)"
      >
        <template v-if="node.is_dir">
          <span class="tree-chevron" :class="{ expanded: node.expanded }">›</span>
          <span class="tree-name">{{ node.name }}</span>
        </template>
        <template v-else>
          <span
            v-if="getFileIcon(node)!.label"
            class="tree-file-icon"
            :style="{ color: getFileIcon(node)!.color }"
          >{{ getFileIcon(node)!.label }}</span>
          <span
            v-else
            class="tree-file-dot"
            :style="{ color: getFileIcon(node)!.color }"
          >●</span>
          <span class="tree-name">{{ node.name }}</span>
        </template>
        <span v-if="node.loading" class="tree-spinner">…</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.file-tree {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #252526;
  user-select: none;
}

.file-tree-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.5px;
  color: #bbb;
  border-bottom: 1px solid #333;
}

.refresh-btn {
  background: none;
  border: none;
  color: #888;
  cursor: pointer;
  font-size: 14px;
  padding: 2px 4px;
  border-radius: 3px;
}
.refresh-btn:hover {
  color: #ccc;
  background: rgba(128, 128, 128, 0.2);
}

.file-tree-loading {
  padding: 16px;
  color: #888;
  font-size: 12px;
}

.file-tree-list {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}

.tree-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  cursor: pointer;
  font-size: 13px;
  color: #ccc;
  white-space: nowrap;
}

.tree-item:hover {
  background: rgba(128, 128, 128, 0.15);
}

.tree-chevron {
  font-size: 12px;
  flex-shrink: 0;
  width: 16px;
  text-align: center;
  color: #888;
  transition: transform 0.15s;
  display: inline-block;
}

.tree-chevron.expanded {
  transform: rotate(90deg);
}

.tree-file-icon {
  font-size: 9px;
  font-weight: 700;
  flex-shrink: 0;
  width: 16px;
  text-align: center;
  line-height: 1;
  font-family: system-ui, -apple-system, sans-serif;
}

.tree-file-dot {
  font-size: 8px;
  flex-shrink: 0;
  width: 16px;
  text-align: center;
  line-height: 1;
}

.tree-name {
  overflow: hidden;
  text-overflow: ellipsis;
}

.tree-spinner {
  color: #888;
  margin-left: 4px;
}

/* Light theme */
.file-tree.light-theme {
  background: #f3f3f3;
}

.light-theme .file-tree-header {
  color: #555;
  border-bottom-color: #e0e0e0;
}

.light-theme .refresh-btn {
  color: #666;
}
.light-theme .refresh-btn:hover {
  color: #333;
  background: rgba(0, 0, 0, 0.06);
}

.light-theme .file-tree-loading {
  color: #666;
}

.light-theme .tree-item {
  color: #333;
}

.light-theme .tree-item:hover {
  background: rgba(0, 0, 0, 0.06);
}

.light-theme .tree-spinner {
  color: #666;
}

.light-theme .tree-chevron {
  color: #666;
}
</style>
