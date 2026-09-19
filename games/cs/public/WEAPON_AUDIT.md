> Archived upstream v28 audit for source revision `64a254be2dcb606f028bc4c9f64a1dd1ae71f3a5`; not evidence of Carrick verification or deployment. See `CREDITS.md`.

# CS 枪械逐项核对 · 2026-09-19

全部 17 把枪采用对应的 Valve CS:GO Workbench 几何，独立设置弹匣、套筒、枪栓与手掌接触点。材质和动画仍是本项目制作，没有导入原版动画轨道或皮肤贴图。

| 枪械 | 原始参考三角面数 | 对应开火样本 |
|---|---:|---|
| AK-47 | 13069 | normal: ak47_01.wav |
| M4A1-S | 23704 | normal: m4a1_us_01.wav, m4a1_us_02.wav, m4a1_us_03.wav, m4a1_us_04.wav / suppressed: m4a1_silencer_01.wav |
| AWP | 21916 | normal: awp_01.wav, awp_02.wav |
| Desert Eagle | 8591 | normal: deagle_01.wav, deagle_02.wav |
| MP5-SD | 22170 | normal: mp5_01.wav / suppressed: mp5_01.wav |
| Glock-18 | 4446 | normal: glock_01.wav, glock_02.wav |
| USP-S | 12000 | normal: usp_unsilenced_01.wav, usp_unsilenced_02.wav, usp_unsilenced_03.wav / suppressed: usp_01.wav, usp_02.wav, usp_03.wav |
| Nova | 19260 | normal: nova-1.wav |
| XM1014 | 19496 | normal: xm1014-1.wav |
| SSG 08 | 13553 | normal: ssg08_01.wav |
| G3SG1 | 13714 | normal: g3sg1_01.wav, g3sg1_02.wav, g3sg1_03.wav |
| AUG | 21355 | normal: aug_01.wav, aug_02.wav, aug_03.wav, aug_04.wav |
| SG 553 | 12944 | normal: sg556_01.wav, sg556_02.wav, sg556_03.wav, sg556_04.wav |
| M249 | 8566 | normal: m249-1.wav |
| MAC-10 | 8759 | normal: mac10_01.wav, mac10_02.wav, mac10_03.wav |
| P90 | 15907 | normal: p90_01.wav, p90_02.wav, p90_03.wav |
| MP9 | 13853 | normal: mp9_01.wav, mp9_02.wav, mp9_03.wav, mp9_04.wav |

## 本次修改

- 替换 M249、Glock-18、AWP、G3SG1、MP9 的简化模型。其余 12 把的参考几何保持不变。
- M249 分离弹箱、供弹盖和右侧拉机柄，补充可见弹链与供弹盖手部接触。
- Glock-18 的套筒、弹匣与固定枪管独立；保留半自动/三连发与空仓挂机。
- 校正 M249、G3SG1 的人物支撑手位置，不拉长手臂或手指。
- 每把枪核查真实文件来源及音频校验值，开火仍保持原始波形、采样率和音高；近远音量、声像和距离滤波由本游戏控制。
- 使用该存档中各枪对应的 numbered report 样本；Nova、XM1014、M249 保留存档提供的对应单样本。

## 手雷与蝴蝶刀

手雷改为带黄色识别环的椭圆壳体、独立保险拉环和压柄；使用骨骼手部。按住拉环，松开后先摆臂，0.22 秒脱手，随后收手切回武器。左/右/双键分别远/近/中投，继承移动和跳跃速度，脱手后开始 1.5 秒引信。固定 120 Hz 子步进处理碰撞与衰减弹跳，增加原始 HE 操作/碰撞/爆炸声和短闪光尘雾。数值按本项目世界尺度适配，不承诺复用 CS:GO 投掷点位。

蝴蝶刀从刀片连续转圈改为整刀绕指翻转、游离柄开合、接柄和停顿检视；食指接触点约束避免手掌滑离。已逐帧查看 Fade 的 35 帧动作和 Black Pearl 的 25 帧展示。搜索到的 Dailymotion 慢动作视频播放失败，未把它作为已观看证据；不能宣称完整覆盖原版全部随机切刀/检视变体。

## 验证与限制

### 爪刀金属更新与蝴蝶刀精确复刻状态

爪刀刀面、刃口、骨架和指环采用独立金属材质，共享本地生成的 512×256 线性 HDR 环境反射；刀面粗糙度 0.29，刃口 0.15，指环 0.20。橡胶握柄保持哑光。无需请求外部材质图片，不改变几何、手部或动作轨道，也不更改其他武器材质。已验证反射数据、材质隔离与 804 个爪刀动作姿态；尚未进行浏览器 PBR 实机视觉验收。

蝴蝶刀仍是项目手工动画，本次未冒充实现原版全部随机动作。已有官方 Workbench 几何包不含蝴蝶刀骨骼动画，现有参考动图也不覆盖完整随机序列。精确复刻需要指定 CS:GO 版本的完整第一人称刀与手臂骨骼动画资源（原始模型及其动画依赖，或保留全部动画轨道的导出），包括序列帧率、帧数、事件时间和随机选择规则；随后才能做逐帧轨道、持握和声音同步对照。

已离线查看全部 17 把枪侧面、持握、拉栓和换弹姿态；检查可动部件、弹药守恒、动作打断、CT/T 持枪、蝴蝶刀刀刃与手部交叉以及手雷 30/60/120/144 Hz 弹道一致性。音频校验以原始文件与模拟连射混音为依据，未进行主观耳听或实时完整对局验证。离线渲染不代表浏览器最终 PBR 画面。

## 参考

- 模型：https://www.counter-strike.net/workshop/workshopresources
- 声效：https://github.com/sourcesounds/csgo/tree/08f1bd6835d4f510d2ccaedeab6bb9f637b388ab
- 蝴蝶刀动作：https://steamcommunity.com/sharedfiles/filedetails/?id=931321295
- 蝴蝶刀展示：https://steamcommunity.com/sharedfiles/filedetails/?id=1229430615

## 蝴蝶刀随机变体更新（v28）

继续核对 Okom 的原始录屏页面：章节列出三套检视（0:34、1:21、2:12）和两套切刀（3:10、3:24）。UNKNOWN Tech 的慢动作页面也明确包含稀有动作。两段视频在当前浏览器均未加载出视频帧，因此只把标题、说明和章节用于确认参考范围，没有据此声称逐帧观看。

新找到 7empest 的 GameMaps 移植包，作者说明包含三套 CS:GO 检视动画；下载页面被网站安全服务拦截，未取得 VPK。该包同时混用多款游戏声音，即使取得也不能视为原版完整动画/声音存档。Sketchfab 的 Vanilla 模型页面只确认几何与材质，没有证明包含动画。

本版在既有手工轨道上增加腕部开刀，以及游离柄展示、额外绕指翻转的检视变化，合计两套切刀、三套检视。每次动作开始独立等概率选择，允许连续重复；整个动作固定变体。时长仍为切刀 1.05 秒、检视 3.4 秒，沿用项目声音事件时间。这些轨道、时长及概率均不是从 Valve 动画数据提取，不能称为原版全部动作逐帧一致。

验证：707 个姿态覆盖全部五种变体与轻重攻击，检查有限矩阵、固定铰链间距、刀刃与手部间隙、腕部角度、打断复位及 16:9/4:3 检视取景。真实游戏状态测试覆盖每个随机分支、动作中变体保持不变、切枪/攻击取消及声音不重复。查看离线几何渲染；未进行浏览器最终画质与完整动态实机验收。爪刀金属更新保留。

新增参考：
- Okom 原始录屏：https://www.youtube.com/watch?v=ARObkSE8z5o
- UNKNOWN Tech 慢动作：https://www.youtube.com/watch?v=irTzzUBfzGQ
- 7empest 移植包说明：https://www.gamemaps.com/details/26460
- Vanilla 几何页面：https://sketchfab.com/3d-models/butterfly-knife-vanilla-514edc772445441083b3cd611fd4e65c
