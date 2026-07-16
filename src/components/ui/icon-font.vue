<script setup lang="ts">
import { computed } from 'vue'

/**
 * iconfont.cn Symbol 图标组件。
 * 依赖 src/assets/iconfont/iconfont.js（在 main.ts 中全局引入）注册的
 * <symbol id="icon-{name}"> 集合。
 *
 * 用法：<icon-font name="close" :size="14" />
 * 颜色跟随 currentColor（iconfont 项目中请使用去色图标）。
 */
const props = withDefaults(
  defineProps<{
    name: string
    size?: number | string
  }>(),
  { size: '1em' },
)

const sizeValue = computed(() =>
  typeof props.size === 'number' ? `${props.size}px` : props.size,
)
</script>

<template>
  <svg
    class="icon-font"
    :style="{ width: sizeValue, height: sizeValue }"
    aria-hidden="true"
  >
    <use :href="`#icon-${name}`" />
  </svg>
</template>

<style scoped>
.icon-font {
  display: inline-block;
  vertical-align: -0.15em;
  fill: currentColor;
  overflow: hidden;
  flex-shrink: 0;
}
</style>
