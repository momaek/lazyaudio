### 1. macOS 原生设计规范

### 1.1 系统颜色

```
系统标准颜色:
- 系统蓝: systemBlue (用于主要操作按钮)
- 系统红: systemRed (用于删除、警告操作)
- 系统绿: systemGreen (用于成功状态)
- 系统橙: systemOrange (用于警告状态)
- 系统灰: systemGray (用于次要文本和图标)
- 系统背景: windowBackgroundColor (窗口背景)
- 系统文本: labelColor (主要文本)
- 系统次要文本: secondaryLabelColor (次要文本)

注意：所有颜色都使用系统颜色，以自动支持深色模式
```

### 1.2 系统字体

```
系统标准字体:
- 标题: .systemFont(ofSize: 13, weight: .bold)
- 正文: .systemFont(ofSize: 13, weight: .regular)
- 小文本: .systemFont(ofSize: 11, weight: .regular)
- 大标题: .systemFont(ofSize: 20, weight: .bold)

注意：使用系统字体以确保最佳的可读性和本地化支持
```

### 1.3 系统间距

```
系统标准间距:
- 窗口边距: 20pt
- 控件间距: 8pt
- 分组间距: 16pt
- 列表项间距: 1pt
- 工具栏间距: 6pt

注意：遵循系统标准间距以保持一致的视觉节奏
```

### 2. 系统控件规范

### 2.1 按钮样式

```
系统标准按钮:
- 主要按钮: NSButton.Style.rounded
- 次要按钮: NSButton.Style.regular
- 工具栏按钮: NSButton.Style.textured
- 图标按钮: NSButton.Style.icon

按钮尺寸:
- 标准高度: 24pt
- 工具栏按钮: 32x32pt
- 图标按钮: 16x16pt
```

### 2.2 列表视图

```
NSTableView 规范:
- 使用系统标准列表样式
- 支持行选择高亮
- 支持拖拽排序
- 支持多选操作
- 使用系统标准的分割线

分组样式:
- 使用 NSOutlineView 实现树形结构
- 遵循系统标准的分组样式
- 支持展开/折叠动画
```

### 2.3 状态指示器

```
系统标准指示器:
- 进度指示器: NSProgressIndicator
- 状态图标: NSImageView 配合系统图标
- 工具栏状态: NSToolbarItem 配合系统图标
- 菜单栏状态: NSStatusItem 配合系统图标
```

### 3. 窗口管理

### 3.1 窗口样式

```
标准窗口:
- 使用系统标准窗口样式
- 支持窗口大小调整
- 支持全屏模式
- 支持分屏模式

工具栏:
- 使用 NSToolbar 实现
- 支持自定义工具栏项目
- 支持工具栏项目拖拽
```

### 3.2 侧边栏

```
标准侧边栏:
- 使用 NSSplitViewController 实现
- 支持拖拽调整宽度
- 支持折叠/展开
- 使用系统标准的分割线样式
```

### 4. 交互规范

### 4.1 系统手势

```
标准手势支持:
- 双指滚动
- 双指缩放
- 双指旋转
- 三指滑动
- 触控板手势
```

### 4.2 快捷键

```
系统标准快捷键:
- Command + N: 新建
- Command + O: 打开
- Command + S: 保存
- Command + W: 关闭窗口
- Command + Q: 退出应用
- Command + ,: 偏好设置
```

### 5. 系统图标

### 5.1 SF Symbols

```
使用系统图标:
- 录制: "record.circle"
- 暂停: "pause.circle"
- 停止: "stop.circle"
- 播放: "play.circle"
- 设置: "gear"
- 历史: "clock"
- 麦克风: "mic"
- 音频: "speaker.wave.2"
- AI: "brain.head.profile"
- 导出: "square.and.arrow.up"

注意：使用 SF Symbols 确保图标风格统一且支持系统主题
```

### 6. 辅助功能

### 6.1 系统辅助功能支持

```
标准辅助功能:
- VoiceOver 支持
- 动态字体
- 高对比度模式
- 减少动画
- 减少透明度
```

### 7. 本地化

### 7.1 系统本地化支持

```
本地化规范:
- 使用 NSLocalizedString
- 支持系统语言切换
- 支持 RTL 布局
- 使用系统日期时间格式
- 使用系统数字格式
```

### 8. 性能优化

### 8.1 系统性能

```
性能优化:
- 使用系统原生动画
- 支持 Metal 加速
- 支持硬件解码
- 使用系统缓存机制
- 支持后台处理
```

### 9. 开发建议

### 9.1 实现指南

```
开发规范:
- 使用 SwiftUI 或 AppKit
- 遵循 MVC/MVVM 架构
- 使用系统标准的数据持久化
- 支持沙盒机制
- 支持系统权限管理
```

### 9.2 测试规范

```
测试要求:
- 支持系统深色模式
- 支持不同分辨率
- 支持不同语言
- 支持辅助功能
- 性能基准测试
```

这个设计规范现在完全遵循了 macOS 的原生设计语言，将帮助开发团队创建出更符合系统风格的应用。主要优势包括：

1. 更好的系统集成
2. 自动支持系统特性
3. 更自然的用户体验
4. 更高的开发效率
5. 更好的可维护性

您觉得这个修改后的规范如何？是否还需要进一步调整？