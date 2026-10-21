# 音频交付说明

## 资源与来源

12 个真实本地 WAV 位于 `public/audio/`，由 `scripts/generate-audio.py` 离线原创算法合成；无第三方采样、CDN 或空音频替代。合成采用多声部和声、节奏与音区变化，包括 Karplus–Strong 拨弦、膜鼓、马林巴式音条、气息笛、滤波噪声及 Schroeder 混响。固定随机种子可复现；生成脚本声明原创资源可按 CC0 / public domain 随游戏分发。

均为 44,100 Hz、16-bit PCM；音乐双声道，音效单声道。

| 文件（省略 .wav） | 时长（秒） | 播放 |
| --- | ---: | --- |
| music-menu | 34.286 | 循环 |
| music-battle | 29.091 | 循环 |
| music-victory | 9.900 | 一次 |
| music-defeat | 11.031 | 一次 |
| sfx-hover | 0.130 | 一次 |
| sfx-click | 0.180 | 一次 |
| sfx-select | 0.460 | 一次 |
| sfx-dispatch | 0.860 | 一次 |
| sfx-march | 1.120 | 一次 |
| sfx-impact | 0.780 | 一次 |
| sfx-capture | 1.060 | 一次 |
| sfx-skill | 1.380 | 一次 |

循环音乐将混响尾部折回开头并做边缘淡化；运行时按解码 buffer 全长循环。

## API 与运行行为

具名导出 `AudioSystem`，支持 `constructor(settings)`、`unlock(): Promise<void>`、`music(track)`、`play(name)`、`configure(partialSettings)`、`diagnostics()`、`dispose()`。默认 master/music/sfx 为 **0.72 / 0.55 / 0.65**，未静音。首次真实 pointer/key/touch 手势解锁 Web Audio；此前音乐请求保留，音效不排队补播。资源 URL 使用 `import.meta.env.BASE_URL + 'audio/…'`，支持子目录部署；本地文件仍经同源 fetch 读取。

菜单与战斗循环，胜败不循环；切歌交叉淡化，异步加载使用请求序号，陈旧曲目不能抢占最新请求（包括重新请求当前正在播放的曲目）。主 UI 结算应仅调用 `music('victory' | 'defeat')`，不要同时 `play()` 同名音效，避免双播；保留后者仅为接口兼容。主界面已按此方式接入。

音效：同名最短间隔分别为 hover 55、click 45、select 80、dispatch 110、march 170、impact 65、capture 150、skill 280、胜败 1200 毫秒。滚动 1000 毫秒最多接受 24 次，同时最多 16 个音效 voice；窗口先原地保留未过期时间戳，再检查限额，不提前清空。未解码音效只预热并丢弃当前请求，避免延迟错位。

输出链为 music/sfx gain → master gain → DynamicsCompressor → destination；阈值 -10 dB、ratio 8、attack 0.003 秒、release 0.15 秒，减轻并发叠加削波。压缩器不是严格 true-peak 硬限制器，不保证任意输入下绝对无峰值超限。

`diagnostics()` 返回独立、可 JSON 序列化的只读观察快照，不暴露内部节点：contextState、decodedBuffers/decodedFiles、failedFiles、pendingLoads、activeVoices、activeMusicSources、currentTrack/pendingTrack、播放时间/时长、循环/淡化状态、压缩增益衰减及限流计数等。修改快照不会修改内部资源集合。

## 验证与限制

- `npx tsc --noEmit`：编译检查。
- `npx vitest run tests/audio.test.ts`：默认值、诊断快照、滚动限流、异步陈旧切歌回归。
- `python scripts/check-audio.py`：独立资源检查已通过 12 项；音乐 peak 约 0.8912，音效 0.4465–0.7079；无空文件、无削波，循环首尾差为 0。报告输出在 `test-results/audio-report.json`。
- 主集成验收已在Edge默认自动播放策略下验证真实手势解锁、解码与播放、交叉淡化、循环配置、静音/恢复，以及压缩器后真实混音输出。静音稳定后RMS为0，恢复并发7音效peak约0.684；详情与机器报告见 `docs/test-report.md`、`docs/verification/browser-report.json`。
- 未进行人工主观听音或专业响度认证；PCM首尾样本一致不等于主观听感绝对无缝。

解码/网络失败只记录并跳过，不产生合成 fallback，也不会自动反复重试；无 Web Audio 时静默降级。首次加载需要等待本地 WAV 下载解码，浏览器后台页或系统音频策略可能暂停上下文。dispose 停止当前/淡出音乐及音效，关闭上下文并释放缓存。
