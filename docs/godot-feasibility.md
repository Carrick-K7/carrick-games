# Godot 在 Carrick Games 中的可行性调研

- 调研日期：2026-09-06。
- 仓库基线：`b7a3de2`，当时包含 28 款游戏。
- 状态：**调研归档；尚未决定采用 Godot，未批准原型开发或迁移。**
- 归档位置：调研时仓库没有 ADR 目录，因此按要求存放于 `docs/`；本文不是已接受的架构决策。
- 范围：官方资料、项目源码和生产 HTTP 响应的只读检查。未安装或运行 Godot，未导出游戏，未进行 Godot 性能实测。

## 1. 结论摘要

**Godot 可以用于 Carrick Games，但更适合新的、较复杂的游戏，不建议整体替换现有 Canvas/Three.js 技术栈。**

最值得验证的路线是保留现有网页壳，按需加载一个独立的 Godot Web 游戏。初期优先考虑同源 iframe，而不是让 Godot 强行接管现有 `BaseGame` 的 Canvas 2D 渲染循环。

Godot 的主要潜在收益是场景编辑、物理、动画和内容制作工具，而不是自动提升画质、帧率或缩短所有类型游戏的开发时间。

| 使用场景 | 适配判断 | 原因 |
| --- | --- | --- |
| 现有贪吃蛇、2048、棋类等小游戏 | 不建议迁移 | 当前实现轻量、功能完整；引擎引入和重写成本大于收益 |
| 新的平台跳跃、物理解谜、关卡型游戏 | 值得考虑 | 可利用场景复用、碰撞、动画和关卡编辑工具 |
| 新的探索类或较复杂 3D 游戏 | 有潜力，先验证 | 内容和交互规模越大，编辑器工作流可能越有价值 |
| 迁移现有 Villa、CS | 可行但代价较高 | 属于逻辑、场景及宿主集成的重新实现，不是替换一个库 |
| 整站改成 Godot | 不推荐 | 导航、搜索、主题、语言和站点布局仍适合现有 Web 技术 |

## 2. Godot 是什么

Godot 是一个完整的开源游戏引擎，包含可视化编辑器和游戏运行时，支持 2D、3D、场景与节点、物理、动画、音频、UI、导航、资源导入和跨平台导出。[1]

与当前技术栈相比：

- **Canvas 2D** 是浏览器的绘图接口，游戏循环、碰撞和玩法主要由项目自己实现。
- **Three.js** 主要提供 3D 渲染和场景相关能力，游戏系统仍需自行组合。
- **Godot** 同时提供渲染、游戏系统和编辑器，相当于从“自己组装零件”转向“使用配套工作室”。

常用开发语言是 GDScript，语法接近 Python，但并不是 Python。Godot 也支持 C# 等开发方式，但不同语言的导出平台支持不同，网页目标不能直接照搬桌面方案。

Godot 使用 MIT 许可证，可商用，没有引擎版税。发布时仍需满足引擎及所用第三方组件、素材的许可证要求。[2]

调研时通过官方发布信息核实的稳定版为 **4.7.2**。这是日期快照，不保证未来阅读本文时仍为最新版本；实际试验应固定引擎和匹配的导出模板版本。[3]

## 3. 当前项目的技术边界

### 3.1 统一 Canvas 与生命周期

[`src/core/game.ts`](../src/core/game.ts) 的 `GameHost` 提供 canvas、逻辑尺寸、主题、语言和计分接口；`BaseGame` 构造时获取 `canvas.getContext('2d')`，自行维护更新、绘制和输入绑定。

[`src/main.ts`](../src/main.ts) 的 `prepareGame()`、`startPreparedGame()` 和 `fitGameCanvas()` 围绕同一个 `#gameCanvas` 管理：

- 销毁旧游戏、动态加载新游戏、准备首帧、开始和重开。
- 加载遮罩、开始遮罩、错误提示和显示尺寸。
- 全局键盘事件、虚拟键盘、焦点和游戏切换。
- 主题、语言、控件、分数和本地记录。

[`src/games/catalog.ts`](../src/games/catalog.ts) 的 loader 当前返回接受 `GameHost` 的游戏构造器；没有独立 Web 应用或 iframe 的运行时类型。现有异步加载主要覆盖 JavaScript 模块，不能直接代表 Godot 引擎和资源已经就绪。

### 3.2 现有 3D 并未改变宿主契约

三个 3D 游戏仍把 WebGL 画面复制回 shell 的 2D canvas：

- CS：[`src/games/cs.ts`](../src/games/cs.ts) 调用独立引擎渲染，再通过 `ctx.drawImage(engine.canvas3d, ...)` 合成 HUD；指针捕获、焦点和计分由适配器桥接。
- CS Kimi：[`src/games/counterstrikeScene3d.ts`](../src/games/counterstrikeScene3d.ts) 创建 Three.js renderer，由 [`src/games/counterstrike.ts`](../src/games/counterstrike.ts) 合成画面。
- Villa：[`src/games/villaScene.ts`](../src/games/villaScene.ts) 渲染后调用 `drawImage()`；另有现成的触屏、全屏、场景及资源清理逻辑。

这些经验可以参考，但不能据此认定 Godot 也能以相同成本接入。Godot Web 有自己的 WebAssembly 运行时、WebGL 画布和主循环；已经获取 2D 上下文的同一个 canvas 不能再直接用作 WebGL 画布。

### 3.3 测试与部署

[`tests/games.spec.ts`](../tests/games.spec.ts) 包含 canvas 尺寸、准备次数、输入、主题、语言和源码结构约束；部分断言还假定每个注册游戏都有 `extends BaseGame` 的类。新运行时不能只靠保留一块隐藏 canvas 通过这些检查，必须真正验证 iframe 内的游戏行为。

[`playwright.config.ts`](../playwright.config.ts) 默认项目为 Chromium。现有流水线安装 WebKit 不等于完整游戏矩阵已经覆盖 Safari，更不等于 iPhone 真机验证。

[`vite.config.ts`](../vite.config.ts) 与 [部署工作流](../.github/workflows/deploy.yml) 构建并部署静态 `dist/`。Godot Web 的静态产物原则上能由同一部署方式承载；如果从源码可复现地导出，还需要新增固定版本的 Godot/导出模板构建步骤，不能说正式接入“完全无需修改 CI”。

共享 Caddy 配置由 `carrick-ops` 管理，本仓库只部署静态发布目录。调研时生产首页响应未见 COOP/COEP；这只是该请求的观察，不代表已经审计所有路径或服务器配置。

## 4. Web 导出能力与限制

以下结论依据 Godot 4.7 的官方 Web 导出文档，而不是早期 Godot 4.0/4.2 的历史限制。[4]

| 项目 | 已核实能力或限制 | 对本项目的影响 |
| --- | --- | --- |
| 产物 | HTML、JS、WASM、PCK 等静态文件 | 不需要在生产服务器运行 Godot 编辑器或游戏进程 |
| 浏览器 | 需要 WebAssembly 和 WebGL 2 | 必须提供不支持时的错误提示或退路 |
| 渲染器 | Web 使用 Compatibility；Forward+/Mobile 不支持，调研版本也不支持 WebGPU | 不能按桌面高端渲染效果设计网页验收标准 |
| 脚本语言 | Godot 4 的 C# 项目目前不能导出 Web | 首轮采用 GDScript，不为 TypeScript 引入额外脚本扩展 |
| 单线程 | 自 4.3 起支持；当前为推荐且默认方式 | 不应把 SharedArrayBuffer 和隔离响应头视为所有 Web 导出的硬性要求 |
| 多线程与扩展 | 启用相关支持涉及跨域隔离；GDExtension 还需专门编译 Web 版本 | 首轮关闭，避免跨仓库运维变更和兼容性负担 |
| 音频 | 默认 Sample 播放有音效处理、程序化及部分位置音频限制；Stream 有延迟等权衡 | 不能默认照搬 CS 的程序化音频或桌面空间音效 |
| 全屏与鼠标捕获 | 需要浏览器认可的真实用户输入触发 | `postMessage` 或合成键盘事件不能被当作权限授权手段 |
| Safari 与手机 | 可以运行，但有 WebGL、性能和浏览器行为方面的注意事项 | 必须单独验证；桌面原生版表现不能外推为手机网页版表现 |
| 持久化 | Godot `user://` 在 Web 依赖浏览器存储及其策略 | 优先让站点宿主继续负责共享记录，处理禁用存储和写入失败 |

WASM 和游戏资源带来额外下载、初始化及内存成本。压缩和裁剪导出模板可以降低成本，但本文没有真实导出样本，**不提供固定包体数字、加载时间或帧率承诺**。

服务端应正确提供 `application/wasm`，并核实压缩、资源路径和缓存版本策略。目录级版本化比随意改名导出文件更稳妥；HTML、JS、WASM 和 PCK 必须来自匹配的同一次导出。

## 5. 推荐的接入方向

### 5.1 保留网站，按需嵌入单个游戏

建议验证的结构：

```text
现有 Carrick Games 网页壳
  └─ 选择 Godot 游戏时才创建同源 iframe
       └─ 自定义 HTML 壳 + Godot Web 运行时 + 游戏资源
```

Godot 官方支持自定义 HTML 壳、指定独立 canvas、跟踪异步启动和加载进度，也提供 `JavaScriptBridge` 与浏览器 JavaScript 交互。[5][6]

iframe 不是唯一办法；也可以在同一页面使用另一个 WebGL canvas，但需要更直接地处理引擎初始化、全局事件和资源销毁。首轮优先 iframe，是为了缩小集成边界，不是因为直接嵌入在技术上不可能。对于自有同源内容，iframe 的作用主要是生命周期和 DOM 隔离，并非安全沙箱。

### 5.2 正式集成仍需要的工作

以下只是待验证的设计方向，不是已批准的接口变更：

1. **宿主与元数据**：明确区分现有 canvas 游戏与嵌入式游戏，保留单一 catalog；增加真正的引擎就绪、失败、重试和取消状态，而不是只等待 loader 完成。
2. **显示与开始流程**：独立游戏表面参与尺寸适配、遮罩、可访问名称和焦点管理；避免出现两套开始按钮或两个同时驱动画面的循环。
3. **输入**：iframe 内的键盘事件不会自动冒泡到父页面。需要桥接壳层快捷键、虚拟按键和输入高亮；失焦、打开游戏库及切换游戏时释放按键。鼠标捕获和全屏要实测权限及降级行为。
4. **状态与计分**：经 `JavaScriptBridge`、`postMessage` 向宿主发送事件，仍由宿主维护 `cg-records`；校验 origin、source、消息类型和数值，并用实例/局次标识过滤旧回调及重复结算。
5. **生命周期**：主题/语言动态同步；暂停、继续、重开、退出有明确语义。切换时移除 iframe、监听器和回调，不遗留后台音频或旧游戏输入。
6. **构建与测试**：固定引擎和模板版本，从源码生成匹配的导出产物；扩展真正的 iframe 行为测试，不只检查文件存在。独立资源仅在选择该游戏时加载，不能拖累其他小游戏首屏。

正式引入前还须遵循 [`AGENTS.md`](../AGENTS.md) 的新增运行时审批和声明要求，并更新涉及的开发、设计规则。当前针对 Three.js 的例外不等于 Godot 已获批准；本次归档不变更 `package.json` 或任何引擎政策。

## 6. 为什么不建议迁移全部已有游戏

- 当前轻量小游戏不缺渲染引擎；重写不直接增加玩法价值。
- TypeScript 游戏逻辑不能直接变成 GDScript；Three.js 程序化场景、材质、音频和 HUD 也不是可直接导入的 Godot 场景。规则数据或标准资源可能复用，但需分别评估。
- 既有输入、移动端交互、全屏、语言、计分及回归测试是已经投入的工程资产。
- Godot 会增加语言、工具链、导出模板、资源导入和浏览器运行时的维护面。
- 更好的开发工具不保证更小包体、更高网页性能或更好的最终美术；这些仍取决于内容、实现和测量结果。

## 7. 可选的后续验证方案

**只有另行确认后才执行。** 本次仅归档报告，不创建原型、不安装引擎、不注册新游戏，也不向生产网站接入 Godot。

### 原型范围

在仓库外的隔离目录制作一个小型 3D 房间：移动、跳跃、墙体碰撞、一道交互门、一个计分收集物、简单音效和触屏控制。使用 Godot 4.7.2 及匹配模板、GDScript、Compatibility、单线程；关闭扩展支持和 PWA，不先移植 Villa/CS，也不引入外部素材包。

使用独立本地宿主页模拟现有壳，验证同源 iframe、异步就绪、开始、暂停、继续、重开、主题/语言及分数消息。消息包含协议版本、实例和局次标识。真实输入负责音频解锁、全屏及鼠标捕获；不能用跨窗口消息绕过权限限制。

### 检查项目

- Chromium、WebKit 的功能测试；具备设备条件后补充桌面和手机真机测试，尤其是 iOS Safari。
- 键盘、触屏、焦点转移、输入释放、全屏和鼠标捕获拒绝时的可用降级。
- WASM 请求失败、缺少 WebGL 2、30 秒加载超时等情况下的明确错误与重试。
- 连续进入退出 20 次，不残留 iframe、重复回调或后台音频；记录内存趋势，而不是要求浏览器立即回收全部内存。
- 记录压缩后实际传输体积、冷/热启动耗时、帧时间和构建耗时。桌面 60 FPS、手机 30 FPS 可以作为试验目标，不是本文已经验证的表现。
- 验证不选择该游戏时不会请求 Godot 运行时，保留轻量小游戏的按需加载特性。

自动化测试中的软件 WebGL 只能作为功能与稳定性证据，不能代替真实设备性能数据。无法实测的浏览器或设备应标记“未验证”，不得默认为通过。

原型结果只能说明小场景及嵌入路径的表现；如果未来目标是替代 Villa 或 CS，还需增加具有代表性的场景、动画、音频和交互负载比较。

### 何时重新做采用决策

只有当目标新游戏确实受益于编辑器/物理/关卡工具，且加载、目标设备表现和宿主集成成本可接受时，再提出正式接入方案。届时可以建立 ADR，记录候选路线、实测证据、批准范围及维护责任；不把本报告直接升级为默认迁移授权。

## 8. 证据与未验证项

已检查的内容包括源码、项目规范、构建/部署配置、官方 Web 导出与 JavaScript 桥接文档，以及生产首页 HTTP 响应。调研时 `PATH` 中未发现 `godot` 或 `godot4`；这不等于扫描过机器上的所有安装位置。

未执行 Godot 导出、嵌入原型、资源迁移、浏览器游戏试跑、真机测试或性能基准。本文中的接入方案和验证目标均为建议，不是实现结果。

## 9. 官方参考资料

以下资料于 2026-09-06 查询；涉及版本限制时优先参考固定版本文档，避免将 `latest` 开发版功能当作稳定版能力。

1. [Godot 功能概览](https://godotengine.org/features/)。
2. [Godot 许可证](https://godotengine.org/license/)。
3. [Godot 4.7.2 官方下载归档](https://godotengine.org/download/archive/4.7.2-stable/)；[官方发布记录](https://github.com/godotengine/godot/releases/tag/4.7.2-stable)。
4. [Godot 4.7：Web 导出文档源码](https://github.com/godotengine/godot-docs/blob/4.7/tutorials/export/exporting_for_web.rst)；[4.3 单线程 Web 导出背景](https://godotengine.org/article/progress-report-web-export-in-4-3/)。
5. [Godot 4.7：JavaScriptBridge 使用文档源码](https://github.com/godotengine/godot-docs/blob/4.7/tutorials/platform/web/javascript_bridge.rst)。
6. [Godot 4.7：自定义 Web HTML 壳文档源码](https://github.com/godotengine/godot-docs/blob/4.7/tutorials/platform/web/customizing_html5_shell.rst)。
