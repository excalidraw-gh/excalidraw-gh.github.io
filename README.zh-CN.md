# Excalidraw GitHub 编辑器 - Vibe Coding 实验项目

<!-- Vercel 部署按钮已移除 -->

本项目是一个实验性的 Web 应用，允许用户浏览 GitHub 仓库，直接在浏览器中使用 Excalidraw 编辑器打开 `.excalidraw` 文件，进行修改，并通过提交信息将更改保存回 GitHub。

**本项目的主要意义不仅在于其功能，更在于其创建过程：它完全通过 Vibe Coding 开发，利用 AI 编码助手（如 Claude、带工具的 ChatGPT 或类似工具）完成，没有人工编写代码。** 这是对 AI 驱动的软件开发工作流程的一次演示和探索。

## 核心功能

*   **GitHub 仓库浏览**: 使用具有 `repo` 范围权限的个人访问令牌 (PAT) 连接到你的 GitHub 帐户。
*   **仓库和分支选择**: 从你的帐户中选择仓库和分支。
*   **文件树导航**: 查看所选分支的文件结构。
*   **Excalidraw 文件编辑**: 点击 `.excalidraw` 文件，在嵌入式 Excalidraw 编辑器中打开它们。
*   **浏览器内缓存**: Excalidraw 利用 IndexedDB 缓存当前的绘图状态，允许你在文件间切换而不会丢失未保存的本地更改。
*   **变更检测**: 基于内容比较，在文件树中用星号 (`*`) 标记已修改的文件。
*   **保存到 GitHub**: 使用自定义提交信息将更改保存回 GitHub 仓库。
*   **文件操作**: 创建新文件，重命名/删除现有文件（对文件夹操作提供指引）。
*   **国际化 (i18n)**: 支持中英文界面语言，自动检测浏览器偏好。
*   **(计划中)** 查看文件提交历史。

## 使用 Vibe Coding 构建：一种新的开发范式

本项目证明了 Vibe Coding 的潜力。与传统的手动编码不同，整个应用程序——从设置 Vite + React + TypeScript 环境到实现 GitHub API 集成、Excalidraw 嵌入、状态管理和 UI 组件（使用 Shadcn UI）等复杂功能——都是通过向配备了文件系统和命令执行工具的 AI 助手发出对话式提示和指令来完成的。

**过程本身与最终产品同样重要。** 它突显了 AI 作为能力极强的结对程序员，甚至作为主要实现者的潜力，由人类的意图和架构决策来引导。

### Vibe Coding 提示实践与示例（来自本项目）

在整个开发过程中，采用了多种提示策略：

1.  **增量功能请求**: 逐步构建功能。
    *   *初始提示 (意译)*: “创建一个 Vite React TypeScript 项目。添加 react-resizable-panels 来创建一个双面板布局（左侧用于文件浏览器，右侧用于内容）。”
    *   *后续*: “在左侧面板中，实现一个组件来安全地输入和存储 GitHub PAT（使用 IndexedDB）。”
    *   *后续*: “在输入 PAT 后，获取并在下拉列表中显示用户的仓库。”
    *   *后续*: “实现一个文件树组件来浏览选定的仓库和分支。”
    *   *后续*: “将 Excalidraw 组件集成到右侧面板。加载在文件树中点击的 `.excalidraw` 文件的内容。”
    *   *后续*: “通过比较当前的 Excalidraw 内容和最初获取的内容来实现变更检测。在树中标记脏文件。”
    *   *后续*: “添加保存功能：为脏文件在文件树上下文菜单中提供‘保存’选项，提示输入提交信息，并使用 GitHub API 更新文件。”

2.  **组件脚手架**: 请求组件的基本结构。
    *   “创建一个 React 组件 `GithubFileTree`，它接受 PAT、repo 和 branch 作为 props，并显示一个文件树。”
    *   “创建一个包装组件 `ExcalidrawWrapper`，它渲染 `@excalidraw/excalidraw` 组件并接受 `initialData` 和 `onChange` props。”

3.  **API 集成**: 指定 API 端点和预期的数据流。
    *   “编写一个函数 `getGithubFileContent`，它使用 GitHub Contents API (`GET /repos/{owner}/{repo}/contents/{path}`) 来获取文件内容，处理 base64 解码。”
    *   “使用 `PUT /repos/{owner}/{repo}/contents/{path}` 实现 `updateGithubFile` 函数，包括文件 SHA 和提交信息。”

4.  **UI 实现与优化**: 使用像 Shadcn UI 这样的库并提供具体的 UI 指令。
    *   “使用 Shadcn UI 的 `Select` 组件进行仓库和分支选择。”
    *   “为文件树节点添加一个上下文菜单 (DropdownMenu)，包含‘重命名’和‘删除’选项。”
    *   “使用 Shadcn UI `Dialog` 在保存前提示输入提交信息。”
    *   “使用 `sonner` 在保存成功/失败时显示 toast 通知。”

5.  **调试与错误处理**: 描述问题并请求修复。
    *   “打开文件时导致 ‘Maximum update depth exceeded’ 错误。分析 `App.tsx` 和 `ExcalidrawWrapper.tsx` 之间的状态更新并修复无限循环。” （这导致了内容比较和 debouncing 的实现）。
    *   “TypeScript 在文件 Y 中显示错误 X。请修复类型不匹配问题。”

6.  **迭代优化**: 基于测试和反馈改进先前结果。
    *   “最初仅使用 `onChange` 进行脏文件检测不可靠。修改它以比较当前的 Excalidraw 内容字符串和最初获取的内容字符串。”

这种迭代的、对话式的方法，结合 AI 执行命令（安装依赖、运行 linter）和操作文件（读取、写入、应用 diff）的能力，使得无需手动编写代码即可开发此应用程序。

## 快速开始

1.  **克隆仓库:**
    ```bash
    git clone https://github.com/icattlecoder/excalidraw-gh.git
    cd excalidraw-gh
    ```
2.  **安装依赖:**
    ```bash
    npm install
    ```
3.  **生成 GitHub 个人访问令牌 (PAT):**
    *   前往你的 GitHub [开发者设置](https://github.com/settings/tokens)。
    *   生成一个新的 **classic** 令牌。
    *   给它起个名字 (例如, "Excalidraw Editor")。
    *   选择 `repo` 范围权限 (完全控制私有仓库)。
    *   复制生成的令牌。**你将无法再次看到它。**
4.  **运行开发服务器:**
    ```bash
    npm run dev
    ```
5.  在浏览器中打开指定的本地 URL (通常是 `http://localhost:5173`)。
6.  在提示时粘贴你的 GitHub PAT。该令牌存储在你浏览器的 IndexedDB 中，不会发送到除 GitHub API 之外的任何地方。

## 通过 Vibe Coding 贡献

我们非常鼓励通过 Vibe Coding 的方法来改进这个项目！

1.  **Fork 本仓库。**
2.  **设置你的 Vibe Coding 环境** (例如，带工具的 Claude、Cursor 等) 指向你 fork 的仓库。
3.  **向 AI 助手描述你想要添加的更改或功能。** 使用清晰、增量的提示。
4.  **引导 AI** 完成实现、调试和测试。
5.  **提交 AI 所做的更改。**
6.  **发起 Pull Request**，详细说明更改内容以及使用的 Vibe Coding 过程。

让我们一起探索软件开发的未来！

## 许可证

本项目基于 MIT 许可证开源。