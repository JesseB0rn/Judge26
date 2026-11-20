import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { backTarget, eventBackTarget, useQueryRefs } from '../useQueryRefs'

const Page = defineComponent({
  setup() {
    const { tab } = useQueryRefs({ tab: 'overview' })
    return () => h('button', { onClick: () => (tab.value = 'teams') }, tab.value)
  },
})

async function mountPage(path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/events/:id', component: Page }],
  })
  await router.push(path)
  await router.isReady()
  const wrapper = mount(Page, { global: { plugins: [router] } })
  return { wrapper, router }
}

describe('useQueryRefs', () => {
  it('starts from the query and writes changes back, leaving defaults out', async () => {
    const { wrapper, router } = await mountPage('/events/1?tab=setup&x=1')
    expect(wrapper.text()).toBe('setup')
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ tab: 'teams', x: '1' })
  })

  it('follows query changes made by links and the back button (M8-20)', async () => {
    const { wrapper, router } = await mountPage('/events/1?tab=setup')
    await router.push('/events/1?tab=staff')
    await flushPromises()
    expect(wrapper.text()).toBe('staff')
    await router.push('/events/1')
    await flushPromises()
    expect(wrapper.text()).toBe('overview')
  })
})

describe('back targets', () => {
  it('accepts in-app paths only', () => {
    expect(backTarget('/judging')).toBe('/judging')
    expect(backTarget('//evil.example')).toBeUndefined()
    expect(backTarget('https://evil.example')).toBeUndefined()
    expect(backTarget(['/judging'])).toBeUndefined()
  })

  it('M11-08: event back targets are event pages', () => {
    expect(eventBackTarget('/events/e1?tab=categories')).toBe('/events/e1?tab=categories')
    expect(eventBackTarget('/events/e1/planner')).toBe('/events/e1/planner')
    expect(eventBackTarget('/judging')).toBeUndefined()
    expect(eventBackTarget(undefined)).toBeUndefined()
  })
})
