# 转录评测 fixture 集

> T61 评测基建。配套脚本:[`scripts/eval-transcribe-fixtures.ts`](../../scripts/eval-transcribe-fixtures.ts)。
> 设计依据:[`development-plan.md`](../../docs/04-development/development-plan.md) §6.2.6 / §6.2.7。

「先量化,再优化」——没有这套 fixture 跑出的对比数据,任何转录优化都不进 v0.1。

## 为什么 git 里看不到样本

样本是真实 dogfood 录音(会议 / 访谈 / 笔记),含隐私内容。`fixtures/.gitignore` 已忽略
`transcribe/sample-*`,**只提交本约定**;实际 wav / 校对稿 / 术语表各自在本机维护。

## 目录约定

每段样本 = 一个音频 + 一份参考稿(同 basename 自动配对),术语表可选:

```
fixtures/transcribe/
  sample-001.wav         # 输入音频
  sample-001.ref.txt     # 人工校对的「正确」全文(UTF-8 纯文本)
  sample-001.terms.json  # 该段出现的专有名词表(可选)
  sample-002.m4a         # 输入也可以是 m4a/mp3/flac/... (见下)
  sample-002.srt         # 参考稿也可以是 SRT(脚本自动去序号 + 时间轴,拼正文)
  ...
```

### 输入音频

- `.wav` 走内置 RIFF 解析(无外部依赖,任意采样率/声道,内部下混 + 重采样到 16k mono)。
- 其它格式(`.m4a .mp3 .flac .aac .ogg .opus .mp4 .mov .webm`)走 **ffmpeg** 解码到 16k mono
  (`brew install ffmpeg`)。ffmpeg 只是 dev 评测工具,**不进产品 runtime**(dev-plan §6.2.7 P2)。
- 适合直接拿「视频无损 remux 出来的音轨 + 平台字幕」当 fixture:`test.m4a` + `test.srt` 同名即可配对。

### 参考稿(`ref.txt` 或 `srt`)

人工逐字校对后的全文。优先读 `<base>.ref.txt`,没有则读 `<base>.srt`(解析掉序号 + 时间轴只取正文)。
脚本算 CER 时会把参考稿和识别稿都规范化(去空白 + ASCII 转小写)再逐字符比对,所以 ref 里的标点
会计入误差——如果只想看「字对不对、不管标点」,跑脚本时加 `--strip-punct`。

### `terms.json`

支持两种写法,脚本都认:

```jsonc
// 写法 A:直接列这段里出现的专有名词(推荐)
["LazyAudio", "SenseVoice", "VAD", "Claude"]
```

```jsonc
// 写法 B:错→对 纠错映射(§6.2.5 术语表格式),脚本取「对」的那一侧作为期望命中词
{
  "雷泽奥迪欧": "LazyAudio",
  "威艾迪": "VAD",
}
```

术语命中率 = 期望词里有多少个出现在识别稿中(子串、忽略大小写)。

## 样本覆盖建议(§6.2.6)

5–10 段,每段 1–5min,尽量覆盖:会议、独白、技术讨论、中英混杂、噪声环境。

## 怎么跑

```bash
# 默认扫 fixtures/transcribe/,用 dev userData 里下好的 SenseVoice 模型
pnpm tsx scripts/eval-transcribe-fixtures.ts

# 指定目录(如 dogfood/)/ 模型 / 导出 JSON / 忽略标点 / 把识别稿写出来肉眼 diff
pnpm tsx scripts/eval-transcribe-fixtures.ts dogfood
pnpm tsx scripts/eval-transcribe-fixtures.ts --model <dir> --json out.json --strip-punct --dump-hyp
```

`--dump-hyp` 会把每段识别稿写成 `<base>.hyp.txt`,方便和参考稿肉眼对比错在哪。

每次优化前后跑同一批样本,记录 CER / 术语命中率 / RTF / RSS 的变化。**不接受「听起来更好」但无数据的结论。**
