import path from 'node:path'
import { app } from 'electron'

// dev 模式把 userData 重定向到仓库内 .local-userdata/,避免污染真实安装的数据
// 详见 dev-environment.md §3.4
if (!app.isPackaged) {
  app.setPath('userData', path.join(process.cwd(), '.local-userdata'))
}
