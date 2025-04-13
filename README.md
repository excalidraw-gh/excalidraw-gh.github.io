# Excalidraw GitHub Editor - A Vibe Coding Experiment

[简体中文](./README.zh-CN.md)

<!-- Vercel Deploy Button Removed -->

This project is an experimental web application that allows users to browse GitHub repositories, open `.excalidraw` files directly within the browser using the Excalidraw editor, make changes, and save them back to GitHub with a commit message.

**The primary significance of this project lies not just in its functionality, but in its creation process: it was developed entirely through Vibe Coding, utilizing an AI coding assistant (like Claude, ChatGPT with tools, or similar) without manual code writing.** This serves as a demonstration and exploration of AI-driven software development workflows.

## Core Features

*   **GitHub Repository Browsing**: Connect to your GitHub account using a Personal Access Token (PAT) with `repo` scope.
*   **Repository & Branch Selection**: Select repositories and branches from your account.
*   **File Tree Navigation**: View the file structure of the selected branch.
*   **Excalidraw File Editing**: Click on `.excalidraw` files to open them in an embedded Excalidraw editor.
*   **In-Browser Caching**: Excalidraw utilizes IndexedDB to cache the current drawing state, allowing you to switch between files without losing unsaved local changes.
*   **Change Detection**: Modified files are marked with an asterisk (`*`) in the file tree based on content comparison.
*   **Save to GitHub**: Save changes back to the GitHub repository with a custom commit message.
*   **File Operations**: Create new files, rename/delete existing files (with guidance for folder operations).
*   **Internationalization (i18n)**: Supports English and Chinese interface languages, automatically detecting browser preference.
*   **(Planned)** View file commit history.

## Built With Vibe Coding: A New Development Paradigm

This project stands as a testament to the power of Vibe Coding. Instead of traditional manual coding, the entire application, from setting up the Vite + React + TypeScript environment to implementing complex features like GitHub API integration, Excalidraw embedding, state management, and UI components (using Shadcn UI), was achieved through conversational prompts and instructions given to an AI assistant equipped with file system and command execution tools.

**The process itself is as important as the resulting product.** It highlights the potential for AI to act as a highly capable pair programmer or even the primary implementer, guided by human intent and architectural decisions.

### Vibe Coding Prompting Practices & Examples (from this project)

Throughout the development, various prompting strategies were employed:

1.  **Incremental Feature Requests**: Building features step-by-step.
    *   *Initial Prompt (Paraphrased)*: "Create a Vite React TypeScript project. Add react-resizable-panels to create a two-panel layout (left for file browser, right for content)."
    *   *Follow-up*: "In the left panel, implement a component to input and store a GitHub PAT securely (using IndexedDB)."
    *   *Follow-up*: "Fetch and display the user's repositories in a dropdown after PAT is entered."
    *   *Follow-up*: "Implement a file tree component to browse the selected repository and branch."
    *   *Follow-up*: "Integrate the Excalidraw component into the right panel. Load the content of `.excalidraw` files clicked in the file tree."
    *   *Follow-up*: "Implement change detection by comparing current Excalidraw content with the original fetched content. Mark dirty files in the tree."
    *   *Follow-up*: "Add a save feature: provide a 'Save' option in the file tree context menu for dirty files, prompt for a commit message, and use the GitHub API to update the file."

2.  **Component Scaffolding**: Requesting the basic structure of components.
    *   "Create a React component `GithubFileTree` that takes PAT, repo, and branch as props and displays a file tree."
    *   "Create a wrapper component `ExcalidrawWrapper` that renders the `@excalidraw/excalidraw` component and accepts `initialData` and `onChange` props."

3.  **API Integration**: Specifying API endpoints and expected data flow.
    *   "Write a function `getGithubFileContent` that uses the GitHub Contents API (`GET /repos/{owner}/{repo}/contents/{path}`) to fetch file content, handling base64 decoding."
    *   "Implement the `updateGithubFile` function using `PUT /repos/{owner}/{repo}/contents/{path}`, including the file SHA and commit message."

4.  **UI Implementation & Refinement**: Using libraries like Shadcn UI and providing specific UI instructions.
    *   "Use Shadcn UI's `Select` component for repository and branch selection."
    *   "Add a context menu (DropdownMenu) to the file tree nodes with 'Rename' and 'Delete' options."
    *   "Use Shadcn UI `Dialog` to prompt for a commit message before saving."
    *   "Use `sonner` for toast notifications on save success/failure."

5.  **Debugging and Error Handling**: Describing issues and asking for fixes.
    *   "Opening a file causes a 'Maximum update depth exceeded' error. Analyze the state updates between `App.tsx` and `ExcalidrawWrapper.tsx` and fix the infinite loop." (This led to implementing content comparison and debouncing).
    *   "TypeScript shows error X in file Y. Please fix the type mismatch."

6.  **Iterative Refinement**: Building upon previous results based on testing and feedback.
    *   "The initial dirty file detection using only `onChange` is unreliable. Modify it to compare the current Excalidraw content string with the originally fetched content string."

This iterative, conversational approach, combined with the AI's ability to execute commands (install dependencies, run linters) and manipulate files (read, write, apply diffs), enabled the development of this application without writing code manually.

## Getting Started

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/icattlecoder/excalidraw-gh.git
    cd excalidraw-gh
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Generate a GitHub Personal Access Token (PAT):**
    *   Go to your GitHub [Developer settings](https://github.com/settings/tokens).
    *   Generate a new **classic** token.
    *   Give it a name (e.g., "Excalidraw Editor").
    *   Select the `repo` scope (Full control of private repositories).
    *   Copy the generated token. **You won't be able to see it again.**
4.  **Run the development server:**
    ```bash
    npm run dev
    ```
5.  Open your browser to the specified local URL (usually `http://localhost:5173`).
6.  Paste your GitHub PAT when prompted. The token is stored locally in your browser's IndexedDB and is not sent anywhere else except directly to the GitHub API.

## Contributing via Vibe Coding

We strongly encourage contributions to improve this project, especially using the Vibe Coding methodology!

1.  **Fork the repository.**
2.  **Set up your Vibe Coding environment** (e.g., Claude with tools, Cursor, etc.) pointing to your forked repository.
3.  **Describe the changes or features you want to add** to the AI assistant. Use clear, incremental prompts.
4.  **Guide the AI** through implementation, debugging, and testing.
5.  **Commit the changes** made by the AI.
6.  **Open a Pull Request** detailing the changes and the Vibe Coding process used.

Let's explore the future of software development together!

## License

This project is open source, licensed under the MIT License.
