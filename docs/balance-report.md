# 战役平衡实测报告

## 范围与复现

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
