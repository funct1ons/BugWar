# 战役平衡实测报告

> **交付阅读提示（2026-10-21）：** 本文按时间保留旧版失败与后续修订。当前结论以「授权平衡修订：Agile 首轮流程」之后的「结论与保留风险」「新版完整参考结果」为准：13关easy/normal均有Agile策略胜利；旧版速败表不代表当前版本。文中的旧编译阻塞已修复。最终集成84项通过与实机验收见 [测试报告](test-report.md)。

## 范围与复现（以下至修订章节为历史记录）

执行 `npm test -- --reporter=verbose`：2 个测试文件、67 项测试全部通过；最终运行耗时 1.95 秒（测试部分 1.26 秒）。新增 campaign 文件 44 项测试，其中 39 项为关卡/难度矩阵；每项执行五种策略，共 **195 场真实模拟**，每场最多 600 模拟秒。结果由测试输出 `CAMPAIGN_RESULT` JSON，可重跑获取完整指标。未修改任何生产代码或关卡参数。

已阅读 architecture、core-rules、ai、Simulation、levels、SaveSystem。只新增本测试和报告。

## 机器人定义与解释限制

- P / agile-planner：Agile，每 0.75 秒调用一次 `think(world,1,'hard',dispatch)`，不开技能。
- A / agile-pulse：同 P，满能量时选择半径 135 内可造成最大即时伤害的位置施法。
- S / strong-pulse、F / fast-pulse：同 A，分别选择 Strong / Fast。
- G / agile-guard：同 A，但派遣回调额外保留 20 初兵；这是独立的保守防守变体，不是额外资源。

敌方完全使用 Simulation 内置难度 AI；没有关停敌方、增兵、改生产、改坐标或修改世界所有权。以 0.75 秒调用 step，内部仍走 0.05 秒固定步长。每步消费事件并验证兵数有限、非负。

**自动对战不等价真人**。P/A/S/F 共用同一目标规划器，对炮塔途中损耗盲区也相同。S/F 在完成 Agile 全战役前不能通过正常存档选择，因此 S/F 胜利不能证明首次流程可通。以下是可复现参考结果，不是通关保证。有限时失败也不能证明数学上无解；playing 表示超时，不擅自判平局。

## 布局与存档验证

- 13 个连续编号、13 个不同坐标布局、四种生境；建筑 ID 唯一、阵营唯一且为 1–4，包含玩家，所有非中立所有者均已配置，种族合法。
- 所有建筑中心 x∈[120,1480]；按上下 80 像素保守占位检查，均不进入顶部 y≤130 和底部 y≥790 的 HUD；建筑中心两两距离≥160。此为逻辑几何检查，不声称完成浏览器缩放/文本实际排版验收。
- 内存存储实际写入并新建 SaveSystem 重载：损坏 JSON、null、旧版本、非法星级/关卡/负时间、读写抛错均有验证。
- master/music/sfx、静音、难度、减少动画重载；音量越界钳制、非法值回退；reset 后重载。
- best：先比较星级，同星取最短时间；更快低星不会覆盖；各种族独立。
- 顺序完成 Agile 1–13，每次重载检查关卡解锁，只有第 13 次才开放 Fast/Strong；三族各完成 13 关，验证全部 12 个成就、去重、65 星和累计 40 次胜利（含重复过关）。这是存档规则验证，不是假装这 40 次是机器人胜场。

## 风险和建议

1. **首轮流程有明显风险，不能宣称全战役已平衡。** Agile 在第 2/3/4/6/9/10 关所有测试难度均未取得胜利；第 6、10 关连 S/F 也全败，多数 12–45 秒内结束。优先人工验证这些关，尤其第 6 关玩家单生产巢对三个敌生产巢、第 10 关两个玩家巢对三个敌巢并受敌炮塔影响。
2. G 保留 20 的变体没有任何胜利，说明简单强留守并不能解决规划问题；它可能阻止有效扩张，而非有效防雪崩策略。
3. P/A 对关 1 normal/hard 也会快速失败，而 S 能胜。首关可达性需要真人或不同的开局脚本验证，不能用未解锁种族掩盖。
4. 多阵营难度不单调：关 9 easy 全策略败而 normal/hard 的 S 胜；关 13 easy 的 Agile 失败而 normal/hard 成功。敌方互相消耗、决策间隔和攻击顺序改变局势，不应据此认为 hard 全面更容易。
5. 技能不是必胜修复：关 5 easy 的 P 败、A 72.2 秒胜，但关 3 easy P 可持续到 600 秒，A 却 88.85 秒败；即时最大伤害并不总是正确的战略目标。
6. 没有调整初兵/坐标/par。上述实验不足以区分规划器炮塔盲区与关卡真正无解；盲目加玩家初兵可能掩盖 AI 缺陷。没有在未提前通知主代理的情况下改 levels。建议主代理将早期速败关列为发布阻断风险，再授权针对 Agile 的保守初兵扫描及真人验收。

## 超时、空闲与死锁

记录每个仍有建筑的阵营距最后一次 dispatch 的最长时间，以及连续无 impact/capture 的最长时间。空闲不等于没有思考；炮塔消灭行军可导致频繁派兵但长期无接战，初兵调整未必能修复。

- 关 3 easy P：600 秒仍在战，双方派遣 266/135 次，最长无接战 5 秒，是持续消耗，不是静止死锁。
- 关 3 hard S：600 秒，敌 2 最长 515 秒无派遣，最长无接战 497 秒；玩家仍派遣 268 次。疑似炮塔消耗/投影与实际结算分歧。
- 关 11 easy S：600 秒，剩玩家与阵营 3；阵营 3 最长 501 秒无派遣，最长无接战 461 秒，玩家派遣 768 次。
- 关 12 easy F：600 秒，剩玩家与阵营 4；玩家最长 565 秒无派遣，最长无接战 549 秒，阵营 4 派遣 408 次。
- 关 11 normal G：也达到 600 秒，完整指标见下方原始结果。

以上只能称有限时停滞候选，不证明无限时永远不能结束。测试不把“所有策略必须获胜”写成断言，以免把实验观察冒充规则契约；真实结果始终输出。

## 每关每难度参考结果

下表列出全部策略，`won/lost/playing@秒数`。未获胜的组合明确保留失败结果。

| 关 | 难度 | G | P | A | S | F |
|---|---|---|---|---|---|---|
| 1 | easy | lost@36.6 | won@38.1 | won@38.1 | won@31.35 | lost@47.45 |
| 1 | normal | lost@35.1 | lost@38.1 | lost@38.1 | won@36.6 | lost@30.6 |
| 1 | hard | lost@32.85 | lost@30.6 | lost@30.6 | won@37.35 | lost@24.6 |
| 2 | easy | lost@40.85 | lost@70.6 | lost@76.6 | won@51.85 | lost@34.85 |
| 2 | normal | lost@36.4 | lost@48.1 | lost@48.1 | won@58.6 | lost@43.9 |
| 2 | hard | lost@36.4 | lost@41.45 | lost@41.45 | won@60.45 | lost@33.4 |
| 3 | easy | lost@38.3 | playing@600 | lost@88.85 | won@339.1 | lost@25.85 |
| 3 | normal | lost@37.85 | lost@51.35 | lost@51.35 | won@127.05 | lost@48.35 |
| 3 | hard | lost@34.1 | lost@47.6 | lost@47.6 | playing@600 | lost@59.3 |
| 4 | easy | lost@38.15 | lost@35.15 | lost@35.15 | won@115.95 | lost@29.15 |
| 4 | normal | lost@41.75 | lost@31.6 | lost@31.6 | lost@76.25 | lost@26.15 |
| 4 | hard | lost@41 | lost@31.8 | lost@31.8 | lost@55.45 | lost@23.75 |
| 5 | easy | lost@71.4 | lost@115.7 | won@72.2 | lost@59.4 | lost@49.4 |
| 5 | normal | lost@68.9 | won@99.75 | won@83.2 | won@78.6 | lost@28.05 |
| 5 | hard | lost@70.7 | lost@130.3 | won@135.05 | won@85.9 | lost@11.8 |
| 6 | easy | lost@24.15 | lost@24.5 | lost@24.5 | lost@28.1 | lost@24.5 |
| 6 | normal | lost@25 | lost@24.5 | lost@24.5 | lost@24.5 | lost@19 |
| 6 | hard | lost@23 | lost@26 | lost@26 | lost@23 | lost@18.25 |
| 7 | easy | lost@57.15 | won@57.2 | won@51.9 | won@50.65 | lost@65.6 |
| 7 | normal | lost@54.9 | won@59.55 | won@59.55 | won@246.65 | lost@60.15 |
| 7 | hard | lost@44.45 | won@62.45 | won@62.45 | won@189.45 | lost@56.45 |
| 8 | easy | lost@47.45 | lost@74.5 | lost@89.5 | won@95.65 | won@45.6 |
| 8 | normal | lost@57.8 | won@70 | won@58 | won@81.8 | lost@149.3 |
| 8 | hard | lost@54.55 | lost@69.85 | lost@99.25 | won@84 | lost@106.1 |
| 9 | easy | lost@70.3 | lost@55.3 | lost@55.3 | lost@99.05 | lost@14.85 |
| 9 | normal | lost@92.8 | lost@115.85 | lost@64.6 | won@81.55 | lost@20.85 |
| 9 | hard | lost@127.85 | lost@23.1 | lost@23.1 | won@103.75 | lost@15.7 |
| 10 | easy | lost@27.85 | lost@18.65 | lost@18.65 | lost@30.65 | lost@18.65 |
| 10 | normal | lost@26.35 | lost@25.4 | lost@25.4 | lost@28.6 | lost@14.9 |
| 10 | hard | lost@23.35 | lost@23.15 | lost@23.15 | lost@44.9 | lost@12.65 |
| 11 | easy | lost@179.45 | won@53.6 | won@50.8 | playing@600 | lost@54.5 |
| 11 | normal | playing@600 | lost@69.4 | lost@88.9 | won@104.35 | lost@27.05 |
| 11 | hard | lost@70.65 | won@109.65 | won@82.7 | won@55.15 | lost@81.2 |
| 12 | easy | lost@66.05 | lost@86.65 | lost@93.1 | lost@66.15 | playing@600 |
| 12 | normal | lost@94.15 | lost@134 | won@81.95 | lost@83.7 | lost@101.05 |
| 12 | hard | lost@82.55 | lost@64.6 | lost@64.6 | lost@68 | lost@41.75 |
| 13 | easy | lost@70.1 | lost@49 | lost@49 | won@175 | won@54.7 |
| 13 | normal | lost@119.9 | won@119.25 | won@100.75 | won@51.75 | won@89.15 |
| 13 | hard | lost@105.8 | won@82.05 | won@76.15 | won@51.5 | lost@71.7 |

## 额外检查

执行 `npx tsc --noEmit`：未通过，现有 src/main.ts 引用的 ./audio/AudioSystem 缺失（TS2307）。未修改该授权外文件；npm test 仍为 67/67 通过。

## 超时原始指标

```json
[
    {
        "level":  3,
        "difficulty":  "easy",
        "strategy":  "agile-planner",
        "status":  "playing",
        "time":  600,
        "lost":  1,
        "dispatches":  {
                           "1":  266,
                           "2":  135
                       },
        "maxIdle":  {
                        "1":  7,
                        "2":  8
                    },
        "maxQuiet":  5,
        "survivors":  [
                          1,
                          2
                      ]
    },
    {
        "level":  3,
        "difficulty":  "hard",
        "strategy":  "strong-pulse",
        "status":  "playing",
        "time":  600,
        "lost":  1,
        "dispatches":  {
                           "1":  268,
                           "2":  49
                       },
        "maxIdle":  {
                        "1":  11,
                        "2":  515
                    },
        "maxQuiet":  497,
        "survivors":  [
                          1,
                          2
                      ]
    },
    {
        "level":  11,
        "difficulty":  "easy",
        "strategy":  "strong-pulse",
        "status":  "playing",
        "time":  600,
        "lost":  6,
        "dispatches":  {
                           "1":  768,
                           "2":  27,
                           "3":  61
                       },
        "maxIdle":  {
                        "1":  5,
                        "2":  16,
                        "3":  501
                    },
        "maxQuiet":  461,
        "survivors":  [
                          1,
                          3
                      ]
    },
    {
        "level":  11,
        "difficulty":  "normal",
        "strategy":  "agile-guard",
        "status":  "playing",
        "time":  600,
        "lost":  7,
        "dispatches":  {
                           "1":  1463,
                           "2":  12,
                           "3":  423
                       },
        "maxIdle":  {
                        "1":  1,
                        "2":  10,
                        "3":  5
                    },
        "maxQuiet":  3,
        "survivors":  [
                          1,
                          3
                      ]
    },
    {
        "level":  12,
        "difficulty":  "easy",
        "strategy":  "fast-pulse",
        "status":  "playing",
        "time":  600,
        "lost":  3,
        "dispatches":  {
                           "1":  7,
                           "2":  4,
                           "3":  12,
                           "4":  408
                       },
        "maxIdle":  {
                        "1":  565,
                        "2":  11,
                        "3":  12,
                        "4":  8
                    },
        "maxQuiet":  549,
        "survivors":  [
                          1,
                          4
                      ]
    }
]
```

# 授权平衡修订：Agile 首轮流程（追加，保留以上历史）

## 执行与 AI 版本

收到授权后只修改 levels、campaign 测试和本报告。没有改 core、坐标、建筑类型、生产率、par、阵营种族或关卡提示。

先对旧 AI 做了 0–100、步长 5 的初兵扫描，按每关 easy 与 normal 均至少 P/A 一种胜选第一个候选。期间 core 代理更新 AI 后，首次完整回归出现 8 个失败组合，旧候选**没有被视为最终结果**。重新扫描后落地下表方案，并在新 AI 上完整验证。最终 ai.ts SHA256 为 `419BC4EFB6EDFAB22B3B7EC5BAE0C2BDD94BCEB16B2F32D37800EEB5F28D255F`，扫描前后核对相同。

最终普通运行：`npm test -- --reporter=verbose`，**68 通过、1 按需扫描跳过**，3.59 秒。随后 PowerShell 执行 `$env:CAMPAIGN_SCAN='1'; npm test -- --reporter=verbose; Remove-Item Env:CAMPAIGN_SCAN`，**69 全部通过**，8.84 秒。该次执行含完整 195 场矩阵、75 个扫描候选×4场=300场，以及1场教学延迟测试，共496场。每场最多600模拟秒。扫描采用复制的关卡，不修改 LEVELS；测试中保留原始 a 巢初兵基线，使再次运行不会在已平衡数据上重复加兵。

`npx tsc --noEmit` 再次执行仍因现有 main.ts 的 AudioSystem 缺失失败，未越权修复。

## 最终数值变更

只增 a 巢初兵；第1关只削敌；6/10另调整一座邻近中立生产巢所有权，不增加建筑。单位没有数百堆叠，但第9关 +80 仍是较大补偿，后续需真人确认难度。

|关|a 初兵原→新|额外变化|
|---|---|---|
|1|38→38|敌 d 26→16|
|2|34→34|无|
|3|40→40|无|
|4|32→97|无|
|5|45→50|无|
|6|38→88|b 由中立转玩家，保留8兵；玩家初始生产巢1→2|
|7|34→34|无|
|8|46→91|无|
|9|44→124|无|
|10|44→64|c 由中立转玩家，保留10兵；玩家初始生产巢2→3|
|11|40→70|无|
|12|46→46|无|
|13|48→63|无|

这些增量是指定5兵网格、指定只增a巢/6与10固定转巢方案中的首个双难度通过候选，不是全参数最小值，也不声称胜率估计。确定性单场通过不等于对多种真人操作鲁棒。第1关 normal 的 P 在前6秒完全不下令，仍于28.35秒获胜、lost=0；加入专门回归测试，给出有限的教学容错证据，不代表无限等待也能赢。

## 结论与保留风险

- 全13关 easy、normal **均有 Agile P 或 A 在600秒内胜利**；测试现在对这26个组合强制断言，回归将失败。
- 新矩阵39个关卡难度组合：P胜21场、A胜35场、S胜33场、F胜8场、G胜3场。hard不要求全关可胜。
- 关6/10原来的速败风险已被本方案缓解，胜利不再依赖未解锁种族；完整参考时刻见下表。
- **仍有15场超时**（P11、G4），不是“AI停滞全部修好”。新矩阵超时场双方仍频繁派遣，最长连续无impact/capture仅3–8秒；不再复现旧版497/549秒的无接战长空闲。持续拉锯仍存在，尤其无技能策略；技能策略是本次可通标准的一部分。
- 多阵营仍有非单调结果；不能从 easy/normal 单次确定性获胜推断真人难度曲线。旧风险/旧数据保留作历史，不应用旧版速败时刻描述当前版本。

## 新版完整参考结果

策略缩写沿用历史定义；playing为600秒未结束。所有数据来自最后69项全通过的执行。

|关|难度|G|P|A|S|F|
|---|---|---|---|---|---|---|
|1|easy|won@151.15|won@35.1|won@35.1|won@27.6|won@31.4|
|1|normal|lost@39.6|won@33.6|won@33.6|won@28.35|won@72.65|
|1|hard|lost@37.35|won@34.35|won@34.35|won@27.6|won@41.15|
|2|easy|lost@37.85|playing@600|won@94.15|won@62.7|lost@37.9|
|2|normal|lost@36.4|playing@600|won@118.85|won@70.65|lost@48.4|
|2|hard|lost@36.4|playing@600|won@127.7|won@66.45|lost@37.9|
|3|easy|lost@46.85|playing@600|won@159.8|won@67.25|lost@25.85|
|3|normal|lost@37.85|won@195.85|won@127.85|lost@48.05|lost@474.35|
|3|hard|lost@34.85|playing@600|won@121.85|lost@45.05|won@259.5|
|4|easy|lost@56.85|won@41.15|won@41.15|won@54.35|lost@47.15|
|4|normal|lost@50.15|won@50.75|won@50.75|won@40.95|lost@50.75|
|4|hard|lost@58.05|won@39.5|won@39.5|won@34.3|lost@48.5|
|5|easy|won@207.65|won@83.45|won@66.7|won@61.15|lost@94.85|
|5|normal|lost@57.15|lost@87.15|won@113.1|won@38.85|lost@84.1|
|5|hard|lost@202.4|lost@44.3|lost@44.3|won@102.4|lost@32.6|
|6|easy|lost@48.5|won@65.2|won@64.75|won@49.45|lost@32.85|
|6|normal|lost@33.5|won@53.2|won@53.2|won@49|lost@48.5|
|6|hard|lost@50.5|won@59.95|won@59.95|won@47.95|lost@44|
|7|easy|lost@74.6|playing@600|won@68.6|won@69.45|won@127.65|
|7|normal|playing@600|playing@600|won@122.6|won@94.2|lost@160.6|
|7|hard|playing@600|playing@600|won@88.7|won@90.2|won@267.25|
|8|easy|lost@55.8|lost@98.3|won@126.15|lost@149.5|lost@46.05|
|8|normal|lost@47.3|won@58|won@56.4|won@71.9|lost@61|
|8|hard|lost@107.3|playing@600|won@72.95|lost@58.6|lost@52.6|
|9|easy|won@251.7|won@36.15|won@36.15|won@44.05|lost@113.85|
|9|normal|lost@131.8|won@42.15|won@42.15|won@38.3|lost@21.65|
|9|hard|lost@94.4|lost@57.2|lost@57.2|won@44.3|lost@28.5|
|10|easy|lost@40.65|playing@600|won@227.9|won@184.55|won@119.25|
|10|normal|playing@600|playing@600|won@220.4|won@226.05|lost@16.4|
|10|hard|playing@600|lost@32.9|lost@32.9|won@122.35|lost@17.15|
|11|easy|lost@110.45|lost@96.55|won@176.45|lost@93.15|lost@73.55|
|11|normal|lost@195.4|won@66.45|won@64.15|won@78.35|lost@33.4|
|11|hard|lost@83.65|won@141.95|won@85.7|won@50.8|lost@89.4|
|12|easy|lost@81.5|won@134.45|won@87.5|won@112.1|lost@66.05|
|12|normal|lost@68|won@68.75|won@61.2|won@70.1|won@57.95|
|12|hard|lost@94.15|won@61.25|won@64.25|won@86.6|lost@73.25|
|13|easy|lost@76|won@90.4|won@76.9|lost@71.95|lost@73.5|
|13|normal|lost@83.6|won@57.25|won@57.25|won@96.3|lost@28.3|
|13|hard|lost@96.35|lost@70.1|lost@73.1|won@58.5|lost@52.25|

## 新AI扫描网格记录

每项为 extra:通过/失败；通过要求 easy/normal 各至少一个 P/A 胜。所有扫描运行均保留不增兵的起点，即使新版不再需要旧候选增兵。

- 关1：0:True
- 关2：0:True
- 关3：0:True
- 关4：0:False, 5:False, 10:False, 15:False, 20:False, 25:False, 30:False, 35:False, 40:False, 45:False, 50:False, 55:False, 60:False, 65:True
- 关5：0:False, 5:True
- 关6：0:False, 5:False, 10:False, 15:False, 20:False, 25:False, 30:False, 35:False, 40:False, 45:False, 50:True
- 关7：0:True
- 关8：0:False, 5:False, 10:False, 15:False, 20:False, 25:False, 30:False, 35:False, 40:False, 45:True
- 关9：0:False, 5:False, 10:False, 15:False, 20:False, 25:False, 30:False, 35:False, 40:False, 45:False, 50:False, 55:False, 60:False, 65:False, 70:False, 75:False, 80:True
- 关10：0:False, 5:False, 10:False, 15:False, 20:True
- 关11：0:False, 5:False, 10:False, 15:False, 20:False, 25:False, 30:True
- 关12：0:True
- 关13：0:False, 5:False, 10:False, 15:True
