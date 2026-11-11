<script setup lang="ts">
import { t } from '@/i18n'
import { ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FieldGroup } from '@/components/ui/field'
import ErrorAlert from '@/shared/components/ErrorAlert.vue'
import FormField from '@/shared/components/FormField.vue'
import { useSessionStore } from '@/shared/auth/session'
import { useSubmit } from '@/shared/composables/useSubmit'
import AuthCard from '../components/AuthCard.vue'

const session = useSessionStore()
const route = useRoute()
const router = useRouter()

const email = ref('')
const password = ref('')

const { run, pending, error } = useSubmit(async () => {
  await session.login(email.value, password.value)
  const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
  await router.replace(redirect.startsWith('/') ? redirect : '/')
})
</script>

<template>
  <AuthCard :title="t('auth.login.title')" :description="t('auth.login.description')">
    <form class="flex flex-col gap-4" @submit.prevent="run()">
      <ErrorAlert :error="error" />
      <FieldGroup>
        <FormField v-slot="{ id }" :label="t('auth.email')" name="email">
          <Input :id="id" v-model="email" type="email" autocomplete="email" required />
        </FormField>
        <FormField v-slot="{ id }" :label="t('auth.password')" name="password">
          <Input
            :id="id"
            v-model="password"
            type="password"
            autocomplete="current-password"
            required
          />
        </FormField>
      </FieldGroup>
      <Button type="submit" :disabled="pending">{{ t('auth.login.submit') }}</Button>
      <RouterLink to="/auth/forgot-password" class="text-sm text-muted-foreground underline">
        {{ t('auth.login.forgotPassword') }}
      </RouterLink>
    </form>
    <template #footer>
      {{ t('auth.login.noAccount') }}
      <RouterLink to="/register" class="underline">{{ t('auth.login.createAccount') }}</RouterLink>
    </template>
  </AuthCard>
</template>
