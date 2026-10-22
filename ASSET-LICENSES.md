# 素材来源与许可

## 成品原创资源

- `public/art/*.svg`：本项目原创矢量曲线／程序绘制的自然虫族封面、四幕背景、五阵营巢穴与炮塔、三族四帧虫兵及徽章，不包含原版提取素材或第三方商业角色。正式封面由已确认的原创样张提升；生成器为 `scripts/generate-cover.cjs`，其余为 `public/art/generate_art.py`。没有复用素材检索中的作者作品，也没有调用图像生成接口。来源、尺寸与方法见 `docs/art-direction.md`。
- `public/audio/music-*.ogg`、`*.mp3`：本项目原创程序编曲，使用 **Versilian Studios / Sam Gossner 的 VSCO 2 Community Edition** 真实管弦采样离线渲染，不是现场交响乐团录音，也不再是旧版简易电子合成。原始采样为 **CC0-1.0**；官方说明：https://versilian-studios.com/vsco-community/ ，源库：https://github.com/sgossner/VSCO-2-CE 。仅分发完成混音，不把整个采样库放进游戏。逐项来源、原始许可、版本与SHA见 `public/audio/SCORE-LICENSES.txt`、`score-manifest.json` 及 `docs/score-production.md`。
- `public/audio/sfx-*.wav`：八个既有原创程序合成操作音效，未改音色与字节，不含外部采样。历史生成器 `scripts/generate-audio.py` 保留复现来源，但已防止误覆盖新管弦配乐；当前音乐生成器为 `scripts/generate-score.py`。
- 关卡地图、中文文本、UI、粒子与战斗效果：本项目原创。「雨后灯火」四幕剧情、巢灯与种核设定为本重制版新增，不声称来自原作。
- 字体：调用操作系统已安装的 Microsoft YaHei / PingFang / SimSun / Songti SC / Georgia 等字体，没有分发字体文件。

原创配乐编曲、完成混音、八个原创音效及生成脚本按CC0-1.0 / public-domain dedication提供；原始VSCO Community采样沿用其CC0许可。这里没有把付费VSCO产品或其他商业音源包含进来。详见脚本头、随包采样许可及 `docs/audio.md`。这不包含第三方软件与原版研究截图。

本项目的原创美术与音频允许项目所有者在本项目及其修改版中使用、修改和分发。这里不为 Bug War 2 原作名称、商标、玩法表达或第三方库授予任何权利。对外商业发布前应另行审查名称与法律风险。

## 第三方软件

- Phaser 3 — MIT，https://github.com/phaserjs/phaser ，完整许可在 `node_modules/phaser/LICENSE.md`；构建时复制至 `dist/licenses/`。
- Vite — MIT；TypeScript — Apache-2.0；Vitest — MIT；Playwright — Apache-2.0。仅开发依赖，不从运行时网络加载。
- 可选音频再生工具：NumPy（BSD-3-Clause）、SciPy（BSD-3-Clause）、SoundFile（BSD-3-Clause）、libsndfile（LGPL-2.1-or-later）及FFmpeg（具体构建配置决定LGPL/GPL，开发时用于编码）；不随成品分发这些工具、编码器或原始采样库，游戏运行无需安装。制作环境与精确版本见 `docs/score-production.md`。

## 仅研究材料（不是成品素材）

`docs/reference/maxgames-*.jpg` 来自 MaxGames 的 Bug War 2 介绍页，版权归各自权利人；仅用于原版机制研究与评论，不放入 `public/` 或渲染代码。来源URL见 `docs/research-addendum.md`。不将这些图片声明为原创或CC0。

原版 Bug War 2 由 Rudy Sudarto / Artlogic 制作；发行平台包括 BubbleBox 等。该重制为非官方项目，无授权、合作或背书主张。
