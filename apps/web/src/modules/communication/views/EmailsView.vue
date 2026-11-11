<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import FilterChips from '@/shared/components/FilterChips.vue'
import PageHeader from '@/shared/components/PageHeader.vue'
import { useLoader } from '@/shared/composables/useSubmit'
import { useQueryRefs } from '@/shared/composables/useQueryRefs'
import type { MailTemplateRecord } from '@/shared/types/records'
import { LOCALE_CODES, LOCALES, locale, t } from '@/i18n'
import { listTemplates, templateVariables } from '../api'
import { templateName } from '../lib'
import OutboxTable from '../components/OutboxTable.vue'
import TemplateEditor from '../components/TemplateEditor.vue'

const { tab } = useQueryRefs({ tab: 'templates' })
const { data, loading, error, load } = useLoader(async () => {
  const [templates, variables] = await Promise.all([listTemplates(), templateVariables()])
  return { templates, variables }
})
const selectedKey = ref('')
// Each notification exists once per language; the editor starts in the admin's language.
const selectedLanguage = ref<string>(locale.value)
const keys = computed(() => {
  const seen = new Map<string, MailTemplateRecord>()
  for (const template of data.value?.templates ?? []) {
    if (!seen.has(template.key) || template.language === locale.value) {
      seen.set(template.key, template)
    }
  }
  return [...seen.values()].sort((a, b) => templateName(a).localeCompare(templateName(b)))
})
const currentKey = computed(() => selectedKey.value || keys.value[0]?.key)
const selected = computed(() =>
  data.value?.templates.find(
    (template) => template.key === currentKey.value && template.language === selectedLanguage.value,
  ),
)
const languages = computed(() =>
  LOCALE_CODES.filter((code) =>
    data.value?.templates.some((tpl) => tpl.key === currentKey.value && tpl.language === code),
  ).map((code) => ({ value: code, label: LOCALES[code].name })),
)
/** A key that is off in every language is shown as off. */
const disabled = (key: string) =>
  (data.value?.templates ?? []).filter((tpl) => tpl.key === key).every((tpl) => !tpl.enabled)

function onSaved(saved: MailTemplateRecord) {
  if (!data.value) return
  data.value.templates = data.value.templates.map((tpl) => (tpl.id === saved.id ? saved : tpl))
}

onMounted(load)
</script>

<template>
  <PageHeader :title="t('shell.nav.emails')" :description="t('communication.emails.description')" />
  <Tabs :model-value="tab" @update:model-value="tab = String($event)">
    <TabsList>
      <TabsTrigger value="templates">{{ t('communication.emails.templates') }}</TabsTrigger>
      <TabsTrigger value="outbox">{{ t('communication.outbox.title') }}</TabsTrigger>
    </TabsList>
    <TabsContent value="templates" class="flex flex-col gap-4">
      <ErrorAlert :error="error" />
      <Skeleton v-if="loading && !data" class="h-40 w-full" />
      <div v-if="data" class="grid gap-4 md:grid-cols-[14rem_1fr]">
        <nav class="flex flex-col gap-1" :aria-label="t('communication.emails.templates')">
          <button
            v-for="tpl in keys"
            :key="tpl.key"
            type="button"
            class="flex items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
            :class="{ 'bg-muted font-medium': currentKey === tpl.key }"
            :aria-current="currentKey === tpl.key ? 'true' : undefined"
            @click="selectedKey = tpl.key"
          >
            {{ templateName(tpl) }}
            <Badge v-if="disabled(tpl.key)" variant="outline">{{
              t('communication.emails.off')
            }}</Badge>
          </button>
        </nav>
        <div class="flex min-w-0 flex-col gap-4">
          <FilterChips
            v-model="selectedLanguage"
            :label="t('shell.language')"
            :options="languages"
            required
          />
          <TemplateEditor
            v-if="selected"
            :template="selected"
            :variables="data.variables[selected.key] ?? []"
            @saved="onSaved"
          />
        </div>
      </div>
    </TabsContent>
    <TabsContent value="outbox">
      <OutboxTable :can-retry="true" />
    </TabsContent>
  </Tabs>
</template>
