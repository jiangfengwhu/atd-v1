# AutoDev RSI Engineering Guardrails (Auto-Generated)

> 本文档由 AutoDev Studio RSI 自进化闭环（经 gemini-decision-1 门控筛选）自动生成，严格受限于 Prompt 预算护栏。编码阶段必须严格遵守。

### 1. [CRITICAL] 前端构建依赖显式声明与校验
- **分类**: 环境与网络异常 · **命中次数**: 3
- **强制指令**: 在配置或修改前端构建文件（如 vite.config.ts）时，必须确保所引用的构建工具与插件（如 vite、@vitejs/plugin-react）已显式声明在当前项目的 package.json 中，并在交付前执行完整构建命令验证依赖可正常解析。

### 2. [CRITICAL] 模块依赖路径一致性检查
- **分类**: 编译/类型错误 · **命中次数**: 2
- **强制指令**: 在修改代码目录结构后，必须执行全局依赖扫描，确保所有相对路径（特别是从 server 目录引用 src 目录的资源）保持同步更新，并运行静态分析工具检测悬空引用。
