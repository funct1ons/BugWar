# 日光花园 · 全游戏改版验收

执行日期：2026-10-22（本机时间）。**本轮仅本地提交，未推送、未发布到Pages。** 以下是本地新版的实际自动化验收与主代理截图复核，不是人工连续试玩或主观听音报告。

## 环境与复现

Windows / PowerShell 5.1、Node 24.14.1、系统Edge 155.0.4283.62；默认自动播放策略，无绕过参数。

```powershell
npm.cmd test -- --reporter=default --reporter=json --outputFile.json=test-results/unit-report.json
npm.cmd run build
npm.cmd run test:art
npm.cmd run test:visual
npm.cmd run test:browser
npm.cmd run test:onboarding
npm.cmd run test:playthrough
python scripts/check-audio.py
npm.cmd run test:offline
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/package-release.ps1
# 实际解压ZIP后，将OFFLINE_ROOT设为解压根目录，再运行test:offline。
# 普通URL冒烟：先启动本地生产服务，再将GAME_URL设为该地址：
# $env:PORT='4182'; npm.cmd run serve
# 另一个终端：$env:GAME_URL='http://127.0.0.1:4182/'; npm.cmd run test:online
```

正式机器证据在 [verification/](verification/)，精选成品截图在 [screenshots/](screenshots/)。测试会重新生成gitignored的 `test-results/`；本次交付前已删除临时运行目录及设计预览。仅 `?test=1` 提供开发测试接口，普通网址不提供。

## 1. 全游戏视觉落地与范围

- 用户确认的第二次封面重绘已提升为正式 `public/art/cover.svg`，菜单直接使用它，不再保留人形骑士版或暗色封面。
- 菜单、四幕纪事、战役图、设置/帮助/成就/制作说明、胜败结算、战场HUD、选区、路线与反馈统一为暖白、浅绿、天蓝的日光花园。
- 四幕全部重绘；**36张正式SVG**：1封面、4背景、10阵营建筑、15阵营虫兵表、5兼容别名、1徽记。每张虫兵表含四个24×32帧。
- 己方湖蓝，敌方珊瑚红/紫/金，中立灰绿；大屋顶/甲壳使用阵营色，木石和虫腿保留材料本色，不再全图染色。数字牌另有形状与己方/敌方/中立文字，不能只靠颜色判断。
- 两个正式生成器再生前后36文件逐字节一致；封面SHA-256为 `6abc652dedcea92021a66fa02f1fb1728ac30647a216eec9ec49f988d8e7942a`。无临时目录、第三方图片或网络资源依赖。程序原创矢量，不冒充人类手绘或新增装备系统。
- [input-scope-report.json](verification/input-scope-report.json) 确认核心、AI、存储、音频、剧情数据及音频文件与基线无修改；七个输入/派兵方法去空白注释后token完全一致。关卡文件唯一变化是首关提示「点击绿巢」改为「点击蓝巢」，布局、初兵与规则未变。存档键及version1不变。

## 2. 构建、逻辑与资产

- TypeScript严格检查和Vite生产构建通过。**7文件、195项单测通过、0失败、1项按需扫描跳过**，其中105项为美术回归。唯一跳过项是额外初兵搜索 `CAMPAIGN_SCAN`，不是跳过关卡矩阵。见 [unit-summary.json](verification/unit-summary.json)、[unit-report.json](verification/unit-report.json)。
- 独立于上述单测计数，13关×3难度×5策略的**195场逻辑对战**全部重跑，结果逐项等于此前 [campaign-v2-report.json](verification/campaign-v2-report.json)。easy/normal每关仍至少有一种Agile策略获胜；13个策略/难度组合在600模拟秒仍未终局，不保证所有打法或hard获胜。
- 前3关18组低频策略仍18/18胜，第二关6/6；这不是18名人类测试者。平衡规则没有在本次美术改版中调整，历史变化与边界见 [balance-v2.md](balance-v2.md)。
- `test:art` 用真实Edge解码全部36SVG：尺寸正确，18张虫兵表的四帧均非空、边缘透明，默认别名与对应阵营图像像素一致。XML、内链、封面哈希及阵营有效色面另有单测。
- 本地构建文件及SHA-256见 [build-verification.json](verification/build-verification.json)；Vite保留Phaser大包提示，未将其伪称为小体积构建。

## 3. 实际浏览器、视觉与自然通关

[visual-report.json](verification/visual-report.json) **122/122检查通过**，覆盖1920×1080、1366×768、1280×720及25次截图：

- 正式封面请求和可见绘制、菜单/四幕/13关地图、全部弹窗、单帧虫族图标裁剪、胜败面板。
- 逐关检查13个战场：标题/分数不重叠，提示/准备期不遮建筑标签，数字牌在HUD之上。最低数字下沿776，HUD上沿792。
- 多阵营三种虫族的实际fleet与可见sprite纹理逐一对应；捕获后建筑纹理、阵营形状、标签同步；极端兵数仍在数字牌内。
- 多阵营展示、连续捕获、极端数字、通用终局与压力场景使用明确标注的**合成fixture**；展示图暂停并将行军放到路径中点，不是实际行军时间证据。
- page/console异常、HTTP失败、网络失败、运行时站外请求均0。

[browser-report.json](verification/browser-report.json) 通用交互全部通过：真实鼠标派兵自然占领、框选/多选/比例、A施法、P暂停、Esc先取消再暂停、暂停取消拖拽、重试/下一关、旧成绩与设置重载、localStorage拒绝降级、失败后改悠闲重试。合成压力场景49批、1000个昆虫精灵，本次短时采样 **77.56 FPS**；这是本机无头Edge采样，不是低端设备或长期帧率保证，表现上限不截断逻辑兵力。

另行验证真实时间、真实UI的自然胜利，均不写世界状态：

- [关2低频报告](verification/onboarding-browser-report.json)：normal、Agile；等待12秒，每4秒最多一个单巢命令，第3时隙跳过，不用技能或多选。**80.15模拟秒获胜，16令，失守2次**；保存后关3解锁。仅预置关1已完成以解锁本关，不注入本关资源、时间或胜负。
- [首关报告](verification/playthrough-report.json)：较强的可见状态UI驾驶器，**40.30模拟秒获胜，6令，失守0，不施法**。它证明自然胜利/保存链路，不代替新手平衡证据。
- 真实输入时序可造成轨迹小幅变化；上述结果不是人类胜率。

主代理直接读取并复核了菜单、关卡图、帮助、纪事、四幕战场、多阵营、1280小屏及自然胜利截图，不只依赖机器断言。精选：[菜单](screenshots/menu.png) · [纪事](screenshots/lore.png) · [战役](screenshots/campaign.png) · [自然关2战斗](screenshots/battle.png) · [自然胜利](screenshots/victory.png) · [幽根](screenshots/roots.png) · [湿地](screenshots/marsh.png) · [琥珀最终图](screenshots/final-map.png) · [多阵营fixture](screenshots/multi-faction.png) · [1280战场](screenshots/battle-1280.png) · [资产接触表](screenshots/art-sheet.png)。

## 4. 音频与存档保持

- 四首OGG、八个WAV音效在跨重载会话中全部实际解码。菜单/战斗各48秒循环，胜败各16秒不循环；WAV母带保留，音频资源未改。
- 手势前Context suspended、无活动音乐；点击后running。强制不可解码OGG后真实回退WAV，失败/回退记录诚实区分；淡化结束回到单音乐源。
- 压缩器后分析器实测播放与恢复RMS非零，静音RMS/peak均0；本次恢复并叠加音效peak约.670。会话内已解码总数受异步菜单切换影响，验收按实际曲目与跨会话12声覆盖，不假定每次都恰好11个。
- [audio-report.json](verification/audio-report.json)：12份PCM均44.1kHz/16-bit；音乐双声道峰值约.708、RMS .135–.161，削波样本0、首尾差0。
- 没有耳机/扬声器人工试听，不能声称专业混音、真实乐器或主观无缝认证。首尾差0也不能单独证明主观无接缝。详见 [audio.md](audio.md)。

## 5. 原生Windows离线包与普通URL

- [offline-report.json](verification/offline-report.json) 使用 `Start-Game.ps1` 原生PowerShell TCP HTTP服务，不是Node替代服务。实际Edge加载95响应、鼠标派兵自然占领、10个当前流程声音解码；异常、缺失、站外请求均0。
- ZIP已实际解压至含中文和空格的 `release/日光花园 解压验证/`，从**包内**启动脚本完成同样检查：95响应、自然占领、10声解码、全部错误0，见 [offline-release-report.json](verification/offline-release-report.json)。最终更新文档证据后重打包，游戏文件与已实测内容逐文件校验一致。
- `release/BugWar-VerdantCrown-Windows.zip` 包含游戏、启动器、许可、文档及精选证据，不包含第三方研究图 `docs/reference`。双击 `Start-Game.cmd`；不要直接打开file://页面。运行不需Node、Python或网络；相同端口/浏览器保留原本地存档。
- [production-smoke-report.json](verification/production-smoke-report.json) 是**本地HTTP普通生产URL**，不是公开Pages：无 `__BUGWAR__`、四幕/初始锁关正常、实际鼠标自然占领、暂停/恢复及声音加载通过。页面自身加载的JS与本地生产构建SHA-256相同：`21f8127f9f5e7ab3026ce9e09c87c3411b82c33217ba00cc5991b92fd9ae86d9`。异常/失败/外请求0。

## 6. 发布状态与历史证据

**本轮没有push或Pages部署。** https://funct1ons.github.io/BugWar/ 仍是此前游戏提交 `67b3a91` 的发布，不是本次日光花园新版。

保留的 [online-report.json](verification/online-report.json) 仅是上次正式站点历史证据：旧 `index-ByE338w_.js`，SHA-256 `37f4294613239d7c424529bee82fbbab390aa4cd120c02a0c5e7148885c0a173`。不得把它当作本轮上线成功证明。之后明确授权推送、部署完成后，才应对正式站运行新版 `test:online`。

## 已知边界

- 未运行原版SWF；原作精确地图、数值、AI、技能及评级未知，本作是明确标注的原创重建。
- 未做13关人工连续通关、多人测试、数小时浸泡、手机/触屏、Firefox/Safari或所有显卡测试。
- 原创程序矢量与算法音频，不冒充专业人类画师手绘、真实录音或人工听感验收；插画武器不是新增玩法。
- 自动化证明可复现路径和已覆盖的回归，不保证每种策略必胜或任何设备恒定帧率。
