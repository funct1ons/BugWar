import { RACES, type BuildingKind, type RaceId, type Road } from '../core/types';
import {
  BATTLE_RULES,
  CANNON_BASE_FIREPOWER,
  CANNON_FIREPOWER_NODES,
  CANNON_GARRISON_CAP,
  cannonFirepower,
  defaultProduction,
  isProductive,
} from '../core/rules';
import { RACE_UNLOCK_LEVELS } from '../storage/SaveSystem';

/**
 * Pure codex data and renderers.
 *
 * Numbers are read from RACES and BATTLE_RULES rather than copied, so the
 * reference cannot drift from the simulation. The renderer intentionally knows
 * nothing about Phaser, the DOM or the save schema; main.ts supplies the small
 * amount of live battle context (selected colony and unlock state).
 */

export type CodexTabId = 'races' | 'buildings' | 'command';

export interface CodexTabInfo {
  id: CodexTabId;
  label: string;
  caption: string;
  summary: string;
}

export const CODEX_TABS: readonly CodexTabInfo[] = [
  { id: 'races', label: '族群', caption: '4 支虫族', summary: '四族的真实移动、攻防与生产倍率；没有石头剪刀布式互克。' },
  { id: 'buildings', label: '建筑', caption: '4 种建筑', summary: '生产巢、孵育巢、疾风巢与守望炮塔的真实职能、数值和使用方式。' },
  { id: 'command', label: '指挥', caption: '4 条规则', summary: '固定道路与自动中转、孢子风暴、归属胜负与操作速查。' },
] as const;

const tabsById = new Map<string, CodexTabInfo>(CODEX_TABS.map((tab) => [tab.id, tab]));
const number = (value: number, digits = 2) => Number.isInteger(value) ? String(value) : String(Number(value.toFixed(digits)));
const factor = (value: number) => `×${value.toFixed(2)}`;
const percent = (value: number) => `${Math.round(value * 100)}%`;
const productionFor = (race: RaceId) => RACES[race].production * BATTLE_RULES.nestProduction;
const naturalCap = BATTLE_RULES.productionCap;

/**
 * Unlock requirements are shared with SaveSystem/UI so the codex and the
 * campaign race cards can never disagree about when a race becomes playable.
 */
export function raceUnlockRequirement(race: RaceId): number {
  return RACE_UNLOCK_LEVELS[race] ?? 0;
}

export function raceUnlockLabel(race: RaceId): string {
  const need = raceUnlockRequirement(race);
  return need > 0 ? `敏捷族通关 ${need} 关后解锁` : '默认可用';
}

/** Human label for every building kind; the art/UI share the same vocabulary. */
export const BUILDING_KIND_LABELS: Readonly<Record<BuildingKind, string>> = {
  nest: '生产巢',
  cannon: '守望炮塔',
  hatchery: '孵育巢',
  wind: '疾风巢',
};
/** Growth prose is generated from the shared table, never retyped by hand. */
const FIREPOWER_GROWTH_TEXT = CANNON_FIREPOWER_NODES
  .map((node) => `${number(node.garrison)} 人 ${number(node.damage)} 伤害 / ${number(node.cooldown)} 秒`)
  .join('，');

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

export interface RaceCodexEntry {
  id: string;
  tab: 'races';
  kind: 'race';
  race: RaceId;
  glyph: string;
  name: string;
  title: string;
  summary: string;
  speed: number;
  attack: number;
  defense: number;
  production: number;
  perSecond: number;
  strengths: readonly string[];
  weaknesses: readonly string[];
  tactics: readonly string[];
  unlock: string;
}

export interface BuildingCodexEntry {
  id: string;
  tab: 'buildings';
  kind: 'building';
  building: BuildingKind;
  glyph: string;
  name: string;
  title: string;
  summary: string;
  stats: readonly { label: string; value: string; note: string }[];
  notes: readonly string[];
  unlock: string;
}

export interface CommandCodexEntry {
  id: string;
  tab: 'command';
  kind: 'command';
  glyph: string;
  name: string;
  title: string;
  summary: string;
  facts: readonly { label: string; value: string }[];
  sections: readonly { heading: string; body: readonly string[] }[];
  unlock: string;
}

export type CodexEntry = RaceCodexEntry | BuildingCodexEntry | CommandCodexEntry;

const raceCopy: Record<RaceId, Omit<RaceCodexEntry, 'id' | 'tab' | 'kind' | 'race' | 'speed' | 'attack' | 'defense' | 'production' | 'perSecond'>> = {
  agile: {
    glyph: '敏',
    name: '敏捷族',
    title: '均衡的先锋',
    summary: '三项战斗属性都在基准线上；没有极端长板，也没有明显短板。',
    strengths: [
      `速度 ${number(RACES.agile.speed)}、攻击 ${factor(RACES.agile.attack)}、防御 ${factor(RACES.agile.defense)}，全部处在基准线。`,
      '入门推荐：同样的道路和兵力下，按计划推进更容易掌握节奏；这是学习建议，不是隐藏数值优势。',
    ],
    weaknesses: [
      '没有单项极限：疾行族更快，重甲族在同等兵力下更难被击退。',
      '均衡不会自动变成优势；仍然必须遵守相邻道路并逐巢留兵。',
    ],
    tactics: [
      '先夺取道路直接相邻的生产巢，再用新巢的生产接续下一跳。',
      '面对未知守军时保留 50% 驻军；集结两座相邻巢的兵力再压向敌巢。',
    ],
    unlock: '默认可用。',
  },
  fast: {
    glyph: '疾',
    name: '疾行族',
    title: '轻甲疾行者',
    summary: '用更快的行军抢到先机，但同等兵力的正面战斗更脆弱。',
    strengths: [
      `行军速度 ${number(RACES.fast.speed)}，是敏捷族的 ${percent(RACES.fast.speed / RACES.agile.speed)}；相同道路更早抵达。`,
      `生产倍率 ${factor(RACES.fast.production)}，默认每座生产巢 ${number(productionFor('fast'))} 兵/秒；速度优势来自移动，不是额外产能。`,
    ],
    weaknesses: [
      `攻击 ${factor(RACES.fast.attack)}、防御 ${factor(RACES.fast.defense)}；同等数量正面交锋弱于敏捷族和重甲族。`,
      '速度快不能越过道路，也不能途中改道；路线在出发时确定，只会经过己方控制的建筑。',
    ],
    tactics: [
      '抢先占近处中立生产巢，再用新巢产出补下一波，不要一次把驻军抽空。',
      '避开同等兵力硬碰；集中多座相邻巢的兵力，或先让炮塔与风暴削减守军。',
    ],
    unlock: `${raceUnlockLabel('fast')}；未解锁也可以在本图鉴中完整查看。`,
  },
  strong: {
    glyph: '甲',
    name: '重甲族',
    title: '磐甲重装',
    summary: '同等兵力下更难被击退，但缓慢的增援节奏会放大每一次分兵。',
    strengths: [
      `攻击 ${factor(RACES.strong.attack)}、防御 ${factor(RACES.strong.defense)}；同等兵力的进攻与防守都更占优。`,
      `生产倍率 ${factor(RACES.strong.production)}，默认每座生产巢 ${number(productionFor('strong'))} 兵/秒，与其它族相同；强度来自战斗倍率。`,
    ],
    weaknesses: [
      `行军速度 ${number(RACES.strong.speed)}，仅为敏捷族的 ${percent(RACES.strong.speed / RACES.agile.speed)}；跨巢增援和抢占中立巢都更慢。`,
      '慢速让对手有时间集结；不要把兵力同时撒向多个远处目标。',
    ],
    tactics: [
      '先守住道路交汇附近的生产巢，等兵力形成规模再推进。',
      '利用防御倍率守住关键巢，迫使对手在窄路上反复消耗。',
    ],
    unlock: `${raceUnlockLabel('strong')}；未解锁也可以在本图鉴中完整查看。`,
  },
  brood: {
    glyph: '孵',
    name: '孵化族',
    title: '扩张的巢群',
    summary: '正面属性略低，却能把新占的中立生产建筑立刻变成下一波兵力；适合稳步铺路。',
    strengths: [
      `速度 ${number(RACES.brood.speed)}、攻击 ${factor(RACES.brood.attack)}、防御 ${factor(RACES.brood.defense)}：攻防都比敏捷族低 10%，正面硬碰需要更多兵力。`,
      `首次占领中立生产建筑时额外获得 ${number(BATTLE_RULES.broodCaptureBonus)} 驻军；奖励只帮助站稳新巢，不改变攻防倍率。`,
      `生产倍率 ${factor(RACES.brood.production)}，默认每座生产巢 ${number(productionFor('brood'))} 兵/秒；与其它族共用 ${number(naturalCap)} 自然生产上限和友方中转。`,
    ],
    weaknesses: [
      `攻击 ${factor(RACES.brood.attack)}、防御 ${factor(RACES.brood.defense)} 意味着同等数量的正面战斗更吃亏。`,
      `额外驻军只在首次占领中立生产建筑时出现；占领敌方或非生产建筑没有奖励。奖励不是自然生产，可以和到达援军一样超过 ${number(naturalCap)}，但不提高自然生产上限。`,
    ],
    tactics: [
      '优先沿最短道路吃下中立生产巢，用额外驻军省下一次增援命令。',
      '避开与重甲族的等兵硬碰；让炮塔和风暴先削减守军，再用数量优势占领。',
    ],
    unlock: `${raceUnlockLabel('brood')}；未解锁也可以在本图鉴中完整查看。`,
  },
};

export const RACE_CODEX_ENTRIES: readonly RaceCodexEntry[] = (['agile', 'fast', 'strong', 'brood'] as RaceId[]).map((race) => {
  const data = RACES[race];
  return {
    id: `race-${race}`,
    tab: 'races',
    kind: 'race',
    race,
    ...raceCopy[race],
    speed: data.speed,
    attack: data.attack,
    defense: data.defense,
    production: data.production,
    perSecond: productionFor(race),
  };
});

export const BUILDING_CODEX_ENTRIES: readonly BuildingCodexEntry[] = [
  {
    id: 'building-nest',
    tab: 'buildings',
    kind: 'building',
    building: 'nest',
    glyph: '巢',
    name: '生产巢',
    title: '持续产兵的根基',
    summary: '中立时不生产；被任一参战方占领后，立即按新归属持续累积兵力，直到自然上限。',
    stats: [
      { label: '默认生产', value: `${number(defaultProduction('nest'))} 兵/秒`, note: '关卡可用 production 字段覆盖' },
      { label: '自然上限', value: `${number(naturalCap)} 兵`, note: `自然生产只累积到 ${number(naturalCap)}` },
      { label: '超出上限', value: '只能靠增援', note: `增援可让驻军超过 ${number(naturalCap)}，自然生产不会继续累积` },
      { label: '中转', value: '友方自动续行', note: '沿己方控制道路经过时继续下一段' },
    ],
    notes: [
      '生产只在 owner > 0 时进行；owner 0 的中立生产巢不会自己涨兵。',
      '归属切换后，生产巢立即为新主人生产；防守方留下的驻军会被战斗结算消耗。',
      `自然生产到达 ${number(naturalCap)} 后停止；超过 ${number(naturalCap)} 的兵来自增援或繁育奖励，驻军回落到上限以下才会恢复自然生产。`,
      '生产巢本身没有攻击能力，它的价值是持续补兵和作为道路节点。',
      '沿己方控制的道路经过生产巢时，行军会自动继续下一段；敌人或中立建筑不能作为中转站。',
      '当前版本没有建筑升级、人口建筑、科技树或特殊弹药。',
    ],
    unlock: '所有关卡均存在；占领方式见“道路与派兵”。',
  },
  {
    id: 'building-hatchery',
    tab: 'buildings',
    kind: 'building',
    building: 'hatchery',
    glyph: '孵',
    name: '孵育巢',
    title: '更快的自然生产',
    summary: '孵化族偏好的生产建筑：自然产速更高，但和所有生产建筑共用同一条自然生产上限。',
    stats: [
      { label: '默认生产', value: `${number(defaultProduction('hatchery'))} 兵/秒`, note: '来自 BATTLE_RULES.hatcheryProduction；关卡仍可用 production 覆盖' },
      { label: '自然上限', value: `${number(naturalCap)} 兵`, note: '与生产巢共用上限；到达后停止自然产兵' },
      { label: '超出上限', value: '只能靠增援', note: `增援可超过 ${number(naturalCap)}，自然生产不会继续累积` },
      { label: '中转', value: '友方自动续行', note: '沿己方控制道路经过时继续下一段' },
    ],
    notes: [
      '孵育巢是生产建筑：归属切换后立即为新主人产兵，中立时不生产。',
      `实际自然产速 = 关卡 production × 种族 production，默认基准 ${number(BATTLE_RULES.hatcheryProduction)} 兵/秒；累积到 ${number(naturalCap)} 后停止。`,
      `孵育巢不提高自然上限：${number(naturalCap)} 人之后必须用增援继续堆积。`,
      '沿己方控制的道路经过孵育巢时，行军会自动继续下一段，与生产巢相同。',
      '当前版本没有升级、科技或额外人口建筑。',
    ],
    unlock: '按关卡配置出现；占领方式与生产巢相同。',
  },
  {
    id: 'building-wind',
    tab: 'buildings',
    kind: 'building',
    building: 'wind',
    glyph: '风',
    name: '疾风巢',
    title: '只加速下一段路程',
    summary: '不产兵，也不提高上限；让从这里出发的下一段行军更快，适合缩短增援距离。',
    stats: [
      { label: '生产', value: '0 兵/秒', note: '疾风巢不产生任何兵力' },
      { label: '行军加速', value: `×${number(BATTLE_RULES.windSpeedMultiplier)}`, note: `来自 BATTLE_RULES.windSpeedMultiplier；只作用于从疾风巢出发的下一段` },
      { label: '叠加', value: '不叠加', note: '多座疾风巢不会相乘，也不会延长作用段数' },
      { label: '作用范围', value: '下一段路程', note: '跨过该段后立即恢复种族基础速度' },
    ],
    notes: [
      '疾风巢是道路节点，不生产、不提高自然生产上限、也不直接改变攻击或防御。',
      '加速只作用于从该疾风巢出发的下一段行军；进入再下一段时恢复种族基础速度，多座疾风巢不叠加。',
      '路线在出发时由自动中转确定，行军途中不能改道去蹭另一座疾风巢。',
      '当前版本没有额外科技、建筑升级或持续加速效果。',
    ],
    unlock: '按关卡配置出现；占领后，从这里出发的下一段行军获得加速。',
  },
  {
    id: 'building-cannon',
    tab: 'buildings',
    kind: 'building',
    building: 'cannon',
    glyph: '塔',
    name: '守望炮塔',
    title: '不生产，只拦截',
    summary: '不能自行补兵；会给射程内的敌方在途部队持续造成小额伤害，驻军越多火力越强。',
    stats: [
      { label: '生产', value: `0 兵/秒`, note: '炮塔不产生任何兵力' },
      { label: '射程', value: `${number(BATTLE_RULES.cannonRange)}`, note: '以炮塔为中心的距离半径，不随驻军变化' },
      { label: '单发伤害', value: `${number(BATTLE_RULES.cannonDamage)}`, note: `空塔（0 驻军）基准；每发最多削减 ${number(BATTLE_RULES.cannonDamage)} 只敌方行军中虫兵，驻军越多伤害越高` },
      { label: '射击冷却', value: `${number(BATTLE_RULES.cannonCooldown)} 秒`, note: '空塔（0 驻军）基准；冷却结束后寻找下一支射程内敌军队列，驻军越多间隔越短' },
      { label: '驻军加成', value: `最多 +${number(cannonFirepower(CANNON_GARRISON_CAP).damage - CANNON_BASE_FIREPOWER.damage)} 伤害`, note: `${number(CANNON_GARRISON_CAP)} 人为火力上限；间隔由 ${number(CANNON_BASE_FIREPOWER.cooldown)} 秒缩短到 ${number(cannonFirepower(CANNON_GARRISON_CAP).cooldown)} 秒，超过上限不再提升` },
    ],
    notes: [
      '炮塔只自动射击射程内的敌方在途部队，不会攻击建筑驻军。',
      '火力由实时驻军决定：' + FIREPOWER_GROWTH_TEXT + `；节点之间按驻军线性插值，${number(CANNON_GARRISON_CAP)} 人封顶。`,
      '调整驻军立即改变伤害与剩余充能速率，但保留已积累的冷却进度，不会重置冷却或免费补射一发。',
      '需要友军增援才能长期驻守；炮塔不生产，驻军损失后火力随之下降，无法自行补充。',
      '选中己方炮塔时，战场会显示射程圈；离开射程的舰队不再被该炮塔锁定。',
      '炮塔对所有种族使用同一套结算，没有额外的重甲抗性、范围伤害或特殊弹药。',
    ],
    unlock: '按关卡配置出现；中立炮塔同样需要派兵占领。',
  },
] as const;

export const COMMAND_CODEX_ENTRIES: readonly CommandCodexEntry[] = [
  {
    id: 'command-roads',
    tab: 'command',
    kind: 'command',
    glyph: '路',
    name: '道路与中转',
    title: '固定道路，自动中转',
    summary: '命令只沿固定道路行军；经过你控制的建筑时自动继续下一段，路线在出发时确定。',
    facts: [
      { label: '合法来源', value: '能沿你控制的建筑连通目标的所选己方建筑' },
      { label: '自动中转', value: '经过己方建筑自动继续下一段' },
      { label: '中转限制', value: '只有己方建筑可中转；目标本身可任意归属' },
      { label: '路径选择', value: '出发时选择确定性的最短几何路线' },
      { label: '多选规则', value: '逐个来源计算路径；无路径来源保留驻军' },
      { label: '非法命令', value: '不扣兵、不计派遣、不生成舰队；提示“无可用路径”' },
      { label: '行军路径', value: '沿真实道路逐段移动，出发后不能改道' },
      { label: '道路遭遇', value: '敌我舰队在同一路段相遇会交战' },
      { label: '经济效果', value: '无；道路不产兵、不共享驻军' },
    ],
    sections: [
      {
        heading: '一条命令可以走多段',
        body: [
          '如果 A—B—C 是连通的，且 B 已经属于你，那么从 A 可以直接下令到 C：部队先走 A→B，抵达友方 B 后自动继续 B→C。',
          '自动中转只经过你控制的建筑。B 还是中立或敌方时，A→C 没有合法路径；先占领 B，再从 B 继续向前。',
          '路线在命令下达时确定，途中不能改道、不能临时改目标，也不会因为沿途又占领了别的巢而重新规划。',
        ],
      },
      {
        heading: '多选只帮助有路径的来源',
        body: [
          '拖框、Shift 追加或空格全选可以一次选中多座建筑，但每条命令仍会逐个来源计算真实路径。',
          '能连通目标的已选建筑才会出兵；无法连通的建筑保留全部驻军，也不会被扣兵，界面会提示部分来源未派出。',
          '没有任何已选来源能连通目标时，命令不会扣兵、不会生成舰队，战场提示“无可用路径”。',
        ],
      },
      {
        heading: '道路不是连线经济',
        body: [
          '道路是固定的无向行军路径，不提供自动输送、额外生产、驻军共享或资源连线。',
          '战场会绘制本关的全部固定道路；选中建筑时，只有真实可达的目标会显示高亮，悬停时显示实际的多段路线。',
          '敌对舰队在同一路段相遇会发生道路遭遇战，双方都可能在抵达建筑前被消耗。',
        ],
      },
    ],
    unlock: '所有战斗通用；具体道路由每张关卡配置定义。',
  },
  {
    id: 'command-storm',
    tab: 'command',
    kind: 'command',
    glyph: '暴',
    name: '孢子风暴',
    title: '一次区域削兵',
    summary: '用满能量削弱密集敌军，但不会直接占领任何建筑。',
    facts: [
      { label: '能量增长', value: `${number(BATTLE_RULES.energyRate)}% / 秒` },
      { label: '从 0 到满', value: `${Math.ceil(BATTLE_RULES.skillCost / BATTLE_RULES.energyRate)} 秒` },
      { label: '施放消耗', value: `${number(BATTLE_RULES.skillCost)}%` },
      { label: '作用半径', value: `${number(BATTLE_RULES.skillRadius)}` },
      { label: '每个目标', value: `最多 ${number(BATTLE_RULES.skillDamage)} 兵` },
      { label: '友军与中立', value: '不受影响' },
    ],
    sections: [
      {
        heading: '如何施放',
        body: [
          `能量达到 ${number(BATTLE_RULES.skillCost)}% 后，点技能按钮或按 A 进入瞄准，再点击战场区域施放。`,
          '右键或 Esc 可以取消瞄准，不消耗能量。',
        ],
      },
      {
        heading: '伤害如何计算',
        body: [
          `半径 ${number(BATTLE_RULES.skillRadius)} 内，每座敌方建筑和每支敌方在途部队分别最多损失 ${number(BATTLE_RULES.skillDamage)} 兵；不是所有目标合计 ${number(BATTLE_RULES.skillDamage)}。`,
          '风暴只削减驻军与在途兵力，不改变归属；要占领建筑，仍然必须派兵抵达。',
        ],
      },
    ],
    unlock: `所有战斗通用；能量按每秒 ${number(BATTLE_RULES.energyRate)}% 持续积累，施放后归零。`,
  },
  {
    id: 'command-ownership',
    tab: 'command',
    kind: 'command',
    glyph: '旗',
    name: '归属与胜负',
    title: '占领、增援与终局',
    summary: '建筑归属由抵达结算决定；胜负只看蓝方与敌方，不看中立。',
    facts: [
      { label: '中立', value: 'owner 0；不生产，不计入胜负' },
      { label: '蓝方', value: 'owner 1；玩家' },
      { label: '敌方', value: 'owner 2–4；彼此也敌对' },
      { label: '胜利', value: '全灭，或占领金色目标建筑' },
      { label: '失败', value: '己方建筑与在途部队全灭' },
      { label: '目标关', value: '只有被标记的目标决定胜负' },
    ],
    sections: [
      {
        heading: '占领如何发生',
        body: [
          '军队抵达非友方建筑时，按攻方种族的攻击倍率与守方种族的防御倍率结算：攻方兵力 × 攻击 > 守方驻军 × 防御时占领，否则攻方被消耗。',
          '这里没有额外的阵营互克表；结果只由当前兵力、攻击、防御和抵达顺序决定。',
        ],
      },
      {
        heading: '目标关如何结束',
        body: [
          '带金色标记的目标建筑决定胜负：蓝方占领它即胜利，目标仍在敌方手里时战斗继续。',
          '目标之外的中立或敌方据点不参与目标关的胜负判定；它们仍然影响生产、道路中转和炮塔火力。',
          '没有金色目标的关卡按全灭结算：敌方建筑与在途部队全部清空即胜，中立方始终不计入胜负。',
        ],
      },
      {
        heading: '增援与归属',
        body: [
          '友军抵达只增加驻军；建筑归属不变。沿己方控制道路行军时，经过友方建筑会自动继续下一段。',
          '占领成功后归属立即切换；如果它是生产建筑，会从新归属方开始继续生产，但自然生产仍受上限约束。',
        ],
      },
      {
        heading: '中立在终局之外',
        body: [
          '中立建筑不是默认胜利目标；可以绕开，但它们常常是道路上的关键中转节点。',
          '即使己方建筑全部失守，只要还有己方在途军队，战斗尚未结束。敌方在途军队同样必须清零才算胜利。',
        ],
      },
    ],
    unlock: '所有战斗通用；目标关的具体标记以战场金色圆环和顶部目标文字为准。',
  },
  {
    id: 'command-controls',
    tab: 'command',
    kind: 'command',
    glyph: '键',
    name: '操作速查',
    title: '选择、派兵与图鉴',
    summary: '战场操作与键盘入口；道路中转与目标规则优先于所有选择技巧。',
    facts: [
      { label: '选择', value: '点击 / 拖框 / Shift 追加 / 空格全选' },
      { label: '派兵', value: '选中己方建筑后点击可达目标；也可从建筑拖向目标' },
      { label: '路径', value: '沿固定道路自动中转；无路径时提示“无可用路径”' },
      { label: '比例', value: '25 / 50 / 75 / 100%；按每座来源向下取整' },
      { label: '技能', value: 'A 或点技能；右键 / Esc 取消瞄准' },
      { label: '系统', value: 'P 暂停 · M 静音 · C 打开图鉴 · Esc 关闭/暂停' },
    ],
    sections: [
      {
        heading: '选择与命令',
        body: [
          '点击己方建筑选择；在空地拖框多选；Shift 追加或取消；空格选择全部己方建筑。',
          '选中后点击高亮的目标派兵。点可达友方是增援；点不可达目标不会出兵、不扣兵，并提示“无可用路径”。',
        ],
      },
      {
        heading: '图鉴键盘',
        body: [
          '在战场、主菜单或战役页按 C 打开图鉴；战场会先暂停。',
          '图鉴内 ←/→ 切换分类，↑/↓ 选择条目，Esc 关闭。关闭后恢复打开前的暂停状态。',
        ],
      },
    ],
    unlock: '道路中转规则见“道路与中转”；本页不改变任何战斗数值。',
  },
] as const;

export const CODEX_ENTRIES: Readonly<Record<CodexTabId, readonly CodexEntry[]>> = {
  races: RACE_CODEX_ENTRIES,
  buildings: BUILDING_CODEX_ENTRIES,
  command: COMMAND_CODEX_ENTRIES,
};

export function isCodexTab(value: string): value is CodexTabId {
  return tabsById.has(value);
}

export function entriesForTab(tab: CodexTabId): readonly CodexEntry[] {
  return CODEX_ENTRIES[tab];
}

export function codexEntryById(id: string): CodexEntry | undefined {
  for (const entries of Object.values(CODEX_ENTRIES)) {
    const found = entries.find((entry) => entry.id === id);
    if (found) return found;
  }
  return undefined;
}

export function defaultEntryForTab(tab: CodexTabId): string {
  return CODEX_ENTRIES[tab][0].id;
}

export function normalizeCodexState(tab: string, entryId: string): { tab: CodexTabId; entryId: string } {
  const safeTab = isCodexTab(tab) ? tab : 'races';
  const entry = codexEntryById(entryId);
  return { tab: safeTab, entryId: entry?.tab === safeTab ? entry.id : defaultEntryForTab(safeTab) };
}

/**
 * Pure keyboard intent shared with main.ts. Keeping pause/codex modal semantics
 * here makes the second-P resume path and Esc priority testable without a DOM.
 */
export type EscapeIntent = 'close-modal' | 'scene-cancel-skill' | 'clear-selection' | 'pause' | 'none';

export function escapeIntent(
  screen: 'menu' | 'campaign' | 'battle' | 'result',
  modal: string,
  skillArmed: boolean,
  hasSelection: boolean,
): EscapeIntent {
  if (modal) return 'close-modal';
  if (screen !== 'battle') return 'none';
  // When a skill is armed in a live battle, BattleScene owns Esc so it can
  // cancel the aim gesture and selection without pausing the battle.
  if (skillArmed) return 'scene-cancel-skill';
  if (hasSelection) return 'clear-selection';
  return 'pause';
}

/**
 * P toggles live battle pause and also closes the pause menu; other modals ignore P.
 * Auto-repeat is never a toggle, so holding P cannot rapidly open/close the menu.
 */
export function pauseKeyIntent(
  screen: 'menu' | 'campaign' | 'battle' | 'result',
  modal: string,
  repeat = false,
): 'toggle' | 'none' {
  if (repeat) return 'none';
  return screen === 'battle' && (modal === '' || modal === 'pause') ? 'toggle' : 'none';
}

export interface SelectedColonyInfo {
  id: string;
  owner: number;
  kind: BuildingKind;
  units: number;
  production: number;
  race?: RaceId;
}

export interface CodexRenderOptions {
  tab: string;
  entryId: string;
  artBase?: string;
  raceUnlocked?: Partial<Record<RaceId, boolean>>;
  currentRace?: RaceId;
  inBattle?: boolean;
  selectedColonies?: readonly SelectedColonyInfo[];
}

export interface MinimapColony {
  id: string;
  x: number;
  y: number;
}

/**
 * Turns the level's real, undirected Road[] into minimap line markup.
 * It never infers an edge from colony array order. Unknown endpoints are skipped
 * so a malformed fixture cannot create a phantom road.
 */
export function renderMinimapRoads(colonies: readonly MinimapColony[], roads: readonly Road[], yOffset = -100): string {
  const positions = new Map(colonies.map((colony) => [colony.id, colony]));
  return roads.map(([fromId, toId]) => {
    if (!fromId || !toId || fromId === toId) return '';
    const from = positions.get(fromId);
    const to = positions.get(toId);
    if (!from || !to) return '';
    return `<line class="minimap-road" data-road="${escapeAttribute(fromId)}-${escapeAttribute(toId)}" x1="${number(from.x)}" y1="${number(from.y + yOffset)}" x2="${number(to.x)}" y2="${number(to.y + yOffset)}" stroke="#5b7f92" stroke-opacity=".30" stroke-width="6" stroke-linecap="round"/>`;
  }).join('');
}

function ownerLabel(owner: number): string {
  if (owner === 0) return '中立';
  if (owner === 1) return '蓝方';
  return `敌方 ${owner}`;
}

function renderRaceDetail(entry: RaceCodexEntry, options: CodexRenderOptions): string {
  const art = `${options.artBase ?? ''}art/bug-${entry.race}.svg`;
  const unlocked = options.raceUnlocked?.[entry.race] !== false;
  const current = options.currentRace === entry.race;
  const speedRelative = entry.speed / RACES.agile.speed;
  return `<div class="codex-detail-head">
    <div class="codex-bug-window" role="img" aria-label="${escapeAttribute(entry.name)}四帧虫兵图中的第一帧">
      <img class="codex-bug-sheet" src="${escapeAttribute(art)}" alt="">
    </div>
    <div class="codex-detail-title">
      <span class="codex-kicker">族群 · ${escapeHtml(entry.race.toUpperCase())}</span>
      <h3>${escapeHtml(entry.name)}<small>${escapeHtml(entry.title)}</small></h3>
      <p>${escapeHtml(entry.summary)}</p>
      <div class="codex-badges">
        <span class="codex-badge ${unlocked ? 'unlocked' : 'locked'}">${unlocked ? '已解锁' : '未解锁 · 仍可学习'}</span>
        ${current ? '<span class="codex-badge current">当前战役种族</span>' : ''}
      </div>
    </div>
  </div>
  <div class="codex-stat-grid">
    <article class="codex-stat"><span>行军速度</span><strong>${number(entry.speed)}</strong><small>战场距离 / 秒 · 敏捷族基准的 ${percent(speedRelative)}</small></article>
    <article class="codex-stat"><span>攻击倍率</span><strong>${factor(entry.attack)}</strong><small>抵达时乘在攻方兵力上</small></article>
    <article class="codex-stat"><span>防御倍率</span><strong>${factor(entry.defense)}</strong><small>防守时乘在守方驻军上</small></article>
    <article class="codex-stat"><span>生产倍率</span><strong>${factor(entry.production)}</strong><small>默认 ${number(entry.perSecond)} 兵/秒（${number(BATTLE_RULES.nestProduction)} × 种族）</small></article>
  </div>
  <div class="codex-two-col">
    <section class="codex-block"><h4>优势</h4><ul>${entry.strengths.map((text) => `<li>${escapeHtml(text)}</li>`).join('')}</ul></section>
    <section class="codex-block"><h4>局限</h4><ul>${entry.weaknesses.map((text) => `<li>${escapeHtml(text)}</li>`).join('')}</ul></section>
  </div>
  <section class="codex-block codex-tactics"><h4>战术用法</h4><ul>${entry.tactics.map((text) => `<li>${escapeHtml(text)}</li>`).join('')}</ul></section>
  <div class="codex-callout"><b>没有石头剪刀布式克制</b><span>四族共用同一套攻击 / 防御结算；数值只改变同等兵力下的结果，不提供隐藏的族群互克。生产倍率全部为 ${factor(entry.production)}，差异来自移动与战斗，而非额外产能。孵化族额外的 ${number(BATTLE_RULES.broodCaptureBonus)} 驻军只在首次占领中立生产建筑时出现。</span></div>
  <p class="codex-note">解锁条件：${escapeHtml(entry.unlock)}</p>`;
}

function renderSelectedProduction(options: CodexRenderOptions): string {
  if (!options.inBattle) return '';
  const selected = options.selectedColonies ?? [];
  const nests = selected.filter((colony) => isProductive(colony.kind));
  if (!nests.length) {
    return `<div class="codex-live"><b>战场实测</b><p>打开图鉴前选中生产建筑，可在这里查看该建筑的实际产兵速度与自然上限；未选中时只显示默认规则。</p></div>`;
  }
  const rows = nests.slice(0, 3).map((colony) => {
    const raceProduction = colony.race ? RACES[colony.race].production : 1;
    const rate = colony.owner > 0 ? colony.production * raceProduction : 0;
    const capReached = colony.units >= BATTLE_RULES.productionCap;
    const label = BUILDING_KIND_LABELS[colony.kind] ?? '生产建筑';
    const formula = colony.owner <= 0
      ? '中立不生产；占领后按地图倍率与归属种族倍率计算'
      : capReached
        ? `已达 ${number(BATTLE_RULES.productionCap)} 自然上限，继续增援可超过上限`
        : `${number(colony.production)} 地图倍率 × ${factor(raceProduction)} 种族倍率 · 再 ${number(Math.max(0, Math.ceil(BATTLE_RULES.productionCap - colony.units)))} 兵到自然上限`;
    return `<li><b>${escapeHtml(colony.id)} · ${escapeHtml(label)}</b><span>${ownerLabel(colony.owner)} · ${number(rate)} 兵/秒 · 驻军 ${number(colony.units)} / ${number(BATTLE_RULES.productionCap)}</span><small>${escapeHtml(formula)}</small></li>`;
  }).join('');
  const more = nests.length > 3 ? `<small class="codex-live-more">另有 ${nests.length - 3} 座已选生产建筑未展开。</small>` : '';
  return `<div class="codex-live"><b>战场实测 · 已选生产建筑</b><ul>${rows}</ul>${more}<p>自然生产只累积到 ${number(BATTLE_RULES.productionCap)}；超过 ${number(BATTLE_RULES.productionCap)} 的驻军可来自增援或繁育奖励。数值来自当前地图 production 与归属种族的生产倍率，打开图鉴不会改变战局。</p></div>`;
}

/** Always-visible firepower baseline + growth table (the no-selection view). */
function renderCannonGrowth(): string {
  const rows = CANNON_FIREPOWER_NODES.map((node) => {
    const profile = cannonFirepower(node.garrison);
    const cap = node.garrison >= CANNON_GARRISON_CAP ? '（上限）' : '';
    return `<tr><th>${number(profile.garrison)} 人${cap}</th><td>${number(profile.damage)}</td><td>${number(profile.cooldown)} 秒</td><td>${number(profile.dps)}</td></tr>`;
  }).join('');
  return `<section class="codex-block codex-firepower"><h4>驻军火力成长</h4>
    <table class="codex-firepower-table"><thead><tr><th>驻军</th><th>单发伤害</th><th>射击间隔</th><th>每秒伤害</th></tr></thead><tbody>${rows}</tbody></table>
    <p>节点之间按实时驻军分段线性插值；${number(CANNON_GARRISON_CAP)} 人封顶，更多驻军不加伤害、不缩间隔。射程 ${number(BATTLE_RULES.cannonRange)} 不随驻军变化，炮塔始终不产兵。</p>
  </section>`;
}

/** Selected-cannon readout: current damage, interval, garrison bonus and cap progress. */
function renderSelectedCannon(options: CodexRenderOptions): string {
  if (!options.inBattle) return '';
  const cannons = (options.selectedColonies ?? []).filter((colony) => colony.kind === 'cannon');
  if (!cannons.length) {
    return `<div class="codex-live"><b>战场实测</b><p>打开图鉴前选中炮塔，可在这里查看它按当前驻军插值后的单发伤害、射击间隔、驻军加成和 ${number(CANNON_GARRISON_CAP)} 人上限进度；未选中时只显示空塔基准和上方成长表。</p></div>`;
  }
  const rows = cannons.slice(0, 3).map((colony) => {
    const profile = cannonFirepower(colony.units);
    const damageBonus = profile.damage - CANNON_BASE_FIREPOWER.damage;
    const cooldownGain = CANNON_BASE_FIREPOWER.cooldown - profile.cooldown;
    const status = colony.owner <= 0
      ? '中立炮塔不射击；占领后按当时驻军生效'
      : profile.capped
        ? `已达 ${number(CANNON_GARRISON_CAP)} 人火力上限`
        : `再驻 ${number(Math.max(0, Math.ceil(CANNON_GARRISON_CAP - colony.units)))} 人达到上限`;
    return `<li><b>${escapeHtml(colony.id)}</b><span>${ownerLabel(colony.owner)} · 驻军 ${number(colony.units)} · 单发 ${number(profile.damage)} 伤害 / ${number(profile.cooldown)} 秒</span><small>驻军加成 +${number(damageBonus)} 伤害 / 间隔缩短 ${number(cooldownGain)} 秒 · 约 ${number(profile.dps)} 伤害/秒 · ${escapeHtml(status)}</small></li>`;
  }).join('');
  const more = cannons.length > 3 ? `<small class="codex-live-more">另有 ${cannons.length - 3} 座已选炮塔未展开。</small>` : '';
  return `<div class="codex-live"><b>战场实测 · 已选炮塔</b><ul>${rows}</ul>${more}<p>数值来自当前驻军与共享火力表的实时插值；调整驻军不会重置冷却，也不会立刻补射一发。</p></div>`;
}

function renderBuildingDetail(entry: BuildingCodexEntry, options: CodexRenderOptions): string {
  const art = `${options.artBase ?? ''}art/${entry.building}.svg`;
  const role = entry.building === 'cannon' ? 'DEFENSE' : entry.building === 'wind' ? 'BOOST' : 'PRODUCTION';
  const roleName = entry.building === 'cannon' ? '防御' : entry.building === 'wind' ? '加速' : '生产';
  const live = entry.building === 'cannon'
    ? `${renderCannonGrowth()}${renderSelectedCannon(options)}`
    : isProductive(entry.building)
      ? renderSelectedProduction(options)
      : '';
  return `<div class="codex-detail-head">
    <div class="codex-building-window"><img class="codex-building-art" src="${escapeAttribute(art)}" alt="${escapeAttribute(entry.name)}插画"></div>
    <div class="codex-detail-title">
      <span class="codex-kicker">建筑 · ${roleName} · ${role}</span>
      <h3>${escapeHtml(entry.name)}<small>${escapeHtml(entry.title)}</small></h3>
      <p>${escapeHtml(entry.summary)}</p>
      <div class="codex-badges"><span class="codex-badge unlocked">按关卡配置出现</span></div>
    </div>
  </div>
  <div class="codex-stat-grid">${entry.stats.map((stat) => `<article class="codex-stat"><span>${escapeHtml(stat.label)}</span><strong>${escapeHtml(stat.value)}</strong><small>${escapeHtml(stat.note)}</small></article>`).join('')}</div>
  <section class="codex-block codex-rules"><h4>使用要点</h4><ul>${entry.notes.map((text) => `<li>${escapeHtml(text)}</li>`).join('')}</ul></section>
  ${live}
  <div class="codex-callout"><b>没有隐藏升级</b><span>图鉴只列出当前模拟真实存在的机制：生产、自然上限、驻军、道路中转与战斗结算。没有升级按钮、科技树或未实现的特殊能力；超过 ${number(BATTLE_RULES.productionCap)} 的驻军可来自增援或繁育奖励。</span></div>
  <p class="codex-note">出现条件：${escapeHtml(entry.unlock)}</p>`;
}

function renderCommandDetail(entry: CommandCodexEntry): string {
  return `<div class="codex-detail-head codex-command-head">
    <div class="codex-command-glyph" aria-hidden="true">${escapeHtml(entry.glyph)}</div>
    <div class="codex-detail-title">
      <span class="codex-kicker">指挥 · RULE</span>
      <h3>${escapeHtml(entry.name)}<small>${escapeHtml(entry.title)}</small></h3>
      <p>${escapeHtml(entry.summary)}</p>
    </div>
  </div>
  <div class="codex-fact-grid">${entry.facts.map((fact) => `<div class="codex-fact"><span>${escapeHtml(fact.label)}</span><b>${escapeHtml(fact.value)}</b></div>`).join('')}</div>
  <div class="codex-rule-sections">${entry.sections.map((section) => `<section class="codex-block"><h4>${escapeHtml(section.heading)}</h4>${section.body.map((text) => `<p>${escapeHtml(text)}</p>`).join('')}</section>`).join('')}</div>
  <p class="codex-note">${escapeHtml(entry.unlock)}</p>`;
}

function renderEntryButton(entry: CodexEntry, active: boolean, options: CodexRenderOptions): string {
  const locked = entry.kind === 'race' && options.raceUnlocked?.[entry.race] === false;
  const current = entry.kind === 'race' && options.currentRace === entry.race;
  return `<button class="codex-entry ${active ? 'active' : ''}" data-action="codex-entry" data-value="${escapeAttribute(entry.id)}" aria-current="${active ? 'true' : 'false'}">
    <span class="codex-entry-glyph" aria-hidden="true">${escapeHtml(entry.glyph)}</span>
    <span class="codex-entry-copy"><b>${escapeHtml(entry.name)}</b><small>${escapeHtml(entry.title)}</small></span>
    ${locked ? '<span class="codex-entry-state locked">未解锁</span>' : current ? '<span class="codex-entry-state current">当前</span>' : '<span class="codex-entry-arrow" aria-hidden="true">›</span>'}
  </button>`;
}

export function renderCodex(options: CodexRenderOptions): string {
  const state = normalizeCodexState(options.tab, options.entryId);
  const tab = tabsById.get(state.tab)!;
  const entries = entriesForTab(state.tab);
  const entry = codexEntryById(state.entryId) ?? entries[0];
  const artBase = options.artBase ?? '';
  const tabs = CODEX_TABS.map((item, index) => `<button class="codex-tab ${item.id === state.tab ? 'active' : ''}" id="codex-tab-${item.id}" role="tab" aria-selected="${item.id === state.tab}" aria-controls="codex-panel" tabindex="${item.id === state.tab ? '0' : '-1'}" data-action="codex-tab" data-value="${item.id}">
    <span>0${index + 1}</span><b>${item.label}</b><small>${item.caption}</small>
  </button>`).join('');
  const list = entries.map((item) => renderEntryButton(item, item.id === entry.id, options)).join('');
  const detail = entry.kind === 'race' ? renderRaceDetail(entry, options) : entry.kind === 'building' ? renderBuildingDetail(entry, options) : renderCommandDetail(entry);
  const currentName = options.currentRace
    ? RACE_CODEX_ENTRIES.find((entry) => entry.race === options.currentRace)?.name ?? options.currentRace
    : '';
  const context = options.inBattle
    ? `<span class="codex-meta-line">战场已暂停 · 关闭后恢复进入前状态</span>`
    : currentName
      ? `<span class="codex-meta-line">当前战役种族 · ${escapeHtml(currentName)}</span>`
      : '';
  return `<div class="codex-shell" data-codex-tab="${state.tab}">
    <header class="codex-head">
      <img class="codex-emblem" src="${escapeAttribute(`${artBase}art/emblem.svg`)}" alt="">
      <div class="codex-heading">
        <span class="eyebrow">日光花园 / 行旅手册</span>
        <h2>虫族图鉴 <small>可随时查阅</small></h2>
        <p>${escapeHtml(tab.summary)}</p>
      </div>
      <div class="codex-meta">
        <span class="codex-meta-line">真实数值 · 未解锁种族也可学习</span>
        ${context}
      </div>
    </header>
    <div class="codex-tabs" role="tablist" aria-label="图鉴分类">${tabs}</div>
    <div class="codex-layout">
      <nav class="codex-list" aria-label="${escapeAttribute(tab.label)}条目"><span class="codex-list-label">${escapeHtml(tab.label)} · ${entries.length} 项</span>${list}</nav>
      <article class="codex-detail" id="codex-panel" role="tabpanel" aria-labelledby="codex-tab-${state.tab}" data-codex-detail="${escapeAttribute(entry.id)}">${detail}</article>
    </div>
    <footer class="codex-footer">
      <span><kbd>←</kbd><kbd>→</kbd> 分类 <kbd>↑</kbd><kbd>↓</kbd> 条目 <kbd>Esc</kbd> 关闭</span>
      <span class="codex-source">数值来源：RACES · BATTLE_RULES</span>
      <button class="button secondary codex-close-button" data-action="close">关闭图鉴</button>
    </footer>
  </div>`;
}
