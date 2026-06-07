// T58 — 全 app 深色模式应用 + 切换过渡。
//
// 主题真相在 main:settings.general.theme 写进 nativeTheme.themeSource,
// 各 renderer 窗口的 prefers-color-scheme 随之联动(全 app 同步,新开窗口也一致)。
// 这里只读 matchMedia 结果切 <html>.dark,三模式(light/dark/system)逻辑全在 nativeTheme。
//
// 切换瞬间加 .theme-switching → globals.css 的 150ms 过渡只在那一下生效:
// 既满足「切换 150ms 过渡」,又不影响日常交互、开窗不闪(首次 apply 不带动画)。

export function initTheme(): void {
  const root = document.documentElement
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  let timer: number | undefined

  const apply = (animate: boolean): void => {
    if (animate) {
      root.classList.add('theme-switching')
      window.clearTimeout(timer)
      timer = window.setTimeout(() => root.classList.remove('theme-switching'), 200)
    }
    root.classList.toggle('dark', mq.matches)
  }

  apply(false) // 首次:不动画,避免开窗闪一下
  mq.addEventListener('change', () => apply(true))
}
