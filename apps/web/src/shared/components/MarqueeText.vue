<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

/**
 * Text on one fixed line that is never cut off (M10-04): when it does not fit, it scrolls back
 * and forth (a marquee). With reduced motion it wraps onto further lines instead. The full text
 * is always readable by screen readers.
 */
const props = defineProps<{ text: string }>()
const outer = ref<HTMLElement>()
const inner = ref<HTMLElement>()
const shift = ref(0)

function measure() {
  const o = outer.value
  const i = inner.value
  shift.value = o && i ? Math.max(0, i.scrollWidth - o.clientWidth) : 0
}

let observer: ResizeObserver | undefined
onMounted(() => {
  measure()
  if (typeof ResizeObserver !== 'undefined' && outer.value) {
    observer = new ResizeObserver(measure)
    observer.observe(outer.value)
  }
})
watch(
  () => props.text,
  () => nextTick(measure),
)
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <span
    ref="outer"
    class="marquee block min-w-0 overflow-hidden whitespace-nowrap"
    :data-overflowing="shift > 0 || undefined"
    :style="{ '--shift': `-${shift}px`, '--duration': `${Math.max(4, shift / 20)}s` }"
    data-testid="marquee"
  >
    <span ref="inner" class="inline-block">{{ text }}</span>
  </span>
</template>

<style scoped>
.marquee[data-overflowing] > span {
  animation: marquee var(--duration) ease-in-out 1s infinite alternate;
}
@keyframes marquee {
  0%,
  15% {
    transform: translateX(0);
  }
  85%,
  100% {
    transform: translateX(var(--shift));
  }
}
@media (prefers-reduced-motion: reduce) {
  .marquee {
    white-space: normal;
    overflow-wrap: anywhere;
  }
  .marquee[data-overflowing] > span {
    animation: none;
  }
}
</style>
