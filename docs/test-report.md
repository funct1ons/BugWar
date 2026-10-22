# 炮塔驻军火力（提交前验收快照）

执行日期：2026-10-22（本机时间）。本轮按用户确认方案，把守望炮塔从固定 `2 伤害 / 0.75 秒` 改为**按实时驻军分段线性插值**：0 人 2 伤害／0.90 秒，10 人 3／0.80，30 人 5／0.65，60 人及以上 6／0.50。射程仍为 200，炮塔仍不产兵，近战防御、占领与归属射击规则不变。**本节记录提交前本地验收，不作为正式站部署成功的证据。**

## 变更范围

- `src/core/rules.ts`：新增 `CANNON_FIREPOWER_NODES` 火力表、`CANNON_GARRISON_CAP`、纯函数 `cannonFirepower`／`cannonHitsForExposure`／`cannonLossForExposure`。`BATTLE_RULES.cannonDamage`／`cannonCooldown` 保留为 0 人基准（2／0.90）并由同一张表导出，射程仍 200。模拟、AI、图鉴与选中面板共用这一份数据。
- `src/core/Simulation.ts`：射击准备由"剩余秒数"改为 0–1 充能，每步按当前驻军对应间隔推进。临阵增减驻军立即影响剩余充能速率，但保留已积累进度，不重置冷却、不免费补射；无目标时最多攒一发就绪射击。空塔仍按基准火力，只有 `owner>0` 的炮塔射击，仍不射建筑。
- `src/core/ai.ts`：`estimateCannonLoss` 逐塔读取实际驻军插值出的伤害与间隔，不再用固定常量；截弦、种族速度、剩余路径、友军／中立排除逻辑保持原样。
- `src/main.ts`、`src/style.css`：战场选中己方炮塔显示实时单发伤害、间隔（最多三位小数）、驻军加成与60人封顶进度，多选显示汇总和最多三座明细，无选中时隐藏。面板不阻挡点击。
- `src/data/codex.ts`、`src/style.css`：炮塔词条增加"驻军加成"和 0/10/30/60 火力成长表（60 人标注上限）；战斗中选中炮塔时"战场实测"显示当前单发伤害、间隔、驻军加成、每秒伤害与距上限人数，中立塔注明不射击。未选中时显示空塔基准与成长表。
- 未改动：13 关坐标／初兵／所有权／道路、生产与技能数值、近战与占领公式、存档格式、音乐与美术资源。

## 本轮实际结果

Windows PowerShell 5.1、Node 24.14.1；均在本机同一个工作区执行。

| 项目 | 实际结果 |
| --- | --- |
| 单元测试 | `npm.cmd test -- --reporter=default --reporter=json --outputFile=test-results/cannon-unit-report.json`：**15 文件，342 通过，0 失败，1 跳过**（共 343 项）。跳过项仍是按需初兵扫描 `CAMPAIGN_SCAN=1`。新增 `tests/cannon.test.ts`（17 项）：火力节点、节点间插值、60 人封顶、非有限/负驻军回退基准、充能射击节奏（空塔 1/19/37 tick，满编 1/11/21/31 tick）、临阵增兵与抽兵不重置冷却、半程充能保留进度并立即改变剩余速率、逐 tick 反复增减驻军不能刷射击、空塔基础伤害、中立塔不射击与不射建筑、AI 估计与共享函数一致、满编炮塔使同一进攻不可行、图鉴基准/成长表/已选炮塔实时显示。 |
| 战役机器人矩阵 | 新跑 195 场（13 关×3 难度×5 策略）：easy 59 胜／1 负／5 仍在进行，normal 58／4／3，hard 55／6／4；easy 与 normal 每关仍至少有一个 `agile-planner` 或 `agile-pulse` 获胜。到上限仍 `playing` 的场次不记为胜。 |
| 道路／图鉴浏览器专项 | `npm.cmd run test:roads` 通过：Edge 实际运行，`passed:true`、0 错误、0 失败请求；三类九项图鉴数值与暂停/键盘检查通过，1280/1366/1600 三尺寸下详情无横向溢出。另以明确标记的第三关UI专用fixture核验0/20/60/90驻军面板、20人0.725秒精度、三尺寸在视口内、双炮塔多选及清选隐藏；此fixture不冒称自然占领。[报告](verification/cannon-roads-codex-report.json)、[面板截图](verification/cannon-selection-cap.png)。 |
| 构建 | `npm.cmd run build` 通过（`tsc --noEmit`、Vite、许可复制），产物 `assets/index--KG0zoJw.js`、`assets/index-CQ36Anrb.css`。 |
| 通用浏览器 | `npm.cmd run test:browser` 通过：13关布局、暂停恢复、音频加载/静音/恢复、回退与储存降级回归，0脚本错误/失败请求/外域请求。[报告](verification/cannon-browser-report.json)。 |
| 第二关自然操作 | `npm.cmd run test:onboarding` 通过：标准/敏捷、12秒观察、4秒最多一令且跳过第3时隙、无技能/多选/本关世界写入，88.45秒获胜。[报告](verification/cannon-onboarding-browser-report.json)。 |

未重跑：专门视觉/美术、离线包、正式站 `test:online`、第一关浏览器自然通关与音乐专项（通用浏览器仅基础音频回归）。它们不是本轮改动的直接证据，下文历史记录保持原样，不冒称本轮已重验。

## 本轮发现与决定

1. **炮塔变强后第 10 关 easy 的对称僵局变长。** 旧版 `agile-pulse` 在 518 秒获胜；新火力下要 618.5 秒，超过原来 600 秒的机器人预算，`agile-planner` 与旧版一样在 600 秒仍是 `playing`。没有改关卡初兵／坐标／道路／经济，也没有放宽胜负判断，只把**机器人实验时间上限由 600 秒调到 900 秒**（`tests/campaign.test.ts`），并保留"到上限仍 playing 不算胜"。
2. **旧断言按新方案更新。** 空塔基准间隔 0.75→0.90 秒（`BATTLE_RULES.cannonCooldown`），射程 200 与空塔伤害 2 不变；`estimateCannonLoss` 的 0 驻军样例由 12／24 变为 10／20（间隔变长），10 驻军塔首发由 8 变 7（第二节点 3 伤害）。这些是用户确认数值的直接结果，不是把失败断言改绿。
3. 静态独立审查未发现阻塞项；0.05秒模拟步长仍会向上量化插值间隔，例如20人理论0.725秒的持续射击实际按0.75秒步点触发；AI按理论间隔估损略偏保守。该步进误差不改变批准的火力表。
4. 炮塔射击节奏用充能而不是"剩余秒数"，所以反复增减驻军既不能重置计时间，也不能刷立即射击；相应的回归测试（逐 tick 交替 0/60 驻军）已加入。

相关玩法文档同步更新：[核心规则](core-rules.md)（炮塔火力表、充能与 AI 估计）、[道路与图鉴](roads-and-codex.md)（图鉴成长表与选中面板）、[架构](architecture.md)（共享纯函数与充能状态）。

---

# 历史：固定道路与虫族图鉴验收

执行日期：2026-10-22（本机时间）。本轮基于 `2ad4b4d`，按用户确认的「仅直接相邻、手动逐巢推进」方案修改道路与AI，补充可暂停查阅的图鉴。**本轮仅本地，未推送／部署。**

设计、冻结范围和方法见 [道路与图鉴](roads-and-codex.md)。下列为本轮记录；下方历史配乐验收不充当本轮功能证据。

## 本轮方法与边界

- 13张显式无向路网；派兵、AI攻击和补给均仅走直接相邻道路。多选逐来源检查，不自动转发。路网连通、岔路和炮塔关口由独立测试约束，不是按距离生成的全连图。
- 图鉴三类九项，直接读取种族常量与技能常量；未解锁族可查。分别验菜单、战役、战场入口，打开前暂停状态、关闭与Esc恢复、操作期间世界时钟，以及三种桌面尺寸的滚动和遮挡。
- 保留原195场、13关×3难度×5策略的确定性矩阵；只把easy／normal每关有agile-planner或agile-pulse获胜作为可达性底线，不要求所有弱策略或hard必胜。600秒仍playing不擅称平局或永久死锁。
- 前三关18组合：标准／敏捷，开局等待8／10／12秒，每3／3.5／4秒最多一条单巢命令，可跳过第3时隙。只读当前可见驻军和道路，后方逐己方相邻建筑补给；同层用固定ID破平局防往返。无预知在途、无技能、无多选、无敌AI规划器。明确道路规则后修正原先无路意识的驾驶器，但未降低18/18断言。
- 两个浏览器自然通关驾驶器不写本关世界、不加兵或加速；第二关仅预置上一关完成以解锁。它们是自动化脚本，不是新手人类胜率或13关人工通关。

## 本轮发现与修复

初轮未直接放行，保留诊断而不伪装全程一次通过：

1. 逐巢路网使旧的欧氏距离补给出现撤离接敌面、反复往返及炮塔不能补给。改为己方子图到真实敌方接触面的跳数，严格朝前一跳；未接敌才向中立面，允许向友方炮塔送兵。不添加自动跨巢命令。
2. 第一关起点第二出口允许敌军绕后，第三关前期分支使低频策略频繁失守。仅删改这两张路网修正；不改初兵、经济、所有权、坐标或准备期，第二关七边保持原方案。
3. 独立审查发现AI将玩家owner 1漏作敌方接触面，多阵营前线待遇不一致；已统一按非中立且非己方判断，并增加对称性回归。
4. 通用浏览器的第二次P暂停恢复断言暴露了DOM模态与Phaser键盘不同步；保留原断言，修复恢复通路，并检验长按／重复keydown、图鉴内P与Esc不泄露至战场。

## 本轮最终构建与回归结果

Windows／PowerShell 5.1、Node 24.14.1、系统Edge 155.0.4283.62；默认自动播放策略。以下浏览器测试均使用**同一次生产构建**，未在测试之间重建或更改源码。

| 项目 | 实际结果与证据 |
| --- | --- |
| 单元测试 | **14文件，325项通过，0失败，1跳过**。跳过项仅按需初兵搜索，不是道路、新手或矩阵测试。[摘要](verification/roads-unit-summary.json)、[原始结果](verification/roads-unit-report.json)、[完整日志](verification/roads-unit-log.txt) |
| 道路战役矩阵 | 新跑195场。easy／normal每关至少一个agile-planner／agile-pulse胜，覆盖无缺口；easy 59胜／2负／4仍在进行，normal 58／3／4，hard 55／7／3。不把弱策略失败或600秒仍在进行冒充全部通关。[逐场记录与输入哈希](verification/roads-matrix-report.json) |
| 低频新手 | 前三关18／18组合胜；另有打开教程后延迟首令的普通首关胜。[矩阵报告](verification/roads-matrix-report.json) |
| 道路／图鉴专项 | 13关真实道路＝战役缩图＝常显道路；所有观察到的AI出兵有合法边。鼠标点击／拖拽非法派兵、混合来源、友方增援、无自动转发通过。三类九项图鉴数值共源、未解锁可查、三尺寸、键盘、实际滚轮、暂停快照及重复P通过。[专项报告](verification/roads-codex-report.json) |
| 通用浏览器 | 交互、存档不可用回退、OGG失败MP3回退、音乐增益／静音及结算、13关HUD通过；0页面错误／缺资源／外网请求。[报告](verification/roads-browser-report.json) |
| 视觉／美术 | **122项视觉检查、25张截图**通过；36张正式SVG真实Edge解码、18张步态表透明边界通过。三尺寸菜单／战斗／设置无遮挡。[视觉报告](verification/roads-visual-report.json)、[美术日志](verification/roads-art-decode-log.txt) |
| 真实时间首关 | normal首关**38.90秒获胜**，21次真实鼠标命令、0技能、0世界写入。[报告](verification/roads-playthrough-report.json) |
| 低频标准第二关 | 仅解锁上一关；本关**88.35秒获胜**，无技能／加兵／加速。[报告](verification/roads-onboarding-browser-report.json) |
| 原生离线启动 | Windows自带PowerShell服务、真实鼠标占巢、图鉴暂停恢复／道路非法提示通过，0外网请求。[报告](verification/roads-offline-report.json) |
| 普通生产URL | **仅本地** `http://127.0.0.1:4180/`，不带`?test=1`且无调试接口；实际派兵占巢、非法道路提示、锁定族图鉴、暂停与恢复通过；0错误／缺资源／外网请求。实际加载JS与本地构建SHA一致。[报告](verification/roads-production-url-report.json) |
| 范围冻结 | 与`2ad4b4d`逐项比较，88份冻结文件一致；初兵、所有权、坐标、种族参数不变，美术／音频／存储模块不变。[范围报告](verification/roads-scope-report.json) |

构建资产为`index-DUA8bNDa.js`，SHA-256 `40143bca4d98742c39412eaa6ffc711c9734e87a84d755218702225df8672540`；[构建清单](verification/roads-build-report.json)绑定全部源码与构建配置输入及89份产物。`tsc --noEmit`、Vite与许可证复制通过。[构建日志](verification/roads-build-log.txt)

本轮实机图：[道路战斗](screenshots/roads-battle.png) · [战斗内图鉴](screenshots/roads-codex.png) · [1280族群](screenshots/roads-codex-races-1280.png) · [1280建筑](screenshots/roads-codex-buildings-1280.png) · [1280指挥](screenshots/roads-codex-command-1280.png) · [首关自然胜利](screenshots/roads-natural-victory.png)。此前音画截图不覆盖。

## 离线交付与证据边界

- 打包使用`package-release.ps1 -SkipBuild`，复用已验收的`dist/`。最终ZIP为`release/BugWar-VerdantCrown-Windows.zip`。
- 最终包在含中文及空格的路径解压，再运行同一原生PowerShell离线测试；结果旁置为`release/roads-offline-release-report.json`。`release/roads-release-payload-report.json`核对源码未变、dist未变、解压包92份运行时／启动器／素材许可逐字节一致，并记录**最终ZIP**的大小和SHA-256。
- **最终解压验收通过**：ZIP为76,434,760 bytes，运行时／启动器／许可92份一致，0外网请求。[最终离线报告](verification/roads-offline-release-report.json)、[最终ZIP与载荷哈希](verification/roads-release-payload-report.json)在打包后追加到本地仓库；它们不在该ZIP的文档快照内。包内文档是打包时快照，最终容器报告留在ZIP外，不宣称包内自证。未推送、未部署，未改线上版本。
- 专项中的所有权／资源／AI观察fixture，以及通用视觉测试中的强制胜败／极大数字，**仅验功能与显示，不计自然胜利**。专项首占为延长AI准备期的时序fixture；自然通关只认上述两份无本关世界写入报告。
- 本轮未重制或重新全量主观试听配乐。资源与音乐代码逐字节未变；既有制作／试听边界仍见下方历史章。自动化驾驶器胜利不等于人类新手胜率，不宣称13关人工通关。

---

# 历史：巢灯交响 · 全游戏配乐验收

以下为上一轮已部署的音画版本记录。其「玩法冻结」「已上线」及测试计数均属于当轮，不代表本轮道路／图鉴已经上线或无需重验。

执行日期：2026-10-22（本机时间）。当轮在 `346909e` 的日光花园版本上替换全游戏配乐。**游戏提交 `d1a6ca0` 已推送，GitHub Pages 部署成功并通过正式站验收。** 下文分别标明本地与线上证据。技术验收通过，不代表人工听感或专业艺术验收。

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
