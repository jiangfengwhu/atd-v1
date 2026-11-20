# AutoDev RSI Engineering Guardrails (Auto-Generated)

> 本文档由 AutoDev Studio RSI 自进化闭环（经 gemini-decision-1 门控筛选）自动生成，严格受限于 Prompt 预算护栏。编码阶段必须严格遵守。

### 1. [CRITICAL] 严禁在生成内容中夹带密钥特征串
- **分类**: 流水线与权限 · **命中次数**: 1
- **强制指令**: 严禁在规划文档、代码、示例配置或测试数据中写入真实密钥或符合常见密钥格式（如 sk-、ghp_、AKIA 等）的占位符，应改用无密钥特征的占位文本（如 YOUR_API_KEY_HERE），避免触发 GitHub Secret Scanning 拦截（409）。
