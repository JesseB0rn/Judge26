<script setup lang="ts">
import { t } from '@/i18n'
import { computed, onMounted, ref } from 'vue'
import { RefreshCwIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import PageHeader from '@/shared/components/PageHeader.vue'
import { useLoader } from '@/shared/composables/useSubmit'
import { formatDateTime } from '@/shared/format'
import { listCapturedMails, mailDocument } from '../devMailbox'

/** Every email the backend captured instead of sending (M8-11, development and test only). */
const { data: mails, loading, error, load } = useLoader(listCapturedMails)
const selected = ref(0)
const current = computed(() => mails.value?.[selected.value])

async function refresh() {
  await load()
  selected.value = 0
}

onMounted(load)
</script>

<template>
  <PageHeader
    :title="t('communication.mailbox.title')"
    :description="t('communication.mailbox.description')"
  >
    <template #actions>
      <Button variant="outline" :disabled="loading" @click="refresh()">
        <RefreshCwIcon /> {{ t('communication.mailbox.refresh') }}
      </Button>
    </template>
  </PageHeader>
  <ErrorAlert :error="error" />
  <p
    v-if="!loading && !mails?.length"
    class="text-sm text-muted-foreground"
    data-testid="mailbox-empty"
  >
    {{ t('communication.mailbox.empty') }}
  </p>
  <div v-else class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
    <nav
      class="flex flex-col gap-1"
      :aria-label="t('communication.mailbox.title')"
      data-testid="mailbox-list"
    >
      <button
        v-for="(mail, i) in mails"
        :key="`${mail.sentAt}-${i}`"
        type="button"
        class="rounded-md border px-3 py-2 text-left text-sm hover:bg-muted"
        :class="{ 'bg-muted': selected === i }"
        :aria-current="selected === i ? 'true' : undefined"
        @click="selected = i"
      >
        <span class="block truncate font-medium">{{ mail.subject }}</span>
        <span class="block truncate text-xs text-muted-foreground"
          >{{ mail.to.join(', ') }} · {{ formatDateTime(mail.sentAt) }}</span
        >
      </button>
    </nav>
    <article v-if="current" class="flex flex-col gap-2" data-testid="mailbox-message">
      <h2 class="font-medium">{{ current.subject }}</h2>
      <p class="text-sm text-muted-foreground">
        {{ t('communication.mailbox.to', { to: current.to.join(', ') }) }} ·
        {{ formatDateTime(current.sentAt) }}
      </p>
      <iframe
        :srcdoc="mailDocument(current.html)"
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        :title="current.subject"
        class="h-[60vh] w-full rounded-md border bg-white"
        data-testid="mailbox-body"
      />
    </article>
  </div>
</template>
