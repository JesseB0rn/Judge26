<script setup lang="ts">
import { ref, watch } from 'vue'
import QRCode from 'qrcode'

/**
 * A QR code of `value`, generated in the browser as SVG (M10-35); nothing is sent anywhere.
 * The SVG comes from the QR library, never from user input.
 */
const props = defineProps<{ value: string; label: string }>()
const svg = ref('')

watch(
  () => props.value,
  async (value) => {
    svg.value = value
      ? await QRCode.toString(value, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' })
      : ''
  },
  { immediate: true },
)
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -->
  <div
    v-if="svg"
    class="qr-code bg-white [&>svg]:block [&>svg]:size-full"
    role="img"
    :aria-label="label"
    :data-qr-value="value"
    data-testid="qr-code"
    v-html="svg"
  />
</template>
