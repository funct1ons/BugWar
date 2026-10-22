# 标准前期平衡 v2 实测（历史音画版）

> 本文记录固定道路引入前的实验，不是本轮道路版胜率。新路网必须重新执行道路感知的低频策略与195场矩阵；本轮结果见 [测试报告](test-report.md) 和 [道路与图鉴](roads-and-codex.md)。保留旧表是为了可追溯，不据此宣称道路版已通过。

## 方法与边界
先读 world-and-art-direction 第5节及现有核心/战役回归。朴素脚本在 `tests/onboarding.test.ts`：Agile，开始等待8/10/12秒，随后每3/3.5/4秒至多一条单巢指令。当前可见中立中最近且50%兵力超过驻军+5者优先；否则75%兵力超过敌驻军+20时集中最近敌巢；否则从兵力最多的后方巢75%补给最靠近目标的前线。只看当前建筑，不看未来、在途预测，不调用think、不用技能或多选。固定阈值不是精确战斗求解；不规避炮线。犹豫变体跳过第三个操作时隙（3–4秒），不是重复运行随机种子。确定性18种组合不是人类胜率，更不冒充真人/浏览器验收。

## 原版第二关
在任何生产代码修改前运行同一脚本：6/6失败。

|间隔/开局等待|无犹豫|跳过一轮|
|---|---|---|
|3/8秒|lost 49.60秒|lost 46.60秒|
|3.5/10秒|lost 37.85秒|lost 37.85秒|
|4/12秒|lost 46.85秒|lost 46.85秒|

原第一关仅2/6获胜，第三关0/6。旧每0.75秒hard规划器的胜利不构成新手可达性证据。

## 最终调整
- 标准思考1.5→2.7秒，悠闲3→4秒；hard保持0.75秒。
- normal/easy每阵营每轮最多一个主攻目标，可多源协调；紧急防守增援仍在主攻之前，不受该目标上限裁剪。hard完整多目标规划保留。
- 无威胁时AI最低留守hard=5（原值）、normal=8、easy=10，来袭威胁仍按原预测提高留守。
- `LevelConfig.openingGrace?:Partial<Record<Difficulty,number>>`；`Simulation.public readonly openingGrace`。未配置自定义图为0，配置非法数值安全处理。准备期不调用敌AI，生产/能量照常；计时器准备期内累积，结束后第一个固定tick即可思考（不另等2.7秒）。
- 标准13关准备秒数：14,13,12,8,7,6,5,4,3,2,1,0,0。悠闲：16,15,14,10,9,8,7,6,5,4,3,2,2。hard均0。
- 明示初兵a巢调整：关2 34→74；关3 40→70；关6 88→103；关9 124→134；关11 70→75；关12 46→96；关13 63→68。其余a不变。第二关b由中立转玩家，仍8兵，让双方初始生产巢2对2。
- 编号、坐标、生产率、战斗/炮塔/技能公式、种族与par均不变，无隐藏资源/随机作弊。初兵/所有权是地图公开配置，hard亦共享这些地图调整；不宣称hard原难度完全不变。
- 曾试仅加准备期、以及第二关单巢64兵，仍不能通过低频矩阵；双巢54兵仍有4秒脚本失败，最终74兵通过。后期多阵营慢AI会改变相互消耗，不能假定单调变容易；额外初兵由5兵步长扫描保住旧Agile回归，尤其关12增加50需真人后续复核，非全局最小解。

## 低频脚本最终结果
|关|间隔/等待|无犹豫胜利秒|犹豫胜利秒|
|---|---|---|---|
|1|3/8|46.45|47.4|
|1|3.5/10|65.9|65.9|
|1|4/12|75.4|75.4|
|2|3/8|78.35|84.3|
|2|3.5/10|97.35|91.3|
|2|4/12|83.6|68.3|
|3|3/8|143.45|83.35|
|3|3.5/10|111.45|140.65|
|3|4/12|87.45|131.45|

18/18获胜；第二关新6/6获胜，68.30–97.35秒，仍丢2–5座次建筑，存在争夺而非无伤碾压。恢复证据限于一次3–4秒犹豫，不能外推所有失误。

## 回归及残余风险
执行 `npx vitest run tests/core.test.ts tests/campaign.test.ts tests/onboarding.test.ts`：81通过、1按需扫描跳过，3文件通过（约3.14秒）。保留195场五策略全战役矩阵，easy/normal全部13关仍至少有原Agile planner/pulse之一获胜，hard不强求。核心协调测试改为明确测试hard完整规划，未削弱兵数守恒断言；新增准备期生产/立即思考/无配置默认值、主攻目标上限测试。扫描入口现在以当前地图a初兵为基准，不修改导出的地图。

仍600秒在战组合（playing不是判平或证明永远死锁）：
- 关2 easy agile-guard，最长无impact/capture 3秒。
- 关2 normal agile-guard，最长无impact/capture 3秒。
- 关3 hard agile-planner，最长无impact/capture 6秒。
- 关7 easy agile-planner，最长无impact/capture 6秒。
- 关7 normal agile-planner，最长无impact/capture 4秒。
- 关7 hard agile-guard，最长无impact/capture 5秒。
- 关7 hard agile-planner，最长无impact/capture 3秒。
- 关8 hard agile-planner，最长无impact/capture 3秒。
- 关10 easy agile-guard，最长无impact/capture 7秒。
- 关10 easy agile-planner，最长无impact/capture 6秒。
- 关10 normal agile-guard，最长无impact/capture 10秒。
- 关10 normal agile-planner，最长无impact/capture 3秒。
- 关10 hard agile-guard，最长无impact/capture 7秒。

未运行全build、未修改UI/CSS/场景/音频/美术；真实浏览器流程留给集成代理，本文不声称已完成。

## 全战役原始结果

195场机器结果见 [campaign-v2-report.json](verification/campaign-v2-report.json)。
