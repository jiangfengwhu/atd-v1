# AutoDev RSI Engineering Guardrails (Auto-Generated)

> 本文档由 AutoDev Studio RSI 自进化闭环自动生成，汇总历史测试失败、环境故障与验收退回经验。编码阶段必须严格遵守。

### 1. [CRITICAL] 避免列表卡片操作按钮与只读 E2E 导航全局定位正则冲突
- **分类**: 测试断言失败 · **命中次数**: 1
- **强制指令**: 实现列表/Feed 卡片中的次级按钮时，必须检查 tests/e2e/ 下的只读 Playwright 契约，确保卡片内按钮的可访问名称（文本、aria-label、title）不会命中全局导航定位正则（如 /站内信|私信|messages/i），防止 Playwright strict mode violation 匹配到多个元素。

### 2. [CRITICAL] 严禁在 AGY 编码回合内启动常驻后台测试或服务任务
- **分类**: 环境与网络异常 · **命中次数**: 1
- **强制指令**: 在 VPS AGY 编码执行期间，严禁以异步后台任务（background task）或未退出守护进程的方式运行 dev server 或 Playwright 套件，避免主 Agent 进入 root agent idle 并空等 20 分钟触发 print_timeout (DEADLINE_EXCEEDED)。所有构建与测试必须使用带有限超时的前台命令（如 timeout 180s npx playwright test --reporter=line），退出前确保无残留后台进程。

### 3. [CRITICAL] 严禁硬编码主题色与残留Mock数据
- **分类**: 人工验收退回 · **命中次数**: 1
- **强制指令**: 实现UI组件时必须使用语义化主题变量或完整的亮暗色适配类（覆盖导航标签、卡片及容器背景），严禁硬编码固定灰阶或暗色背景；同时在交付前必须接入真实后端数据（如曝光量等指标）并彻底清理Mock数据与未实现的占位功能按钮，确保视觉边框、圆角风格与整体页面保持一致。
