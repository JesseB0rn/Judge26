<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import PageHeader from '@/shared/components/PageHeader.vue'
import { useLoader } from '@/shared/composables/useSubmit'
import { useQueryRefs } from '@/shared/composables/useQueryRefs'
import type { MailTemplateRecord } from '@/shared/types/records'
import { listTemplates, templateVariables } from '../api'
import OutboxTable from '../components/OutboxTable.vue'
import TemplateEditor from '../components/TemplateEditor.vue'

const { tab } = useQueryRefs({ tab: 'templates' })
const { data, loading, error, load } = useLoader(async () => {
  const [templates, variables] = await Promise.all([listTemplates(), templateVariables()])
  return { templates, variables }
})
const selectedKey = ref('')
const selected = computed(
  () => data.value?.templates.find((t) => t.key === selectedKey.value) ?? data.value?.templates[0],
)

function onSaved(saved: MailTemplateRecord) {
  if (!data.value) return
  data.value.templates = data.value.templates.map((t) => (t.id === saved.id ? saved : t))
}

onMounted(load)
</script>

<template>
  <PageHeader
    title="Emails"
    description="Notifications sent to coaches, and the delivery log. Account emails (verification, password reset) are configured in the PocketBase dashboard."
  />
  <Tabs :model-value="tab" @update:model-value="tab = String($event)">
    <TabsList>
      <TabsTrigger value="templates">Templates</TabsTrigger>
      <TabsTrigger value="outbox">Delivery log</TabsTrigger>
    </TabsList>
    <TabsContent value="templates" class="flex flex-col gap-4">
      <ErrorAlert :error="error" />
      <Skeleton v-if="loading && !data" class="h-40 w-full" />
      <div v-if="data" class="grid gap-4 md:grid-cols-[14rem_1fr]">
        <nav class="flex flex-col gap-1" aria-label="Templates">
          <button
            v-for="t in data.templates"
            :key="t.id"
            type="button"
            class="flex items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
            :class="{ 'bg-muted font-medium': selected?.id === t.id }"
            :aria-current="selected?.id === t.id ? 'true' : undefined"
            @click="selectedKey = t.key"
          >
            {{ t.name }}
            <Badge v-if="!t.enabled" variant="outline">off</Badge>
          </button>
        </nav>
        <TemplateEditor
          v-if="selected"
          :template="selected"
          :variables="data.variables[selected.key] ?? []"
          @saved="onSaved"
        />
      </div>
    </TabsContent>
    <TabsContent value="outbox">
      <OutboxTable :can-retry="true" />
    </TabsContent>
  </Tabs>
</template>
