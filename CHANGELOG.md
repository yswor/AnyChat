# Changelog

## [1.8.1] - 2026-04-30

### Fixed
- 修复 migration 007 列顺序不匹配导致对话数据损坏（`SELECT *` → 显式列名）

## [1.8.0] - 2026-04-30

### Added
- 新增智谱 GLM（Zhipu）供应商模板：指向智谱 AI 开放平台，支持思考模式
- 对话页 header 新增供应商切换按钮（多供应商时可见）
- 供应商删除二次确认弹窗

### Changed
- 删除供应商不再级联删除对话记录，provider_id 置空后对话可重新分配供应商
- 模型列表接口解析容错：非标准格式时返回空列表而非报错

### Fixed
- 修复 SettingsPage 删除供应商仅从内存移除、未删除 DB 的问题
- 修复思考模式 effort 参数为空时仍注入请求体的问题

## [1.7.0] - 2026-04-30

### Added
- 新增 Kimi Code 供应商模板：指向 Kimi Code 会员 API（`api.kimi.com/coding/v1`），默认模型 `kimi-for-coding`

## [1.6.0] - 2026-04-30

### Added
- 工具调用日志面板：Chat 页 header 新增入口按钮，底部弹出可展开查看每次工具调用的输入/输出/错误详情

### Fixed
- 修复 SettingsModal 背键处理因 onClose 内联导致每帧重注册的性能浪费

## [1.5.2] - 2026-04-30

### Fixed
- 修复 HTML→text 解析：改用 html2text 库，跳过 script/style 文本，支持实体解码
- Charset 编码检测：从 content-type 提取 charset（gbk/shift_jis 等），正确解码非 UTF-8 页面
- 二进制 MIME 拒绝：image/video/audio/font 等直接返回友好错误
- 重复工具调用检测：连续 3 轮相同调用时发送警告，避免死循环

### Changed
- Accept 头按 format 动态变化，Accept-Language 改 zh-CN 优先

## [1.5.1] - 2026-04-30

### Fixed
- 修复有 tool node 时思考过程内容无法点击收起

## [1.5.0] - 2026-04-30

### Added
- 天气工具改用 wttr.in API：支持当前天气 + 未来 3 天预报，中文自动描述，体感温度

### Fixed
- 修复工具调用节点（toolNodes）退出重进后不显示（新增 migration 006 持久化到 SQLite）
- 修复工具调用达 5 轮上限时直接报错，改为正常返回最后一轮内容

## [1.4.0] - 2026-04-29

### Added
- 新增 `get_current_time` 工具，获取精确日期、时间和星期
- 新增 `get_weather` 工具，基于 Open-Meteo 免费 API 查询城市实时天气

### Changed
- 工具调用节点 UI 精简：去背景去边框，融入消息流
- 非思考模式下工具节点推理内容改用纯文本样式
- webfetch 单次 URL 上限从 3 提升至 5

### Fixed
- 修复工具节点思考内容重复（改为增量切片，不再取全量累加值）
- 修复有工具节点时顶层思考块冗余显示

## [1.3.0] - 2026-04-29

### Added
- 工具调用改为节点链展示：每轮思考过程 + 工具调用状态按时间线排列，不再相互覆盖
- webfetch 工具节点显示目标 URL 列表

### Changed
- 用户消息复制/删除按钮移至消息卡片下方
- 重构 chatStore：提取 `emptyStreamState()`、`tryParseJson`、`ApiMessage` 类型，删除 `toolStatus` 死代码

### Fixed
- 修复工具调用节点在获得最终答案后消失
- 修复 `tool_calls` DB 存储格式不符合 API 标准导致多轮消息 400 错误
- 修复 handleRegenerate 手动开 DB 连接泄漏

## [1.2.0] - 2026-04-28

### Added
- webfetch 工具支持批量 URL（最多 3 个），LLM 可一次性列出多个目标链接
- 工具调用消息持久化到 SQLite（含 `tool_calls`、`reasoning_content`），多轮对话中正确回传思考上下文

### Changed
- 工具调用状态从消息列表底部独立横幅移入 ChatBubble（思考过程与正文之间）
- 用户消息气泡新增复制和删除按钮
- 工具调用上限从 5 轮调整为安全基线（无需因串行 URL 调用耗尽轮次）
- 触底阈值从固定 50px 改为 `max(50, clientHeight*0.1)` 自适应
- 错误事件通道统一为 `chat-stream:{id}`（修复前端无法即时接收错误提示）

### Fixed
- 修复流式输出中用户滚动浏览历史时被自动拽回底部（ref 替代 state 防竞态）
- 修复工具调用跨轮次状态残留（执行完成后不清除指示器）
- 修复 FAB 平滑滚动期间 `isAtBottom` 状态跳变导致按钮闪现
- 修复阅读模式切换时 `setTimeout` 未清理导致潜在内存泄漏
- 修复 `-error` 事件发送到无人监听的频道（死代码消除）

## [1.1.0] - 2026-04-28

### Added
- 新增 webfetch 工具调用功能：LLM 可自主抓取指定 URL 的网页内容
- 新增多格式输出支持（markdown / text / html），可配置 Accept 请求头
- 新增 Cloudflare 多模式检测（5 种 header 特征 + 7 种 body 内容特征）
- 新增 TLS 指纹升级：reqwest 从 rustls 切换为 native-tls-vendored（OpenSSL）
- 新增 WebView fetch 回退机制：native TLS 被拦截时通过 Android WebView 抓取
- 新增 tracing 日志覆盖 webfetch 全部生命周期

### Changed
- webfetch 大小限制从 2MB 提升至 5MB，增加 Content-Length 预检
- webfetch 超时从固定 30s 改为可配置 1-120s
- debug APK 包名添加 `.debug` 后缀，文件名添加 `-debug` 后缀，独立安装

### Fixed
- 修复 SSE 流式 tool_calls 浅层合并导致 function.name 丢失和 arguments 截断
- 修复用户气泡中链接颜色与背景同色导致不可见

## [1.0.4] - 2026-04-28

### Fixed
- 修复启动时多次新建对话导致空对话堆积（空对话检测改为 SQL 查 messages 表，全应用只保留一个）
- 修复"新建对话"按钮总是新建而不复用已有空对话

### Changed
- 滚动到底部 FAB 改用 sticky 定位，偏白底色小尺寸，不再与输入框重叠

## [1.0.3] - 2026-04-28

### Changed
- 滚动到底部 FAB 按钮改用 sticky 定位，不再与输入框重叠；缩小至 28px，偏白底色 + 阴影
- 消息卡片去除头像，宽度撑满屏幕

### Fixed
- 修复旧对话中发送消息导致白屏（`usage_details` JSON 未解析）
- 修复用户消息去除头像后未右对齐
- 启动时自动新建对话

## [1.0.2] - 2026-04-28

### Fixed
- 修复旧对话中发送消息导致白屏（`usage_details` JSON 字符串未解析为对象）
- 修复用户消息去除头像后未右对齐
- 启动时自动新建对话，不再进入上次对话

## [1.0.1] - 2026-04-28

### Fixed
- 修复旧版 DB 未执行 migration 003 导致消息发送失败（INSERT 缺列 addColumn 兜底）
- 修复消息卡片头像去除后 max-width 未更新导致卡片未撑满屏幕
- 修复 FAB 按钮缺少 position: relative 父容器导致定位偏移

### Changed
- 消息卡片去除头像图标，宽度撑满屏幕
- Token 用量信息移至操作按钮同行，去除 emoji
- 文件上传限制提升至 2MB
- 删除 OpenAI / OpenRouter 供应商模板

## [1.0.0] - 2026-04-27

### Added
- DeepSeek + Kimi 供应商余额查询，设置页自动刷新
- Android 返回键全局拦截，弹窗打开时优先关闭弹窗
- Kimi 供应商模板（api.moonshot.cn/v1，支持思考模式 + 余额查询）
- 数据驱动常量文件：`constants/defaults.ts`、`constants/attachments.ts`

### Changed
- **breaking** thinking 参数 key 名由 provider 模板配置驱动（不再硬编码 `thinking` / `reasoning_effort`）
- 余额响应解析改为通用 JSON 字段检测，支持 DeepSeek / Kimi 两种格式
- 模板选择器改为 `PROVIDER_TEMPLATES` 循环渲染，增删模板只需改配置
- reasoning effort 选项由模板 `reasoning_effort_options` 配置驱动
- 参数滑块范围从 JSX 行内抽出到 `PARAMETER_RANGES` 常量
- 流式超时从总超时改为空闲超时（思考阶段不误杀连接）
- 阅读模式流式输出时实时展示正文，达截断字数后显示预览 + loading
- 移除 OpenAI / OpenRouter 预设模板
- 移除 SQL 列名字符串匹配的脆弱迁移兜底

### Fixed
- 修复思考模式下写长文时流式连接中途断开
- 修复 `frequency_penalty` / `presence_penalty` 从 DB 重载后回退为 0
- 修复设置弹窗切对话时 system prompt 等字段残留上一对话值（`key={id}`）
- 修复 placeholder 硬编码 DeepSeek 文案
- 修复 `||` 应为 `??` 的 nullish 语义问题
- 修复新建对话默认参数重复定义和多处散落的 `"high"` 魔数

## [0.5.0] - 2026-04-27

### Added
- DeepSeek 供应商余额查询：设置页可查看余额并手动刷新，每次进入页面自动查询
- Android 返回键全局拦截：任何弹窗/抽屉打开时按返回键优先关闭弹窗，而非页面回退

### Changed
- 模板选择器改为数据驱动循环渲染，增删模板只需改 `PROVIDER_TEMPLATES` 配置
- 移除 OpenAI / OpenRouter 预设模板
- 余额查询路径通过 Provider 模板配置声明，零硬编码供应商名

### Fixed
- 修复 `frequency_penalty` / `presence_penalty` 从数据库重新加载后回退为 0 的 bug
- 修复设置弹窗在切换对话时 system prompt 等字段残留上一对话值的 bug（`key={id}` 强制重挂载）

## [0.4.5] - 2026-04-27

### Fixed
- 修复思考模式下写长文时流式连接中途断开的 bug（reqwest 总超时替换为空闲超时，思考阶段不再误杀）
- 修复移动网络长时间无数据导致连接被运营商 NAT 断开的问题（新增 TCP keepalive）

### Changed
- 阅读模式 + 流式输出时实时展示正文内容，不再隐藏为 loading 占位；正文达截断字数后显示预览遮罩，底部 loading 动画切换为"点击阅读全文"
- Rust HTTP 客户端启用 HTTP/2 支持，提升长连接稳定性
- 思考模式流式超时从 120 秒固定值改为分阶段：首字节 300 秒 / 流式中 120 秒空闲超时

## [0.4.4] - 2026-04-26

### Fixed
- 修复阅读模式下流式输出时 loading 占位符不显示的问题（React 18 批处理导致 Zustand 中间状态丢失）
- 修复阅读模式下思考过程异常收起的问题（`<details>` 元素在 Android WebView 中的 `open` 属性竞态）
- 修复阅读模式 + 思考模式下思考内容为空的问题（`??` 无法正确处理空字符串回退）
- 修复流式输出期间仍可点击设置按钮并在结束后自动弹出弹窗的问题
- 修复历史消息思考过程也被自动展开的问题

### Changed
- 流式输出期间禁用模型选择器、思考模式按钮、参数设置按钮
- 手机端输入框提示文字移除桌面端快捷键提示

## [0.4.3] - 2026-04-26

### Fixed
- 修复阅读模式下 AI 流式输出时需等 120 字符才显示预览占位的问题，现立即显示 loading 占位
- 修复阅读模式 + 思考模式下思考过程异常收起的问题（移除 `onToggle` 消除 React `<details>` 竞态）

## [0.4.2] - 2026-04-26

### Fixed
- 修复切换对话时流式输出内容串扰到新对话的问题（streamState 全局单例隔离）
- 修复消息中 Markdown 表格语法无法解析的问题（缺少 remark-gfm 插件）

## [0.4.1] - 2026-04-26

### Fixed
- 修复上传文件后对话气泡中显示完整文件内容的问题，现在仅显示文件名标签

## [0.4.0] - 2026-04-26

### Added
- 新增文件上传功能：输入框左侧添加附件按钮，支持上传 .txt/.md/.json/.csv/.log 等文本文件
- 上传文件后显示文件名和大小标签，发送时自动将文件内容拼入消息上下文
- 支持从 Android 系统分享菜单接收文本内容

### Fixed
- 修复全屏阅读模式下安卓系统返回键未拦截的问题，现在按返回键会关闭阅读页而非退出应用

## [0.3.0] - 2026-04-26

### Added
- 新增阅读模式：对话页可开启阅读模式，AI 长回复显示为 3 行摘要，点击打开全屏沉浸式阅读
- 新增全屏阅读层：支持 Markdown 渲染，顶部显示对话标题和模型名，拦截系统返回键关闭
- 新增思考内容点击收起功能：点击思考过程内容区域即可收起

### Changed
- 阅读模式开关按钮移至思考模式按钮前方
- 新建对话按钮添加错误捕获和提示
- 优化阅读模式下的内容摘要遮罩和提示文字样式

### Fixed
- 修复数据库 schema 不匹配问题（conversations 表缺少 frequency_penalty 和 presence_penalty 列）
- 修复新建对话按钮点击无效的问题
- 修复阅读模式切换后滚动位置异常的问题
- 修复阅读模式按钮激活状态样式不生效的问题（CSS 加载顺序导致）

## [0.2.0] - 2026-04-26

### Added
- 新增暗色/亮色主题切换，支持跟随系统主题
- 新增主题切换按钮在对话页顶部标题栏
- 新增应用 logo 显示在侧边栏和设置页
- 新增长按删除对话功能（长按对话卡片弹出选项框，确认后删除）
- 新增对话标题单行省略号样式
- 新增版本号自动同步（前端显示从 package.json 动态读取）

### Changed
- 模型选择下拉栏从顶部工具栏移至输入框上方，与思考模式按钮同一行
- 侧边栏移除关闭按钮（AnyChat 标题右侧）
- 侧边栏对话跳转改为 replace 模式（避免系统返回键回到上一个对话）
- 供应商编辑页移除默认参数设置（Temperature、Max Tokens、Top P）

### Fixed
- 修复对话列表删除按钮过小不适合移动端的问题
- 修复抽屉页面跳转后系统返回按钮会回到上一个对话的问题

## [0.1.3] - 2026-04-26

### Changed
- 优化对话页面参数设置按钮图标（改为三条横线带调节圆点）
- 优化侧边栏设置按钮图标（改为标准齿轮形状）

## [0.1.2] - 2026-04-26

### Fixed
- 修复已配置供应商时点击新建对话仍跳转到设置页的问题
- 自动将首个加载的供应商设为活跃状态

## [0.1.1] - 2026-04-26

### Fixed
- 修复 Android 状态栏遮挡应用顶部内容的问题
- 修复编辑已有供应商时 API Key 必填校验错误（留空不再报错）
- 修复无对话时无法点击新建对话的问题，首页空状态添加新建对话按钮
- 修复 APK 打包时未签名导致安装失败的问题

## [0.1.0] - 2025-XX-XX

### Added
- 初始版本发布
- 支持多供应商 AI 对话（OpenAI 兼容接口）
- 支持流式响应和对话历史
- 支持本地 SQLite 存储
- Android 移动端适配
