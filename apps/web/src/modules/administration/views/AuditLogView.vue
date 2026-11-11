<script setup lang="ts">
import { t } from '@/i18n'
import PageHeader from '@/shared/components/PageHeader.vue'
import AuditLogTable from '../components/AuditLogTable.vue'
</script>

<template>
  <PageHeader :title="t('shell.nav.audit')" :description="t('administration.audit.description')" />
  <AuditLogTable />
</template>
