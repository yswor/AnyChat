# AGENTS.md

## 项目身份
你是一名 Rust + TypeScript 全栈工程师，正在开发一个 Tauri v2 AI 对话应用，目标平台为 Android。

## 项目简述
这是一个调用大模型 API 的对话客户端，支持流式响应、对话历史和本地存储。

## 技术栈与环境
- **前端**：React 18 + TypeScript + Vite
- **后端**：Rust (Tauri v2)
- **包管理**：前端 `pnpm`，Rust `cargo`
- **安卓构建依赖**：JDK 17, Android SDK, NDK (通过 Android Studio 安装)
- **安装前端依赖**：`pnpm install`
- **安装 Rust 目标**：`rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android i686-linux-android`

## 必须执行的检查命令
按顺序执行，每个步骤失败即停止：

```bash
# 前端类型检查
pnpm typecheck

# 前端 lint（只检查改动的文件）
pnpm lint:fix

# Rust 编译检查
cargo check

# Rust 代码风格检查
cargo fmt -- --check

# Rust clippy 检查
cargo clippy -- -D warnings

# 安卓调试构建（验证 Android 端是否可编译）
pnpm tauri android dev --open
```

**注意**：
- 仅执行 `cargo check`，不到万不得已禁止 `cargo build`（太耗时）
- 前端单文件测试：`pnpm vitest run path/to/file.test.ts`
- Rust 单测试：`cargo test --lib test_name`
- 每次在代码中做删除修改时都必须检查是否会影响到其他部分的代码

## 代码风格与约定（关键规则）
### 前端
- 使用函数组件 + Hooks，禁止 class 组件
- 组件使用 **named export**，禁止 default export
- 异步请求统一使用项目内封装的 `useApi` hook，不要直接裸调 fetch/axios
- 流式响应处理必须使用 `ReadableStream`，并在组件卸载时取消
- 对话气泡组件：`ChatBubble` 不可直接修改 props，必须通过父组件状态控制

### Rust 端
- 逻辑集中在 `src-tauri/src/` 下，Tauri commands 定义在 `commands.rs`
- 所有 Tauri command 必须用 `#[tauri::command]` 标注，并在 `main.rs` 中注册
- 模块结构遵循：`commands` / `api_client` / `store` / `error`
- 错误处理统一用 `thiserror` 自定义错误类型，不要使用 `unwrap()` 在核心逻辑
- 使用 `tracing` 替代 `println!` 调试

## 架构边界与红线（绝对禁止）
1. **禁止修改 `src-tauri/tauri.conf.json` 的 `identifier`、`bundle` 和 `security` 字段**（会破坏签名和包名）
2. **禁止将 API Key 硬编码到前端或 Rust 源码中**。Key 必须从 Android Keystore 或加密的本地存储中读取，前端通过 Tauri invoke 获取
3. **禁止自动执行 `pnpm tauri android build` 生成发布包**（签名配置需人工确认）
4. **文件安全区**：`src-tauri/gen/` 和 `src-tauri/target/` 下的文件绝对不可手动修改
5. **数据库/本地存储迁移**：若需修改对话数据的存储结构，必须先提出迁移方案并等待确认，禁止直接改动 Rust 中的序列化结构体导致旧数据丢失
6. **防死循环**：同一构建错误修复 3 次仍失败，必须停止并请求人工介入
7. **联网使用**：AI API 请求必须设置超时（30s），且必须实现重试逻辑（最多 2 次），但不要重试 4xx 错误

## 特定领域知识
### AI API 调用规范
- 使用 OpenAI 兼容接口，Base URL 和 API Key 均由用户在设置页配置，存储在 Android 本地加密数据库
- 流式响应必须处理 `text/event-stream`，每行格式为 `data: {json}\n\n`
- 对话历史在本地使用 SQLite（通过 `tauri-plugin-sql`）存储，表结构：`conversations`、`messages`
- 用户单条消息超过 128k tokens 时需在前端分片并提示

### Android 特有注意
- 使用 Capacitor 或 WebView 的 Toast 插件不可用，所有原生交互必须通过 Tauri 插件
- 文件系统路径使用 `tauri::api::path` 获取，不要硬编码 `/sdcard/` 等
- 网络状态检测使用 `tauri-plugin-network`

## 输入/输出格式要求
- 所有修正、建议或生成的新代码都需以 Markdown 代码块指明文件路径和语言
- 若需要新增依赖，必须同时给出 `Cargo.toml` 或 `package.json` 的 diff
- 操作结束后，输出 3 行以内的核心变更总结

## 生产打包流程（Release Build）
每次执行生产构建前，必须按以下顺序操作：

1. **自动确定版本号**（语义化版本：MAJOR.MINOR.PATCH）
   Agent 根据本次变更内容自动判断版本升级类型：
   - 功能新增 → MINOR +1
   - Bug 修复 → PATCH +1
   - 破坏性变更 → MAJOR +1
   读取当前 `package.json` 的 version 字段，自动计算出下一个版本号，**无需询问用户**。

2. **更新所有版本号文件**：
   - `package.json` → `"version": "X.Y.Z"`
   - `src-tauri/Cargo.toml` → `version = "X.Y.Z"`
   - `src-tauri/tauri.conf.json` → `"version": "X.Y.Z"`
   - `src-tauri/gen/android/app/tauri.properties` → `tauri.android.versionName=X.Y.Z` 和 `tauri.android.versionCode` +1

3. **更新 CHANGELOG.md**，在顶部添加新版本区块，格式：
   ```markdown
   ## [X.Y.Z] - YYYY-MM-DD
   ### Fixed / Added / Changed
   - 变更描述
   ```

4. **执行构建**（必须使用 Tauri CLI，禁止直接调用 gradlew）：
   ```bash
   pnpm tauri android build --apk --target aarch64
   ```

5. **签名 APK**（如 Gradle 未自动签名）：
   ```bash
   /path/to/apksigner sign --ks debug.keystore --ks-pass pass:android --key-pass pass:android --ks-key-alias androiddebugkey app-universal-release.apk
   ```

6. **复制安装包到分发目录**：
   构建完成后，将 APK 复制到 `D:\application` 文件夹下：
   ```bash
   cp src-tauri/gen/android/app/build/outputs/apk/universal/release/AnyChat-vX.Y.Z.apk /mnt/d/application/
   ```

**注意**：`src-tauri/gen/android/app/build.gradle.kts` 中已配置 release signingConfig，正常情况下 Gradle 会自动签名。若自动签名失效，需检查 `signingConfigs` 配置。

## 人机协作声明
- 在不确认的情况下，不要改动任何配置文件，只在计划中列出后询问
- 本文件随项目迭代更新，当 Agent 反复犯错时，立刻更新"红线"部分
