# 实施计划与协作契约

## 原则
以有来源的规则为基础。13关、Agile/Fast/Strong、Spawn/Cannon、无限驻军、1–5星、通关解锁种族、满能量A施法。禁止声称未知数值为原版精确值。不添加巢穴升级或科技树等未经确认机制。

## 模块所有权
此前美术与交响配乐迁移已完成并发布。本轮道路／图鉴按互斥文件分工：核心代理负责道路合法性、单跳AI及共享规则常量；关卡代理负责13张手工路网与拓扑／几何测试；场景代理负责常显道路、相邻高亮与输入反馈；UI代理负责图鉴、真实路网缩略图、指南与暂停恢复；独立QA代理负责浏览器和低频驾驶器；主代理复核、整合、验收和离线交付。音乐引擎、音乐导演、音频文件、美术与存档格式保留，不再冻结需修正的道路规则和AI。

## 画布/关卡
逻辑画面1600×900，战役建筑中心 x=210..1400,y=230..710；顶部HUD y=20..138、底部HUD y=792..888。提示单行位于y140，最下兵力数字下沿777，不遮挡建筑。坐标均绝对逻辑像素。关卡13个，4类生境，布局各异。渲染Phaser，HTML覆盖层提供可访问的游戏UI。

## src/core/types.ts (核心代理实现并导出)
```ts
export type RaceId = 'agile' | 'fast' | 'strong';
export type BuildingKind = 'nest' | 'cannon';
export type Difficulty = 'easy' | 'normal' | 'hard';
export type Road = readonly [string,string];
export interface ColonyConfig { id:string; x:number; y:number; owner:number; kind:BuildingKind; units:number; production?:number }
export interface FactionConfig { id:number; race:RaceId }
export interface LevelConfig { id:number; name:string; subtitle:string; biome:'meadow'|'roots'|'marsh'|'amber'; par:number; factions:FactionConfig[]; colonies:ColonyConfig[]; roads:Road[]; tip:string; openingGrace?:Partial<Record<Difficulty,number>> }
export interface Colony extends ColonyConfig { production:number }
export interface Fleet { id:number; owner:number; race:RaceId; from:string; to:string; x:number; y:number; count:number; initialCount:number }
export interface GameEvent { type:'dispatch'|'impact'|'capture'|'shot'|'skill'|'end'; x:number; y:number; owner:number; targetX?:number; targetY?:number; amount?:number }
export interface World { elapsed:number; colonies:Colony[]; roads:Road[]; fleets:Fleet[]; factions:FactionConfig[]; energy:Record<number,number>; status:'playing'|'won'|'lost'; stats:{sent:number; kills:number; captures:number; lost:number; skills:number}; events:GameEvent[] }
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
`src/core/roads.ts` 的 `hasRoad(roads,from,to)` 为无向直接邻接判断。LevelConfig与World必须携带显式roads，Simulation复制关卡道路；不将缺少道路解释成任意直达。dispatch对每个来源分别检查道路，只有直接相邻、己方且有整数兵力的来源可以出兵。军队抵达后合流／交战，不自动产生下一跳。

World events only consumed with drainEvents; AI deterministic utility with incoming projections, reserve, coordinated attacks; cannot cheat resources. AI攻击、防守及后方补给均只从直接相邻来源派兵。地图拓扑可用于选择手动下令的下一跳，但不是给在途军队自动寻路。`src/core/rules.ts` 的 `BATTLE_RULES` 是模拟与图鉴共用的生产／炮塔／技能常量，种族继续读取RACES。 Cannon nonproducing, range fire at enemy marching fleets. Fleet counts logical separate from bounded sprite representation. Movement no mid-path retarget (unsupported). Battle weighted attrition on arrival; race attributes meaningful. Victory after all hostile colonies+fleets eliminated; neutral need not captured. Defeat player colonies+fleets eliminated. Player1. Factions2–4 AI.

## 美术资源契约
全部SVG自含viewBox，无外部资源／字体／脚本依赖，正式共36张。
- `cover.svg`：1600×900，已确认自然虫族插画，由DOM菜单显示；Phaser菜单背景使用明亮草甸，不叠旧徽章或暗虫。
- 四张 `background-{meadow,roots,marsh,amber}.svg`：1600×900，明亮自然地表，边缘框景，中央可读。
- `nest-{0..4}.svg`／`cannon-{0..4}.svg`：160×160，按所有者独立绘制主要色面。默认 `nest.svg`／`cannon.svg` 对应中立0。
- `bug-{agile,fast,strong}-{0..4}.svg`：96×32 spritesheet，四帧横排、每帧24×32、朝上。默认三张不带所有者后缀的虫兵对应蓝方1，UI只裁单帧。
- `emblem.svg`：256×256种核甲虫与十三灯环。
- 所有者色：0中立`#92A18B`、1蓝`#327FC1`、2红`#C85F48`、3紫`#8B70BA`、4金`#C49336`；文字与不同形状同时编码。捕获时切换纹理，不以全图tint代替材质。

表现层负责浅底深字数字牌、常显真实道路、蓝选区／直接相邻路线高亮、行军步态及占领／技能／炮击效果。缩略图同样读取LevelConfig.roads，不能以数组顺序生成装饰路线。图鉴采用既有SVG与真实核心数值；战斗中打开暂停，切条目不重写暂停快照，关闭恢复原状态。资源再生不依赖临时设计目录，详见 `art-direction.md`。

## AudioSystem (音频代理)
默认导出或具名导出 class AudioSystem，具名优先：
```ts
export interface AudioSettings { master:number; music:number; sfx:number; muted:boolean }
export class AudioSystem {
 settings:AudioSettings;
 constructor(settings?:Partial<AudioSettings>);
 unlock():Promise<void>; //首次交互创建/恢复context
 music(track:ScoreId|'battle'):void; // battle为meadow兼容别名
 setIntensity(level:0|1|2):void;
 setPaused(paused:boolean):void;
 play(name:'hover'|'click'|'select'|'dispatch'|'march'|'impact'|'capture'|'skill'|'victory'|'defeat'):void;
 configure(settings:Partial<AudioSettings>):void;
 dispose():void;
}
```
`score.ts` 是八个曲目ID、BPM、小节数及18份分轨的共享契约。音乐由合法真实管弦采样离线渲染；同源OGG失败回退同名MP3，八个WAV音效原样保留。音乐组内三层使用同一AudioContext启动时刻与相同长度；强度在下一小节平滑变化，换曲先淡出旧调性再淡入新曲，胜败快速接管。当前／渐退／加载音乐被临时固定，其余缓存立即释放；192MiB为软预算，转场瞬间的超额必须如实报告。资源路径均使用import.meta.env.BASE_URL，不访问运行时CDN或外部服务。

`MusicDirector` 仅读取 World 与 LevelConfig，不修改模拟、不消费事件队列。它按起始兵力比例归一化，结合多敌方来袭、生产巢损失与累计战斗统计差分，使用快升慢降、进入退出不同阈值及8秒最短保持，避免单次碰撞频繁切层。暂停冻结估计器，重试清空状态，胜败模式禁止战场更新覆盖结算曲。实际实现与验收见 `audio.md`。

## 交付阶段
1. 研究证据→2.架构与并行模块→3.核心/AI+13关+成长→4.绘制与音乐→5.浏览器操作/视觉/音频/性能验收→6.离线静态包和Windows启动脚本。
