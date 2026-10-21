# Bug War 2 研究补遗（仅研究，不实现）

## 范围与证据标准

已先阅读本次用户研究要求及追加的 MaxGames 核实信息。工作区检查时只有 `.git`，没有可供阅读的另一个“用户原版研究需求”文件；因此不能声称读过未提供的完整原始需求。本报告以对话中要求为范围，不创建游戏、不确定设计参数。

置信分级：**高**＝直接取得作者/发布页说明，或多项明确证据；**中**＝直接取得的同期独立评测；**低**＝只有现代转载站描述、无法独立验证；**未知**＝缺乏可判定原文/画面。网页说明不等于运行时测试；本次没有运行原版。

## 1. 技能/魔法：确认了操作，未确认伤害与充能

### S1：MaxGames 发布页（已实际 fetch 原文）
URL：https://www.maxgames.com/game/bug-war-2.html

> “When the energy bar is full, you are able to cast magic by pressing 'A' or clicking on the energy bar, and then move and click on the pointer to the desired area.”

**高置信（网页说明层面）**：有能量条；满条时按 A 或点击能量条进入施法操作，再点击目标区域。不能据此声称存在技能树、多种可选法术、逐族专属法术、自动施法。

**仍未知**：实际视觉效果、是否造成伤害/击杀/减速/击退、影响行军单位还是驻军、是否伤害友军、半径、持续时间、目标限制、消耗量、施放取消方式；以及能量到底按时间、击杀、出兵、占领还是其他事件累积。原文只写“full”，没有说明“如何变满”。

### S2：8Games 转载描述（原文已 fetch，但只能作为线索）
URL：https://8games.net/defense-games/bug-war-2.html

> “In the bottom right corner, an energy meter fills until you can cast spells, and the tornado can block expansion or cut reinforcement routes.”

**低置信线索**：此站提到 tornado（龙卷风）与阻碍扩张/增援。没有可核对的原版演示帧或作者说明，不能将其写成已确认技能效果。该页还写“begins with bees”“After a few wins, new beetle breeds”，与同期评测的 Agile 开局、通关解锁表述不一致；不能据此确定物种或解锁条件。

**搜索摘要幻觉的具体例子**：搜索 `"Bug War 2" "energy" "kill"` 返回的回答声称“energy meter fills over time”“not getting energy from kills”，但指向的 S2 原文并没有 over time 或排除击杀充能的陈述。因此这两项均不采信。“fills”本身不能证明被动计时充能。

## 2. 操作与派兵比例

S1 原文：

> “To send units to other colonies, drag your pointer from your building to the target building.”
>
> “Selection of multiple colonies are done by dragging pointer over all of the desired colonies.”

**高置信（说明层面）**：从己方建筑拖向目标可派兵；拖过需要的殖民地可多选。

### S3：Newgrounds 作者说明（已 fetch）
URL：https://www.newgrounds.com/portal/view/534973

> “Click your colonies individually or click and drag to select multiple colonies. Click a neutral or enemy colony to attack.”

**高置信（作者说明层面）**：点击己方单选，拖框多选，点击中立或敌方殖民地攻击。与用户已核实的 Kongregate 描述一致，但本次尝试的 Kongregate URL 只返回平台通用页，不能冒充独立取得 Kongregate 游戏原文。两种操作说明可以并列记录；没有实际运行，不判断某一种是唯一操作。

**派兵比例未知**：本次检索没有取得“全军”“一半/50%”“可调百分比”、留守下限、取整规则或连续派兵间隔的直接证据。截图中的箭头也不证明比例。不得默认每次派出一半。

## 3. 三种族：名称和解锁已知，属性未知

### S4：Anne in Red 同期评测（2010 年 7 月，已 fetch 全文）
URL：https://anneinred.blogspot.com/2010/07/bug-war-2-tips-and-review.html

> “At the start, you’ll see that there are 3 options for races of bugs: Agile, Fast or Strong – but you can only choose Agile type of bugs if you’re playing the game for the first time.”
>
> “Fast and Strong bugs can be unlocked after finishing the game using the Agile Race.”

**中置信，同期评测明确陈述**：初始 Agile；用 Agile 通关后解锁 Fast 与 Strong。

| 种族 | 可确认 | 未确认 |
|---|---|---|
| Agile | 名称、初始可选 | 速度、生命/战斗力、生产率、专属魔法 |
| Fast | 名称、上述解锁条件 | 实际速度倍率、代价、战斗力、生产率 |
| Strong | 名称、上述解锁条件 | 实际伤害/防御倍率、速度代价、生产率 |

不能仅凭英文名称推导 Agile＝均衡、Fast＝速度翻倍、Strong＝二换一等数值或规则。S3 评论区有人说“crickets were the hardest”，这是玩家意见，不足以建立种族与昆虫外观的对应表。

## 4. 炮塔行为

S4 直接证据：

> “the Spawn tower which can produce bugs every second”
>
> “the Cannon tower that can fire cannon balls at incoming attacking bugs but can’t create bugs.”
>
> “Both towers can hold unlimited number of bugs.”

**中置信，同期评测**：Spawn 按秒生产；Cannon 向来袭虫群射击、不生产；两类塔都可驻军，评测称驻军无限。注意“every second”不能自动解释为每秒恰好 1 只，也不能推出所有种族生产率相同；“无限”未经过压力测试。

**未知**：射程、射速、弹速、单体/溅射、命中规则、优先目标、驻军数是否影响火力、无人炮塔是否射击、是否消耗驻军作炮弹、可否射击路过但并非攻击本塔的敌军、是否存在友伤。不能从“incoming attacking bugs”扩展成已确认全范围自动锁敌。

## 5. 13 关：数量有证据，逐关布局尚无证据

S4：

> “There are 13 levels in the game”
>
> “after you finish level 13 'aka' \"The Final Level\"”

同文明确“1-5 stars”，并说：

> “The key to get all 5 stars in each level is speed and to some extent, not losing any spawn over to the enemies.”

还写有 12 trophies/achievements。**中置信**：13 关、末关称 The Final Level、1–5 星、速度和丢巢与评分有关、12 成就。评测举例第 1 关 11 秒且丢 1 巢仍获 5 星，因此不能写成“丢任何巢都不能五星”。未取得评分公式/阈值。

| 关卡 | 本次布局核实结果 |
|---|---|
| 1 | 未取得开局完整画面；评测的结算截图不是布局证据 |
| 2–9（逐关） | 均未取得可标识关卡号的完整开局画面 |
| 10–12（逐关） | 同上；评测对高关卡的驻军建议不能代替节点图 |
| 13 | 可确认评测中的末关称呼；塔坐标、数量、归属、初始驻军仍未知 |

不能据 13 关数量编造 13 张地图，也不能把一张未标关卡号的宣传截图指定为某关。地形是否影响寻路、建筑间是否有固定连接、起始敌军种族是否固定，均未核实。

## 6. 参考图片与视频尝试

以下三图已下载并直接打开检查，仅限研究参考；**不得拷贝进成品或视为授权游戏素材**：

| 本地文件 | 原始 URL | 实际可见与局限 |
|---|---|---|
| `reference/maxgames-1.jpg` | https://www.maxgames.com/upload/images/bug_war_2_screenshot_1MTA1OA==.jpg | 约 100×75 的建筑/虫群及箭头局部图，无完整 HUD、关卡号或可读技能说明 |
| `reference/maxgames-2.jpg` | https://www.maxgames.com/upload/images/bug_war_2_screenshot_2MTA1OA==.jpg | 约 125×125 的昆虫宣传图，不提供机制证据 |
| `reference/maxgames-3.jpg` | https://www.maxgames.com/upload/images/bug_war_2_screenshot_3MTA1OA==.jpg | 约 125×125 的局部战场，建筑、数字与行军虫群可见；无关卡号，无法重建完整布局或充能机制 |

视频：https://www.youtube.com/watch?v=ExCw1Z5w5po

已尝试 fetch，返回无法提取 YouTube 内容，提示需浏览器 Google 登录或 GEMINI_API_KEY；本地命令检查未找到 yt-dlp 和 ffmpeg。用户亦报告 YouTube 抓取缺 yt-dlp。本次未取得转录或视频帧，**没有任何带时间戳的视频观察结论**。未用宣传图充当视频截图。

## 7. 失败/排除来源及后续核实办法

- https://blog.livedoor.jp/lkrejg/archives/65430035.html ：多次正文抓取失败。搜索结果称有特殊攻击/能量条，未读取正文，不作为确认依据。
- https://armorgames.com/community/thread/5549208/bug-war-2-tips ：HTTP 503，未使用搜索摘要代替论坛内容。
- https://armorgames.com/play/5831/bugwar2 ：返回内容不足以支持魔法效果/充能判断。
- https://www.y8.com/games/bug_war_2 ：已读取 HTML；未找到能量/龙卷风规则。其泛化说明“Each controlled base generates additional soldiers”与 S4 的炮塔不生产存在冲突，不将其用于覆盖同期具体描述。

建议后续在合法可访问的原版/完整录像中进行可复核观察，而非现在填入设计值：

1. 固定种族，记录无操作时能量随时间变化；另做仅移动、仅击杀、仅占领对照，区分充能来源，记录前后时间和 HUD 数值。
2. 满条分别选择空地、敌方行军、友方行军、敌塔、友塔，记录施法前后单位数、持续时间与能量变化；区分技能视觉与真正效果。
3. 每关开局截图必须含关卡号与完整地图，逐塔记录类型、坐标、归属和驻军；有动画/随机性时至少重复两次。
4. 停止增长或通过视频逐帧分离增长影响，以 10/11/20 等驻军量测试一次派兵，计算实际派出/剩余数量与取整。
5. 对三族、炮塔进行同条件计时/计数比较；无法控制变量时只报告观察，不下数值结论。

**结论**：魔法激活操作得到可靠网页证据；实际效果仅有低置信“龙卷风”线索，充能来源仍未知。13 关完整布局、种族数值、派兵比例、炮塔详细战斗参数均不能据现有来源定案。
