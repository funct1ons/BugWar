# 巢灯交响 · 全游戏配乐验收

执行日期：2026-10-22（本机时间）。本轮在 `346909e` 的日光花园版本上替换全游戏配乐。**游戏提交 `d1a6ca0` 已推送，GitHub Pages 部署成功并通过正式站验收。** 下文分别标明本地与线上证据。技术验收通过，不代表人工听感或专业艺术验收。

## 1. 交付范围与协作

- 3个实施子代理分别负责音乐制作、Web Audio引擎、战况音乐导演；另2个子代理独立审查代码与音乐制作。主代理集成、返修并运行最终验收。
- 菜单、草甸、幽根、湿地、琥珀、最终关、胜利、失败共 **8套主题**；五套战斗配乐各有基础／推进／高潮三层。18份逻辑音频各提供 OGG 和 MP3，**36份共60,783,213 bytes（约57.97 MiB）**，不是只替换一段样板。
- 使用 VSCO 2 Community Edition 的真实录制管弦采样，原创确定性程序编曲；不是简易振荡器音色，也不冒充新录真人交响乐团。437份源录音仅用于开发，不随包分发；固定版本、逐份SHA及完整CC0许可随包可查。
- 音乐导演按13关地域／最终关及战况请求三档强度，暂停降低配器，结算优先；引擎在同一音频时钟同步三层、小节边界混合，避免不同调性直接重叠。旧设置与存档兼容。
- [score-scope-report.json](verification/score-scope-report.json)：玩法、AI、地图、剧情、输入、存储、UI样式、36张SVG及八个WAV音效与本轮基线逐项相同。存档仍为 `bugwar-verdant-v1`／version 1。仅 `main.ts` 的音乐挂接及制作说明随之调整。

## 2. 独立审查发现与返修

初轮并非直接放行。审查发现以下3项制作阻断，全部修复后重新渲染全量资源：

1. **定音鼓曾按无音高打击随机跨鼓选样。** 改为测定五鼓20份力度／RR录音的主模态，先选最近鼓再选力度／变体，按实际参考频率移调。231份渲染变体最大主模态误差约2.64 cents；这不是人耳音准认证。
2. **结算最后主音曾被截止条件丢弃。** 重写第7小节终止，两曲末旋律真实落在D3，第8小节只留释放；单测核实际音符事件，浏览器等待两曲完整自然结束。
3. **冷下载跟随master、缓存仅检查存在。** 固定commit及真实tree，逐份验证Git blob与SHA-256；实际损坏一次性缓存后能重下正确数据，模拟错误下载被拒绝。

引擎另补资源网络截止、陈旧加载取消、缓存释放和真实增益诊断；目标值不再冒充已生效值。见 [初轮审查](verification/score-initial-audit.json)、[修复闭环](verification/score-review-resolution.json)。初轮报告是历史发现，不代表最终资源仍有这些阻断。

## 3. 构建、逻辑和制作验证

Windows／PowerShell 5.1、Node 24.14.1、Python 3.12.10、系统Edge 155.0.4283.62；默认自动播放策略，无绕过参数。

- TypeScript严格检查、Vite生产构建通过。**10文件、266项单测通过、0失败、1项跳过**。跳过项仅为按需 `CAMPAIGN_SCAN` 初兵搜索，不是关卡矩阵。音频资产51项、音乐契约／引擎12项、导演9项；其余含既有玩法、存档和105项美术回归。见 [unit-summary.json](verification/unit-summary.json)。
- `test:art` 真实Edge解码36张SVG；18张虫兵表四帧非空、透明边界正确、默认别名匹配。见 [art-decode-report.txt](verification/art-decode-report.txt)。本轮未重新制作美术。
- [audio-report.json](verification/audio-report.json) 核八SFX的PCM质量，以及36音乐的库存、实际SHA、帧长契约、来源／完整许可与生成器SHA绑定；它不冒充压缩音乐的独立解码器。
- [score-production-report.json](verification/score-production-report.json)：36音乐全部经FFmpeg精确帧长检查；两格式全编4×峰值最大约 **−1.8844 dBFS**，无削波。循环边界差均低于各自相邻样本差分第99百分位，但这不等于主观无缝。
- 独立目录完整再生：**18份WAV母带和36份解码PCM一致，18份MP3容器逐字节一致**；OGG随机流序号及相应页面CRC不同，逐页证明仅这两项不同。不能宣称36个容器SHA均可稳定再现。再生与复核脚本已保留。
- 运行依赖审计 **0漏洞**；开发依赖仍有既存的2项moderate、1项critical告警，修复涉及Vitest跨主版本升级，本轮未静默升级。见两份 dependency-audit 报告。Vite的Phaser大包提示仍保留。

历史 [campaign-v2-report.json](verification/campaign-v2-report.json) 与 [input-scope-report.json](verification/input-scope-report.json) 保留作此前平衡／美术证据，不把它们冒称本轮新跑的独立195场对战。当前相关单测已重跑，玩法文件完全冻结。

## 4. 真实浏览器与自然通关

[score-browser-report.json](verification/score-browser-report.json) 使用真实Edge，正式修正版资源全部通过：

- 两种编码共36文件逐份解码，16组cue／codec全编检查；立体声、精确长度、同cue层间对齐、动态变化与无削波。
- 经真实应用启动全部13关，地域／最终关映射正确；三源共享启动时刻，稳定后缓存低于192 MiB软预算。转场瞬态可超预算，诊断如实报告；该预算不是进程总内存上限。
- 与live世界脱离的600敌军多阵营来袭fixture使强度升至2，恢复后降至0；这些是**合成战况**，不是自然战斗或人工试玩证据。
- 核实际层增益、暂停约0.32的duck、取消待切换、强度变化不重启源、胜利抢占；胜败完整播完后活动源归零。强制不可解码OGG后三层MP3同步回退。

[browser-report.json](verification/browser-report.json) 通用交互通过：真实鼠标自然占领、框选／多选／比例、技能、暂停／Esc、取消拖拽、重试／下一关、设置与存档重载、存储拒绝降级。实际混音播放RMS约.14262，静音RMS／峰值为0；恢复并叠加7种音效后峰值约.73616。合成压力场景49批／1000精灵短时采样约75.81 FPS，非低端设备或长期帧率保证。

[visual-report.json](verification/visual-report.json) **122/122检查通过、25次截图**，覆盖1920×1080、1366×768、1280×720、全部弹窗及13关。图形未改，确认新音乐接入没有破坏UI。快速fixture换关产生15次过时音乐请求取消：观察原生AbortSignal触发当刻的目标曲，仅经证明已经过时的请求单列；当前所需曲、未证实取消、其它网络／HTTP错误仍会使测试失败。真正网络失败、页面／控制台异常、HTTP错误、站外请求均0。

真实时间、真实UI自然通关，不写本关世界状态：

- [关2低频报告](verification/onboarding-browser-report.json)：normal／Agile；等待12秒、每4秒最多一个单巢命令、第3时隙跳过、不用技能或多选；**76.25模拟秒、15令、失守2次，自然获胜**。仅预置关1完成以解锁关2。
- [首关报告](verification/playthrough-report.json)：可见状态UI驾驶器，**40.60模拟秒、6令、失守0、不施法，自然获胜**。不是新手人类胜率。

主代理复核了本次制作说明、关2战斗与自然胜利截图；既有美术哈希全部未变。精选：[战斗](screenshots/battle.png) · [自然胜利](screenshots/victory.png) · [制作说明](screenshots/credits.png)。

## 5. 离线包、普通URL与发布边界

- [offline-report.json](verification/offline-report.json)：从原生 `Start-Game.ps1` PowerShell TCP HTTP服务加载，97响应、真实鼠标自然占领；八SFX和草甸三层实际解码，同钟、无错误、无缺失、无站外请求。
- `release/BugWar-VerdantCrown-Windows.zip` 重新打包。解压至含中文及空格的路径，从**包内**启动器运行同一浏览器验收，见 [offline-release-report.json](verification/offline-release-report.json)。加入最终文档证据再次压包后，游戏与启动器逐文件SHA必须与实测包一致；清单见 [release-payload-report.json](verification/release-payload-report.json)。
- 双击 `Start-Game.cmd`，不要直接打开file://。运行无需Node、Python或联网；首次点击后有声。包中包含两种音乐格式与完整CC0许可，不含原始采样库、母带、开发工具或第三方研究截图。
- [production-smoke-report.json](verification/production-smoke-report.json) 为**本地HTTP普通生产URL**：无测试接口，真实鼠标自然占领、四幕／锁关、暂停恢复及12个流程音频文件服务通过。页面实际加载的JS与本地构建同SHA，见 [build-verification.json](verification/build-verification.json)。不是正式站验收。
- **已按用户授权推送并发布。** `d1a6ca0` 的 [GitHub Actions](https://github.com/funct1ons/BugWar/actions/runs/39749779959) 测试、构建、Pages部署均成功，见 [pages-deployment-report.json](verification/pages-deployment-report.json)。正式网址为 <https://funct1ons.github.io/BugWar/>。
- 新 [online-report.json](verification/online-report.json) 是正式HTTPS普通URL的真实Edge验收：页面无测试接口、四幕／13关初始锁定正确、鼠标派兵自然占领、暂停恢复、菜单及草甸三层与八SFX服务通过；页面实际加载 `index-Dfb9Bb_k.js`，SHA-256与本地验收构建完全一致。页面异常、失败请求、站外请求均0。旧站历史证据另存为 [online-prior-release-report.json](verification/online-prior-release-report.json)。
- [public-score-assets-report.json](verification/public-score-assets-report.json) 从正式HTTPS逐份完整下载 **36份音乐和完整CC0许可**，SHA-256全部与已验收产物相同；不是只检查HTTP响应头或文件存在，也不冒称线上听音。
- 上线验收首轮快速离开菜单触发了设计内的过时音乐取消；测试现明确等待菜单响应体下载完成再进入战场，不屏蔽失败请求。重新运行正式站验收通过，未修改游戏运行时代码。
- 离线ZIP保留配乐交付时的 `d1a6ca0` 文档快照，不包含随后新增的这批线上发布记录；游戏资源与正式站相同。

## 复现

```powershell
npm.cmd test -- --reporter=default --reporter=json --outputFile.json=test-results/unit-report.json
npm.cmd run build
python scripts/check-audio.py
npm.cmd run test:score
npm.cmd run test:browser
npm.cmd run test:visual
npm.cmd run test:art
npm.cmd run test:offline
npm.cmd run test:onboarding
npm.cmd run test:playthrough
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/package-release.ps1
# 解压ZIP后：$env:OFFLINE_ROOT='C:\你的中文 空格路径'; npm.cmd run test:offline
# 本地生产服务另起终端：$env:PORT='4182'; npm.cmd run serve
# $env:GAME_URL='http://127.0.0.1:4182/'; npm.cmd run test:online
```

制作再生见 [score-production.md](score-production.md)。正式机器证据保留在 `docs/verification/`，临时采样／工具／母带／测试工作目录交付前清理。

## 未覆盖的边界

**没有人工耳听，也未获得模型音听证据。** 真实录制样本与客观技术指标不能保证音乐会级演奏、自然连奏或长时间不疲劳；免费社区库、重采样与程序编曲仍可能有机械感，需要你实际试听评价。不声称最终艺术验收通过。

未做13关人工连续通关、长时浸泡、多人、手机触屏或Firefox／Safari测试。原版SWF未运行，原作精确规则未知，本项目是明确标注的原创重建。自动化覆盖不等于任何策略必胜或所有设备恒定帧率。
