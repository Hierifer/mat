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

function getFileIcon(node: TreeNode): string {
  if (node.is_dir) {
    return node.expanded ? '📂' : '📁'
  }
  const ext = node.extension?.toLowerCase()
  switch (ext) {
    case 'ts': case 'tsx': return '🟦'
    case 'js': case 'jsx': return '🟨'
    case 'vue': return '💚'
    case 'rs': return '🦀'
    case 'json': return '📋'
    case 'md': return '📝'
    case 'css': case 'scss': return '🎨'
    case 'html': return '🌐'
    default: return '📄'
  }
}

watch(() => props.rootPath, loadRoot, { immediate: true })
</script>

<template>
  <div class="file-tree">
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
        <span class="tree-icon">{{ getFileIcon(node) }}</span>
        <span class="tree-name">{{ node.name }}</span>
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

.tree-icon {
  font-size: 14px;
  flex-shrink: 0;
}

.tree-name {
  overflow: hidden;
  text-overflow: ellipsis;
}

.tree-spinner {
  color: #888;
  margin-left: 4px;
}
</style>
