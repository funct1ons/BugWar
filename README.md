# 虫界战争 · 翡翠王冠

**[在线试玩](https://funct1ons.github.io/BugWar/)** · [GitHub 仓库](https://github.com/funct1ons/BugWar) · [问题反馈](https://github.com/funct1ons/BugWar/issues) · [贡献与 PR 规范](CONTRIBUTING.md)

研究驱动的 **Bug War 2 非官方单机重制**。TypeScript + Phaser 3 + Vite，无后端、账户或运行时 CDN。13 张原创重建战场、3 个虫族、生产巢与防御炮塔、多阵营策略 AI、区域魔法、五星评级、12 项成就和自动存档。

> 不是声称精确复原的原版发行版。可确认的玩法框架优先保留；原作地图、数值、魔法效果和AI内部规则未能核实，均明确标为保守重建。详见 [原版机制研究](docs/original-game-analysis.md)。未提取原作素材。

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

报告问题、玩法建议或文档改进请使用 [Issue 模板](https://github.com/funct1ons/BugWar/issues/new/choose)；提交修改请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)，PR 会自动带出验证与兼容性检查模板。

## 操作

|操作|作用|
|---|---|
|点击己方绿巢，再点目标|派兵攻击中立/敌方，或增援友方|
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

生产巢持续增长，无玩法人口上限；炮塔不生产，但会射击范围内敌军。行军不能中途撤回或改道。绿色为玩家，橙红/紫/金为互相敌对的电脑。道路上双方虫群不互相拦截，到建筑结算交战；炮塔可以截击。

种族：敏捷族均衡；疾行族快但较弱；重甲族慢但强韧。首次只开放敏捷族，完成其13关解锁另两族。星级参考时间与失守建筑次数，保留各族各关最好成绩；累计成就按胜利结算统计。

技能具体效果（重建）：每秒2能量，100满条；半径135内每个敌方驻军/行军批次最多损失18，友方安全，不能直接改变归属。

## 音乐、美术与设置

原创分层自然场景、雕刻式虫巢与炮塔、六腿昆虫四帧行走动画、阵营旗帜、派兵路线、受击/占领/风暴反馈。四种生态：草甸、根林、湿地、琥珀荒庭。

本地完整 WAV 配乐和音效，通过 Web Audio 加载播放，不使用空音频或运行时网络合成服务。菜单与战斗音乐循环，胜败短曲、UI/派兵/行军/攻击/占领/施法音效完整。主音量、音乐、音效与静音独立保存；音效限流避免爆音。详细来源及生成测量见 [音频文档](docs/audio.md)、[素材许可](ASSET-LICENSES.md)。

针对16:9 PC屏幕设计，1920×1080最佳，常见笔记本分辨率等比缩放；其他宽高比留边，不裁切战场。设置支持减少环境动画。

## 架构

```text
src/core/             纯逻辑、种族、固定步模拟、交战、技能、效用AI
src/data/levels.ts   13关不同布局及教学
src/game/            Phaser表现、虫群、输入、选区、特效
src/audio/           Web Audio解码/音乐/限流音效
src/storage/         版本化校验存档、最佳成绩、成就
src/main.ts          菜单/战役/战斗HUD/设置/结算整合
src/ui/              兵力显示等纯界面格式工具
public/art/          原创SVG场景、建筑、动画、徽章
public/audio/        本地配乐与音效WAV
scripts/             合成、浏览器测试、构建许可、离线服务和打包
```

逻辑步长0.05秒，界面帧率独立。逻辑部队为带数量的行军批次，表现每批最多36只可辨识虫兵、全场最多1000只，数量并未因此丢失或截断。没有单位等级、建筑升级、科技树、联网或随机遭遇战等未经确认的扩展。

## 测试

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run test:browser
npm.cmd run test:offline
npm.cmd run test:playthrough
# 可选PCM资源校验（需要Python，仅开发验收用）：
python scripts/check-audio.py
```

当前交付：84项逻辑/存档/音频回归通过；浏览器交互、真实音频输出、Windows原生服务器通过。标准首关另以不改世界状态的真实UI驾驶器在23.2秒自然获胜；不宣称13关人工通关。实机预览：[菜单](docs/screenshots/menu.png) · [战斗](docs/screenshots/battle.png) · [战役地图](docs/screenshots/campaign.png)。

浏览器测试使用本机 Edge，默认路径 `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`；可设置 `$env:EDGE_PATH` 指向兼容Chromium。脚本自行启动/关闭临时本地服务，产出 `test-results/*.png` 和JSON。测试钩子仅在 `?test=1` 开启。

验收证据、局限与实际结果见 [测试报告](docs/test-report.md)、[战役平衡](docs/balance-report.md)、[核心参数](docs/core-rules.md)。自动战役对战不等同真人通关；浏览器结算场景的合成fixture会与真实鼠标交互测试分别标明。

## 已知边界

- 13关坐标、敌初兵、种族倍率、战斗/评分公式、技能效果为重建，不宣称原版精确数值。
- 未成功运行原版或抓取全流程视频，证据主要为作者说明和2010同期评测。
- 没有地形阻挡/路径寻路；装饰水面与根须不影响行军。
- 音乐为原创算法作曲、多声部采样合成，未经专业录音棚混音。
- localStorage被浏览器隐私策略禁用时，只能保留本次会话进度；结果界面会提示。
- 当前版本面向鼠标PC，未专门适配触屏/手机。

Bug War 2 原作者权利不变。本项目为非官方致敬，没有关联或背书主张；商业发布前需额外审查名称与权利。
