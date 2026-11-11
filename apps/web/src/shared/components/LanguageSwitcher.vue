<script setup lang="ts">
import { LanguagesIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { LOCALE_CODES, LOCALES, isLocale, locale, t } from '@/i18n'
import { useSessionStore } from '@/shared/auth/session'

const session = useSessionStore()

function choose(value: unknown) {
  if (isLocale(value)) void session.setLanguage(value)
}
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="ghost" size="sm" :aria-label="t('shell.language')">
        <LanguagesIcon />
        <span class="uppercase">{{ locale }}</span>
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuRadioGroup :model-value="locale" @update:model-value="choose">
        <!-- Each language is named in itself, so users find theirs whatever is shown. -->
        <DropdownMenuRadioItem
          v-for="code in LOCALE_CODES"
          :key="code"
          :value="code"
          :lang="LOCALES[code].tag"
        >
          {{ LOCALES[code].name }}
        </DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
