<script setup lang="ts">
import { t, type MessageKey } from '@/i18n'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { CircleIcon, SendIcon, SettingsIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import { toAppError, type AppError } from '@/shared/api/errors'
import type { EventRecord } from '@/shared/types/records'
import { getSetupStatus, type SetupStatus } from '@/modules/templates/api'

/**
 * M11-13: publishing asks first when the setup is not complete. `start()` loads the setup
 * status: complete → `publish` at once; incomplete → the dialog lists the open steps with
 * Go to setup and Publish anyway. Steps stay unlocked (M8-20).
 */
const props = defineProps<{ event: EventRecord; publishing?: boolean }>()
const emit = defineEmits<{ publish: [] }>()
const router = useRouter()

const open = ref(false)
const checking = ref(false)
const error = ref<AppError>()
const status = ref<SetupStatus>()
const openSteps = computed(
  () => status.value?.steps.filter((s) => !s.done && s.key !== 'publish') ?? [],
)

async function start() {
  if (checking.value) return
  checking.value = true
  error.value = undefined
  try {
    status.value = await getSetupStatus(props.event.id)
  } catch (e) {
    // Without the status, ask rather than publish blindly.
    error.value = toAppError(e)
    status.value = undefined
  } finally {
    checking.value = false
  }
  if (status.value && !openSteps.value.length) emit('publish')
  else open.value = true
}

function publishAnyway() {
  open.value = false
  emit('publish')
}

function goToSetup() {
  open.value = false
  void router.push({ name: 'event', params: { id: props.event.id }, query: { tab: 'setup' } })
}

defineExpose({ start, checking })
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-md" data-testid="publish-dialog">
      <DialogHeader>
        <DialogTitle>{{ t('events.publish.title') }}</DialogTitle>
        <DialogDescription>{{ t('events.publish.description') }}</DialogDescription>
      </DialogHeader>
      <ErrorAlert :error="error" />
      <ul
        v-if="openSteps.length"
        class="flex flex-col gap-2 text-sm"
        data-testid="publish-open-steps"
      >
        <li v-for="step in openSteps" :key="step.key" class="flex items-center gap-2">
          <CircleIcon class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          {{ t(`templates.setup.steps.${step.key}.title` as MessageKey) }}
        </li>
      </ul>
      <DialogFooter class="gap-2">
        <Button variant="outline" data-testid="publish-go-to-setup" @click="goToSetup">
          <SettingsIcon /> {{ t('events.publish.goToSetup') }}
        </Button>
        <Button :disabled="publishing" data-testid="publish-anyway" @click="publishAnyway">
          <SendIcon /> {{ t('events.publish.anyway') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
