<script setup lang="ts">
import { t } from '@/i18n'
import { PlusIcon, Trash2Icon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { TeamMember } from '@/shared/types/records'

defineProps<{ disabled?: boolean; max?: number }>()
const members = defineModel<TeamMember[]>({ required: true })

function add() {
  members.value = [...members.value, { first_name: '', last_name: '', birth_year: NaN }]
}

function remove(index: number) {
  members.value = members.value.filter((_, i) => i !== index)
}
</script>

<template>
  <fieldset class="flex flex-col gap-2" :disabled="disabled">
    <legend class="mb-2 text-sm font-medium">{{ t('teams.membersEditor.title') }}</legend>
    <div
      v-for="(member, i) in members"
      :key="i"
      class="grid grid-cols-[1fr_1fr_7rem_auto] items-center gap-2"
      data-testid="member-row"
    >
      <Input
        v-model="member.first_name"
        :aria-label="t('teams.membersEditor.firstNameOf', { n: i + 1 })"
        :placeholder="t('teams.firstName')"
        required
      />
      <Input
        v-model="member.last_name"
        :aria-label="t('teams.membersEditor.lastNameOf', { n: i + 1 })"
        :placeholder="t('teams.lastName')"
        required
      />
      <Input
        v-model.number="member.birth_year"
        :aria-label="t('teams.membersEditor.birthYearOf', { n: i + 1 })"
        type="number"
        min="1900"
        max="2100"
        :placeholder="t('teams.birthYear')"
        required
      />
      <Button
        v-if="!disabled"
        type="button"
        variant="ghost"
        size="icon"
        :aria-label="t('teams.membersEditor.remove', { n: i + 1 })"
        @click="remove(i)"
      >
        <Trash2Icon />
      </Button>
    </div>
    <p v-if="!members.length" class="text-sm text-muted-foreground">
      {{ t('teams.membersEditor.empty') }}
    </p>
    <Button
      v-if="!disabled && (!max || members.length < max)"
      type="button"
      variant="outline"
      class="self-start"
      @click="add"
    >
      <PlusIcon /> {{ t('teams.membersEditor.add') }}
    </Button>
  </fieldset>
</template>
