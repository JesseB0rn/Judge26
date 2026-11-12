<script setup lang="ts">
import { t } from '@/i18n'
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { listStaff, type StaffMember } from '@/modules/administration/invitations'
import { pb } from '@/shared/api/pocketbase'
import { useSessionStore } from '@/shared/auth/session'
import { roleHome, VIEW_AS_ROLES, type ViewAsRole } from '@/shared/auth/viewAs'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import FormField from '@/shared/components/FormField.vue'
import { useSubmit } from '@/shared/composables/useSubmit'
import { ROLE_LABELS, type EventRecord } from '@/shared/types/records'

/**
 * Admin "view as" (M8-13, M8-16): pick an event and a role, and optionally one person with that
 * role, to see the app exactly as they do.
 */
const props = defineProps<{ eventId?: string }>()
const open = defineModel<boolean>('open', { required: true })
const session = useSessionStore()
const router = useRouter()

const events = ref<EventRecord[]>([])
const staff = ref<StaffMember[]>([])
const event = ref('')
const role = ref<ViewAsRole>('judge')
const person = ref('')

const people = computed(() =>
  staff.value.filter((m) => m.role === role.value && m.status === 'active'),
)

const load = useSubmit(async () => {
  events.value = await pb
    .collection('events')
    .getFullList<EventRecord>({ sort: '-season,name', filter: 'status != "archived"' })
  if (!events.value.some((e) => e.id === event.value)) event.value = events.value[0]?.id ?? ''
})

watch(event, async (id) => {
  staff.value = []
  person.value = ''
  if (id) staff.value = await listStaff(id).catch(() => [])
})
watch(role, () => (person.value = ''))

const submit = useSubmit(async () => {
  const started = await session.startViewAs({
    event: event.value,
    role: role.value,
    ...(person.value ? { user: person.value } : {}),
  })
  open.value = false
  await router.push(roleHome(started.role, started.event.id))
})

watch(open, (isOpen) => {
  if (!isOpen) return
  submit.reset()
  person.value = ''
  if (props.eventId) event.value = props.eventId
  void load.run()
})
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-md" data-testid="view-as-dialog">
      <DialogHeader>
        <DialogTitle>{{ t('shell.viewAs.title') }}</DialogTitle>
        <DialogDescription>{{ t('shell.viewAs.description') }}</DialogDescription>
      </DialogHeader>
      <form id="view-as-form" class="flex flex-col gap-4" @submit.prevent="submit.run()">
        <ErrorAlert :error="load.error.value ?? submit.error.value" />
        <FormField v-slot="{ id }" :label="t('shell.viewAs.event')" name="event">
          <NativeSelect :id="id" v-model="event" class="w-full" required>
            <NativeSelectOption v-for="e in events" :key="e.id" :value="e.id">{{
              e.name
            }}</NativeSelectOption>
          </NativeSelect>
        </FormField>
        <FormField v-slot="{ id }" :label="t('shell.viewAs.role')" name="role">
          <NativeSelect :id="id" v-model="role" class="w-full">
            <NativeSelectOption v-for="r in VIEW_AS_ROLES" :key="r" :value="r">{{
              ROLE_LABELS[r]
            }}</NativeSelectOption>
          </NativeSelect>
        </FormField>
        <FormField
          v-slot="{ id }"
          :label="t('shell.viewAs.person')"
          :description="t('shell.viewAs.personHint')"
          name="person"
        >
          <NativeSelect :id="id" v-model="person" class="w-full">
            <NativeSelectOption value="">{{ t('shell.viewAs.anyone') }}</NativeSelectOption>
            <NativeSelectOption v-for="m in people" :key="m.user.id" :value="m.user.id">{{
              m.user.name || m.user.email
            }}</NativeSelectOption>
          </NativeSelect>
        </FormField>
      </form>
      <DialogFooter>
        <Button variant="outline" @click="open = false">{{ t('common.cancel') }}</Button>
        <Button type="submit" form="view-as-form" :disabled="!event || submit.pending.value">{{
          t('shell.viewAs.submit')
        }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
