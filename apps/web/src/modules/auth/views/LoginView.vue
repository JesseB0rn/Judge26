<script setup lang="ts">
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
  <AuthCard title="Sign in" description="Sign in to manage events, teams and scores.">
    <form class="flex flex-col gap-4" @submit.prevent="run()">
      <ErrorAlert :error="error" />
      <FieldGroup>
        <FormField v-slot="{ id }" label="Email" name="email">
          <Input :id="id" v-model="email" type="email" autocomplete="email" required />
        </FormField>
        <FormField v-slot="{ id }" label="Password" name="password">
          <Input
            :id="id"
            v-model="password"
            type="password"
            autocomplete="current-password"
            required
          />
        </FormField>
      </FieldGroup>
      <Button type="submit" :disabled="pending">Sign in</Button>
      <RouterLink to="/auth/forgot-password" class="text-sm text-muted-foreground underline">
        Forgot your password?
      </RouterLink>
    </form>
    <template #footer>
      No account yet?
      <RouterLink to="/register" class="underline">Create one</RouterLink>
    </template>
  </AuthCard>
</template>
