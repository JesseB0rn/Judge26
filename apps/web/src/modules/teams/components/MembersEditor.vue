<script setup lang="ts">
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
    <legend class="mb-2 text-sm font-medium">Team members</legend>
    <div
      v-for="(member, i) in members"
      :key="i"
      class="grid grid-cols-[1fr_1fr_7rem_auto] items-center gap-2"
      data-testid="member-row"
    >
      <Input
        v-model="member.first_name"
        :aria-label="`Member ${i + 1} first name`"
        placeholder="First name"
        required
      />
      <Input
        v-model="member.last_name"
        :aria-label="`Member ${i + 1} last name`"
        placeholder="Last name"
        required
      />
      <Input
        v-model.number="member.birth_year"
        :aria-label="`Member ${i + 1} birth year`"
        type="number"
        min="1900"
        max="2100"
        placeholder="Birth year"
        required
      />
      <Button
        v-if="!disabled"
        type="button"
        variant="ghost"
        size="icon"
        :aria-label="`Remove member ${i + 1}`"
        @click="remove(i)"
      >
        <Trash2Icon />
      </Button>
    </div>
    <p v-if="!members.length" class="text-sm text-muted-foreground">No members added yet.</p>
    <Button
      v-if="!disabled && (!max || members.length < max)"
      type="button"
      variant="outline"
      class="self-start"
      @click="add"
    >
      <PlusIcon /> Add member
    </Button>
  </fieldset>
</template>
