# 红色家园 — 本地格式兼容层说明

## 素材权利边界

本游戏运行时和发布包不附带、自动下载或分发《命令与征服：红色警戒 2》《尤里的复仇》或《泰伯利亚之日》的原版资源。格式兼容代码仅处理调用方提供的字节；没有网络请求、路径读取、目录扫描或自动寻找游戏安装目录的能力。用户只能导入自己有合法使用权的本地文件。经用户授权取得的外部公开社区格式样本仅在仓库之外用于开发验证，不随游戏发布。

源代码的开源许可不等于游戏美术、音频、地图或其他素材的使用/再分发许可。格式文档可公开阅读，也不构成原版资源授权。产品名仅用于说明格式兼容目标，不表示与原版权方有关联或得到其背书。

## 独立实现与格式来源

纯 TypeScript 解码器根据公开格式事实自行实现；没有引入第三方运行时依赖，没有复制游戏引擎、工具中的专有代码，没有打包参考网页中的示例素材或任何原版二进制。以下文档链接仅作为格式研究依据，不是资源授权；这些文档/工具的许可证不被解释为素材许可证。

- **PAL / VGA 色板**：ModdingWiki，[VGA Palette](https://moddingwiki.shikadi.net/wiki/VGA_Palette)。使用 256 个 RGB 三字节条目，每分量限定 0–63；位扩展 `(v << 2) | (v >> 4)` 转为 0–255。PAL 本身没有透明通道；返回全部不透明的色板，SHP/TMP 按格式单独应用透明度。
- **TS/RA2 SHP 头、帧偏移、阴影约定**：ModdingWiki，[Westwood SHP Format (TS)](https://moddingwiki.shikadi.net/wiki/Westwood_SHP_Format_%28TS%29)；Banshee 的格式说明，由 ModEnc² 镜像，[SHP](https://www.modenc2.markjfox.net/SHP)。帧包含 8 位标志及 3 字节对齐空间，不把对齐字节误当标志。
- **SHP RLE-zero 扫描行**：ModdingWiki，[Westwood RLE-Zero](https://moddingwiki.shikadi.net/wiki/Westwood_RLE-Zero)。逐行长度含两字节前缀；支持省略行末透明像素，拒绝越行、截断和零长度 run。兼容 0/1 原始帧、2 长度前缀原始扫描行、3 长度前缀 RLE-zero 扫描行；有关不常见格式 2 的公开讨论：[PPM, MadHQ's Graveyard](https://ppmforums.com/topic-40113-page-4/madhqs-graveyard/)（搜索摘要可读取，页面正文当时不可达）。
- **TMP 结构、位域、地形高度/坡型与雷达色**：ModEnc²，[TMP](https://www.modenc2.markjfox.net/TMP)。
- **TMP 菱形行宽、空槽、坐标与附加图像布局**：Olaf van der Spek，[TMP TS Format](http://xhp.xwis.net/documents/TMP_TS_Format.html)。仅依据格式事实实现，未移植该页面的示例代码。RA2 单元为 60×30，TS 单元为 48×24；菱形扫描行为 4、8、…、最大宽度、…、8、4，画布最后一行为空。
- **MIX 基本/扩展头、加密标志、体相对索引、校验尾**：ModdingWiki，[MIX Format (Westwood)](https://moddingwiki.shikadi.net/wiki/MIX_Format_%28Westwood%29)。
- **MIX TS/RA2 文件名哈希规则**：Olaf van der Spek，[MIX Format](http://xhp.xwis.net/documents/MIX_Format.html)。ASCII 名称大写、末个不完整 4 字节组的长度/首字节填充，然后计算标准 ZIP CRC32；不是 TD/RA1 的 rotate/add 哈希。仅依据协议规则独立实现，不包含该文档中的 Blowfish/RSA 实现、密钥或表格。
- **地图安全元数据**：ModEnc²，[Map](https://www.modenc2.markjfox.net/Map)、[Units (maps)](https://www.modenc2.markjfox.net/Units_%28maps%29)、[Infantry (maps)](https://www.modenc2.markjfox.net/Infantry_%28maps%29)、[Structures (maps)](https://www.modenc2.markjfox.net/Structures_%28maps%29)、[Terrain (maps)](https://www.modenc2.markjfox.net/Terrain_%28maps%29)、[Waypoints](https://www.modenc2.markjfox.net/Waypoints)。仅白名单保留基本信息、尺寸、地貌、对象位置和路点；不执行 INI、脚本、规则覆盖或 include 指令。
- **地图地形压缩**：ModEnc²，[IsoMapPack5](https://www.modenc2.markjfox.net/IsoMapPack5)。专用 `decodeMapTerrain` 解码严格 Base64、uint16 输入/输出长度分块及 LZO1X，输出原始 11 字节记录中的坐标、tileIndex、subTileIndex、level 和 iceGrowth。支持文档的四零终止，以及下述固定社区地图实际使用的精确记录边界 EOF；不会悄悄截断不完整记录。
- **LZO1X v0 指令格式**：Willy Tarreau、Dave Rodgman，[Linux 文档中的 LZO 流格式分析](https://www.kernel.org/doc/html/latest/staging/lzo.html)。仅依据公开的 opcode/operand/状态和字典距离规则独立编写 TypeScript 状态机，没有移植 Linux/miniLZO 库实现、GPL 代码或表格。处理重叠字典复制、M1/M2/M3/M4、扩展长度和严格 EOF；LZO-RLE v1/版本前缀明确 unsupported。
- **嵌入地图预览**：ModEnc²，[Preview](https://www.modenc2.markjfox.net/Preview)、[PreviewPack](https://www.modenc2.markjfox.net/PreviewPack)。其 LZO 解压数据为无行填充的 **BGR888**，不是 RGB；`decodeMapPreview` 保留 BGR 并交换通道生成 RGBA。该图片只是地图列表嵌入缩略图，不是可玩地形或地形贴图。
- **VXL/HVA 几何与变换**：OpenTS [VXL and HVA models](https://opents-developers.github.io/OpenTS/formats/vxl-hva/) 的加载语义；Olaf van der Spek [VXL Format](http://xhp.xwis.net/documents/VXL_Format.txt) 的早期 span 格式事实（不采用该早期文档的错误 tailer 布局）；公开接口文档 [92 字节 VXL limb tailer](https://docs.rs/cnc-formats/0.1.0-alpha.5/cnc_formats/vxl/struct.VxlLimbTailer.html) 与 [HVA 布局](https://docs.rs/cnc-formats/0.1.0-alpha.5/cnc_formats/hva/index.html)。实现仅根据格式事实自行编写，没有移植上述库或引擎代码；读取 voxel span、色板索引和逐帧 3×4 变换，不声称包含 VPL 光照或完整原版车辆渲染。

## 实现边界与验证

- SHP 所有裁剪帧分别输出 indices/RGBA 与 x/y/width/height；不解析规则中的动画序列、阵营重映射或光照。原格式没有阴影标志，偶数帧数不是充分依据；默认不自动启用阴影。调用方明确选择后半帧阴影模式时，要求该半区仅含索引 0/1，并生成配对黑色半透明阴影；阴影应先于正常帧绘制。
- TMP 输出基础菱形、signed 坐标、可选独立 extra 图层、elevation/坡型/landType 和 Z/extra-Z 字节平面。基础菱形中索引 0 仍有覆盖，菱形外透明，extra 中索引 0 透明。平面偏移相对各 cell 头，逐个校验边界和重叠。Z 值不是绝对世界高度；最终遮挡、光照、地形场景映射由渲染器负责。损坏/桥梁状态图像未实现，相关标志明确报告 `damagedData: 'unsupported'`，不伪造损坏态。
- MIX 支持旧式基本头及新式未加密头。加密头返回 `Ra2FormatError`、`code: 'UNSUPPORTED'`，不猜测解码。索引只含哈希，不会凭空恢复完整文件名；按名字查找使用 TS/RA2 CRC32。校验尾长度经过检查，但 SHA-1 未验证，明确报告 `present-unverified`。基础接口返回字节视图；实际素材库另按已知档案名白名单读取嵌套 MIX，最多四层，不猜测哈希对应的全部文件名。冲突资源不会静默覆盖。
- 输入硬上限：图形文件 64 MiB，MIX 512 MiB，地图文本 8 MiB；单图维度 ≤4096、像素 ≤4,194,304；SHP ≤8192 帧；TMP ≤10×10 单元；单次解码输出计费 ≤128 MiB。地图还限制行数、行长和条目数。无符号/有符号读取、输入切片的 byteOffset、累积输出量与每帧/每平面边界均校验。
- 地图元数据接口 `parseMapIni` 仍为 `metadata-only`，不自动解压；遇到地形节提示 `SEPARATE_TERRAIN_DECODER`。专用地形接口只验证地图容器信息和实际 tile 记录，不执行与地形无关的脚本/离图路点；原元数据接口的非负对象坐标约束不因此放宽。地形输出标注 `requiresTheaterMapping: true`，仍需 theater INI 的 tileset 顺序和对应本地 TMP；没有捏造缺省格子或完整场景。非零 Map.Size origin、规则和触发器执行不在此接口支持范围。可玩地图编译器另外使用有界 LCW 读取 OverlayPack/OverlayDataPack，并仅从本地注册表识别有限矿区；不执行原版增长、伤害或战斗行为。
- Packed 输入上限为 8 MiB Base64 文本 / 6 MiB 二进制，最多 1024 块，每块输出 ≤8192 字节，总输出 ≤8 MiB，并进一步收紧到声明的地图格数/预览像素预算。LZO 单独接口输入/输出各 ≤16 MiB。地图边长 ≤512，格子受等轴 diamond 边界与唯一坐标校验；Preview 边长 ≤1024、像素 ≤1,048,576，输出必须严格等于宽×高×3，不猜测尺寸。所有指令检查字典 lookbehind、输入/输出边界、扩展长度与 EOF，拒绝超额数据。
- 所有仓库内单元测试二进制均由测试代码现场合成，覆盖各 LZO 指令、截断、越界、扩展长度、输出炸弹、Base64/块序列、坐标重复、两种记录终止和 BGR 通道。没有将下述外部样本复制到仓库。合成测试与固定社区样本格式读取均不是正版原始文件字节认证，也不是完整原版安装资源/全图渲染认证。

## 先行版的实际场景接入

- 公开版本只附带原创练习场、程序绘制的和平建筑/车辆、原创图标及真实练习场封面。游戏程序不附带或自动下载下述社区样本。
- 「经典素材与地图」与只读检视器分开：本地文件经 Worker 编译后，TMP 真正组成地图，地形高度、坡地、水域、不可通行区域和矿位参与模拟。地形表按 theater INI 的 TileSet 顺序及 TilesInSet 累计映射，ClearTile 按 tileset 编号解析；缺失原始地块会报出具体文件，不用程序草地冒充。
- 原始坐标保留，首版可玩方格范围至多 256×256（原图宽+高+1不超过256）。省略的 clear 格按格式规则和真实 ClearTile 资源显式填充；绝不使用 PreviewPack 当可玩地图背景。矿石依据本地 OverlayTypes 声明顺序、Image/Tiberium 条目确认，不凭硬编码编号猜测。相关格式事实来源：[theater control](https://opents-developers.github.io/OpenTS/formats/theater-control/)、[OverlayTypes](https://www.modenc2.markjfox.net/OverlayTypes)、[Westwood LCW](https://moddingwiki.shikadi.net/wiki/Westwood_LCW)，均为独立实现，无额外运行时依赖。
- 选定和平建筑 SHP 可替换对应城市场景图像；无武装 MCV、Chrono Miner 和民用卡车 VXL/HVA 可生成八个方向的真实几何图。炮塔、炮管文件与武器规则不加载。建筑以底部居中对齐，体素采用基础色盘，不声称精确复现原版 art.ini 偏移、动画、重映射或 VPL 法线光照。其余城市设施保留明确的原创图像，不宣称全部原版单位已经复刻。
- 桥梁状态、非矿 overlay、地图建筑与布景的完整复刻尚未完成，并在导入结果列明。原图任务单位、敌军和脚本不进入世界。坡型首版作为相邻一层通行许可，尚未复刻每一种坡向。
- 单次素材输入至多256 MiB/12000文件；编译后的保留图像累计至多96 MiB，加入每幅图像即检查预算，不等全部解码/哈希后才拒绝。本机最多8个素材集合、192 MiB图片缓存；没有静默逐出旧家园依赖的素材。图片与城市存档分开保存在浏览器中，不包含在城市导出备份；缓存丢失需重新导入匹配资源，不能用练习场伪装恢复。公开封面与发布清单不含私人导入图像。
- 城市存档 schema 2 保留此前开发 schema 1 的经济、时钟和任务状态后迁移；源图像不入存档。居民行走是与人口对应的有界视觉表现，不产生额外资源。离线不补算。

## 固定公开社区样本的外部验证

2026-10-28，经用户授权，仅在仓库外读取 [CnCNet 客户端包固定版本](https://github.com/CnCNet/cncnet-yr-client-package/tree/c43d69cca65fbc766046893bb5f8028f247ce159) 的三张社区地图。它们可能包含社区规则修改，不能称为与原版光盘字节相同。三图默认严格 UTF-8 通过；其他本地文件可显式选择 windows-1252 或 gb18030。

| 外部样本（仅来源引用，不随发布包分发） | 地图尺寸 / theater | 实际 tile 记录 / LZO 块 | 嵌入预览 / LZO 块 |
| --- | --- | --- | --- |
| [2_snow_valley.map](https://raw.githubusercontent.com/CnCNet/cncnet-yr-client-package/c43d69cca65fbc766046893bb5f8028f247ce159/package/Maps/Yuri%27s%20Revenge/2_snow_valley.map) | 98×99 / SNOW | 19,305 / 26 | 196×99 / 8 |
| [2_arctic_circle.map](https://raw.githubusercontent.com/CnCNet/cncnet-yr-client-package/c43d69cca65fbc766046893bb5f8028f247ce159/package/Maps/Yuri%27s%20Revenge/2_arctic_circle.map) | 155×83 / SNOW | 25,647 / 35 | 310×83 / 10 |
| [xmp05t4.map](https://raw.githubusercontent.com/CnCNet/cncnet-yr-client-package/c43d69cca65fbc766046893bb5f8028f247ce159/package/Maps/Yuri%27s%20Revenge/xmp05t4.map) | 80×83 / TEMPERATE | 13,197 / 18 | 150×72 / 4 |

三张文件的源 SHA-256（依上表顺序）：

```text
dca79391d1d2185f65460c611ffe4803c1fff0c144e5ce55fb0a7b131b70ae4b
199f8677101cc0c03a5d58d9cda08fab74326f3ae3b73d25bb17aa1f9b0f8adf
f9fdcfe7437f2a3467a24645ba437658aaa12acb5bc9296c8e6aee5199f2e146
```

79 个地形块和 22 个预览块分别用 TypeScript 与系统已安装的 `liblzo2.so.2` 独立解压；逐图解压全字节 SHA-256 一致。系统库只用于开发对照，没有加入项目依赖或运行时代码。前两张地图以整记录 EOF 结束，第三张有四零终止；验证没有丢弃末尾数据。

另由主线程在仓库外验证了固定社区 PAL/SHP/TMP/VXL/HVA/MIX 样本：来源为上述 CnCNet revision、[Advanced-TMP-Editor revision bb57a990a19b22e874857b0bdbf5300df284e205](https://github.com/FS-21/Advanced-TMP-Editor/tree/bb57a990a19b22e874857b0bdbf5300df284e205) 与 [terrain-expansion revision 49b6bbd74a252708742db76ff4e31575a5d612b4](https://github.com/CnC-RaVaGe/ra2yr-terrain-expansion/tree/49b6bbd74a252708742db76ff4e31575a5d612b4)。公开仓库托管及其代码许可证均不被视为素材再分发许可；样本不随代码/游戏发布。
