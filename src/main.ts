import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { i18n } from './i18n'
import './style.css'
import './assets/iconfont/iconfont.js'
import App from './App.vue'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(i18n)
app.mount('#app')
