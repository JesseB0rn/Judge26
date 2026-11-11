<script setup lang="ts">
import PageHeader from '@/shared/components/PageHeader.vue'
import AuditLogTable from '../components/AuditLogTable.vue'
</script>

<template>
  <PageHeader
    title="Audit log"
    description="Administrative actions on every event: who changed what, when and from where. Score sheet history is kept with each game."
  />
  <AuditLogTable />
</template>
