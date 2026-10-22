# 巢灯交响 · 全游戏自适应管弦配乐

本轮不是样板：菜单、四幕地域、最终关与胜败全部接入新配乐。使用 **VSCO 2 Community Edition 的 CC0 真实录制采样**离线演奏原创程序编曲，替换旧版四首简易合成曲；八个原有操作音效逐字节保留。不是现场新录交响乐团，也未经过人工主观试听。

## 曲目与分层

| 场景 | 曲目 | BPM / 小节 | 时长 | 文件层 |
|---|---|---|---:|---|
| 菜单、纪事、战役图 | 巢灯与远方 · menu | 96 / 48 | 120s | 完整混音 |
| 草甸（关1–3） | 初晴的原野 · meadow | 108 / 48 | 106.667s | base / motion / power |
| 幽根（关4–6、12） | 根脉的守望 · roots | 100 / 48 | 115.2s | 三层 |
| 湿地（关7–9） | 苇影与归途 · marsh | 92 / 48 | 125.217s | 三层 |
| 琥珀（关10–11） | 琥珀之冠 · amber | 116 / 48 | 99.310s | 三层 |
| 最终关13 | 十三盏灯的交响 · finale | 120 / 48 | 96s | 三层 |
| 胜利 | 巢灯重燃 · victory | 108 / 8 | 17.778s | 一次性完整混音 |
| 失败 | 归途未尽 · defeat | 76 / 8 | 25.263s | 一次性完整混音 |

全部4/4、44.1kHz立体声。**8个主题、18份逻辑音轨、36个OGG/MP3文件**，音乐总量60,783,213 bytes（约57.97MiB），并不首次全量下载。循环曲发展为六个八小节段，不是短句机械拷贝延长。具体旋律、配器、来源、终止句及再生见 [score-production.md](score-production.md)。

- **0 平静**：base包含主旋律、低弦与回答声部，自身是完整音乐。
- **1 推进**：加入motion的短弓、竖琴与节奏运动。
- **2 激烈**：再加入power的铜管和声、已校准音高的定音鼓与管弦打击；不是只把同一混音调响。

## 音乐导演：只读战况，不改游戏

`MusicDirector`按关卡biome选曲，关13明确使用finale。它每0.75模拟秒采样己敌建筑/行军兵力、朝己方来袭、生产巢损失，以及累计击杀/伤亡/占领/失守的差分；多敌方合计，忽略中立驻军。按关卡起始兵力比例归一化，避免天然兵力不对称直接触发高潮。

压力快升2秒、慢降5秒平滑，使用进入/退出不同阈值与最短8秒保持；不是每次碰撞都切层。暂停冻结估计器，恢复不累计暂停时间；重试清空历史。结算模式优先且不会再被战场tick覆盖。只读取`World`，不消费场景事件队列，不影响AI、平衡、输入或存档。

## 播放、调度与失败降级

保留`AudioSystem`的`unlock/music/play/configure/dispose/diagnostics`，增加`setIntensity(0|1|2)`与`setPaused(boolean)`；`music('battle')`仍兼容为meadow。真实pointer/key/touch或显式`unlock()`才尝试恢复音频上下文；手势前请求仅挂起。小型八音效库可先解码，不等待整套配乐才处理输入。

同曲三层在**同一AudioContext时刻**启动，帧长和采样率必须一致；强度改变仅自动化增益，不重启或追赶音轨。新强度在下一小节平滑进入，约0.72秒收敛。暂停仍走音乐时钟，在小节边界收起motion/power并将base降至0.32；不是立刻冻结音频或瞬间静音。

不同地域换曲先在旧曲下一小节前淡出，再从新曲首拍淡入，避免异调叠奏；因此不是保持满响度的两曲交叠。胜败在缓冲就绪后80ms快速接管，不循环，播完释放音乐源。相同曲目请求不重启；快速换曲、重试及回菜单取消陈旧加载/未来排程，未完成的旧结果不能抢占新曲。

音乐优先本地OGG，HTTP/解码不支持时尝试同名**MP3**，不再回退WAV，也不生成电子占位曲。每个格式的fetch及body读取独立15秒截止；取消请求会Abort，不能中断的`decodeAudioData`在前后检查归属。两格式均失败记入`failedFiles`；可选层失败只播放可用层，base失败则不启动该曲。路径均遵守`BASE_URL`，运行不访问外部音乐服务。

八个WAV音效、主/音乐/音效音量与静音设置不变；音效仍最多16并发、滚动每秒24次及逐音效节流，保留主总线保护。结算只调用`music()`，不同时叠加同名`play()`。

## 缓存与真实诊断

仅当前／渐退／加载中的音乐保留，旧buffer与Promise及时淘汰；八音效常驻。**192MiB是解码缓存软预算，不是整个浏览器内存上限**；转场及解码瞬态可能超出，`cacheOverBudgetBytes`如实显示，不预载13关所有音乐。

`?test=1`中的诊断用于验收，普通URL不暴露测试接口：

- `decodedFiles`为真正成功解码且仍缓存的格式；`fallbackFiles`记录成功MP3回退，不伪报OGG成功。`pendingLoads`、`failedFiles`分别计在途与最终失败。
- `intensity`在小节边界生效；`requestedIntensity`、`pendingIntensity`单列。`pauseGain`与`activeLayers[].gain`读取实际AudioParam（后者含duck）；`targetPauseGain`/`targetGain`是目标，不把未来目标冒充当前增益。
- `scheduledTransitionTime`/`mixSettledAt`保留到平滑收敛。`currentTrack`/`activeLayers`可代表**已排队的新组**，不能仅凭名称就断言新曲在下拍前已可听；需结合`startedAt`、时钟、渐退状态。
- `decodedBytes`只计算缓存Float32 PCM，非进程内存测量；`activeMusicSources`可含短暂渐退组。

## 复核与授权

- `npm.cmd test`：调度、取消、回退、超时、缓存、导演防抖、精确资产/hash与终止主音等回归。
- `npm.cmd run test:score`：真实Edge分别解码36文件、精确gapless帧长、全编峰值/动态、13关选曲、三源同钟、压力升降/实际gain、暂停、胜败自然播完、三层MP3回退。压力场景是脱离live模拟的合成world clone，不冒充自然实战。
- `python scripts/check-audio.py`：八音效PCM检查及音乐库存/hash；它不把压缩文件仅看文件头就宣称已解码。
- [正式验收报告](test-report.md)、[制作复核](verification/score-production-report.json)、[浏览器配乐复核](verification/score-browser-report.json)。

原始采样及本次原创编曲/混音的CC0声明分别列于`public/audio/SCORE-LICENSES.txt`，完整源许可为`VSCO-CC0-LICENSE.txt`。源库、WAV母带及Python/FFmpeg工具不进入成品；生成器保留以便开发再生。旧`generate-audio.py`仅用于在单独`--output`目录复现历史音效，已拒绝覆盖现代配乐目录。

**验收边界**：未进行人工耳机/扬声器试听，不能声称专业混音、主观无缝或最终艺术验收。免费社区采样层数/奏法有限，持续音含延展、管乐非多人实录组、空间不是音乐厅IR，可能有机械感和重采样痕迹。现有证据证明真实素材来源、完整集成及已覆盖的技术质量，不用轨数或峰值统计替代听感。
