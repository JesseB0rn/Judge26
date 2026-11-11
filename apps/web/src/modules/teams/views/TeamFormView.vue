<script setup lang="ts">
import { t } from '@/i18n'
import { computed, onMounted, reactive, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { FieldGroup } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Skeleton } from '@/components/ui/skeleton'
import { listEventCategories } from '@/modules/categories/api'
import { getEvent } from '@/modules/events/api'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import FormField from '@/shared/components/FormField.vue'
import PageHeader from '@/shared/components/PageHeader.vue'
import { toAppError, type AppError } from '@/shared/api/errors'
import { useSessionStore } from '@/shared/auth/session'
import { useSubmit } from '@/shared/composables/useSubmit'
import { formatDateTime } from '@/shared/format'
import type {
  CategoryRecord,
  EventRecord,
  TeamMember,
  TeamRecord,
  TeamStatus,
} from '@/shared/types/records'
import { createTeam, deleteTeam, getTeam, updateTeam, type TeamInput } from '../api'
import { canCoachEdit, validateMembers } from '../lib'
import MembersEditor from '../components/MembersEditor.vue'
import TeamDocuments from '../components/TeamDocuments.vue'
import TeamStatusBadge from '../components/TeamStatusBadge.vue'

/** Create (`eventId`) or view/edit (`id`) a team registration. */
const props = defineProps<{ id?: string; eventId?: string }>()
const session = useSessionStore()
const router = useRouter()

const team = ref<TeamRecord>()
const event = ref<EventRecord>()
const categories = ref<CategoryRecord[]>([])
const loadError = ref<AppError>()
const loading = ref(true)
const clientErrors = ref<string[]>([])

const form = reactive<TeamInput & { members: TeamMember[] }>({
  category: '',
  name: '',
  organization: '',
  country: '',
  coach_name: '',
  coach_email: '',
  members: [],
})

const isManager = computed(() => !!event.value && session.canManageEvent(event.value.id))
const isOwner = computed(() => !team.value || team.value.coach === session.user?.id)
const editable = computed(() => {
  if (!event.value) return false
  if (isManager.value) return event.value.status !== 'archived'
  return isOwner.value && canCoachEdit(team.value, event.value)
})
const category = computed(() => categories.value.find((c) => c.id === form.category))

async function load() {
  loading.value = true
  try {
    if (props.id) {
      team.value = await getTeam(props.id)
      event.value = team.value.expand?.event ?? (await getEvent(team.value.event))
      Object.assign(form, {
        category: team.value.category,
        name: team.value.name,
        organization: team.value.organization,
        country: team.value.country,
        coach_name: team.value.coach_name,
        coach_email: team.value.coach_email,
        members: (team.value.members ?? []).map((m) => ({ ...m })),
      })
    } else if (props.eventId) {
      event.value = await getEvent(props.eventId)
      form.coach_name = session.user?.name ?? ''
      form.coach_email = session.user?.email ?? ''
    }
    if (event.value && team.value) {
      // An existing team already has its category; the list (slow: its access rule) only feeds
      // the category select, so the registration is shown without waiting for it (with the
      // expanded own category meanwhile).
      const own = team.value.expand?.category
      if (own) categories.value = [own]
      void listEventCategories(event.value.id).then(
        (list) => (categories.value = list),
        (e: unknown) => (loadError.value = toAppError(e)),
      )
    } else if (event.value) {
      categories.value = await listEventCategories(event.value.id)
      if (!form.category) form.category = categories.value[0]?.id ?? ''
    }
  } catch (e) {
    loadError.value = toAppError(e)
  } finally {
    loading.value = false
  }
}

const save = useSubmit(async (status?: TeamStatus) => {
  const complete = status === 'submitted' || status === 'approved'
  clientErrors.value = validateMembers(form.members, {
    category: category.value,
    season: event.value?.season,
    complete,
  })
  if (clientErrors.value.length) return

  const data: TeamInput = { ...form, members: form.members }
  if (team.value) {
    team.value = await updateTeam(team.value.id, status ? { ...data, status } : data)
  } else {
    // Staff create registrations on behalf of coaches (linked by email).
    const coach = isManager.value ? '' : session.user!.id
    const created = await createTeam(event.value!.id, coach, data, status ?? 'draft')
    await router.replace({ name: 'team', params: { id: created.id } })
    team.value = await getTeam(created.id)
  }
})

const remove = useSubmit(async () => {
  if (!team.value || !confirm(t('teams.form.confirmDeleteDraft', { team: team.value.name }))) {
    return
  }
  await deleteTeam(team.value.id)
  await router.replace({ name: 'my-teams' })
})

onMounted(load)
</script>

<template>
  <ErrorAlert :error="loadError" />
  <Skeleton v-if="loading" class="h-10 w-1/2" />
  <template v-else-if="event">
    <PageHeader :title="team ? team.name : t('events.detail.registerTeam')">
      <template #actions>
        <TeamStatusBadge v-if="team" :status="team.status" class="self-center" />
        <Button as-child variant="outline">
          <RouterLink :to="{ name: 'event', params: { id: event.id } }">{{
            event.name
          }}</RouterLink>
        </Button>
      </template>
    </PageHeader>

    <Alert
      v-if="team?.status === 'rejected'"
      variant="destructive"
      class="mb-4"
      data-testid="review-note"
    >
      <AlertTitle>{{ t('teams.form.rejectedTitle') }}</AlertTitle>
      <AlertDescription>{{
        t('teams.form.rejectedText', { note: team.review_note })
      }}</AlertDescription>
    </Alert>
    <Alert v-else-if="team && !editable" class="mb-4">
      <AlertDescription>
        <template v-if="team.status === 'submitted'">{{
          t('teams.form.awaitingReview', { date: formatDateTime(team.submitted_at) })
        }}</template>
        <template v-else-if="team.status === 'approved'">{{
          t('teams.form.approvedAt', { date: formatDateTime(team.reviewed_at) })
        }}</template>
        <template v-else>{{ t('teams.form.locked') }}</template>
      </AlertDescription>
    </Alert>

    <Card class="max-w-3xl">
      <CardContent>
        <form
          class="flex flex-col gap-6"
          @submit.prevent="save.run(isManager ? undefined : 'submitted')"
        >
          <ErrorAlert :error="save.error.value ?? remove.error.value" />
          <Alert v-if="clientErrors.length" variant="destructive" data-testid="client-errors">
            <AlertDescription
              ><ul>
                <li v-for="e in clientErrors" :key="e">{{ e }}</li>
              </ul></AlertDescription
            >
          </Alert>
          <fieldset :disabled="!editable">
            <FieldGroup>
              <div class="grid gap-4 sm:grid-cols-2">
                <FormField
                  v-slot="{ id }"
                  :label="t('teams.form.name')"
                  name="name"
                  :errors="save.fieldErrors.value"
                >
                  <Input :id="id" v-model="form.name" required maxlength="100" />
                </FormField>
                <FormField
                  v-slot="{ id }"
                  :label="t('teams.category')"
                  name="category"
                  :errors="save.fieldErrors.value"
                >
                  <NativeSelect :id="id" v-model="form.category" class="w-full" required>
                    <NativeSelectOption v-for="c in categories" :key="c.id" :value="c.id">
                      {{ c.code }} – {{ c.name }}
                    </NativeSelectOption>
                  </NativeSelect>
                </FormField>
                <FormField
                  v-slot="{ id }"
                  :label="t('teams.form.organization')"
                  name="organization"
                  :errors="save.fieldErrors.value"
                >
                  <Input :id="id" v-model="form.organization" />
                </FormField>
                <FormField
                  v-slot="{ id }"
                  :label="t('teams.country')"
                  name="country"
                  :errors="save.fieldErrors.value"
                >
                  <Input :id="id" v-model="form.country" />
                </FormField>
                <FormField
                  v-slot="{ id }"
                  :label="t('teams.form.coachName')"
                  name="coach_name"
                  :errors="save.fieldErrors.value"
                >
                  <Input :id="id" v-model="form.coach_name" />
                </FormField>
                <FormField
                  v-slot="{ id }"
                  :label="t('teams.coachEmail')"
                  name="coach_email"
                  :errors="save.fieldErrors.value"
                >
                  <Input :id="id" v-model="form.coach_email" type="email" required />
                </FormField>
              </div>
              <p v-if="category" class="text-sm text-muted-foreground">
                {{
                  category.min_age || category.max_age
                    ? t('teams.form.categoryLimitsAge', {
                        category: category.name,
                        min: category.min_team_size,
                        max: category.max_team_size,
                        minAge: category.min_age || '?',
                        maxAge: category.max_age || '?',
                        season: event.season,
                      })
                    : t('teams.form.categoryLimits', {
                        category: category.name,
                        min: category.min_team_size,
                        max: category.max_team_size,
                      })
                }}
              </p>
              <MembersEditor
                v-model="form.members"
                :disabled="!editable"
                :max="category?.max_team_size"
              />
              <p
                v-if="save.fieldErrors.value.members"
                class="text-sm text-destructive"
                role="alert"
              >
                {{ save.fieldErrors.value.members }}
              </p>
            </FieldGroup>
          </fieldset>

          <div v-if="editable" class="flex flex-wrap gap-2">
            <template v-if="isManager">
              <Button type="submit" :disabled="save.pending.value">{{ t('common.save') }}</Button>
            </template>
            <template v-else>
              <Button
                type="button"
                variant="outline"
                :disabled="save.pending.value"
                @click="save.run('draft')"
              >
                {{ t('teams.form.saveDraft') }}
              </Button>
              <Button type="submit" :disabled="save.pending.value">{{
                t('teams.form.submit')
              }}</Button>
              <Button
                v-if="team?.status === 'draft'"
                type="button"
                variant="ghost"
                class="ml-auto"
                @click="remove.run()"
              >
                {{ t('teams.form.deleteDraft') }}
              </Button>
            </template>
          </div>
        </form>
      </CardContent>
    </Card>

    <TeamDocuments
      v-if="team"
      :team-id="team.id"
      :editable="isManager && event.status !== 'archived'"
      class="mt-6"
    />
  </template>
</template>
