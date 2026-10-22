# 实施计划与协作契约

## 原则
以有来源的规则为基础。13关、Agile/Fast/Strong、Spawn/Cannon、无限驻军、1–5星、通关解锁种族、满能量A施法。禁止声称未知数值为原版精确值。不添加巢穴升级或科技树等未经确认机制。

## 模块所有权
本轮日光花园迁移按互斥文件分工：主代理负责调度、整合、文档、实机质量检查、清理与提交；资源代理负责 `public/art/**` 与正式封面生成器；界面代理负责 `src/main.ts`／`src/style.css`；场景代理负责 `src/game/BattleScene.ts`；独立验收工具代理负责美术单测与资源／视觉检查脚本。核心、关卡、存档、音频模块冻结，不因改美术更改玩法。

## 画布/关卡
逻辑画面1600×900，战役建筑中心 x=210..1400,y=230..710；顶部HUD y=20..138、底部HUD y=792..888。提示单行位于y140，最下兵力数字下沿777，不遮挡建筑。坐标均绝对逻辑像素。关卡13个，4类生境，布局各异。渲染Phaser，HTML覆盖层提供可访问的游戏UI。

## src/core/types.ts (核心代理实现并导出)
```ts
export type RaceId = 'agile' | 'fast' | 'strong';
export type BuildingKind = 'nest' | 'cannon';
export type Difficulty = 'easy' | 'normal' | 'hard';
export interface ColonyConfig { id:string; x:number; y:number; owner:number; kind:BuildingKind; units:number; production?:number }
export interface FactionConfig { id:number; race:RaceId }
export interface LevelConfig { id:number; name:string; subtitle:string; biome:'meadow'|'roots'|'marsh'|'amber'; par:number; factions:FactionConfig[]; colonies:ColonyConfig[]; tip:string; openingGrace?:Partial<Record<Difficulty,number>> }
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
  readonly openingGrace: number; // seconds, 0 if not configured
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
全部SVG自含viewBox，无外部资源／字体／脚本依赖，正式共36张。
- `cover.svg`：1600×900，已确认自然虫族插画，由DOM菜单显示；Phaser菜单背景使用明亮草甸，不叠旧徽章或暗虫。
- 四张 `background-{meadow,roots,marsh,amber}.svg`：1600×900，明亮自然地表，边缘框景，中央可读。
- `nest-{0..4}.svg`／`cannon-{0..4}.svg`：160×160，按所有者独立绘制主要色面。默认 `nest.svg`／`cannon.svg` 对应中立0。
- `bug-{agile,fast,strong}-{0..4}.svg`：96×32 spritesheet，四帧横排、每帧24×32、朝上。默认三张不带所有者后缀的虫兵对应蓝方1，UI只裁单帧。
- `emblem.svg`：256×256种核甲虫与十三灯环。
- 所有者色：0中立`#92A18B`、1蓝`#327FC1`、2红`#C85F48`、3紫`#8B70BA`、4金`#C49336`；文字与不同形状同时编码。捕获时切换纹理，不以全图tint代替材质。

表现层负责浅底深字数字牌、蓝选区／路线、行军步态及占领／技能／炮击效果。资源再生不依赖临时设计目录，详见 `art-direction.md`。

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
真实同源OGG配乐（失败回退WAV）与WAV音效，不依赖运行时CDN或外部请求。音乐不应只有简单正弦，使用多声部、节奏、合成音色与自然噪声，峰值控制、循环过渡。WebAudio限流。资源路径import.meta.env.BASE_URL。

## 交付阶段
1. 研究证据→2.架构与并行模块→3.核心/AI+13关+成长→4.绘制与音乐→5.浏览器操作/视觉/音频/性能验收→6.离线静态包和Windows启动脚本。
