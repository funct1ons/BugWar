# 素材来源与许可

## 成品原创资源

- `public/art/*.svg`：本项目原创矢量曲线／程序绘制的自然虫族封面、四幕背景、五阵营巢穴与炮塔、三族四帧虫兵及徽章，不包含原版提取素材或第三方商业角色。正式封面由已确认的原创样张提升；生成器为 `scripts/generate-cover.cjs`，其余为 `public/art/generate_art.py`。没有复用素材检索中的作者作品，也没有调用图像生成接口。来源、尺寸与方法见 `docs/art-direction.md`。
- `public/audio/*.wav`、`*.ogg`：本项目原创算法作曲/离线合成，OGG由WAV母带编码，无外部采样或第三方录音，不模仿原作旋律；生成脚本在 `scripts/`，编配清单为 `public/audio/score-manifest.json`，参数与测量见 `docs/audio.md`。
- 关卡地图、中文文本、UI、粒子与战斗效果：本项目原创。「雨后灯火」四幕剧情、巢灯与种核设定为本重制版新增，不声称来自原作。
- 字体：调用操作系统已安装的 Microsoft YaHei / PingFang / SimSun / Songti SC / Georgia 等字体，没有分发字体文件。

原创WAV、OGG衍生音频及其合成脚本另按CC0-1.0 / public-domain dedication提供；详见脚本头和 `docs/audio.md`。这不包含第三方软件与原版研究截图。

本项目的原创美术与音频允许项目所有者在本项目及其修改版中使用、修改和分发。这里不为 Bug War 2 原作名称、商标、玩法表达或第三方库授予任何权利。对外商业发布前应另行审查名称与法律风险。

## 第三方软件

- Phaser 3 — MIT，https://github.com/phaserjs/phaser ，完整许可在 `node_modules/phaser/LICENSE.md`；构建时复制至 `dist/licenses/`。
- Vite — MIT；TypeScript — Apache-2.0；Vitest — MIT；Playwright — Apache-2.0。仅开发依赖，不从运行时网络加载。
- 可选音频再生工具：NumPy（BSD-3-Clause）、SoundFile（BSD-3-Clause）、libsndfile（LGPL-2.1-or-later）；不随成品分发这些工具或其二进制，游戏运行无需安装。

## 仅研究材料（不是成品素材）

`docs/reference/maxgames-*.jpg` 来自 MaxGames 的 Bug War 2 介绍页，版权归各自权利人；仅用于原版机制研究与评论，不放入 `public/` 或渲染代码。来源URL见 `docs/research-addendum.md`。不将这些图片声明为原创或CC0。

原版 Bug War 2 由 Rudy Sudarto / Artlogic 制作；发行平台包括 BubbleBox 等。该重制为非官方项目，无授权、合作或背书主张。
