import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest'
import { ref, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { useTerminalStore } from '@/stores/terminal-store'

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } })

// ---------------------------------------------------------------------------
// Mocks – must be declared before the component import
// ---------------------------------------------------------------------------

// Controllable claude status refs
const mockIsRunning = ref(false)
const mockSessionId = ref<string | null>(null)

vi.mock('@/composables/use-claude-status', () => ({
  useClaudeStatus: () => ({
    isRunning: mockIsRunning,
    sessionId: mockSessionId,
  }),
}))

const mockNotifyTaskComplete = vi.fn()
vi.mock('@/composables/use-notification', () => ({
  useNotification: () => ({
    notifyTaskComplete: mockNotifyTaskComplete,
  }),
}))

vi.mock('@/composables/use-platform', () => ({
  usePlatform: () => ({
    isMacOS: () => true,
    isWindows: () => false,
    isLinux: () => false,
  }),
}))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ setTitle: vi.fn(), minimize: vi.fn(), toggleMaximize: vi.fn(), close: vi.fn() }),
}))

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))

vi.mock('@/settings/themes', () => ({
  themes: { 'VS Code Dark': { name: 'VS Code Dark' } },
}))
vi.mock('@xterm/addon-serialize', () => ({ SerializeAddon: vi.fn() }))
vi.mock('@/composables/xterm-manager', () => ({ getAllTerminals: () => new Map() }))

// Stub AudioContext globally
const mockOscillator = {
  connect: vi.fn(),
  type: '',
  frequency: { setValueAtTime: vi.fn() },
  start: vi.fn(),
  stop: vi.fn(),
  onended: null as (() => void) | null,
}
const mockGain = {
  connect: vi.fn(),
  gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
}
const mockAudioClose = vi.fn()
;(globalThis as any).AudioContext = vi.fn(function (this: any) {
  this.createOscillator = () => mockOscillator
  this.createGain = () => mockGain
  this.destination = {}
  this.currentTime = 0
  this.close = mockAudioClose
})

// Now import the component (after all mocks are set up)
import TabBar from './tab-bar.vue'

// Helper to mount with required plugins/stubs
function mountTabBar() {
  return mount(TabBar, {
    global: {
      plugins: [i18n],
    },
  })
}

describe('tab-bar notifications', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockIsRunning.value = false
    mockSessionId.value = null
    mockNotifyTaskComplete.mockClear()
    ;(globalThis.AudioContext as Mock).mockClear()
    mockOscillator.start.mockClear()
    mockAudioClose.mockClear()
  })

  function seedTabs(store: ReturnType<typeof useTerminalStore>) {
    store.tabs.push(
      {
        id: 'tab_1',
        title: '~/project',
        layout: { type: 'pane', paneId: 'p1', sessionId: 'sess_1' },
        createdAt: Date.now(),
      },
      {
        id: 'tab_2',
        title: '~/other',
        layout: { type: 'pane', paneId: 'p2', sessionId: 'sess_2' },
        createdAt: Date.now(),
      },
    )
    store.activeTabId = 'tab_1'
    store.activePaneId = 'p1'
  }

  // ---------------------------------------------------------------------------
  // Sound
  // ---------------------------------------------------------------------------
  it('plays a notification sound when Claude finishes', async () => {
    const store = useTerminalStore()
    seedTabs(store)
    mountTabBar()

    mockSessionId.value = 'sess_2'
    mockIsRunning.value = true
    await nextTick()

    mockIsRunning.value = false
    await nextTick()

    expect(globalThis.AudioContext).toHaveBeenCalled()
    expect(mockOscillator.start).toHaveBeenCalled()
  })

  // ---------------------------------------------------------------------------
  // Red dot on non-active tab
  // ---------------------------------------------------------------------------
  it('adds a red dot notification to a non-active tab on completion', async () => {
    const store = useTerminalStore()
    seedTabs(store)
    mountTabBar()

    // Simulate Claude running in tab_2 (which is not active)
    mockSessionId.value = 'sess_2'
    mockIsRunning.value = true
    await nextTick()

    mockIsRunning.value = false
    await nextTick()

    expect(store.tabNotifications).toContain('tab_2')
  })

  it('does NOT add a red dot to the currently active tab', async () => {
    const store = useTerminalStore()
    seedTabs(store)
    mountTabBar()

    // Simulate Claude running in the active tab (tab_1)
    mockSessionId.value = 'sess_1'
    mockIsRunning.value = true
    await nextTick()

    mockIsRunning.value = false
    await nextTick()

    expect(store.tabNotifications).not.toContain('tab_1')
  })

  // ---------------------------------------------------------------------------
  // Clicking tab clears the red dot
  // ---------------------------------------------------------------------------
  it('clears the red dot when the tab is clicked', async () => {
    const store = useTerminalStore()
    seedTabs(store)
    store.addTabNotification('tab_2')
    const wrapper = mountTabBar()

    const tabs = wrapper.findAll('.tab')
    // tab_2 is the second one
    await tabs[1].trigger('click')

    expect(store.tabNotifications).not.toContain('tab_2')
  })

  // ---------------------------------------------------------------------------
  // Renders the notification-dot element
  // ---------------------------------------------------------------------------
  it('renders a .notification-dot element when a tab has a notification', async () => {
    const store = useTerminalStore()
    seedTabs(store)
    store.addTabNotification('tab_2')
    const wrapper = mountTabBar()

    const dots = wrapper.findAll('.notification-dot')
    expect(dots.length).toBe(1)
  })

  it('does not render .notification-dot when there are no notifications', () => {
    const store = useTerminalStore()
    seedTabs(store)
    const wrapper = mountTabBar()

    expect(wrapper.find('.notification-dot').exists()).toBe(false)
  })

  // ---------------------------------------------------------------------------
  // System notification when app is not focused
  // ---------------------------------------------------------------------------
  it('sends a system notification when app is not focused', async () => {
    const store = useTerminalStore()
    seedTabs(store)
    store.enableCommandNotifications = true

    // Simulate app not focused
    vi.spyOn(document, 'hasFocus').mockReturnValue(false)

    mountTabBar()

    mockSessionId.value = 'sess_2'
    mockIsRunning.value = true
    await nextTick()

    mockIsRunning.value = false
    await nextTick()

    expect(mockNotifyTaskComplete).toHaveBeenCalledWith(
      'Claude Code 任务完成',
      '~/other 中的任务已完成',
    )

    vi.restoreAllMocks()
  })

  it('does NOT send a system notification when app is focused', async () => {
    const store = useTerminalStore()
    seedTabs(store)
    store.enableCommandNotifications = true

    vi.spyOn(document, 'hasFocus').mockReturnValue(true)

    mountTabBar()

    mockSessionId.value = 'sess_2'
    mockIsRunning.value = true
    await nextTick()

    mockIsRunning.value = false
    await nextTick()

    expect(mockNotifyTaskComplete).not.toHaveBeenCalled()

    vi.restoreAllMocks()
  })
})
