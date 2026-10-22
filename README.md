# 虫界战争 · 翡翠王冠

**[在线试玩](https://funct1ons.github.io/BugWar/)** · [GitHub 仓库](https://github.com/funct1ons/BugWar) · [问题反馈](https://github.com/funct1ons/BugWar/issues) · [贡献与 PR 规范](CONTRIBUTING.md)

研究驱动的 **Bug War 2 非官方单机重制**。TypeScript + Phaser 3 + Vite，无后端、账户或运行时 CDN。13 张原创重建战场、3 个虫族、生产巢与防御炮塔、多阵营策略 AI、区域魔法、五星评级、12 项成就和自动存档。

> 不是声称精确复原的原版发行版。可确认的玩法框架优先保留；原作地图、数值、魔法效果和AI内部规则未能核实，均明确标为保守重建。详见 [原版机制研究](docs/original-game-analysis.md)。未提取原作素材。

## 日光花园：统一视觉更新

> 本轮改版仅作本地提交，尚未推送发布；上方在线地址仍为上一次Pages构建。以下截图与验收报告对应本地新版。

暴雨冲断根网，十三座守望巢失去灯火。你带领苔翅行旅，携最后一枚种核穿过四片林地。**翡翠王冠不是帝王的冠冕，而是重新照亮归途的灯环。** 主菜单的「林地纪事」可随时阅读、关闭；这是本重制版的原创故事，不是原作剧情。

- **封面正式实装**：采用已确认的自然虫族原创插画，蓝轻装前锋与红重甲守卫在雨后花园交锋；左侧保留清楚的真实操作。封面角色不是新增英雄玩法。
- **整个游戏统一明亮风格**：四种地貌、花瓣种荚巢、炮塔、三族四帧虫兵、徽章、菜单与HUD共同改绘。己方蓝／敌方红等大块屋顶和甲壳配色，加上形状标记、浅底深字兵力牌，不再只靠小旗和细环辨敌我。
- **玩法与进度不变**：保留此前标准难度的准备期与双巢第二关，未再次调整AI、地图数值、技能或评分；存档键和版本不变。
- **配乐另行全面升级**：真实管弦采样与原创编配，菜单、四幕、终章和胜败共8个主题；五套战斗主题各有平稳／交锋／高潮三层，按局势在小节边界混合。详见下节。
- **旧存档保留**：不需要清空进度；在同一地址刷新即可使用新版。如仍显示旧美术，可按Ctrl+F5强制刷新，不会清除存档。

[![日光花园 · 自然虫族主菜单](docs/screenshots/menu.png)](docs/screenshots/menu.png)

故事与制作方向见 [世界观与视听总纲](docs/world-and-art-direction.md)，难度新旧对比见 [标准前期平衡 v2](docs/balance-v2.md)。

## Windows 最简单启动

**当前工作目录已经构建过 `dist/`，或者下载了离线包：**

1. 双击 **`Start-Game.cmd`**。
2. 浏览器自动打开 `http://127.0.0.1:4173/`。
3. 保持命令窗口开启。退出时关闭该窗口或按 Ctrl+C。

此方式使用 Windows 自带 PowerShell 5.1 和本机环回 HTTP 服务，**不需要 Node.js、Python、管理员权限或网络**。不要直接双击 `dist/index.html`（浏览器对 `file://` 模块及音频有限制）。首次点击界面后音乐启动。

PowerShell 手动启动：

```powershell
Set-Location C:\files\code\BugWar
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Start-Game.ps1
# 若4173被占用：
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Start-Game.ps1 -Port 4174
```

服务器只监听 `127.0.0.1`，不向局域网开放。固定端口可保留同一浏览器下的存档；更换端口/浏览器会使用不同的 localStorage。

## 源码安装、运行、构建

首次开发安装需要 Node.js **22.12+ 或 24+** 和网络；推荐 Node 24 LTS。后续运行与已构建成品均离线。

```powershell
Set-Location C:\files\code\BugWar
npm.cmd install
npm.cmd run dev
# 浏览器打开终端显示的127.0.0.1地址

npm.cmd test
npm.cmd run build
npm.cmd run serve
# http://127.0.0.1:4173/
```

使用 `npm.cmd` 可避开部分 Windows 环境对 npm.ps1 的执行策略限制。`package-lock.json` 锁定依赖；CI可用 `npm.cmd ci`。

生成可复制给其他 Windows 电脑的完整离线 ZIP：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\package-release.ps1
# release\BugWar-VerdantCrown-Windows.zip
```

解压后双击 `Start-Game.cmd` 即可。运行时资源全部位于 `dist/`。也可部署到任意静态HTTP站点（含子目录），无需服务端逻辑。

## GitHub 部署与协作

GitHub Pages 游玩地址：**https://funct1ons.github.io/BugWar/**，直接用桌面浏览器打开即可，无需安装。首次点击后启用音乐；进度保存在当前浏览器，本地版和在线版的存档不互通。

`.github/workflows/pages.yml` 使用 Node.js 24，先执行 `npm ci`、回归测试和生产构建，再把 `dist/` 发布到 GitHub Pages。推送/合并到 `main` 或手动执行工作流会发布；PR 只测试和构建，不会覆盖线上游戏。不需要额外部署密钥，发布权限只授予部署任务。

Fork 后自行部署时，在仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**，再推送 `main` 或手动运行工作流。Vite 已使用相对资源路径，可部署到仓库子目录。

发布后可在装有 Edge 的本机运行 `npm run test:online`，验证正式 URL 的资源、鼠标派兵占领与已发布 JS 哈希；默认不打开调试接口。检查其他部署地址时设置 `GAME_URL` 环境变量。报告写入 `test-results/online-report.json`。

报告问题、玩法建议或文档改进请使用 [Issue 模板](https://github.com/funct1ons/BugWar/issues/new/choose)；提交修改请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)，PR 会自动带出验证与兼容性检查模板。

## 操作

|操作|作用|
|---|---|
|点击己方蓝巢，再点目标|派兵攻击中立/敌方，或增援友方|
|从己方巢拖向目标|直接派遣；已多选时可联合出兵|
|空地拖框|多选己方建筑|
|Shift + 点击|追加/移除选择|
|空格|全选己方建筑|
|底部25 / 50 / 75 / 100%|派遣比例，默认50%|
|A / 点击技能|满能量后选择区域施放孢子风暴|
|右键 / Esc|取消施法/选择；Esc也可暂停|
|P|暂停/继续|
|M|静音/恢复|

目标：消灭所有敌方建筑与**在途军队**，不必占完所有中立建筑。己方在途军队尚存时，即使最后虫巢丢失也不会立即判负。

生产巢持续增长，无玩法人口上限；炮塔不生产，但会射击范围内敌军。行军不能中途撤回或改道。蓝色为玩家，红/紫/金为互相敌对的电脑；中立为灰绿，另有归属文字与形状标记辅助辨识。道路上双方虫群不互相拦截，到建筑结算交战；炮塔可以截击。

种族：敏捷族均衡；疾行族快但较弱；重甲族慢但强韧。首次只开放敏捷族，完成其13关解锁另两族。星级参考时间与失守建筑次数，保留各族各关最好成绩；累计成就按胜利结算统计。

技能具体效果（重建）：每秒2能量，100满条；半径135内每个敌方驻军/行军批次最多损失18，友方安全，不能直接改变归属。

## 音乐、美术与设置

四幕故事贯穿晨露草甸、幽根林地、萤火湿地与琥珀荒庭，画面统一为雨后初晴。正式资源共36张原创SVG，包含封面、四幕场景、花瓣种荚巢、鸣炮、三族六肢四帧虫兵与种核守望环。建筑屋顶／炮壳及虫兵甲壳使用独立阵营配色纹理，木石／眼睛／关节保留材质，不把整张纹理染色。制作与再生见 [美术文档](docs/art-direction.md)。

**配乐不再使用旧版简易电子音合成。** 新配乐使用合法真实管弦采样离线制作：菜单《巢灯与远方》、草甸／根林／湿地／琥珀四幕主题、13关专属终章，以及胜利和失败收束，共8个核心主题。循环曲为48小节、约96–125秒；胜败为8小节、约18–25秒。

五套战斗主题各有同步的基础、推进、高潮三层。只读音乐导演依据兵力变化、来袭、失守与持续交战，平滑、防抖后请求强度变化；播放引擎在下一小节切换声部，暂停压低配乐，结算优先接管。不会改变战斗难度或数值。八个现有操作音效保持原样。

18份音乐分轨各提供同源OGG和MP3回退，全部随离线包分发；不调用运行时音乐服务、不预载全部战役曲目。按当前章节释放旧音乐缓存，主音量／音乐／音效／静音及旧存档继续兼容。制作方法、采样授权、自动验收与听感局限见 [音频文档](docs/audio.md)、[素材许可](ASSET-LICENSES.md)。

针对16:9 PC屏幕设计，1920×1080最佳，常见笔记本分辨率等比缩放；其他宽高比留边，不裁切战场。设置支持减少环境动画。

## 架构

```text
src/core/             纯逻辑、种族、固定步模拟、交战、技能、效用AI
src/data/            13关布局、准备期、教学与原创四幕故事
src/game/            Phaser表现、虫群、输入、选区、特效
src/audio/           Web Audio解码/音乐/限流音效
src/storage/         版本化校验存档、最佳成绩、成就
src/main.ts          菜单/战役/战斗HUD/设置/结算整合
src/ui/              兵力显示等纯界面格式工具
public/art/          原创封面、场景、五阵营建筑／虫兵变体与徽章
public/audio/        OGG/MP3管弦分轨、八个WAV音效、编配清单及采样许可
scripts/             离线配乐渲染、浏览器测试、构建许可、离线服务和打包
```

逻辑步长0.05秒，界面帧率独立。逻辑部队为带数量的行军批次，表现每批最多36只可辨识虫兵、全场最多1000只，数量并未因此丢失或截断。没有单位等级、建筑升级、科技树、联网或随机遭遇战等未经确认的扩展。

## 测试

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run test:browser
npm.cmd run test:offline
npm.cmd run test:playthrough
npm.cmd run test:onboarding
npm.cmd run test:art
npm.cmd run test:visual
npm.cmd run test:score
# 线上站点已部署且联网时：
npm.cmd run test:online
# PCM音效及压缩配乐文件清单校验（需要Python，仅开发验收用）：
python scripts/check-audio.py
```

保留195场全战役对战与前3关18组低频操作回归：先等待8–12秒、每3–4秒最多一个单巢指令，不调用高强度规划器、不用技能。另有真实Edge的首关和低频标准第二关驾驶器，及正式SVG解码／步态帧边界、全部13关HUD布局、三尺寸、多阵营纹理切换检查。本轮实际测试数量、自然胜利时间、合成fixture与局限见 [测试报告](docs/test-report.md)；这些是脚本证据，不是人类胜率，也不宣称13关人工通关。实机预览：[菜单](docs/screenshots/menu.png) · [战斗](docs/screenshots/battle.png) · [战役地图](docs/screenshots/campaign.png)。

浏览器测试使用本机 Edge，默认路径 `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`；可设置 `$env:EDGE_PATH` 指向兼容Chromium。本地验收脚本自行启动/关闭临时服务；`test:online` 直接访问已部署站点。产出 `test-results/*.png` 和JSON。测试钩子仅在 `?test=1` 开启。

验收证据、局限与实际结果见 [测试报告](docs/test-report.md)、[本轮难度对比](docs/balance-v2.md)、[历史战役平衡](docs/balance-report.md)、[核心参数](docs/core-rules.md)。自动战役对战不等同真人通关；浏览器结算场景的合成fixture会与真实鼠标交互测试分别标明。

## 已知边界

- 13关坐标、敌初兵、种族倍率、战斗/评分公式、技能效果为重建，不宣称原版精确数值。
- 未成功运行原版或抓取全流程视频，证据主要为作者说明和2010同期评测。
- 没有地形阻挡/路径寻路；装饰水面与根须不影响行军。
- 配乐为真实管弦采样驱动的程序编曲，不是现场乐团录音；自动解码、混音与调度验收不等于人工主观试听或专业作曲／混音认可，不宣称达到商业电影配乐水准。
- localStorage被浏览器隐私策略禁用时，只能保留本次会话进度；结果界面会提示。
- 当前版本面向鼠标PC，未专门适配触屏/手机。

Bug War 2 原作者权利不变。本项目为非官方致敬，没有关联或背书主张；商业发布前需额外审查名称与权利。
