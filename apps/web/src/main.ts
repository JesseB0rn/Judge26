import '@/assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { installErrorHandling } from '@/shared/errorHandling'

const app = createApp(App)

installErrorHandling(app)
app.use(createPinia())
app.use(router)

app.mount('#app')

// M0-T06: deliberate type error to verify CI fails. Do not merge.
export const m0t06: number = 'not a number'
