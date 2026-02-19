使用 code-review 代理审查代码。

**审查范围**：$ARGUMENTS

## 执行步骤

1. 如果 `$ARGUMENTS` 为空，获取当前 git 改动（`git diff HEAD` 和 `git status`）确定审查范围；否则审查指定的文件或目录。
2. 调用 code-review 代理完成完整审查，输出结构化的中文审查报告。
3. 如果发现严重问题，在报告末尾追加：「建议在合并/部署前修复上述严重问题。」
