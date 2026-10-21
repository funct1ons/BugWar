# 实施计划与协作契约

## 原则
以有来源的规则为基础。13关、Agile/Fast/Strong、Spawn/Cannon、无限驻军、1–5星、通关解锁种族、满能量A施法。禁止声称未知数值为原版精确值。不添加巢穴升级或科技树等未经确认机制。

## 模块所有权
- 主代理：工程、src/main.ts、src/game/**、src/ui/**、src/style.css、src/data/**、src/storage/**、集成验收和文档。
- 核心代理：src/core/** 与 tests/core.test.ts，纯TS，无Phaser/DOM依赖。
- 美术代理：public/art/**、docs/art-direction.md，自制SVG，禁止编辑其它代码。
- 音频代理：public/audio/**、src/audio/AudioSystem.ts、scripts/generate-audio.*、docs/audio.md。
- 研究代理：docs/research-addendum.md、docs/reference/**。

## 画布/关卡
逻辑画面1600×900，战场有效区域 x=120..1480,y=210..740；顶部HUD 0..130、底部HUD 790..900。坐标均绝对逻辑像素。关卡13个，4类生境，布局各异。渲染Phaser，HTML覆盖层提供可访问的游戏UI。

## src/core/types.ts (核心代理实现并导出)
```ts
export type RaceId = 'agile' | 'fast' | 'strong';
export type BuildingKind = 'nest' | 'cannon';
export type Difficulty = 'easy' | 'normal' | 'hard';
export interface ColonyConfig { id:string; x:number; y:number; owner:number; kind:BuildingKind; units:number; production?:number }
export interface FactionConfig { id:number; race:RaceId }
export interface LevelConfig { id:number; name:string; subtitle:string; biome:'meadow'|'roots'|'marsh'|'amber'; par:number; factions:FactionConfig[]; colonies:ColonyConfig[]; tip:string }
export interface Colony extends ColonyConfig { production:number }
export interface Fleet { id:number; owner:number; race:RaceId; from:string; to:string; x:number; y:number; count:number; initialCount:number }
export interface GameEvent { type:'dispatch'|'impact'|'capture'|'shot'|'skill'|'end'; x:number; y:number; owner:number; targetX?:number; targetY?:number; amount?:number }
export interface World { elapsed:number; colonies:Colony[]; fleets:Fleet[]; factions:FactionConfig[]; energy:Record<number,number>; status:'playing'|'won'|'lost'; stats:{sent:number; kills:number; captures:number; lost:number; skills:number}; events:GameEvent[] }
export const RACES: Record<RaceId,{name:string;speed:number;attack:number;defense:number;production:number}>;
```

## src/core/Simulation.ts (核心代理)
```ts
export class Simulation {
  world: World;
  constructor(level:LevelConfig, race:RaceId='agile', difficulty:Difficulty='normal');
  step(dt:number):void; // seconds; fixed substeps, bounds finite values
  dispatch(sources:string[], target:string, ratio?:number, owner?:number):number; // default conservative 0.5, sends integer >=1; return sent
  castSkill(owner:number,x:number,y:number):boolean; // full100 charge area attack, conservative reconstruction
  drainEvents():GameEvent[];
}
export function rateVictory(time:number,lost:number,par:number):number; //1..5
```
World events only consumed with drainEvents; AI deterministic utility with incoming projections, reserve, coordinated attacks; cannot cheat resources. Cannon nonproducing, range fire at enemy marching fleets. Fleet counts logical separate from bounded sprite representation. Movement no mid-path retarget (unsupported). Battle weighted attrition on arrival; race attributes meaningful. Victory after all hostile colonies+fleets eliminated; neutral need not captured. Defeat player colonies+fleets eliminated. Player1. Factions2–4 AI.

## 美术资源契约
所有SVG viewBox,无外部资源/字体依赖。
- background-meadow.svg/background-roots.svg/background-marsh.svg/background-amber.svg：1600×900精致自然地表，四周环境框景，中间战场可读。
- nest.svg/cannon.svg：160×160原生细腻多层结构，暖中性(可叠阵营色环)。建筑形态不是圆节点。
- bug-agile.svg/bug-fast.svg/bug-strong.svg：96×128 spritesheet，4行走帧横向（每帧24×32，实际总96×32亦可，需在美术文档精确说明）。朝上，可旋转，清楚腿/触角/翅甲。
- emblem.svg：256×256封面昆虫徽章。
主代理使用自制图形动态叠加旗帜、光、血条、行军步态、粉尘等。

## AudioSystem (音频代理)
默认导出或具名导出 class AudioSystem，具名优先：
```ts
export interface AudioSettings { master:number; music:number; sfx:number; muted:boolean }
export class AudioSystem {
 settings:AudioSettings;
 constructor(settings?:Partial<AudioSettings>);
 unlock():Promise<void>; //首次交互创建/恢复context
 music(track:'menu'|'battle'|'victory'|'defeat'):void;
 play(name:'hover'|'click'|'select'|'dispatch'|'march'|'impact'|'capture'|'skill'|'victory'|'defeat'):void;
 configure(settings:Partial<AudioSettings>):void;
 dispose():void;
}
```
真实本地WAV，不依赖运行时网络。音乐不应只有简单正弦，使用多声部、节奏、合成音色与自然噪声，峰值控制、循环过渡。WebAudio限流。资源路径import.meta.env.BASE_URL。

## 交付阶段
1. 研究证据→2.架构与并行模块→3.核心/AI+13关+成长→4.绘制与音乐→5.浏览器操作/视觉/音频/性能验收→6.离线静态包和Windows启动脚本。
