import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { registerBuiltinModes } from './modes'
import './assets/styles/main.css'

// 创建应用实例
const app = createApp(App)

// 创建 Pinia 实例
const pinia = createPinia()

// 注册插件
app.use(pinia)
app.use(router)

// 注册内置 Modes
registerBuiltinModes()

// 挂载应用
app.mount('#app')
