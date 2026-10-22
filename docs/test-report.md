# 雨后灯火 · 第二版交付验收

执行日期：2026-10-21–22（本机时间）。这是实际自动化验收记录，**不是人工试玩或主观听音报告**。旧版平衡历史见 [balance-report.md](balance-report.md)，本轮对比见 [balance-v2.md](balance-v2.md)。

## 环境与复现

Windows / PowerShell 5.1、Node 24.14.1、Intel i5-13400F、系统 Edge 155.0.4283.62。使用默认浏览器自动播放策略，没有自动播放绕过参数。

```powershell
npm.cmd test -- --silent
npm.cmd run build
npm.cmd run test:browser
npm.cmd run test:onboarding
npm.cmd run test:playthrough
npm.cmd run test:art
python scripts/check-audio.py
npm.cmd run test:offline
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/package-release.ps1
# 解压ZIP后，设置OFFLINE_ROOT为解压目录，再运行test:offline
# main部署完成且联网后：
npm.cmd run test:online
```

机器快照在 [verification/](verification/)，临时运行图与JSON在gitignored的 `test-results/`；精选成品截图在 [screenshots/](screenshots/)。仅 `?test=1` 提供开发测试接口，正常网址不提供。

## 1. 构建、逻辑与难度

- TypeScript严格检查、Vite生产构建通过；**6文件、90项通过、1项按需扫描跳过**。不是把失败测试改为跳过。
- 保留13关×3难度×5策略的195场纯逻辑对战，每场上限600模拟秒；13关easy/normal仍各至少有一种Agile策略获胜。13个策略/难度组合仍会拉锯，不保证所有策略或hard都获胜。原始结果：[campaign-v2-report.json](verification/campaign-v2-report.json)。
- 新增前3关18组低频单巢策略：开局等待8–12秒，每3–4秒最多一个命令，另含第三时隙跳过；不用技能、多选、敌军拦截或高强度规划器。**18/18胜，第二关6/6胜**，68.30–97.35模拟秒，失守2–5次。旧版同策略第二关0/6。
- 标准AI间隔1.5→2.7秒，悠闲3→4秒；两者每轮至多一个主攻目标，紧急增援仍保留。标准前期观察准备期递减，双方正常生产/充能。第二关双巢起步及初兵调整详见平衡v2。
- hard仍为0.75秒、无准备期、完整多目标规划；但各难度共享修改后的地图，**不能解释为hard完全未改**。
- 存档键及version1未变；最佳成绩、旧解锁、音量与难度设置保留。单测覆盖坏记录、localStorage拒绝、连续解锁及异步音频竞态。

## 2. 真浏览器低频标准第二关

[onboarding-browser-report.json](verification/onboarding-browser-report.json)：实际Edge、normal、Agile、关2；先等待12秒，每4秒一个单巢50%/75%命令，第3时隙跳过，不用技能/多选、不写世界状态。

- 本轮复验 **76.20模拟秒自然胜利、15条命令、失守2次**，保存后关3解锁断言通过；独立代理此前执行同一脚本为68.35秒、14令、失守2次。
- 仅在localStorage预置关1已完成以解锁关2；不注入本关兵力、时间、占领、胜负或进度。
- 读取当前可见的向下取整兵数和地图位置，用实际按钮/鼠标下令，不预测在途战斗。真实浏览器输入时序有小幅差异，两次轨迹不要求逐tick相同。
- 页面异常0、HTTP错误0。截图：[对局中](screenshots/battle.png) · [自然胜利](screenshots/victory.png)。
- 这是可复现的低频脚本证据，**不是18名新玩家样本或人类胜率**。

另有 [playthrough-report.json](verification/playthrough-report.json)：较强的首关UI驾驶器，本轮40.15模拟秒自然获胜、6令、失守0、不施法、不写世界。这只证明自然胜利与保存链路可达，不用它代替新手平衡证据。

## 3. 交互、故事与视觉

[browser-report.json](verification/browser-report.json) 全部通过：

- 主菜单、四幕「林地纪事」及关闭、13关/种族初始锁、战斗入口、可见准备期。
- 真实鼠标单选派兵并等待自然占领；框选、多选、派遣比例、A施法、P暂停、Esc先取消再暂停，暂停时取消拖拽。
- 设置与进度重载、禁用localStorage降级；失败后「改为悠闲再试」保存新难度且不覆盖旧成绩。
- 胜败结算、成就、重试和下一关。**通用交互测试的终局和压力场景使用合成fixture**，不冒充自然通关；上节另测自然关2胜利。
- 1920×1080、1366×768、1280×720等比布局。额外逐一检查13张地图：故事标题与阵营分数不重叠，提示/准备期不遮建筑标签，全部兵力数字在HUD之上；最低数字下沿777，HUD起点792。
- 强化己方/敌方/中立文字标签和旗帜区分，文字以双分辨率纹理渲染；四帧虫族图标正确截单帧。
- 主代理读取菜单、纪事、战役、关2战斗/自然胜利及关5/8/13布局截图复核。十张SVG通过XML、尺寸、本地引用、真实浏览器解码及四帧边缘透明验证。
- 合成压力场景49批行军、实际1000个昆虫精灵，当次采样 **79.75 FPS**。这是本机无头Edge短时采样，不是低端GPU或长期帧率承诺；表现上限不截断逻辑兵力。
- 页面异常、资源缺失、运行时站外请求均 **0**。

视觉方向与原创剧情见 [世界观总纲](world-and-art-direction.md)；[菜单](screenshots/menu.png) · [纪事](screenshots/lore.png) · [战役](screenshots/campaign.png) · [最终地图](screenshots/final-map.png) · [资产接触表](screenshots/art-sheet.png)。

## 4. 音频真实解码与输出

四首OGG及八个WAV音效共12个逻辑声音在跨重载会话中实际成功解码；菜单/战斗各48秒循环，胜败各16秒、不循环。四曲压缩版共1,537,260字节，WAV母带保留；不是删声部或空音频。

- 手势前AudioContext为suspended、没有活动音乐；真实点击后running。
- 强制返回不可解码OGG，实际成功加载WAV，`fallbackFiles`诚实记录，整体失败列表为空；单测另覆盖HTTP缺失回退。
- 压缩器后AnalyserNode实测：播放RMS **.14235**；静音RMS/peak **0**；恢复并叠加7种音效后RMS **.18119**、peak **.53739**，本次没有削波。切歌交叉淡化后回到一个音乐源。
- 独立PCM检查12文件：44.1kHz/16-bit；音乐双声道峰值约.70795、RMS .13484–.16058，全部削波样本0、首尾差0。见 [audio-report.json](verification/audio-report.json)。
- 全部为离线算法作曲/合成，没有原作或第三方录音采样。**没有耳机/扬声器人工试听，不能声称专业混音、乐器真实性或主观无缝认证。** 首尾差0也不能单独证明主观无接缝。详见 [音频文档](audio.md)。

## 5. 原生Windows离线包

[offline-report.json](verification/offline-report.json) 使用 `Start-Game.ps1` 原生TCP HTTP服务器，不是Node静态服务：实际Edge加载44个响应，鼠标派兵自然占领，10个当前流程声音成功解码（两首OGG、八个WAV），异常/缺失/外部请求均0。

本轮ZIP已实际解压至 `release/解压 验证/`（中文及空格），从**包内**PowerShell启动并完成相同占领/音频检查：44响应、异常/缺失/外部请求均0，见 [offline-release-report.json](verification/offline-release-report.json)。OGG MIME为audio/ogg。运行游戏无需Node、Python或网络；它们只用于开发和自动验收。

离线包 `release/BugWar-VerdantCrown-Windows.zip` 包含dist、启动脚本、README、许可、文档与精选证据，不包含 `docs/reference` 第三方原作研究图。双击 `Start-Game.cmd`，不要直接打开file://页面。相同端口/浏览器保留同一本地存档。

## 6. 正式Pages验收

本轮游戏代码尚待推送部署；完成后更新此节及 [online-report.json](verification/online-report.json)。当前文件中的旧版线上快照不是本轮代码的部署证明。

正式地址：**https://funct1ons.github.io/BugWar/**。线上脚本不带测试参数，验证HTTPS资源、无调试接口、自然行军占领、暂停恢复，并核对远程JS与本地dist的SHA-256。

## 已知边界

- 未运行原版SWF；原版精确地图、数值、AI、技能及评级未知，本作是明确标注的原创重建。
- 未做13关人工连续通关、多人用户测试、数小时浸泡、手机/触屏、Firefox/Safari或所有显卡测试。
- 美术是原创程序绘制矢量，音频是原创算法作曲/合成，不冒充人类手绘、真实录音或专业听感验收。
- 本轮证据支持「前期容错提高且有可复现的低频胜利路径」，不保证每种打法都能获胜。
