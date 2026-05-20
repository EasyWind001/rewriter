# 风格化改写完整指南（Codex CLI 版）

> 适用场景：**已有整本初稿，想按目标风格批量重写**
>
> 工具：`novel-writer-style-cn` v0.22.3+（含改写流水线）+ Codex CLI

---

## 目录

1. [核心理念](#一核心理念)
2. [前置准备](#二前置准备)
3. [完整工作流（8 步）](#三完整工作流8-步)
4. [Codex CLI 操作要点](#四codex-cli-操作要点)
5. [实战示例（端到端）](#五实战示例端到端)
6. [进阶技巧](#六进阶技巧)
7. [常见问题排查](#七常见问题排查)
8. [配置参考](#八配置参考)
9. [5 分钟快速开始](#九附最简快速开始5-分钟版)
10. [**长记忆系统（防止 AI 失忆）⭐**](#十长记忆系统v0240-️-防止-ai-失忆)
6. [进阶技巧](#六进阶技巧)
7. [常见问题排查](#七常见问题排查)
8. [配置参考](#八配置参考)

---

## 一、核心理念

### 工作原理

整个流水线由**两类组件**协作完成：

| 组件 | 角色 | 能力 |
|------|------|------|
| **`novel` CLI** | 量化分析师 | 用 NLP 把文本变成可比对的数学指纹（不会写作） |
| **Codex CLI** | 创作执行者 | 读取改写工单，逐章按风格指纹改写（不会算指纹） |

二者通过中间产物（JSON 工单 + JSON 风格指纹）解耦：

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   样本书.txt          初稿.md                                     │
│      │                   │                                      │
│      ▼                   ▼                                      │
│   [novel preprocess]  [novel split]                             │
│      │                   │                                      │
│      ▼                   ▼                                      │
│   clean/书.txt      draft/chapters/  ← 章节文件 + _index.json    │
│      │                   │                                      │
│      ▼                   │                                      │
│   [novel analyze]        │                                      │
│      │                   │                                      │
│      ▼                   ▼                                      │
│   nlp/书.json  →  [novel rewrite-batch]                         │
│   (风格指纹)            │                                        │
│                         ▼                                       │
│                  rewrite-worklist.json  ← 改写工单                │
│                         │                                       │
│                         ▼                                       │
│                  ┌──────────────────────┐                       │
│                  │   Codex CLI          │                       │
│                  │  /novel-rewrite-execute │                    │
│                  │                      │                       │
│                  │  for 每一章:          │                       │
│                  │    读原文 → 改写      │                       │
│                  │    novel diff-style  │ ← 自我校验             │
│                  │    PASS? 下一章       │                       │
│                  │    FAIL? 重写        │                       │
│                  └──────────┬───────────┘                       │
│                             ▼                                   │
│                     output/chapters/  ← 改写后的章节              │
│                             │                                   │
│                             ▼                                   │
│                       [novel compose]                           │
│                             │                                   │
│                             ▼                                   │
│                     output/final.md  ← 最终成稿                  │
│                             │                                   │
│                             ▼                                   │
│                    [novel check-style] ← 全书校验                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 设计亮点

| 特性 | 价值 |
|------|------|
| **断点续传** | 工单实时记录每章状态，中断后下次自动续上 |
| **自我校验循环** | AI 改完一章自动调用 `novel diff-style` 判断是否达标，未达标自动重写 |
| **保护清单** | 专有名词、术语、产品名永不被改 |
| **规模监控** | 字数变化超过 ±15% 自动告警，防止过度删减/膨胀 |
| **量化指标** | 不靠主观感觉，所有判断基于 NLP 指纹（TTR/句长/标点分布） |

---

## 二、前置准备

### 2.1 软件要求

| 软件 | 版本要求 | 验证命令 |
|------|---------|---------|
| Node.js | ≥ 18.0.0 | `node -v` |
| Codex CLI | 最新版 | `codex --version` |
| Git（可选） | 任意 | `git --version` |

### 2.2 安装 novel CLI

```powershell
# 全局安装
npm install -g novel-writer-style-cn

# 验证
novel --version
```

如果你是从本地仓库使用（开发模式）：

```powershell
cd D:\Workspace\novel-writer-style-cn
npm install
npm link
novel --version
```

### 2.3 准备你的资料

在动手前，请准备好：

| 资料 | 要求 | 大小 |
|------|------|------|
| **目标风格样本** | 你想模仿的那本书的纯文本（`.txt` 或 `.md`） | 至少 1 万字，推荐 5 万字以上 |
| **你的初稿** | 整本初稿的 markdown 文件 | 不限 |
| **保护清单**（可选） | 必须保留的术语、人名、产品名（每行一个） | 任意 |

### 2.4 章节标题格式确认

提前确认你初稿的章节标题格式，这决定了 `novel split` 的参数：

| 格式 | 示例 | 默认是否识别 |
|------|------|------------|
| `第X章 标题` | `第一章 引言` / `第1章 引言` | ✅ 默认识别 |
| `第X节/回/卷/篇 标题` | `第三节 数据准备` | ✅ 默认识别 |
| `# Chapter N` | `# Chapter 1: Introduction` | ✅ 默认识别 |
| `# 第X章` | `# 第一章 引言` | ✅ 默认识别 |
| `【第一章】` | `【第三章】数据准备` | ❌ 需自定义正则 |
| `Part 1 / Section 1` | `Part 1: Foundations` | ❌ 需自定义正则 |
| `1. 标题` | `1. 引言` | ❌ 需自定义正则 |

如果是后三种，记下来后面用 `--pattern` 参数覆盖。

---

## 三、完整工作流（8 步）

### Step 0：初始化项目

```powershell
# 切换到工作目录
cd E:\my-projects

# 创建新项目，指定 Codex 平台 + 风格学习插件
novel init my-book-rewrite --ai codex --plugins style-learning

# 进入项目
cd my-book-rewrite
```

**会发生什么？**

```
my-book-rewrite/
├── .codex/
│   └── prompts/                    ← Codex 的命令目录
│       ├── novel-rewrite-execute.md  ← 你将要用的核心命令 ⭐
│       ├── novel-style-analyze.md
│       ├── novel-style-learn.md
│       └── ... 共 22 个命令
├── .specify/                       ← 项目配置
├── plugins/style-learning/         ← 风格学习插件本体
├── samples/                        ← 放样本的地方
├── stories/                        ← 项目自带（你不会用到）
└── spec/                           ← 写作规范
```

> 💡 **如果是已有项目**，使用 `novel init --here --ai codex --plugins style-learning`

### Step 1：放置目标风格样本

```powershell
# 创建样本子目录（按作者/风格分类）
mkdir samples\target

# 把你想模仿的那本书复制进来
copy E:\path\to\目标书.txt samples\target\
```

**样本要求**：

- 纯文本格式（`.txt` / `.md`），UTF-8 编码
- 单本书最少 1 万字，推荐 5 万字以上
- 同一作者同一时期的作品风格更稳定
- 不要混入多个差异巨大的风格

### Step 2：预处理样本

```powershell
novel preprocess samples/target/目标书.txt
```

**输出示例**：
```
✔ 预处理完成

📝 预处理结果

  原始长度: 156789 字符
  处理后长度: 142356 字符
  减少比例: 9.21%

处理步骤:
  ✓ 移除目录内容: 1234 字符
  ✓ 移除页码: 543 字符
  ✓ 规范化章节标题
  ✓ 统一标点符号为全角
  ✓ 移除多余空白: 12656 字符

✓ 处理后文本已保存到: clean/target/目标书.txt
  下一步: novel analyze clean/target/目标书.txt
```

**这一步在做什么？**

- 移除目录、页码等非正文
- 全角化标点（确保后续 NLP 分析准确）
- 清理多余空白行
- 自动输出到 `clean/target/目标书.txt`

> 💡 加 `--quality` 选项可同时评估文本质量

### Step 3：学习目标风格（生成风格指纹）

```powershell
novel analyze clean/target/目标书.txt --verbose
```

**输出示例**：
```
✔ 分析完成 (87ms)

📊 NLP 分析结果

词汇分析:
  总词数: 89432
  唯一词数: 12876
  词汇丰富度 (TTR): 14.4%

句法分析:
  总句数: 6234
  平均句长: 18.5 字

情感分析:
  情感倾向: positive
  情感得分: 0.12

高频词汇 (Top 10):
  1. 的
  2. 是
  3. 我
  4. 在
  5. 了
  ...

✓ 分析结果已保存到: nlp/target/目标书.json
```

**生成的风格指纹（`nlp/target/目标书.json`）长这样**：

```json
{
  "vocabulary": {
    "totalTokens": 89432,
    "uniqueTokens": 12876,
    "topWords": ["的", "是", "我", ...],   // Top 50 高频词
    "vocabularyRichness": 0.144            // TTR
  },
  "syntax": {
    "sentenceCount": 6234,
    "avgSentenceLength": 18.5,             // 平均句长
    "lengthDistribution": {                // 句长分布
      "short": 0.32,
      "medium": 0.51,
      "long": 0.17
    },
    "stdDeviation": 6.8,                   // 句长标准差（节奏感）
    "punctuationStyle": { ... }            // 标点使用频率
  },
  "sentiment": {
    "emotionalTone": "positive",
    "sentimentScore": 0.12
  }
}
```

这个 JSON 就是 AI 改写时的"风格目标"。

### Step 4：放置并切分你的初稿

```powershell
# 创建 draft 目录
mkdir draft

# 把整本初稿复制进来
copy E:\path\to\我的初稿.md draft\

# 切分章节
novel split draft/我的初稿.md
```

**输出示例**：
```
✓ 已切分为 47 章
  输出目录: draft/chapters
  索引文件: draft/chapters/_index.json
  总字数:   183456

章节预览（前 10 章）:
    1. 第一章 引言  (3245 字)
    2. 第二章 基础概念  (4567 字)
    3. 第三章 ...
    ...
```

**如果切分识别不准确**（章节数明显不对），自定义正则：

```powershell
# 例如：你的章节是 "【第X章】" 格式
novel split draft/我的初稿.md --pattern "^【第.+?章】"

# 例如：英文 "Chapter N: Title"
novel split draft/我的初稿.md --pattern "^#\s*Chapter\s+\d+"

# 例如："Part 1" / "Section 1"
novel split draft/我的初稿.md --pattern "^(Part|Section)\s+\d+"
```

### Step 5：（可选）准备保护清单

如果你的书里有不能改的术语、人名、产品名，建一个清单：

```powershell
# 创建 glossary-protected.txt（每行一个词）
@"
GPT-4
LangChain
Transformer
张三
李四
本书
本节
"@ | Out-File -FilePath glossary-protected.txt -Encoding utf8
```

这些词在改写时**绝对不会被替换**。

### Step 6：生成改写工单

```powershell
# 基础版
novel rewrite-batch `
  --source draft/chapters `
  --style nlp/target/目标书.json `
  --output output/chapters

# 带保护清单 + 自定义阈值
novel rewrite-batch `
  --source draft/chapters `
  --style nlp/target/目标书.json `
  --output output/chapters `
  --protect glossary-protected.txt `
  --threshold 75
```

**输出示例**：
```
✓ 已生成改写工单: rewrite-worklist.json
  目标风格: nlp/target/目标书.json
  待改写章节: 47
  通过阈值: 75%
  保护术语: 7 个

下一步：在 AI 助手中执行改写命令
  Claude Code:  /novel.rewrite-execute
  Cursor:       /rewrite-execute
  Gemini CLI:   /novel:rewrite-execute
```

> 💡 注意：提示里没显式列出 Codex，但你用的就是 `/novel-rewrite-execute`（短横线分隔）

`rewrite-worklist.json` 结构：

```json
{
  "version": "1.0",
  "style": "nlp/target/目标书.json",
  "sourceDir": "draft/chapters",
  "outputDir": "output/chapters",
  "threshold": 75,
  "protectedTerms": ["GPT-4", "LangChain", ...],
  "tasks": [
    {
      "index": 1,
      "title": "第一章 引言",
      "file": "001-第一章 引言.md",
      "sourcePath": "draft/chapters/001-第一章 引言.md",
      "targetPath": "output/chapters/001-第一章 引言.md",
      "originalWords": 3245,
      "status": "pending",
      "matchScore": null,
      "attempts": 0,
      "notes": ""
    },
    ...
  ]
}
```

### Step 7：在 Codex CLI 中执行批量改写 ⭐

**这是核心步骤。**

```powershell
# 在项目根目录启动 Codex
cd my-book-rewrite
codex
```

进入 Codex 交互界面后，输入：

```
/novel-rewrite-execute
```

**Codex 会自动按提示词执行**：

```
读取改写工单...
✓ 工单文件: rewrite-worklist.json
✓ 待改写章节: 47
✓ 目标风格: nlp/target/目标书.json
✓ 通过阈值: 75%
✓ 保护术语: 7 个

开始批量改写...

[1/47] 001-第一章 引言.md
  原文 3,245 字 → 改写中...
  ✓ 改写完成 → output/chapters/001-第一章 引言.md (3,180 字, -2.0%)
  → 校验: novel diff-style ...
  → 匹配率: 81.3% PASS ✓

[2/47] 002-第二章 基础概念.md
  原文 4,567 字 → 改写中...
  ✓ 改写完成 → 4,210 字, -7.8%
  → 校验: 匹配率 68.5% FAIL (词汇维度仅 52%)
  → 启动二次改写（强化高频词融入）
  ✓ 二次改写完成 → 4,398 字, -3.7%
  → 校验: 匹配率 79.2% PASS ✓

...

[进度报告 5/47]
  ✓ 完成 5 章, 平均匹配率 78.6%
  ⚠ 0 章待复核

...

[47/47] 047-后记.md
  ✓ 改写完成, 匹配率 84.3% PASS

🎉 全书改写完成！

总览:
  ✓ PASS: 42 章 (89%)
  ⚠ NEEDS_REVIEW: 5 章 (11%)
  📊 平均匹配率: 78.9%

报告已生成: rewrite-report.md
```

### Step 8：抽查、合稿、全书校验

#### 8.1 抽查任意章节

```powershell
novel diff-style `
  draft/chapters/005-第五章.md `
  output/chapters/005-第五章.md `
  --target nlp/target/目标书.json
```

**输出示例**：
```
📊 风格指纹对比

维度                 改写前        改写后        变化
────────────────────────────────────────────────────────────────
词汇丰富度 TTR            0.156         0.182    ↑ +0.026
平均句长                 24.300        18.700    ↓ -5.600
句长标准差                8.200         6.900    ↓ -1.300
情感得分                  0.080         0.120    ↑ +0.040
总词数(规模变化)        4567.000      4210.000    ↓ -357.000
  ✓ 规模变化 -7.8% 在合理范围内

🎯 与目标风格匹配度

改写前: 64.2%  (部分一致)
改写后: 81.5%  (基本一致)
变化:   ✓ 显著改善 (+17.3%)

各维度匹配度（改写后）:
  词汇: 78.3%   句法: 89.1%   情感: 76.4%   节奏: 82.7%

  RESULT: PASS
```

#### 8.2 合稿

```powershell
novel compose --output output/最终稿.md
```

**输出示例**：
```
✓ 合稿完成: output/最终稿.md
  合并章节: 47/47
  总字数:   174823
  原书字数: 183456

下一步：
  novel check-style output/最终稿.md <目标风格.json>   # 全书风格校验
```

#### 8.3 全书风格校验

```powershell
novel check-style output/最终稿.md nlp/target/目标书.json
```

**输出示例**：
```
🎯 风格一致性检测结果

  总体得分: 79.4% (基本一致)

各维度得分:
  词汇匹配: 76.2%
  句法匹配: 84.5%
  情感匹配: 75.8%
  节奏匹配: 81.1%

改进建议:
  - 词汇丰富度 0.182，目标 0.144，建议略减少词汇多样性
  - 节奏控制优秀，与目标风格一致
```

---

## 四、Codex CLI 操作要点

### 4.1 命令格式速查

| 操作 | 命令 |
|------|------|
| 启动 Codex | `codex` |
| 在项目内启动 | `cd my-book-rewrite && codex` |
| 风格化批量改写 | `/novel-rewrite-execute` |
| 风格分析（替代 CLI） | `/novel-style-analyze samples/target/目标书.txt` |
| 风格学习（替代 CLI） | `/novel-style-learn samples/target/ --name="目标风格"` |
| 单章风格化创作 | `/novel-write-styled 第1章 引言 --style="目标风格"` |
| 退出 | Ctrl+C 或输入 `exit` |

> ⚠️ Codex 的命令一律是 **`/novel-<命令名>`** 格式（短横线分隔），不要写成 `/novel.xxx` 或 `/novel:xxx`

### 4.2 权限确认

首次执行 `/novel-rewrite-execute` 时，Codex 可能会询问：

```
Codex wants to:
  - Read files in: rewrite-worklist.json, draft/chapters/**, nlp/**
  - Write files to: output/chapters/**, rewrite-worklist.json
  - Run command: novel diff-style ...

Allow? (y/n)
```

**回答 `y`**。这些都是改写流程必须的操作。

如果想一次性放开，可以在启动 Codex 时加参数（参考 Codex 自身文档）。

### 4.3 中断与恢复

**正常中断**：直接 Ctrl+C 退出 Codex。

**恢复方式**：

```powershell
codex
```

```
/novel-rewrite-execute
```

Codex 会自动读取 `rewrite-worklist.json`，**跳过所有 status === "done" 的任务**，从第一个 pending 任务继续。

### 4.4 让 Codex 处理特定章节

如果你只想改写其中某几章（比如只改 5-10 章），不要直接全跑。改成手动指令：

```
/novel-rewrite-execute 

只处理第 5 到第 10 章的任务（任务 5-10），其他章节保持 pending 状态不动
```

或者**手工编辑 `rewrite-worklist.json`**，把不想改的章节 `status` 改为 `"skipped"`。

### 4.5 让 Codex 重写已完成章节

如果你对某章不满意，想让它重写：

```
请重新改写第 7 章（output/chapters/007-第七章.md），
我觉得当前版本句式太生硬，希望增加对话感、降低正式程度
```

Codex 会读取原章节、按你的额外要求重新改写，再调用 `novel diff-style` 校验。

---

## 五、实战示例（端到端）

假设你正在写一本《机器学习实战》，想模仿《人类简史》的通俗易懂风格。

### 完整命令序列

```powershell
# === 准备 ===
cd E:\projects
novel init ml-book-rewrite --ai codex --plugins style-learning
cd ml-book-rewrite

# === 学风格 ===
mkdir samples\harari
copy E:\books\人类简史.txt samples\harari\
novel preprocess samples/harari/人类简史.txt
novel analyze clean/harari/人类简史.txt --verbose

# === 切初稿 ===
mkdir draft
copy E:\drafts\我的ML实战初稿.md draft\
novel split draft/我的ML实战初稿.md

# 假设输出: 已切分为 32 章，总字数 256789

# === 准备保护清单 ===
@"
GPT-4
LangChain
Hugging Face
PyTorch
TensorFlow
scikit-learn
Transformer
BERT
ResNet
"@ | Out-File glossary-protected.txt -Encoding utf8

# === 生成工单 ===
novel rewrite-batch `
  --source draft/chapters `
  --style nlp/harari/人类简史.json `
  --output output/chapters `
  --protect glossary-protected.txt `
  --threshold 75

# === 在 Codex 中执行 ===
codex
```

进入 Codex 后：

```
/novel-rewrite-execute
```

等待 Codex 完成（32 章预计 30-90 分钟，取决于章节长度和 Codex 速度）。

```powershell
# === 抽查关键章节 ===
novel diff-style `
  draft/chapters/001-第一章` 引言.md `
  output/chapters/001-第一章` 引言.md `
  --target nlp/harari/人类简史.json

# === 合稿 ===
novel compose --output output/最终稿.md

# === 全书校验 ===
novel check-style output/最终稿.md nlp/harari/人类简史.json
```

---

## 六、进阶技巧

### 6.1 多风格融合

想要"60% 人类简史 + 40% 三体"的风格？

**目前 CLI 不直接支持，但可以通过 Codex 实现**：

1. 分别生成两个风格 JSON：
   ```powershell
   novel analyze clean/harari/人类简史.txt
   novel analyze clean/liucixin/三体.txt
   ```

2. 在工单生成后，让 Codex 同时参考两个风格：

   编辑 `rewrite-worklist.json`，把 `style` 字段改为：
   ```json
   "style": ["nlp/harari/人类简史.json", "nlp/liucixin/三体.json"],
   "styleRatio": [0.6, 0.4]
   ```

3. 在 Codex 中执行时手动说明：
   ```
   /novel-rewrite-execute
   
   注意：本次改写需要融合两种风格。优先采用《人类简史》(60%) 的通俗风格，
   再融入《三体》(40%) 的硬核精确感。最终匹配率以 60% 倾向《人类简史》为准。
   ```

### 6.2 仅润色不重写（增量模式）

如果你的初稿已经接近目标风格，只想做小幅调整：

在 Codex 中：

```
/novel-rewrite-execute

执行模式：润色模式
- 只调整匹配率 < 70% 的段落（不是章节级，是段落级）
- 大部分段落保持原样
- 字数变化控制在 ±5% 以内
```

### 6.3 单章试改（验证可行性）

不要一上来就跑整本书。先单章试：

```powershell
# 把 worklist 备份
copy rewrite-worklist.json rewrite-worklist.full.json

# 编辑 worklist，只保留第 1 章（其他删掉或标记 skipped）
# 用记事本打开 rewrite-worklist.json，把 tasks 数组只留 1 个
```

在 Codex 执行：
```
/novel-rewrite-execute
```

满意了再恢复完整工单：
```powershell
copy rewrite-worklist.full.json rewrite-worklist.json
```

### 6.4 并行处理多本书

如果你有多本书要改写，每本一个项目目录：

```
E:\projects\
├── book-A-rewrite\
│   ├── draft\
│   ├── output\
│   └── rewrite-worklist.json
├── book-B-rewrite\
│   └── ...
└── book-C-rewrite\
    └── ...
```

每个目录独立运行，互不干扰。

### 6.5 自动化脚本（一键流水线）

把整套流程封装成 PowerShell 脚本 `rewrite.ps1`：

```powershell
param(
    [Parameter(Mandatory)] [string]$DraftFile,
    [Parameter(Mandatory)] [string]$SampleFile,
    [string]$ProtectFile = "",
    [int]$Threshold = 75
)

Write-Host "=== Step 1: 预处理样本 ===" -ForegroundColor Cyan
novel preprocess $SampleFile

$cleanFile = $SampleFile -replace "^samples", "clean"
Write-Host "=== Step 2: 学习风格 ===" -ForegroundColor Cyan
novel analyze $cleanFile

$styleFile = ($cleanFile -replace "^clean", "nlp") -replace "\.txt$", ".json"

Write-Host "=== Step 3: 切分初稿 ===" -ForegroundColor Cyan
novel split $DraftFile

Write-Host "=== Step 4: 生成工单 ===" -ForegroundColor Cyan
$args = @("rewrite-batch",
    "--source", "draft/chapters",
    "--style", $styleFile,
    "--output", "output/chapters",
    "--threshold", $Threshold)

if ($ProtectFile) {
    $args += @("--protect", $ProtectFile)
}

& novel @args

Write-Host ""
Write-Host "✓ 准备完成！" -ForegroundColor Green
Write-Host "  下一步：" -ForegroundColor Yellow
Write-Host "    1. codex" -ForegroundColor White
Write-Host "    2. /novel-rewrite-execute" -ForegroundColor White
Write-Host "    3. novel compose --output output/最终稿.md" -ForegroundColor White
```

使用：
```powershell
.\rewrite.ps1 `
  -DraftFile "draft/我的初稿.md" `
  -SampleFile "samples/target/目标书.txt" `
  -ProtectFile "glossary-protected.txt"
```

---

## 七、常见问题排查

### 7.1 命令找不到

#### Q1: `novel: command not found`

**原因**：CLI 未全局安装或 PATH 未刷新。

**解决**：
```powershell
npm install -g novel-writer-style-cn
# 或本地链接：
cd D:\Workspace\novel-writer-style-cn
npm link
```

#### Q2: Codex 中输入 `/novel-rewrite-execute` 没反应

**原因**：`.codex/prompts/novel-rewrite-execute.md` 不存在。

**诊断**：
```powershell
ls .codex\prompts\novel-rewrite-execute.md
```

**修复**：
```powershell
# 重装插件
novel plugins:add style-learning

# 或重新初始化（在新目录）
novel init my-book --ai codex --plugins style-learning
```

### 7.2 切分问题

#### Q3: `novel split` 识别的章节数不对

**诊断**：默认正则只识别 `第X章/节/回/卷/篇` 和 `# Chapter`。

**修复**：用 `--pattern` 自定义：

```powershell
# 看看你的初稿前 50 行的标题样式
Get-Content draft/我的初稿.md -Head 50 | Select-String -Pattern "章|节|Chapter|Section|Part|^\d+\."

# 然后根据实际格式自定义
novel split draft/我的初稿.md --pattern "^### .+"  # 三级标题
```

#### Q4: 切分后某些章节字数异常少

**原因**：可能误把段落开头当成了章节标题。

**修复**：让正则更严格：
```powershell
# 例如要求章节标题独占一行且无其他内容
novel split draft/我的初稿.md --pattern "^第[一二三四五六七八九十百千万\d]+章\s+\S"
```

### 7.3 改写过程问题

#### Q5: Codex 改写到一半卡住了

**原因**：上下文用满、网络问题、或权限请求未确认。

**解决**：
1. Ctrl+C 退出 Codex
2. 重新进 Codex：`codex`
3. 重新执行：`/novel-rewrite-execute`
4. Codex 会自动从断点续传

#### Q6: 改写后匹配率全部很低（< 60%）

**可能原因**：
- 样本与初稿风格差异过大（如学术书 vs 网络小说，本身难以贴合）
- 样本量不足（< 1 万字）
- 目标风格本身置信度低

**诊断**：
```powershell
# 查看风格指纹的置信度
type nlp\target\目标书.json | Select-String "confidence"
```

**解决**：
- 增加样本（再加几本同作者的书）
- 降低阈值：`novel rewrite-batch --threshold 60`
- 检查初稿是否有大量代码/表格/公式占主导（这些 AI 不会改，会拉低匹配率）

#### Q7: AI 把保护的术语改了

**原因**：保护清单未生效或词条不准确。

**诊断**：
```powershell
type rewrite-worklist.json | Select-String "protectedTerms" -Context 0,10
```

**修复**：
- 确认 `glossary-protected.txt` 是 UTF-8 编码
- 确认每行一个词，无多余空格
- 重新生成工单：`novel rewrite-batch --protect glossary-protected.txt ...`
- 在 Codex 提示中明确强调：
  ```
  /novel-rewrite-execute
  
  特别强调：rewrite-worklist.json 中的 protectedTerms 必须严格保留原文，
  这些术语在改写时绝对不能进行任何同义词替换或语序调整。
  ```

### 7.4 字数问题

#### Q8: 改写后某章字数变化超过 ±15%

**告警提示**：
```
⚠ 规模变化 -23.5% 超过 ±15%，可能存在过度删减/膨胀
```

**处理**：
- 如果是某一章的问题：手动让 Codex 重改这一章并约束字数
  ```
  请重新改写第 8 章 (output/chapters/008-第八章.md)，
  目标字数控制在原文 ±10% 以内（原文 4500 字，目标 4050-4950）
  ```
- 如果是全书的问题：调整 Codex 提示，强化字数约束

#### Q9: 合稿后总字数明显少于原书

**原因**：AI 在改写时倾向于精简。

**解决**：
- 在 Codex 中明确要求"保持信息密度"
- 在执行前修改 `rewrite-worklist.json`，添加全局约束：
  ```json
  {
    "globalConstraints": {
      "preserveAllExamples": true,
      "preserveAllCases": true,
      "wordCountTolerance": 0.10
    }
  }
  ```

### 7.5 编码问题

#### Q10: 文件出现乱码（中文变 ??）

**原因**：文件不是 UTF-8 编码。

**解决**：
```powershell
# PowerShell 转码
Get-Content E:\原文件.txt -Encoding GBK | Out-File draft\我的初稿.md -Encoding utf8

# 或用记事本打开 → 另存为 → 编码选 UTF-8
```

---

## 八、配置参考

### 8.1 项目目录结构（完整版）

```
my-book-rewrite/
├── .codex/
│   └── prompts/                    # Codex 命令目录
│       ├── novel-rewrite-execute.md
│       ├── novel-style-analyze.md
│       └── ...
├── .specify/                       # Spec Kit 配置
│   ├── config.json
│   ├── memory/
│   ├── scripts/
│   └── templates/
├── plugins/style-learning/         # 风格学习插件本体
├── samples/                        # 原始样本（你提供）
│   └── target/
│       └── 目标书.txt
├── clean/                          # 预处理后的文本（CLI 自动生成）
│   └── target/
│       └── 目标书.txt
├── nlp/                            # 风格指纹（CLI 自动生成）
│   └── target/
│       └── 目标书.json
├── draft/                          # 你的初稿
│   ├── 我的初稿.md
│   └── chapters/                   # 切分后的章节
│       ├── _index.json
│       ├── 001-xxx.md
│       └── ...
├── output/                         # AI 改写产物
│   ├── chapters/
│   │   ├── 001-xxx.md
│   │   └── ...
│   └── 最终稿.md                    # compose 后的成稿
├── rewrite-worklist.json           # 改写工单（核心文件）
├── rewrite-report.md               # 全书改写报告（AI 生成）
└── glossary-protected.txt          # 保护清单（你提供）
```

### 8.2 命令速查表

#### CLI 命令（在 PowerShell 中运行）

| 命令 | 用途 | 必需参数 |
|------|------|---------|
| `novel init <name> --ai codex --plugins style-learning` | 初始化项目 | name |
| `novel preprocess <file>` | 预处理样本 | file |
| `novel analyze <file>` | 生成风格指纹 | file |
| `novel split <file>` | 切分初稿 | file |
| `novel rewrite-batch --source --style --output` | 生成工单 | --style |
| `novel diff-style <a> <b>` | 对比风格变化 | a, b |
| `novel compose --output` | 合并章节 | --output |
| `novel check-style <text> <style>` | 全书校验 | text, style |

#### Codex 命令（在 Codex CLI 中运行）

| 命令 | 用途 |
|------|------|
| `/novel-rewrite-execute` | 批量改写（核心命令） |
| `/novel-style-analyze <file>` | 让 AI 描述风格特征 |
| `/novel-style-learn <dir> --name=...` | 让 AI 生成风格档案 |
| `/novel-write-styled <章节名> --style=...` | 让 AI 写新章节 |
| `/novel-style-check <file> --style=...` | 让 AI 校验单章 |

### 8.3 工单文件字段说明

```json
{
  "version": "1.0",                       // 工单格式版本
  "style": "nlp/target/目标书.json",       // 目标风格指纹路径
  "sourceDir": "draft/chapters",          // 初稿章节目录
  "outputDir": "output/chapters",         // 改写输出目录
  "threshold": 75,                        // PASS 阈值（百分比）
  "protectedTerms": ["GPT-4", ...],       // 保护清单
  "createdAt": "2026-05-20T15:30:00Z",
  "tasks": [
    {
      "index": 1,                         // 章节序号
      "title": "第一章 引言",              // 章节标题
      "file": "001-第一章 引言.md",        // 文件名
      "sourcePath": "draft/...",          // 源路径
      "targetPath": "output/...",         // 目标路径
      "originalWords": 3245,              // 原文字数
      "status": "pending",                // 状态: pending|done|needs_review|error|skipped
      "matchScore": null,                 // 匹配率（执行后填入）
      "attempts": 0,                      // 尝试次数
      "notes": ""                         // 备注（失败原因等）
    }
  ]
}
```

### 8.4 风格指纹核心字段

| 字段 | 类型 | 含义 | 改写时的目标 |
|------|------|------|------------|
| `vocabulary.vocabularyRichness` | float | TTR 词汇丰富度（0-1） | 调整词汇多样性 |
| `vocabulary.topWords` | array | Top 50 高频词 | 在不影响语义的情况下融入 |
| `syntax.avgSentenceLength` | float | 平均句长 | 句子长度向此值靠拢 |
| `syntax.lengthDistribution` | object | 短/中/长句比例 | 调整句长分布 |
| `syntax.stdDeviation` | float | 句长标准差 | 控制节奏感 |
| `syntax.punctuationStyle` | object | 标点频率 | 调整标点使用 |
| `sentiment.emotionalTone` | string | positive/neutral/negative | 调整整体语气 |

### 8.5 阈值参考

| 匹配率 | 等级 | 处理建议 |
|--------|------|---------|
| ≥ 90% | 优秀 | 高度一致，无需调整 |
| 75-90% | 基本一致 | 通过，可不调整 |
| 60-75% | 部分一致 | 建议二次改写或人工微调 |
| 40-60% | 较低 | 必须重写或人工介入 |
| < 40% | 很低 | 风格目标可能本身不切实际 |

**推荐阈值**：

- **首次尝试**：`--threshold 70`（宽松，先看效果）
- **正式生产**：`--threshold 75`（默认）
- **追求高度一致**：`--threshold 80`（严格，会有更多 NEEDS_REVIEW）

---

## 九、附：最简快速开始（5 分钟版）

如果你只想最快跑起来，记住这 6 行命令：

```powershell
# 1. 建项目
novel init my-book --ai codex --plugins style-learning
cd my-book

# 2. 准备样本和初稿（手动复制到 samples/target/ 和 draft/）

# 3. 学风格 + 切初稿（一行命令做完前置）
novel preprocess samples/target/目标书.txt
novel analyze clean/target/目标书.txt
novel split draft/我的初稿.md
novel rewrite-batch --source draft/chapters --style nlp/target/目标书.json --output output/chapters

# 4. 进 Codex 跑改写
codex
```

进 Codex 后输入：
```
/novel-rewrite-execute
```

完成后退出 Codex：
```powershell
# 5. 合稿 + 校验
novel compose --output output/最终稿.md
novel check-style output/最终稿.md nlp/target/目标书.json
```

---

**🎉 现在你掌握了完整的 Codex 风格化改写流水线。**

如有问题，参考[第七章排查指南](#七常见问题排查)或查看 [`docs/PROJECT_WORKFLOW.md`](PROJECT_WORKFLOW.md)。

📚 相关文档：
- [项目架构总览](../README.md)
- [NLP 分析流程](nlp-analysis-flow.md)
- [风格学习插件](../plugins/style-learning/README.md)

---

## 十、长记忆系统（v0.24.0+）⭐ 防止 AI 失忆

### 10.1 为什么需要长记忆？

批量改写 50 章时，AI 在改第 30 章时**已经完全忘了第 5 章**做过什么决策：

| 失忆类型 | 具体表现 | 后果 |
|---------|---------|------|
| **术语漂移** | "Transformer"前面译"变换器"，后面译"变压器" | 🔴 全书术语不一致 |
| **称谓不一** | 前面用"我们"，后面变"你"或"读者" | 🔴 风格分裂 |
| **概念引用断裂** | 第 15 章说"如前所述的 X 原则"，但 X 原则前文表述对不上 | 🔴 逻辑断裂 |
| **风格漂移** | 前 5 章句长稳定，第 20 章突然变长 | 🟡 风格疲劳 |

**长记忆系统的解决方案**：让 AI 改每一章时都先读取一份"全书工作笔记"，改完后把新决策写回笔记。

### 10.2 工作原理

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   memory/rewrite-memory.json    ← 全局记忆库（持久化）       │
│   ┌─────────────────────────────────────────────────────┐  │
│   │ 术语表（全书统一译法）                                  │  │
│   │   Transformer → "Transformer 模型"                  │  │
│   │   fine-tuning → "微调"                              │  │
│   │   ...                                               │  │
│   │                                                     │  │
│   │ 风格决策（全书锁定）                                   │  │
│   │   narratorPerson: 第二人称（你）                      │  │
│   │   toneRegister: 通俗易懂                             │  │
│   │                                                     │  │
│   │ 章节摘要（供后续章节交叉引用）                          │  │
│   │   Ch3: Transformer 基础 [keyClaims, definedTerms]   │  │
│   │   Ch5: BERT 详解 ...                                │  │
│   │   ...                                               │  │
│   └─────────────────────────────────────────────────────┘  │
│                ▲                          │                 │
│                │ 读取                  写回 │                 │
│                │                          ▼                 │
│   ┌────────────────────────────────────────────────────┐   │
│   │  改写第 N 章时的输入                                  │   │
│   │   - 完整记忆库（全书共享）                              │   │
│   │   - 前 N-2..N-1 章成稿（滑动窗口：上下文衔接）           │   │
│   │   - 第 N 章原稿（待改写）                              │   │
│   │   - 第 N+1 章原稿（预读：识别伏笔）                     │   │
│   │   - 风格指纹 JSON                                    │   │
│   └────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 10.3 命令速查

| 命令 | 用途 |
|------|------|
| `novel memory init` | 初始化空记忆库 |
| `novel memory show` | 查看当前记忆（术语/风格/章节摘要） |
| `novel memory show --section terminology` | 只看术语表 |
| `novel memory update --patch-file <file> --chapter <n>` | 合并新记忆（AI 自动调用） |
| `novel memory validate <chapter.md>` | 校验某章是否符合记忆 |
| `novel memory check-all` | 全书一致性扫描 |

### 10.4 默认行为（无需手动操作）

从 v0.24.0 起，`novel rewrite-batch` **自动启用长记忆系统**：

```powershell
novel rewrite-batch --source draft/chapters --style nlp/target/某书.json --output output/chapters
```

会自动做：
1. ✅ 检测 `memory/rewrite-memory.json` 是否存在，不存在则自动创建
2. ✅ 在 `rewrite-worklist.json` 中注入 `memory.enabled: true`
3. ✅ 配置滑动窗口（默认前 2 章 + 后 1 章）

```json
// rewrite-worklist.json (v2.0)
{
  "version": "2.0",
  "memory": {
    "enabled": true,
    "path": "memory/rewrite-memory.json"
  },
  "slidingWindow": {
    "contextBefore": 2,
    "contextAfter": 1
  },
  ...
}
```

然后在 Codex 中执行 `/novel-rewrite-execute`，AI 会：

1. **每章开始前**：读取记忆库 + 前 2 章成稿 + 后 1 章原稿
2. **改写时**：严格使用记忆库中的术语译法，沿用风格决策
3. **改完后**：自动调用 `novel memory update` 把新术语/章节摘要写入记忆库
4. **校验时**：除了 `novel diff-style` 风格校验，还做 `novel memory validate` 术语校验
5. **失败时**：术语漂移 → 自动修正错误用词；风格不达标 → 二次改写

### 10.5 自定义参数

```powershell
# 调整滑动窗口大小（参考更多上下文，但消耗更多 token）
novel rewrite-batch `
  --source draft/chapters `
  --style nlp/target/某书.json `
  --output output/chapters `
  --window-before 3 `
  --window-after 2

# 使用自定义记忆库路径
novel rewrite-batch `
  --source draft/chapters `
  --style nlp/target/某书.json `
  --memory custom/my-memory.json

# 禁用长记忆（不推荐）
novel rewrite-batch `
  --source draft/chapters `
  --style nlp/target/某书.json `
  --no-memory
```

### 10.6 中途查看 / 编辑记忆库

#### 查看 AI 已经做了哪些决策

```powershell
# 看完整记忆
novel memory show

# 只看术语表
novel memory show --section terminology

# 只看风格决策
novel memory show --section style

# 只看章节摘要
novel memory show --section chapters
```

**输出示例**：
```
📚 改写长记忆库

路径: memory/rewrite-memory.json
最后更新: 2026-05-20T16:30:00Z
已改写章节: 15

📖 术语表 (47 个):
  Transformer → Transformer 模型  (出现 32 次, 首现 Ch3)
  fine-tuning → 微调  (出现 18 次, 首现 Ch5)
  attention → 注意力机制  (出现 24 次, 首现 Ch3)
  ...

🎨 全局风格决策:
  narratorPerson: 第二人称（你）
  toneRegister: 通俗易懂
  exampleStyle: 用日常类比代替学术案例
  codeBlockHandling: 保留原样，不改注释

📑 章节摘要 (15 章):
  Ch1. 引言
     本章介绍 AI 时代的到来...
     定义术语: AI, 神经网络
  Ch3. Transformer 基础
     本章介绍 Transformer 核心架构...
     定义术语: Transformer, 自注意力, 位置编码
  ...

🔗 交叉引用: 前向 23 条 / 后向 8 条
```

#### 手动修正某个错误决策

如果你发现 AI 把某术语译错了（比如把 "Transformer" 译成了 "变换器"，但你想改回 "Transformer 模型"）：

**方式 1：直接编辑记忆库 JSON**

```powershell
notepad memory\rewrite-memory.json
```

找到 `terminology.Transformer` 字段，改成你想要的：

```json
"Transformer": {
  "translation": "Transformer 模型",
  "alternativesRejected": ["变换器", "变压器"],
  "firstAppearance": { "chapter": 3 },
  "usageCount": 32
}
```

**方式 2：用 patch 文件覆盖**

```powershell
@'
{
  "terminology": {
    "Transformer": {
      "translation": "Transformer 模型",
      "alternativesRejected": ["变换器", "变压器"]
    }
  }
}
'@ | Out-File patch.json -Encoding utf8

novel memory update --patch-file patch.json
```

修正后，对所有已改写章节做扫描：

```powershell
novel memory check-all
```

```
🔍 全书一致性扫描

✗ 发现 3 处不一致:

  Ch5. 005-第五章.md
    变换器 (2次) → 应为 Transformer 模型
  Ch12. 012-第十二章.md
    变换器 (1次) → 应为 Transformer 模型
  Ch18. 018-第十八章.md
    变换器 (5次) → 应为 Transformer 模型
```

然后让 Codex 修正这些章节：

```
在 Codex 中输入：

请扫描 output/chapters/ 目录下的所有 .md 文件，
将所有 "变换器" 替换为 "Transformer 模型"，
然后调用 novel memory check-all 验证全书一致性。
```

### 10.7 全书一致性扫描

改写完成后，强烈建议运行：

```powershell
novel memory check-all --dir output/chapters
```

这会扫描所有改写后的章节，检查：
- 是否有术语使用了 `alternativesRejected` 中的错误译法
- 同一术语在不同章节是否一致

**如果有问题，输出会精确到章节和具体词汇**。修正后再运行一次，直到通过。

### 10.8 完整带记忆的工作流（更新版）

```powershell
# 1. 初始化项目
novel init my-book-rewrite --ai codex --plugins style-learning
cd my-book-rewrite

# 2. 准备样本和初稿（不变）
copy E:\目标书.txt samples\target\
copy E:\我的初稿.md draft\

# 3. 学风格 + 切初稿（不变）
novel preprocess samples/target/目标书.txt
novel analyze clean/target/目标书.txt
novel split draft/我的初稿.md

# 4. 生成工单（自动启用长记忆）
novel rewrite-batch `
  --source draft/chapters `
  --style nlp/target/目标书.json `
  --output output/chapters
# 输出会显示: "📚 长记忆: 已启用"

# 5. 在 Codex 执行（AI 会自动维护记忆）
codex
# /novel-rewrite-execute

# 6. （可选）中途查看 AI 学到了什么
novel memory show --section terminology

# 7. 改写完成后，做全书一致性扫描
novel memory check-all

# 8. 合稿 + 校验
novel compose --output output/最终稿.md
novel check-style output/最终稿.md nlp/target/目标书.json
```

### 10.9 多本书的记忆隔离

**每个项目目录有独立的 `memory/rewrite-memory.json`**，互不干扰：

```
projects/
├── book-A-rewrite/
│   ├── memory/rewrite-memory.json  ← A 书的术语表
│   └── ...
└── book-B-rewrite/
    ├── memory/rewrite-memory.json  ← B 书的术语表
    └── ...
```

如果你想在多本书间共享某些术语决策（比如同一作者的系列书），手动复制相关字段即可。

### 10.10 记忆库的常见问题

#### Q1: 记忆库越来越大会影响性能吗？

**不会**。即使 100 章 + 500 个术语，记忆库也只有几百 KB，AI 读取毫无压力。

但要注意：如果术语表超过 200 项，AI 上下文消耗会显著增加。这种情况建议：
- 把不再活跃的术语用 `"deprecated": true` 标记，AI 加载时跳过
- 或拆分多个记忆文件（按主题）

#### Q2: 如何回滚记忆库？

记忆库每次更新都会在 `rewriteLog` 中留痕：

```json
"rewriteLog": [
  { "timestamp": "2026-05-20T15:00:00Z", "chapter": 5, "changes": {...} },
  { "timestamp": "2026-05-20T15:30:00Z", "chapter": 6, "changes": {...} }
]
```

但当前版本不支持自动回滚。建议每改完几章手动备份：

```powershell
copy memory\rewrite-memory.json memory\rewrite-memory.backup-ch10.json
```

#### Q3: 我直接编辑了 JSON 文件，会被 AI 覆盖吗？

**不会**。AI 调用 `memory update` 时是**合并模式**：
- 已存在的术语：累加 usageCount，不修改 translation
- 已设定的风格决策：不覆盖

所以你手动改了某个术语译法后，AI 会沿用你的修改，不会覆盖。

#### Q4: 滑动窗口大小怎么选？

| 场景 | 推荐窗口 |
|------|---------|
| 章节独立性强（如教程书每章自成一体） | `--window-before 1 --window-after 0` |
| 普通技术书（默认） | `--window-before 2 --window-after 1` |
| 强连续性叙事（小说/传记/有大量伏笔的书） | `--window-before 3 --window-after 2` |
| 上下文消耗已经很大（章节本身很长） | `--window-before 1 --window-after 1` |

### 10.11 更新后的目录结构

```
my-book-rewrite/
├── memory/                         ← 长记忆系统 ⭐
│   └── rewrite-memory.json         ← 全局记忆库
├── draft/chapters/                 ← 切分后的初稿
├── output/chapters/                ← 改写产物
├── nlp/target/                     ← 风格指纹
├── samples/target/                 ← 原始样本
├── clean/target/                   ← 预处理后的样本
├── rewrite-worklist.json (v2.0)   ← 工单（含 memory + slidingWindow 配置）
├── rewrite-report.md               ← 全书改写报告
└── ...
```

---

## 总结：本工具的关键不变量

无论改写多少章，长记忆系统保证以下 6 条始终满足：

1. **术语一致**：同一概念全书一种译法
2. **称谓一致**：narratorPerson 全书不变
3. **基调一致**：toneRegister 不漂移
4. **引用真实**：所有"如前所述"指向真实存在的内容
5. **结构完整**：章节标题、小标题、列表层级与原文 1:1 对应
6. **事实保留**：人名/地名/数字/年份/引用零修改

只要这 6 条都满足，改写就是成功的。

**这是普通对话式 AI 改写做不到的，因为它每次都是"白板从头来"。我们的方案让 AI 拥有了「持久化的全书认知」。**
