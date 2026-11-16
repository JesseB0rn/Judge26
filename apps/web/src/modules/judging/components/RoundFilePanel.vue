<script setup lang="ts">
import { t } from '@/i18n'
import { onBeforeUnmount, ref, watch } from 'vue'
import { DownloadIcon, ExternalLinkIcon, EyeIcon, EyeOffIcon, ShuffleIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { roundFileUrl } from '../api'
import type { RoundFile } from '../types'

/**
 * The randomization file of a round (M10-17), shown on the robot check and the score sheet once
 * the check is confirmed. The file needs the sign-in, so it is loaded into a local object URL.
 *
 * Once the table is set up the judge can hide the preview. That choice is remembered on this
 * device for the round, until the file is replaced.
 */
const props = defineProps<{ roundId: string; file: RoundFile }>()

const hiddenKey = (roundId: string) => `judge26:judging:roundFileHidden:${roundId}`

function readHidden(): boolean {
  try {
    return localStorage.getItem(hiddenKey(props.roundId)) === props.file.updated
  } catch {
    return false
  }
}

const hidden = ref(readHidden())
watch(
  () => `${props.roundId}:${props.file.updated}`,
  () => (hidden.value = readHidden()),
)

function toggleHidden() {
  hidden.value = !hidden.value
  try {
    if (hidden.value) localStorage.setItem(hiddenKey(props.roundId), props.file.updated)
    else localStorage.removeItem(hiddenKey(props.roundId))
  } catch {
    // Not persisted (private mode); the toggle still works for this page.
  }
}

const url = ref('')
const failed = ref(false)

function revoke() {
  if (url.value) URL.revokeObjectURL(url.value)
  url.value = ''
}

watch(
  () => `${props.roundId}:${props.file.updated}`,
  async () => {
    revoke()
    failed.value = false
    try {
      url.value = await roundFileUrl(props.roundId)
    } catch {
      failed.value = true
    }
  },
  { immediate: true },
)
onBeforeUnmount(revoke)
</script>

<template>
  <section
    class="flex flex-col gap-2 rounded-xl border-2 border-violet-300 p-3"
    data-testid="round-file"
  >
    <div class="flex items-center gap-2">
      <ShuffleIcon class="size-5 shrink-0 text-violet-700" aria-hidden="true" />
      <h2 class="min-w-0 flex-1 font-semibold">
        {{ t('checks.file.title') }}
        <span class="block truncate text-sm font-normal text-muted-foreground">{{
          file.name
        }}</span>
      </h2>
      <template v-if="url">
        <Button as-child size="icon-touch" variant="ghost">
          <a
            :href="url"
            target="_blank"
            rel="noopener"
            :aria-label="t('common.openItem', { item: file.name })"
            ><ExternalLinkIcon
          /></a>
        </Button>
        <Button as-child size="icon-touch" variant="ghost">
          <a
            :href="url"
            :download="file.name"
            :aria-label="t('common.downloadItem', { item: file.name })"
            ><DownloadIcon
          /></a>
        </Button>
      </template>
      <Button
        size="touch"
        variant="outline"
        :aria-expanded="!hidden"
        data-testid="round-file-toggle"
        @click="toggleHidden"
      >
        <EyeIcon v-if="hidden" aria-hidden="true" />
        <EyeOffIcon v-else aria-hidden="true" />
        {{ hidden ? t('checks.file.show') : t('checks.file.hide') }}
      </Button>
    </div>
    <p v-if="hidden" class="sr-only">{{ t('checks.file.hidden') }}</p>
    <p v-else-if="failed" class="text-sm text-destructive">{{ t('checks.file.failed') }}</p>
    <template v-else-if="url">
      <img
        v-if="file.kind === 'image'"
        :src="url"
        :alt="file.name"
        class="max-h-[70vh] w-full rounded-lg bg-muted object-contain"
        data-testid="round-file-image"
      />
      <iframe
        v-else
        :src="url"
        :title="file.name"
        class="h-[70vh] w-full rounded-lg border bg-muted"
      />
    </template>
  </section>
</template>
