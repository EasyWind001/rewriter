#!/usr/bin/env node
import { Command } from '@commander-js/extra-typings';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import ora from 'ora';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { getVersion, getVersionInfo } from './version.js';
import { PluginManager } from './plugins/manager.js';
import { ensureProjectRoot, getProjectInfo } from './utils/project.js';
import { displayProjectBanner, selectAIAssistant, selectWritingMethod, selectScriptType, confirmExpertMode, displayStep, isInteractive } from './utils/interactive.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const program = new Command();
const AI_CONFIGS = [
    { name: 'claude', dir: '.claude', commandsDir: 'commands', displayName: 'Claude Code' },
    { name: 'cursor', dir: '.cursor', commandsDir: 'commands', displayName: 'Cursor' },
    { name: 'gemini', dir: '.gemini', commandsDir: 'commands', displayName: 'Gemini CLI' },
    { name: 'windsurf', dir: '.windsurf', commandsDir: 'workflows', displayName: 'Windsurf' },
    { name: 'roocode', dir: '.roo', commandsDir: 'commands', displayName: 'Roo Code' },
    { name: 'copilot', dir: '.github', commandsDir: 'prompts', displayName: 'GitHub Copilot', extraDirs: ['.vscode'] },
    { name: 'qwen', dir: '.qwen', commandsDir: 'commands', displayName: 'Qwen Code' },
    { name: 'opencode', dir: '.opencode', commandsDir: 'command', displayName: 'OpenCode' },
    { name: 'codex', dir: '.codex', commandsDir: 'prompts', displayName: 'Codex CLI' },
    { name: 'kilocode', dir: '.kilocode', commandsDir: 'workflows', displayName: 'Kilo Code' },
    { name: 'auggie', dir: '.augment', commandsDir: 'commands', displayName: 'Auggie CLI' },
    { name: 'codebuddy', dir: '.codebuddy', commandsDir: 'commands', displayName: 'CodeBuddy' },
    { name: 'q', dir: '.amazonq', commandsDir: 'prompts', displayName: 'Amazon Q Developer' }
];
// 辅助函数：处理命令模板生成 Markdown 格式
function generateMarkdownCommand(template, scriptPath) {
    // 直接替换 {SCRIPT} 并返回完整内容，保留所有 frontmatter 包括 scripts 部分
    return template.replace(/{SCRIPT}/g, scriptPath);
}
// 辅助函数：生成 TOML 格式命令
function generateTomlCommand(template, scriptPath) {
    // 提取 description
    const descMatch = template.match(/description:\s*(.+)/);
    const description = descMatch ? descMatch[1].trim() : '命令说明';
    // 移除 YAML frontmatter
    const content = template.replace(/^---[\s\S]*?---\n/, '');
    // 替换 {SCRIPT}
    const processedContent = content.replace(/{SCRIPT}/g, scriptPath);
    // 规范化换行符，避免 Windows CRLF 导致 TOML 解析失败
    const normalizedContent = processedContent.replace(/\r\n/g, '\n');
    const promptValue = JSON.stringify(normalizedContent);
    const escapedDescription = description
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"');
    return `description = "${escapedDescription}"

prompt = ${promptValue}
`;
}
// 显示欢迎横幅
function displayBanner() {
    const banner = `
╔═══════════════════════════════════════╗
║     📚  Novel Writer  📝              ║
║     AI 驱动的中文小说创作工具        ║
╚═══════════════════════════════════════╝
`;
    console.log(chalk.cyan(banner));
    console.log(chalk.gray(`  v${getVersion()}\n`));
}
displayBanner();
program
    .name('novel')
    .description(chalk.cyan('Novel Writer - AI 驱动的中文小说创作工具初始化'))
    .version(getVersion(), '-v, --version', '显示版本号')
    .helpOption('-h, --help', '显示帮助信息');
// init 命令 - 初始化小说项目（类似 specify init）
program
    .command('init')
    .argument('[name]', '小说项目名称')
    .option('--here', '在当前目录初始化')
    .option('--ai <type>', '选择 AI 助手: claude | cursor | gemini | windsurf | roocode | copilot | qwen | opencode | codex | kilocode | auggie | codebuddy | q')
    .option('--all', '为所有支持的 AI 助手生成配置')
    .option('--method <type>', '选择写作方法: three-act | hero-journey | story-circle | seven-point | pixar | snowflake')
    .option('--no-git', '跳过 Git 初始化')
    .option('--with-experts', '包含专家模式')
    .option('--plugins <names>', '预装插件，逗号分隔')
    .description('初始化一个新的小说项目')
    .action(async (name, options) => {
    // 如果是交互式终端且没有明确指定参数，显示交互选择
    const shouldShowInteractive = isInteractive() && !options.all;
    const needsAISelection = shouldShowInteractive && !options.ai;
    const needsMethodSelection = shouldShowInteractive && !options.method;
    const needsExpertConfirm = shouldShowInteractive && !options.withExperts;
    
    // 验证参数：必须提供项目名称或使用 --here 参数
    if (!name && !options.here) {
        console.error(chalk.red('错误: 请提供项目名称或使用 --here 参数在当前目录初始化'));
        console.log(chalk.gray('示例:'));
        console.log(chalk.gray('  novel init my-novel'));
        console.log(chalk.gray('  novel init --here'));
        process.exit(1);
    }
    
    if (needsAISelection || needsMethodSelection || needsExpertConfirm) {
        // 显示项目横幅
        displayProjectBanner();
        let stepCount = 0;
        const totalSteps = 4;
        // 交互式选择 AI 助手
        if (needsAISelection) {
            stepCount++;
            displayStep(stepCount, totalSteps, '选择 AI 助手');
            options.ai = await selectAIAssistant(AI_CONFIGS);
            console.log('');
        }
        // 交互式选择写作方法
        if (needsMethodSelection) {
            stepCount++;
            displayStep(stepCount, totalSteps, '选择写作方法');
            options.method = await selectWritingMethod();
            console.log('');
        }
        // 交互式选择脚本类型
        stepCount++;
        displayStep(stepCount, totalSteps, '选择脚本类型');
        const selectedScriptType = await selectScriptType();
        console.log('');
        // 交互式确认专家模式
        if (needsExpertConfirm) {
            stepCount++;
            displayStep(stepCount, totalSteps, '专家模式');
            const enableExperts = await confirmExpertMode();
            if (enableExperts) {
                options.withExperts = true;
            }
            console.log('');
        }
    }
    // 设置默认值（如果没有通过交互或参数指定）
    if (!options.ai)
        options.ai = 'claude';
    if (!options.method)
        options.method = 'three-act';
    const spinner = ora('正在初始化小说项目...').start();
    try {
        // 确定项目路径
        let projectPath;
        if (options.here) {
            projectPath = process.cwd();
            name = path.basename(projectPath);
        }
        else {
            // name 已经在前面验证过，这里不会是 undefined
            projectPath = path.join(process.cwd(), name);
            if (await fs.pathExists(projectPath)) {
                // 检查是否是有效的 novel-writer 项目
                const configPath = path.join(projectPath, '.specify', 'config.json');
                const isValidProject = await fs.pathExists(configPath);

                // 如果指定了 --plugins 且是有效项目，则只安装插件
                if (options.plugins && isValidProject) {
                    spinner.text = '检测到现有项目，正在安装插件...';
                    const packageRoot = path.resolve(__dirname, '..');
                    const pluginNames = options.plugins.split(',').map((p) => p.trim());
                    const pluginManager = new PluginManager(projectPath);

                    // 检测已安装的 AI 平台
                    const installedAIs = await pluginManager.detectInstalledAIs();

                    for (const pluginName of pluginNames) {
                        const builtinPluginPath = path.join(packageRoot, 'plugins', pluginName);
                        if (await fs.pathExists(builtinPluginPath)) {
                            await pluginManager.installPlugin(pluginName, builtinPluginPath);
                            spinner.text = `已安装插件: ${pluginName}`;

                            // 注入插件命令到 AI 平台
                            if (installedAIs.length > 0) {
                                spinner.text = `正在注入 ${pluginName} 命令到 AI 平台...`;
                                const injectedCount = await pluginManager.injectPluginCommands(pluginName, builtinPluginPath, installedAIs);
                                if (injectedCount > 0) {
                                    spinner.text = `已注入 ${injectedCount} 个命令`;
                                }
                            }
                        }
                        else {
                            console.log(chalk.yellow(`\n警告: 插件 "${pluginName}" 未找到`));
                        }
                    }

                    // 复制 samples 目录（风格学习插件需要）
                    const samplesSourceDir = path.join(packageRoot, 'samples');
                    if (await fs.pathExists(samplesSourceDir)) {
                        const userSamplesDir = path.join(projectPath, 'samples');
                        if (!await fs.pathExists(userSamplesDir)) {
                            await fs.copy(samplesSourceDir, userSamplesDir);
                        }
                    }

                    spinner.succeed(chalk.green(`插件安装成功！`));
                    console.log('\n' + chalk.cyan('已安装的插件:'));
                    for (const pluginName of pluginNames) {
                        console.log(chalk.gray(`  - ${pluginName}`));
                    }
                    console.log('\n' + chalk.gray('提示: 使用 /style-learn 命令开始学习写作风格'));
                    process.exit(0);
                }

                // 如果不是有效项目或没有指定插件，报错
                if (!isValidProject) {
                    spinner.fail(`目录 "${name}" 已存在但不是有效的 novel-writer 项目`);
                    console.log(chalk.gray('提示: 使用其他名称创建新项目，或删除该目录'));
                }
                else {
                    spinner.fail(`项目 "${name}" 已存在`);
                    console.log(chalk.gray('提示: 如需安装插件，请使用: novel init ' + name + ' --plugins <插件名>'));
                    console.log(chalk.gray('      或使用: novel plugins:install <插件名>'));
                }
                process.exit(1);
            }
            await fs.ensureDir(projectPath);
        }
        // 创建基础项目结构
        const baseDirs = [
            '.specify',
            '.specify/memory',
            '.specify/scripts',
            '.specify/scripts/bash',
            '.specify/scripts/powershell',
            '.specify/templates',
            'stories',
            'spec',
            'spec/tracking',
            'spec/knowledge'
        ];
        for (const dir of baseDirs) {
            await fs.ensureDir(path.join(projectPath, dir));
        }
        // 根据 AI 类型创建特定目录
        const aiDirs = [];
        if (options.all) {
            // 创建所有 AI 目录
            aiDirs.push('.claude/commands', '.cursor/commands', '.gemini/commands', '.windsurf/workflows', '.roo/commands', '.github/prompts', '.vscode', '.qwen/commands', '.opencode/command', '.codex/prompts', '.kilocode/workflows', '.augment/commands', '.codebuddy/commands', '.amazonq/prompts');
        }
        else {
            // 根据选择的 AI 创建目录
            switch (options.ai) {
                case 'claude':
                    aiDirs.push('.claude/commands');
                    break;
                case 'cursor':
                    aiDirs.push('.cursor/commands');
                    break;
                case 'gemini':
                    aiDirs.push('.gemini/commands');
                    break;
                case 'windsurf':
                    aiDirs.push('.windsurf/workflows');
                    break;
                case 'roocode':
                    aiDirs.push('.roo/commands');
                    break;
                case 'copilot':
                    aiDirs.push('.github/prompts', '.vscode');
                    break;
                case 'qwen':
                    aiDirs.push('.qwen/commands');
                    break;
                case 'opencode':
                    aiDirs.push('.opencode/command');
                    break;
                case 'codex':
                    aiDirs.push('.codex/prompts');
                    break;
                case 'kilocode':
                    aiDirs.push('.kilocode/workflows');
                    break;
                case 'auggie':
                    aiDirs.push('.augment/commands');
                    break;
                case 'codebuddy':
                    aiDirs.push('.codebuddy/commands');
                    break;
                case 'q':
                    aiDirs.push('.amazonq/prompts');
                    break;
            }
        }
        for (const dir of aiDirs) {
            await fs.ensureDir(path.join(projectPath, dir));
        }
        // 创建基础配置文件
        const config = {
            name,
            type: 'novel',
            ai: options.ai,
            method: options.method || 'three-act',
            created: new Date().toISOString(),
            version: getVersion()
        };
        await fs.writeJson(path.join(projectPath, '.specify', 'config.json'), config, { spaces: 2 });
        // 从构建产物复制 AI 配置和命令文件
        const packageRoot = path.resolve(__dirname, '..');
        const scriptsDir = path.join(packageRoot, 'scripts');
        const sourceMap = {
            'claude': 'dist/claude',
            'gemini': 'dist/gemini',
            'cursor': 'dist/cursor',
            'windsurf': 'dist/windsurf',
            'roocode': 'dist/roocode',
            'copilot': 'dist/copilot',
            'qwen': 'dist/qwen',
            'opencode': 'dist/opencode',
            'codex': 'dist/codex',
            'kilocode': 'dist/kilocode',
            'auggie': 'dist/auggie',
            'codebuddy': 'dist/codebuddy',
            'q': 'dist/q'
        };
        // 确定需要复制的 AI 平台
        const targetAI = [];
        if (options.all) {
            targetAI.push('claude', 'gemini', 'cursor', 'windsurf', 'roocode', 'copilot', 'qwen', 'opencode', 'codex', 'kilocode', 'auggie', 'codebuddy', 'q');
        }
        else {
            targetAI.push(options.ai);
        }
        // 复制 AI 配置目录（包含命令文件和 .specify 目录）
        for (const ai of targetAI) {
            const sourceDir = path.join(packageRoot, sourceMap[ai]);
            if (await fs.pathExists(sourceDir)) {
                // 复制整个构建产物目录到项目
                await fs.copy(sourceDir, projectPath, { overwrite: false });
                spinner.text = `已安装 ${ai} 配置...`;
            }
            else {
                console.log(chalk.yellow(`\n警告: ${ai} 构建产物未找到，请运行 npm run build:commands`));
            }
        }
        // 复制脚本文件到用户项目的 .specify/scripts 目录（构建产物已包含）
        // 注意：.specify 目录已由上面的 fs.copy 复制，此处仅作为备份逻辑
        if (await fs.pathExists(scriptsDir) && !await fs.pathExists(path.join(projectPath, '.specify', 'scripts'))) {
            const userScriptsDir = path.join(projectPath, '.specify', 'scripts');
            await fs.copy(scriptsDir, userScriptsDir);
            // 设置 bash 脚本执行权限
            const bashDir = path.join(userScriptsDir, 'bash');
            if (await fs.pathExists(bashDir)) {
                const bashFiles = await fs.readdir(bashDir);
                for (const file of bashFiles) {
                    if (file.endsWith('.sh')) {
                        const filePath = path.join(bashDir, file);
                        await fs.chmod(filePath, 0o755);
                    }
                }
            }
        }
        // 复制模板文件到 .specify/templates 目录
        const fullTemplatesDir = path.join(packageRoot, 'templates');
        if (await fs.pathExists(fullTemplatesDir)) {
            const userTemplatesDir = path.join(projectPath, '.specify', 'templates');
            await fs.copy(fullTemplatesDir, userTemplatesDir);
        }
        // 复制 memory 文件到 .specify/memory 目录
        const memoryDir = path.join(packageRoot, 'memory');
        if (await fs.pathExists(memoryDir)) {
            const userMemoryDir = path.join(projectPath, '.specify', 'memory');
            await fs.copy(memoryDir, userMemoryDir);
        }
        // 复制追踪文件模板到 spec/tracking 目录
        const trackingTemplatesDir = path.join(packageRoot, 'templates', 'tracking');
        if (await fs.pathExists(trackingTemplatesDir)) {
            const userTrackingDir = path.join(projectPath, 'spec', 'tracking');
            await fs.copy(trackingTemplatesDir, userTrackingDir);
        }
        // 复制知识库模板到 spec/knowledge 目录
        const knowledgeTemplatesDir = path.join(packageRoot, 'templates', 'knowledge');
        if (await fs.pathExists(knowledgeTemplatesDir)) {
            const userKnowledgeDir = path.join(projectPath, 'spec', 'knowledge');
            await fs.copy(knowledgeTemplatesDir, userKnowledgeDir);
            // 更新模板中的日期
            const knowledgeFiles = await fs.readdir(userKnowledgeDir);
            const currentDate = new Date().toISOString().split('T')[0];
            for (const file of knowledgeFiles) {
                if (file.endsWith('.md')) {
                    const filePath = path.join(userKnowledgeDir, file);
                    let content = await fs.readFile(filePath, 'utf-8');
                    content = content.replace(/\[日期\]/g, currentDate);
                    await fs.writeFile(filePath, content);
                }
            }
        }
        // 复制 spec 目录结构（包括预设和反AI检测规范）
        // 注意：构建产物已包含 spec/presets 等，此处作为后备确保完整性
        const specDir = path.join(packageRoot, 'spec');
        if (await fs.pathExists(specDir)) {
            const userSpecDir = path.join(projectPath, 'spec');
            // 遍历并复制所有 spec 子目录
            const specItems = await fs.readdir(specDir);
            for (const item of specItems) {
                const sourcePath = path.join(specDir, item);
                const targetPath = path.join(userSpecDir, item);
                // presets、checklists、config.json 等直接复制（不覆盖已存在的）
                // tracking 和 knowledge 已在前面从 templates 复制，跳过
                if (item !== 'tracking' && item !== 'knowledge') {
                    await fs.copy(sourcePath, targetPath, { overwrite: false });
                }
            }
        }
        // 为 Gemini 复制额外的配置文件
        if (aiDirs.some(dir => dir.includes('.gemini'))) {
            // 复制 settings.json
            const geminiSettingsSource = path.join(packageRoot, 'templates', 'gemini-settings.json');
            const geminiSettingsDest = path.join(projectPath, '.gemini', 'settings.json');
            if (await fs.pathExists(geminiSettingsSource)) {
                await fs.copy(geminiSettingsSource, geminiSettingsDest);
                console.log('  ✓ 已复制 Gemini settings.json');
            }
            // 复制 GEMINI.md
            const geminiMdSource = path.join(packageRoot, 'templates', 'GEMINI.md');
            const geminiMdDest = path.join(projectPath, '.gemini', 'GEMINI.md');
            if (await fs.pathExists(geminiMdSource)) {
                await fs.copy(geminiMdSource, geminiMdDest);
                console.log('  ✓ 已复制 GEMINI.md');
            }
        }
        // 为 GitHub Copilot 复制 VS Code settings
        if (aiDirs.some(dir => dir.includes('.github') || dir.includes('.vscode'))) {
            const vscodeSettingsSource = path.join(packageRoot, 'templates', 'vscode-settings.json');
            const vscodeSettingsDest = path.join(projectPath, '.vscode', 'settings.json');
            if (await fs.pathExists(vscodeSettingsSource)) {
                await fs.copy(vscodeSettingsSource, vscodeSettingsDest);
                console.log('  ✓ 已复制 GitHub Copilot settings.json');
            }
        }
        // 如果指定了 --with-experts，复制专家文件和 expert 命令
        if (options.withExperts) {
            spinner.text = '安装专家模式...';
            // 复制专家目录
            const expertsSourceDir = path.join(packageRoot, 'experts');
            if (await fs.pathExists(expertsSourceDir)) {
                const userExpertsDir = path.join(projectPath, 'experts');
                await fs.copy(expertsSourceDir, userExpertsDir);
            }
            // 复制 expert 命令到各个 AI 目录
            const expertCommandSource = path.join(packageRoot, 'templates', 'commands', 'expert.md');
            if (await fs.pathExists(expertCommandSource)) {
                const expertContent = await fs.readFile(expertCommandSource, 'utf-8');
                for (const aiDir of aiDirs) {
                    if (aiDir.includes('claude') || aiDir.includes('cursor')) {
                        const expertPath = path.join(projectPath, aiDir, 'expert.md');
                        await fs.writeFile(expertPath, expertContent);
                    }
                    // Windsurf 使用 workflows 目录
                    if (aiDir.includes('windsurf')) {
                        const expertPath = path.join(projectPath, aiDir, 'expert.md');
                        await fs.writeFile(expertPath, expertContent);
                    }
                    // Roo Code 使用 Markdown 命令目录
                    if (aiDir.includes('.roo')) {
                        const expertPath = path.join(projectPath, aiDir, 'expert.md');
                        await fs.writeFile(expertPath, expertContent);
                    }
                    // Gemini 格式处理
                    if (aiDir.includes('gemini')) {
                        const expertPath = path.join(projectPath, aiDir, 'expert.toml');
                        const expertToml = generateTomlCommand(expertContent, '');
                        await fs.writeFile(expertPath, expertToml);
                    }
                }
            }
        }
        // 如果指定了 --plugins，安装插件
        if (options.plugins) {
            spinner.text = '安装插件...';
            const pluginNames = options.plugins.split(',').map((p) => p.trim());
            const pluginManager = new PluginManager(projectPath);

            // 确定目标 AI 平台
            let targetAIs = [];
            if (options.all) {
                targetAIs = ['claude', 'cursor', 'gemini', 'windsurf', 'roocode', 'copilot', 'qwen'];
            } else if (options.ai) {
                targetAIs = [options.ai];
            }

            for (const pluginName of pluginNames) {
                // 检查内置插件
                const builtinPluginPath = path.join(packageRoot, 'plugins', pluginName);
                if (await fs.pathExists(builtinPluginPath)) {
                    await pluginManager.installPlugin(pluginName, builtinPluginPath);

                    // 注入插件命令到 AI 平台
                    if (targetAIs.length > 0) {
                        spinner.text = `正在注入 ${pluginName} 命令...`;
                        const injectedCount = await pluginManager.injectPluginCommands(pluginName, builtinPluginPath, targetAIs);
                        if (injectedCount > 0) {
                            spinner.text = `已注入 ${injectedCount} 个命令`;
                        }
                    }
                }
                else {
                    console.log(chalk.yellow(`\n警告: 插件 "${pluginName}" 未找到`));
                }
            }

            // 复制 samples 目录（风格学习插件需要）
            const samplesSourceDir = path.join(packageRoot, 'samples');
            if (await fs.pathExists(samplesSourceDir)) {
                const userSamplesDir = path.join(projectPath, 'samples');
                await fs.copy(samplesSourceDir, userSamplesDir);
                spinner.text = '已复制样本文件...';
            }
        }
        // Git 初始化
        if (options.git !== false) {
            try {
                execSync('git init', { cwd: projectPath, stdio: 'ignore' });
                // 创建 .gitignore
                const gitignore = `# 临时文件
*.tmp
*.swp
.DS_Store

# 编辑器配置
.vscode/
.idea/

# AI 缓存
.ai-cache/

# 节点模块
node_modules/
`;
                await fs.writeFile(path.join(projectPath, '.gitignore'), gitignore);
                execSync('git add .', { cwd: projectPath, stdio: 'ignore' });
                execSync('git commit -m "初始化小说项目"', { cwd: projectPath, stdio: 'ignore' });
            }
            catch {
                console.log(chalk.yellow('\n提示: Git 初始化失败，但项目已创建成功'));
            }
        }
        spinner.succeed(chalk.green(`小说项目 "${name}" 创建成功！`));
        // 显示后续步骤
        console.log('\n' + chalk.cyan('接下来:'));
        console.log(chalk.gray('─────────────────────────────'));
        if (!options.here) {
            console.log(`  1. ${chalk.white(`cd ${name}`)} - 进入项目目录`);
        }
        const aiName = {
            'claude': 'Claude Code',
            'cursor': 'Cursor',
            'gemini': 'Gemini',
            'windsurf': 'Windsurf',
            'roocode': 'Roo Code',
            'copilot': 'GitHub Copilot',
            'qwen': 'Qwen Code',
            'opencode': 'OpenCode',
            'codex': 'Codex CLI',
            'kilocode': 'Kilo Code',
            'auggie': 'Auggie CLI',
            'codebuddy': 'CodeBuddy',
            'q': 'Amazon Q Developer'
        }[options.ai] || 'AI 助手';
        if (options.all) {
            console.log(`  2. ${chalk.white('在任意 AI 助手中打开项目（Claude Code、Cursor、Gemini、Windsurf、Roo Code、GitHub Copilot、Qwen Code、OpenCode、Codex CLI、Kilo Code、Auggie CLI、CodeBuddy、Amazon Q Developer）')}`);
        }
        else {
            console.log(`  2. ${chalk.white(`在 ${aiName} 中打开项目`)}`);
        }
        console.log(`  3. 使用以下斜杠命令开始创作:`);
        console.log('\n' + chalk.yellow('     📝 七步方法论:'));
        console.log(`     ${chalk.cyan('/constitution')} - 创建创作宪法，定义核心原则`);
        console.log(`     ${chalk.cyan('/specify')}      - 定义故事规格，明确要创造什么`);
        console.log(`     ${chalk.cyan('/clarify')}      - 澄清关键决策点，明确模糊之处`);
        console.log(`     ${chalk.cyan('/plan')}         - 制定技术方案，决定如何创作`);
        console.log(`     ${chalk.cyan('/tasks')}        - 分解执行任务，生成可执行清单`);
        console.log(`     ${chalk.cyan('/write')}        - AI 辅助写作章节内容`);
        console.log(`     ${chalk.cyan('/analyze')}      - 综合验证分析，确保质量一致`);
        console.log('\n' + chalk.yellow('     📊 追踪管理命令:'));
        console.log(`     ${chalk.cyan('/plot-check')}  - 检查情节一致性`);
        console.log(`     ${chalk.cyan('/timeline')}    - 管理故事时间线`);
        console.log(`     ${chalk.cyan('/relations')}   - 追踪角色关系`);
        console.log(`     ${chalk.cyan('/world-check')} - 验证世界观设定`);
        console.log(`     ${chalk.cyan('/track')}       - 综合追踪与智能分析`);
        // 如果安装了专家模式，显示提示
        if (options.withExperts) {
            console.log('\n' + chalk.yellow('     🎓 专家模式:'));
            console.log(`     ${chalk.cyan('/expert')}       - 列出可用专家`);
            console.log(`     ${chalk.cyan('/expert plot')} - 剧情结构专家`);
            console.log(`     ${chalk.cyan('/expert character')} - 人物塑造专家`);
        }
        // 如果安装了插件，显示插件命令
        if (options.plugins) {
            const installedPlugins = options.plugins.split(',').map((p) => p.trim());
            if (installedPlugins.includes('translate')) {
                console.log('\n' + chalk.yellow('     🌍 翻译插件:'));
                console.log(`     ${chalk.cyan('/translate')}   - 中英文翻译`);
                console.log(`     ${chalk.cyan('/polish')}      - 英文润色`);
            }
        }
        console.log('\n' + chalk.gray('推荐流程: constitution → specify → clarify → plan → tasks → write → analyze'));
        console.log(chalk.dim('提示: 斜杠命令在 AI 助手内部使用，不是在终端中'));
    }
    catch (error) {
        spinner.fail(chalk.red('项目初始化失败'));
        console.error(error);
        process.exit(1);
    }
});
// check 命令 - 检查环境
program
    .command('check')
    .description('检查系统环境和 AI 工具')
    .action(() => {
    console.log(chalk.cyan('检查系统环境...\n'));
    const checks = [
        { name: 'Node.js', command: 'node --version', installed: false },
        { name: 'Git', command: 'git --version', installed: false },
        { name: 'Claude CLI', command: 'claude --version', installed: false },
        { name: 'Cursor', command: 'cursor --version', installed: false },
        { name: 'Gemini CLI', command: 'gemini --version', installed: false }
    ];
    checks.forEach(check => {
        try {
            execSync(check.command, { stdio: 'ignore' });
            check.installed = true;
            console.log(chalk.green('✓') + ` ${check.name} 已安装`);
        }
        catch {
            console.log(chalk.yellow('⚠') + ` ${check.name} 未安装`);
        }
    });
    const hasAI = checks.slice(2).some(c => c.installed);
    if (!hasAI) {
        console.log('\n' + chalk.yellow('警告: 未检测到 AI 助手工具'));
        console.log('请安装以下任一工具:');
        console.log('  • Claude: https://claude.ai');
        console.log('  • Cursor: https://cursor.sh');
        console.log('  • Gemini: https://gemini.google.com');
        console.log('  • Roo Code: https://roocode.com');
    }
    else {
        console.log('\n' + chalk.green('环境检查通过！'));
    }
});
// plugins 命令 - 插件管理
program
    .command('plugins')
    .description('插件管理')
    .action(() => {
    // 显示插件子命令帮助
    console.log(chalk.cyan('\n📦 插件管理命令:\n'));
    console.log('  novel plugins list              - 列出已安装的插件');
    console.log('  novel plugins add <name>        - 安装插件');
    console.log('  novel plugins remove <name>     - 移除插件');
    console.log('\n' + chalk.gray('可用插件:'));
    console.log('  translate         - 中英文翻译插件');
    console.log('  authentic-voice   - 真实人声写作插件');
});
program
    .command('plugins:list')
    .description('列出已安装的插件')
    .action(async () => {
    try {
        // 检测项目
        const projectPath = await ensureProjectRoot();
        const projectInfo = await getProjectInfo(projectPath);
        if (!projectInfo) {
            console.log(chalk.red('❌ 无法读取项目信息'));
            process.exit(1);
        }
        const pluginManager = new PluginManager(projectPath);
        const plugins = await pluginManager.listPlugins();
        console.log(chalk.cyan('\n📦 已安装的插件\n'));
        console.log(chalk.gray(`项目: ${path.basename(projectPath)}`));
        console.log(chalk.gray(`AI 配置: ${projectInfo.installedAI.join(', ') || '无'}\n`));
        if (plugins.length === 0) {
            console.log(chalk.yellow('暂无插件'));
            console.log(chalk.gray('\n使用 "novel plugins:add <name>" 安装插件'));
            console.log(chalk.gray('可用插件: translate, authentic-voice, book-analysis, genre-knowledge\n'));
            return;
        }
        for (const plugin of plugins) {
            console.log(chalk.yellow(`  ${plugin.name}`) + ` (v${plugin.version})`);
            console.log(chalk.gray(`    ${plugin.description}`));
            if (plugin.commands && plugin.commands.length > 0) {
                console.log(chalk.gray(`    命令: ${plugin.commands.map(c => `/${c.id}`).join(', ')}`));
            }
            if (plugin.experts && plugin.experts.length > 0) {
                console.log(chalk.gray(`    专家: ${plugin.experts.map(e => e.title).join(', ')}`));
            }
            console.log('');
        }
    }
    catch (error) {
        if (error.message === 'NOT_IN_PROJECT') {
            console.log(chalk.red('\n❌ 当前目录不是 novel-writer 项目'));
            console.log(chalk.gray('   请在项目根目录运行此命令\n'));
            process.exit(1);
        }
        console.error(chalk.red('❌ 列出插件失败:'), error);
        process.exit(1);
    }
});
program
    .command('plugins:add <name>')
    .description('安装插件')
    .action(async (name) => {
    try {
        // 1. 检测项目
        const projectPath = await ensureProjectRoot();
        const projectInfo = await getProjectInfo(projectPath);
        if (!projectInfo) {
            console.log(chalk.red('❌ 无法读取项目信息'));
            process.exit(1);
        }
        console.log(chalk.cyan('\n📦 Novel Writer 插件安装\n'));
        console.log(chalk.gray(`项目版本: ${projectInfo.version}`));
        console.log(chalk.gray(`AI 配置: ${projectInfo.installedAI.join(', ') || '无'}\n`));
        // 2. 查找插件
        const packageRoot = path.resolve(__dirname, '..');
        const builtinPluginPath = path.join(packageRoot, 'plugins', name);
        if (!await fs.pathExists(builtinPluginPath)) {
            console.log(chalk.red(`❌ 插件 ${name} 未找到\n`));
            console.log(chalk.gray('可用插件:'));
            console.log(chalk.gray('  - translate (翻译出海插件)'));
            console.log(chalk.gray('  - authentic-voice (真实人声插件)'));
            console.log(chalk.gray('  - book-analysis (拆书分析插件)'));
            console.log(chalk.gray('  - genre-knowledge (类型知识库插件)'));
            process.exit(1);
        }
        // 3. 读取插件配置
        const pluginConfigPath = path.join(builtinPluginPath, 'config.yaml');
        const yaml = await import('js-yaml');
        const pluginConfigContent = await fs.readFile(pluginConfigPath, 'utf-8');
        const pluginConfig = yaml.load(pluginConfigContent);
        // 4. 显示插件信息
        console.log(chalk.cyan(`准备安装: ${pluginConfig.description || name}`));
        console.log(chalk.gray(`版本: ${pluginConfig.version}`));
        if (pluginConfig.commands && pluginConfig.commands.length > 0) {
            console.log(chalk.gray(`命令数量: ${pluginConfig.commands.length}`));
        }
        if (pluginConfig.experts && pluginConfig.experts.length > 0) {
            console.log(chalk.gray(`专家模式: ${pluginConfig.experts.length} 个`));
        }
        if (projectInfo.installedAI.length > 0) {
            console.log(chalk.gray(`目标 AI: ${projectInfo.installedAI.join(', ')}\n`));
        }
        else {
            console.log(chalk.yellow('\n⚠️  未检测到 AI 配置目录'));
            console.log(chalk.gray('   插件将被复制，但命令不会被注入到任何 AI 平台\n'));
        }
        // 5. 安装插件
        const spinner = ora('正在安装插件...').start();
        const pluginManager = new PluginManager(projectPath);
        await pluginManager.installPlugin(name, builtinPluginPath);

        // 6. 注入插件命令到 AI 平台
        if (projectInfo.installedAI.length > 0) {
            spinner.text = '正在注入插件命令...';
            const injectedCount = await pluginManager.injectPluginCommands(name, builtinPluginPath, projectInfo.installedAI);
            if (injectedCount > 0) {
                spinner.text = `已注入 ${injectedCount} 个命令到 AI 平台`;
            }
        }

        // 7. 复制 samples 目录（风格学习插件需要）
        const samplesSourceDir = path.join(packageRoot, 'samples');
        if (await fs.pathExists(samplesSourceDir)) {
            const userSamplesDir = path.join(projectPath, 'samples');
            if (!await fs.pathExists(userSamplesDir)) {
                await fs.copy(samplesSourceDir, userSamplesDir);
                spinner.text = '正在复制样本文件...';
            }
        }

        spinner.succeed(chalk.green('插件安装成功！\n'));
        // 6. 显示后续步骤
        if (pluginConfig.commands && pluginConfig.commands.length > 0) {
            console.log(chalk.cyan('可用命令:'));
            for (const cmd of pluginConfig.commands) {
                console.log(chalk.gray(`  /${cmd.id} - ${cmd.description || ''}`));
            }
        }
        if (pluginConfig.experts && pluginConfig.experts.length > 0) {
            console.log(chalk.cyan('\n专家模式:'));
            for (const expert of pluginConfig.experts) {
                console.log(chalk.gray(`  /expert ${expert.id} - ${expert.title || ''}`));
            }
        }
        console.log('');
    }
    catch (error) {
        if (error.message === 'NOT_IN_PROJECT') {
            console.log(chalk.red('\n❌ 当前目录不是 novel-writer 项目'));
            console.log(chalk.gray('   请在项目根目录运行此命令，或使用 novel init 创建新项目\n'));
            process.exit(1);
        }
        console.log(chalk.red('\n❌ 安装插件失败'));
        console.error(chalk.gray(error.message || error));
        console.log('');
        process.exit(1);
    }
});
program
    .command('plugins:remove <name>')
    .description('移除插件')
    .action(async (name) => {
    try {
        // 检测项目
        const projectPath = await ensureProjectRoot();
        const projectInfo = await getProjectInfo(projectPath);
        if (!projectInfo) {
            console.log(chalk.red('❌ 无法读取项目信息'));
            process.exit(1);
        }
        const pluginManager = new PluginManager(projectPath);
        console.log(chalk.cyan('\n📦 Novel Writer 插件移除\n'));
        console.log(chalk.gray(`准备移除插件: ${name}`));
        console.log(chalk.gray(`AI 配置: ${projectInfo.installedAI.join(', ') || '无'}\n`));
        const spinner = ora('正在移除插件...').start();
        await pluginManager.removePlugin(name);
        spinner.succeed(chalk.green('插件移除成功！\n'));
    }
    catch (error) {
        if (error.message === 'NOT_IN_PROJECT') {
            console.log(chalk.red('\n❌ 当前目录不是 novel-writer 项目'));
            console.log(chalk.gray('   请在项目根目录运行此命令\n'));
            process.exit(1);
        }
        console.log(chalk.red('\n❌ 移除插件失败'));
        console.error(chalk.gray(error.message || error));
        console.log('');
        process.exit(1);
    }
});
/**
 * 交互式选择要更新的内容
 */
async function selectUpdateContentInteractive() {
    const inquirer = (await import('inquirer')).default;
    const answers = await inquirer.prompt([
        {
            type: 'checkbox',
            name: 'content',
            message: '选择要更新的内容:',
            choices: [
                { name: '命令文件 (Commands)', value: 'commands', checked: true },
                { name: '脚本文件 (Scripts)', value: 'scripts', checked: true },
                { name: '写作规范和预设 (Spec/Presets)', value: 'spec', checked: true },
                { name: '专家模式文件 (Experts)', value: 'experts', checked: false },
                { name: '模板文件 (Templates)', value: 'templates', checked: false },
                { name: '记忆文件 (Memory)', value: 'memory', checked: false }
            ]
        }
    ]);
    return {
        commands: answers.content.includes('commands'),
        scripts: answers.content.includes('scripts'),
        templates: answers.content.includes('templates'),
        memory: answers.content.includes('memory'),
        spec: answers.content.includes('spec'),
        experts: answers.content.includes('experts')
    };
}
/**
 * 更新命令文件
 */
async function updateCommands(targetAI, projectPath, packageRoot, dryRun) {
    let count = 0;
    const sourceMap = {
        'claude': 'dist/claude',
        'gemini': 'dist/gemini',
        'cursor': 'dist/cursor',
        'windsurf': 'dist/windsurf',
        'roocode': 'dist/roocode',
        'copilot': 'dist/copilot',
        'qwen': 'dist/qwen',
        'opencode': 'dist/opencode',
        'codex': 'dist/codex',
        'kilocode': 'dist/kilocode',
        'auggie': 'dist/auggie',
        'codebuddy': 'dist/codebuddy',
        'q': 'dist/q'
    };
    for (const ai of targetAI) {
        const sourceDir = path.join(packageRoot, sourceMap[ai]);
        const aiConfig = AI_CONFIGS.find(c => c.name === ai);
        if (!aiConfig)
            continue;
        if (await fs.pathExists(sourceDir)) {
            const targetDir = path.join(projectPath, aiConfig.dir);
            // 复制命令文件目录
            const sourceCommandsDir = path.join(sourceDir, aiConfig.dir, aiConfig.commandsDir);
            const targetCommandsDir = path.join(targetDir, aiConfig.commandsDir);
            if (await fs.pathExists(sourceCommandsDir)) {
                if (!dryRun) {
                    await fs.copy(sourceCommandsDir, targetCommandsDir, { overwrite: true });
                }
                // 统计命令文件数
                const commandFiles = await fs.readdir(sourceCommandsDir);
                const cmdCount = commandFiles.filter(f => f.endsWith('.md') || f.endsWith('.toml')).length;
                count += cmdCount;
                console.log(chalk.gray(`  ✓ ${aiConfig.displayName}: ${cmdCount} 个文件`));
            }
            // 处理额外目录 (如 GitHub Copilot 的 .vscode)
            if (aiConfig.extraDirs) {
                for (const extraDir of aiConfig.extraDirs) {
                    const sourceExtraDir = path.join(sourceDir, extraDir);
                    const targetExtraDir = path.join(projectPath, extraDir);
                    if (await fs.pathExists(sourceExtraDir)) {
                        if (!dryRun) {
                            await fs.copy(sourceExtraDir, targetExtraDir, { overwrite: true });
                        }
                        console.log(chalk.gray(`  ✓ ${aiConfig.displayName}: 已更新 ${extraDir}`));
                    }
                }
            }
        }
        else {
            console.log(chalk.yellow(`  ⚠ ${aiConfig?.displayName || ai}: 构建产物未找到`));
        }
    }
    return count;
}
/**
 * 更新脚本文件
 */
async function updateScripts(projectPath, packageRoot, dryRun) {
    const scriptsSource = path.join(packageRoot, 'scripts');
    const scriptsDest = path.join(projectPath, '.specify', 'scripts');
    if (!await fs.pathExists(scriptsSource)) {
        console.log(chalk.yellow('  ⚠ 脚本源文件未找到'));
        return 0;
    }
    if (!dryRun) {
        await fs.copy(scriptsSource, scriptsDest, { overwrite: true });
        // 设置 bash 脚本执行权限
        const bashDir = path.join(scriptsDest, 'bash');
        if (await fs.pathExists(bashDir)) {
            const bashFiles = await fs.readdir(bashDir);
            for (const file of bashFiles) {
                if (file.endsWith('.sh')) {
                    const filePath = path.join(bashDir, file);
                    await fs.chmod(filePath, 0o755);
                }
            }
        }
    }
    // 统计脚本数量
    const bashScripts = await fs.readdir(path.join(scriptsSource, 'bash'));
    const psScripts = await fs.readdir(path.join(scriptsSource, 'powershell'));
    const totalScripts = bashScripts.length + psScripts.length;
    console.log(chalk.gray(`  ✓ 更新 ${bashScripts.length} 个 bash 脚本`));
    console.log(chalk.gray(`  ✓ 更新 ${psScripts.length} 个 powershell 脚本`));
    return totalScripts;
}
/**
 * 更新模板文件
 */
async function updateTemplates(projectPath, packageRoot, dryRun) {
    const templatesSource = path.join(packageRoot, 'templates');
    const templatesDest = path.join(projectPath, '.specify', 'templates');
    if (!await fs.pathExists(templatesSource)) {
        console.log(chalk.yellow('  ⚠ 模板源文件未找到'));
        return 0;
    }
    if (!dryRun) {
        await fs.copy(templatesSource, templatesDest, { overwrite: true });
    }
    // 统计模板文件
    const files = await fs.readdir(templatesSource);
    const templateCount = files.filter(f => f.endsWith('.md') || f.endsWith('.yaml')).length;
    console.log(chalk.gray(`  ✓ 更新 ${templateCount} 个模板文件`));
    return templateCount;
}
/**
 * 更新记忆文件
 */
async function updateMemory(projectPath, packageRoot, dryRun) {
    const memorySource = path.join(packageRoot, 'memory');
    const memoryDest = path.join(projectPath, '.specify', 'memory');
    if (!await fs.pathExists(memorySource)) {
        console.log(chalk.yellow('  ⚠ 记忆源文件未找到'));
        return 0;
    }
    if (!dryRun) {
        await fs.copy(memorySource, memoryDest, { overwrite: true });
    }
    // 统计记忆文件
    const files = await fs.readdir(memorySource);
    const memoryCount = files.filter(f => f.endsWith('.md')).length;
    console.log(chalk.gray(`  ✓ 更新 ${memoryCount} 个记忆文件`));
    return memoryCount;
}
/**
 * 更新 spec 目录（包括 presets、反AI检测规范等）
 */
async function updateSpec(projectPath, packageRoot, dryRun) {
    const specSource = path.join(packageRoot, 'spec');
    const specDest = path.join(projectPath, 'spec');
    if (!await fs.pathExists(specSource)) {
        console.log(chalk.yellow('  ⚠ Spec 源文件未找到'));
        return 0;
    }
    let count = 0;
    if (!dryRun) {
        // 遍历 spec 目录，只更新 presets、checklists、config.json 等
        // 不覆盖 tracking 和 knowledge（用户数据）
        const specItems = await fs.readdir(specSource);
        for (const item of specItems) {
            if (item !== 'tracking' && item !== 'knowledge') {
                const sourcePath = path.join(specSource, item);
                const targetPath = path.join(specDest, item);
                await fs.copy(sourcePath, targetPath, { overwrite: true });
                // 统计文件数
                if (await fs.stat(sourcePath).then(s => s.isDirectory())) {
                    const files = await fs.readdir(sourcePath);
                    count += files.filter(f => f.endsWith('.md') || f.endsWith('.json')).length;
                }
                else {
                    count += 1;
                }
            }
        }
    }
    else {
        // dry run - 只统计
        const specItems = await fs.readdir(specSource);
        for (const item of specItems) {
            if (item !== 'tracking' && item !== 'knowledge') {
                const sourcePath = path.join(specSource, item);
                if (await fs.stat(sourcePath).then(s => s.isDirectory())) {
                    const files = await fs.readdir(sourcePath);
                    count += files.filter(f => f.endsWith('.md') || f.endsWith('.json')).length;
                }
                else {
                    count += 1;
                }
            }
        }
    }
    console.log(chalk.gray(`  ✓ 更新 spec/ (presets 等 ${count} 个文件)`));
    return count;
}
/**
 * 更新专家模式文件
 */
async function updateExperts(projectPath, packageRoot, dryRun) {
    const expertsSource = path.join(packageRoot, 'experts');
    const expertsDest = path.join(projectPath, '.specify', 'experts');
    // 检查项目是否安装了专家模式
    if (!await fs.pathExists(expertsDest)) {
        console.log(chalk.gray('  ⓘ 项目未安装专家模式，跳过'));
        return 0;
    }
    if (!await fs.pathExists(expertsSource)) {
        console.log(chalk.yellow('  ⚠ 专家源文件未找到'));
        return 0;
    }
    if (!dryRun) {
        await fs.copy(expertsSource, expertsDest, { overwrite: true });
    }
    // 统计专家文件
    const countFiles = async (dir) => {
        let count = 0;
        const items = await fs.readdir(dir);
        for (const item of items) {
            const itemPath = path.join(dir, item);
            const stat = await fs.stat(itemPath);
            if (stat.isDirectory()) {
                count += await countFiles(itemPath);
            }
            else if (item.endsWith('.md')) {
                count += 1;
            }
        }
        return count;
    };
    const expertsCount = await countFiles(expertsSource);
    console.log(chalk.gray(`  ✓ 更新 ${expertsCount} 个专家文件`));
    return expertsCount;
}
/**
 * 创建选择性备份
 */
async function createBackup(projectPath, updateContent, targetAI, projectVersion) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const backupPath = path.join(projectPath, 'backup', timestamp);
    await fs.ensureDir(backupPath);
    console.log(chalk.cyan('📦 创建备份...'));
    // 备份命令文件
    if (updateContent.commands) {
        for (const ai of targetAI) {
            const aiConfig = AI_CONFIGS.find(c => c.name === ai);
            if (!aiConfig)
                continue;
            const source = path.join(projectPath, aiConfig.dir);
            const dest = path.join(backupPath, aiConfig.dir);
            if (await fs.pathExists(source)) {
                await fs.copy(source, dest);
                console.log(chalk.gray(`  ✓ 备份 ${aiConfig.dir}/`));
            }
        }
    }
    // 备份脚本
    if (updateContent.scripts) {
        const scriptsSource = path.join(projectPath, '.specify', 'scripts');
        if (await fs.pathExists(scriptsSource)) {
            await fs.copy(scriptsSource, path.join(backupPath, '.specify', 'scripts'));
            console.log(chalk.gray('  ✓ 备份 .specify/scripts/'));
        }
    }
    // 备份模板
    if (updateContent.templates) {
        const templatesSource = path.join(projectPath, '.specify', 'templates');
        if (await fs.pathExists(templatesSource)) {
            await fs.copy(templatesSource, path.join(backupPath, '.specify', 'templates'));
            console.log(chalk.gray('  ✓ 备份 .specify/templates/'));
        }
    }
    // 备份记忆
    if (updateContent.memory) {
        const memorySource = path.join(projectPath, '.specify', 'memory');
        if (await fs.pathExists(memorySource)) {
            await fs.copy(memorySource, path.join(backupPath, '.specify', 'memory'));
            console.log(chalk.gray('  ✓ 备份 .specify/memory/'));
        }
    }
    // 保存备份信息
    const backupInfo = {
        timestamp,
        fromVersion: projectVersion,
        toVersion: getVersion(),
        upgradedAI: targetAI,
        updateContent,
        backupPath
    };
    await fs.writeJson(path.join(backupPath, 'BACKUP_INFO.json'), backupInfo, { spaces: 2 });
    console.log(chalk.green(`✓ 备份完成: ${backupPath}\n`));
    return backupPath;
}
/**
 * 显示升级报告
 */
function displayUpgradeReport(stats, projectVersion, backupPath, updateContent) {
    console.log(chalk.cyan('\n📊 升级报告\n'));
    console.log(chalk.green('✅ 升级完成！\n'));
    console.log(chalk.yellow('升级统计:'));
    console.log(`  • 版本: ${projectVersion} → ${getVersion()}`);
    console.log(`  • AI 平台: ${stats.platforms.join(', ')}`);
    if (updateContent.commands && stats.commands > 0) {
        console.log(`  • 命令文件: ${stats.commands} 个`);
    }
    if (updateContent.scripts && stats.scripts > 0) {
        console.log(`  • 脚本文件: ${stats.scripts} 个`);
    }
    if (updateContent.spec && stats.spec > 0) {
        console.log(`  • 写作规范和预设: ${stats.spec} 个`);
    }
    if (updateContent.experts && stats.experts > 0) {
        console.log(`  • 专家模式文件: ${stats.experts} 个`);
    }
    if (updateContent.templates && stats.templates > 0) {
        console.log(`  • 模板文件: ${stats.templates} 个`);
    }
    if (updateContent.memory && stats.memory > 0) {
        console.log(`  • 记忆文件: ${stats.memory} 个`);
    }
    if (backupPath) {
        console.log(chalk.gray(`\n📦 备份位置: ${backupPath}`));
        console.log(chalk.gray('   如需回滚，删除当前文件并从备份恢复'));
    }
    console.log(chalk.cyan('\n✨ 本次升级包含:'));
    console.log('  • 反AI检测规范: 基于朱雀实测的0% AI浓度写作指南');
    console.log('  • 专家模式增强: 核心专家系统（角色、剧情、风格、世界观）');
    console.log('  • AI 温度控制: write 命令新增创作强化指令');
    console.log('  • 多平台支持: 所有 13 个 AI 平台的命令已更新');
    console.log(chalk.gray('\n📚 查看详细升级指南: docs/upgrade-guide.md'));
    console.log(chalk.gray('   或访问: https://github.com/wordflowlab/novel-writer/blob/main/docs/upgrade-guide.md'));
}
// upgrade 命令 - 升级现有项目
program
    .command('upgrade')
    .option('--ai <type>', '指定要升级的 AI 配置: claude | cursor | gemini | windsurf | roocode | copilot | qwen | opencode | codex | kilocode | auggie | codebuddy | q')
    .option('--all', '升级所有 AI 配置')
    .option('-i, --interactive', '交互式选择要更新的内容')
    .option('--commands', '仅更新命令文件')
    .option('--scripts', '仅更新脚本文件')
    .option('--spec', '仅更新写作规范和预设')
    .option('--experts', '仅更新专家模式文件')
    .option('--templates', '仅更新模板文件')
    .option('--memory', '仅更新记忆文件')
    .option('-y, --yes', '跳过确认提示')
    .option('--no-backup', '跳过备份')
    .option('--dry-run', '预览升级内容，不实际修改')
    .description('升级现有项目到最新版本')
    .action(async (options) => {
    const projectPath = process.cwd();
    const packageRoot = path.resolve(__dirname, '..');
    try {
        // 1. 检测项目
        const configPath = path.join(projectPath, '.specify', 'config.json');
        if (!await fs.pathExists(configPath)) {
            console.log(chalk.red('❌ 当前目录不是 novel-writer 项目'));
            console.log(chalk.gray('   请在项目根目录运行此命令，或使用 novel init 创建新项目'));
            process.exit(1);
        }
        // 读取项目配置
        const config = await fs.readJson(configPath);
        const projectVersion = config.version || '未知';
        console.log(chalk.cyan('\n📦 Novel Writer 项目升级\n'));
        console.log(chalk.gray(`当前版本: ${projectVersion}`));
        console.log(chalk.gray(`目标版本: ${getVersion()}\n`));
        // 2. 检测已安装的 AI 配置
        const installedAI = [];
        for (const aiConfig of AI_CONFIGS) {
            if (await fs.pathExists(path.join(projectPath, aiConfig.dir))) {
                installedAI.push(aiConfig.name);
            }
        }
        if (installedAI.length === 0) {
            console.log(chalk.yellow('⚠️  未检测到任何 AI 配置目录'));
            process.exit(1);
        }
        const displayNames = installedAI.map(name => {
            const config = AI_CONFIGS.find(c => c.name === name);
            return config?.displayName || name;
        });
        console.log(chalk.green('✓') + ' 检测到 AI 配置: ' + displayNames.join(', '));
        // 3. 确定要升级的 AI 配置
        let targetAI = installedAI;
        if (options.ai) {
            if (!installedAI.includes(options.ai)) {
                console.log(chalk.red(`❌ AI 配置 "${options.ai}" 未安装`));
                process.exit(1);
            }
            targetAI = [options.ai];
        }
        else if (!options.all) {
            // 默认升级所有已安装的 AI 配置
            targetAI = installedAI;
        }
        const targetDisplayNames = targetAI.map(name => {
            const config = AI_CONFIGS.find(c => c.name === name);
            return config?.displayName || name;
        });
        console.log(chalk.cyan(`\n升级目标: ${targetDisplayNames.join(', ')}\n`));
        // 4. 确定要更新的内容
        let updateContent;
        if (options.interactive) {
            // 交互式选择
            updateContent = await selectUpdateContentInteractive();
        }
        else {
            // 根据选项确定更新内容
            const hasSpecificOption = options.commands || options.scripts || options.spec || options.experts || options.templates || options.memory;
            updateContent = {
                commands: hasSpecificOption ? !!options.commands : true,
                scripts: hasSpecificOption ? !!options.scripts : true,
                spec: hasSpecificOption ? !!options.spec : true,
                experts: hasSpecificOption ? !!options.experts : false,
                templates: hasSpecificOption ? !!options.templates : false,
                memory: hasSpecificOption ? !!options.memory : false
            };
        }
        // 显示将要更新的内容
        const updateList = [];
        if (updateContent.commands)
            updateList.push('命令文件');
        if (updateContent.scripts)
            updateList.push('脚本文件');
        if (updateContent.spec)
            updateList.push('写作规范和预设');
        if (updateContent.experts)
            updateList.push('专家模式');
        if (updateContent.templates)
            updateList.push('模板文件');
        if (updateContent.memory)
            updateList.push('记忆文件');
        console.log(chalk.cyan(`更新内容: ${updateList.join(', ')}\n`));
        if (options.dryRun) {
            console.log(chalk.yellow('🔍 预览模式（不会实际修改文件）\n'));
        }
        // 5. 确认执行
        if (!options.yes && !options.dryRun && !options.interactive) {
            const inquirer = (await import('inquirer')).default;
            const answers = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'proceed',
                    message: '确认执行升级?',
                    default: true
                }
            ]);
            if (!answers.proceed) {
                console.log(chalk.yellow('\n升级已取消'));
                process.exit(0);
            }
        }
        // 6. 创建备份
        let backupPath = '';
        if (options.backup !== false && !options.dryRun) {
            backupPath = await createBackup(projectPath, updateContent, targetAI, projectVersion);
        }
        // 7. 执行更新
        const stats = {
            commands: 0,
            scripts: 0,
            templates: 0,
            memory: 0,
            spec: 0,
            experts: 0,
            platforms: targetDisplayNames
        };
        const dryRun = !!options.dryRun;
        if (updateContent.commands) {
            console.log(chalk.cyan('📝 更新命令文件...'));
            stats.commands = await updateCommands(targetAI, projectPath, packageRoot, dryRun);
        }
        if (updateContent.scripts) {
            console.log(chalk.cyan('\n🔧 更新脚本文件...'));
            stats.scripts = await updateScripts(projectPath, packageRoot, dryRun);
        }
        if (updateContent.spec) {
            console.log(chalk.cyan('\n📋 更新写作规范和预设...'));
            stats.spec = await updateSpec(projectPath, packageRoot, dryRun);
        }
        if (updateContent.experts) {
            console.log(chalk.cyan('\n🎓 更新专家模式文件...'));
            stats.experts = await updateExperts(projectPath, packageRoot, dryRun);
        }
        if (updateContent.templates) {
            console.log(chalk.cyan('\n📄 更新模板文件...'));
            stats.templates = await updateTemplates(projectPath, packageRoot, dryRun);
        }
        if (updateContent.memory) {
            console.log(chalk.cyan('\n🧠 更新记忆文件...'));
            stats.memory = await updateMemory(projectPath, packageRoot, dryRun);
        }
        // 8. 显示升级报告
        displayUpgradeReport(stats, projectVersion, backupPath, updateContent);
        // 9. 更新项目版本号
        if (!options.dryRun) {
            config.version = getVersion();
            await fs.writeJson(configPath, config, { spaces: 2 });
        }
    }
    catch (error) {
        console.error(chalk.red('\n❌ 升级失败:'), error);
        process.exit(1);
    }
});
// info 命令 - 查看方法信息（保留简单版本）
program
    .command('info')
    .description('查看可用的写作方法')
    .action(() => {
    console.log(chalk.cyan('\n📚 可用的写作方法:\n'));
    console.log(chalk.yellow('  三幕结构') + ' - 经典的故事结构，适合大多数类型');
    console.log(chalk.yellow('  英雄之旅') + ' - 12阶段的成长之旅，适合奇幻冒险');
    console.log(chalk.yellow('  故事圈') + ' - 8环节的循环结构，适合角色驱动');
    console.log(chalk.yellow('  七点结构') + ' - 紧凑的情节结构，适合悬疑惊悚');
    console.log(chalk.yellow('  皮克斯公式') + ' - 简单有力的故事模板，适合短篇');
    console.log(chalk.yellow('  雪花十步') + ' - 系统化的递进式规划，适合细致构建');
    console.log('\n' + chalk.gray('提示：在 AI 助手中使用 /method 命令进行智能选择'));
    console.log(chalk.gray('AI 会通过对话了解你的需求，推荐最适合的方法'));
    console.log(chalk.gray('追踪系统会在写作过程中自动更新，保持数据同步'));
});
// preprocess 命令 - 文本预处理
program
    .command('preprocess <file>')
    .description('预处理文本（清理目录、页码、标准化标点）')
    .option('-o, --output <file>', '输出处理后的文本到文件')
    .option('--quality', '同时评估文本质量')
    .action(async (file, options) => {
    try {
        const filePath = path.resolve(file);
        if (!await fs.pathExists(filePath)) {
            console.log(chalk.red(`❌ 文件不存在: ${file}`));
            process.exit(1);
        }
        
        // 智能输出路径：如果未指定 -o，自动生成到 clean/ 目录
        let outputPath = options.output;
        if (!outputPath) {
            // 从 samples/author/book.txt 转换为 clean/author/book.txt
            const relativePath = path.relative(process.cwd(), filePath);
            // 规范化路径分隔符为正斜杠
            const normalizedPath = relativePath.replace(/\\/g, '/');
            
            if (normalizedPath.startsWith('samples/')) {
                outputPath = normalizedPath.replace(/^samples\//, 'clean/');
                // 转换回系统路径分隔符
                outputPath = outputPath.replace(/\//g, path.sep);
            } else {
                // 如果不在 samples 目录，使用原文件名 + .clean.txt
                const parsed = path.parse(filePath);
                outputPath = path.join(parsed.dir, `${parsed.name}.clean${parsed.ext}`);
            }
        }
        
        // 确保输出目录存在
        await fs.ensureDir(path.dirname(outputPath));
        
        const spinner = ora('正在预处理文本...').start();
        const text = await fs.readFile(filePath, 'utf-8');
        const TextPreprocessor = (await import('./utils/text-preprocessor.js')).default;
        const preprocessor = new TextPreprocessor();
        const result = preprocessor.preprocess(text);
        spinner.succeed(chalk.green('预处理完成'));
        console.log(chalk.cyan('\n📝 预处理结果\n'));
        console.log(`  原始长度: ${result.originalLength} 字符`);
        console.log(`  处理后长度: ${result.processedLength} 字符`);
        console.log(`  减少比例: ${result.reductionRate}`);
        console.log(chalk.yellow('\n处理步骤:'));
        result.steps.forEach(step => {
            console.log(`  ✓ ${step}`);
        });
        if (options.quality) {
            const quality = preprocessor.assessQuality(result.text);
            console.log(chalk.yellow('\n质量评估:'));
            console.log(`  得分: ${quality.score}/100 (${quality.level})`);
            if (quality.suggestions.length > 0) {
                console.log(chalk.gray('  建议:'));
                quality.suggestions.forEach(s => console.log(`    - ${s}`));
            }
        }
        
        // 保存处理后的文本
        await fs.writeFile(outputPath, result.text, 'utf-8');
        console.log(chalk.gray(`\n✓ 处理后文本已保存到: ${chalk.cyan(outputPath)}`));
        console.log(chalk.gray(`  下一步: ${chalk.yellow(`novel analyze ${outputPath}`)}`));
    }
    catch (error) {
        console.error(chalk.red('❌ 预处理失败:'), error.message);
        process.exit(1);
    }
});

// analyze 命令 - NLP 文本分析
program
    .command('analyze <file>')
    .description('分析文本的 NLP 特征（词汇、句法、情感）')
    .option('-o, --output <file>', '输出结果到 JSON 文件')
    .option('--verbose', '显示详细分析结果')
    .action(async (file, options) => {
    try {
        const filePath = path.resolve(file);
        if (!await fs.pathExists(filePath)) {
            console.log(chalk.red(`❌ 文件不存在: ${file}`));
            process.exit(1);
        }
        
        // 智能输出路径：如果未指定 -o，自动生成到 nlp/ 目录
        let outputPath = options.output;
        if (!outputPath) {
            // 从 clean/author/book.txt 转换为 nlp/author/book.json
            const relativePath = path.relative(process.cwd(), filePath);
            // 规范化路径分隔符为正斜杠
            const normalizedPath = relativePath.replace(/\\/g, '/');
            
            if (normalizedPath.startsWith('clean/')) {
                const parsed = path.parse(normalizedPath.replace(/^clean\//, 'nlp/'));
                outputPath = path.join(parsed.dir, `${parsed.name}.json`);
            } else if (normalizedPath.startsWith('samples/')) {
                // 如果直接分析 samples，也输出到 nlp
                const parsed = path.parse(normalizedPath.replace(/^samples\//, 'nlp/'));
                outputPath = path.join(parsed.dir, `${parsed.name}.json`);
            } else {
                // 其他情况，使用原文件名 + .analysis.json
                const parsed = path.parse(filePath);
                outputPath = path.join(parsed.dir, `${parsed.name}.analysis.json`);
            }
        }
        
        // 确保输出目录存在
        await fs.ensureDir(path.dirname(outputPath));
        
        const spinner = ora('正在分析文本...').start();
        const text = await fs.readFile(filePath, 'utf-8');
        const NLPAnalyzer = (await import('./utils/nlp-analyzer.js')).default;
        const analyzer = new NLPAnalyzer();
        const startTime = Date.now();
        const result = analyzer.analyze(text);
        const elapsed = Date.now() - startTime;
        spinner.succeed(chalk.green(`分析完成 (${elapsed}ms)`));
        console.log(chalk.cyan('\n📊 NLP 分析结果\n'));
        console.log(chalk.yellow('词汇分析:'));
        console.log(`  总词数: ${result.vocabulary.totalTokens}`);
        console.log(`  唯一词数: ${result.vocabulary.uniqueTokens}`);
        console.log(`  词汇丰富度 (TTR): ${(result.vocabulary.vocabularyRichness * 100).toFixed(1)}%`);
        console.log(chalk.yellow('\n句法分析:'));
        console.log(`  总句数: ${result.syntax.sentenceCount}`);
        console.log(`  平均句长: ${result.syntax.avgSentenceLength.toFixed(1)} 字`);
        console.log(chalk.yellow('\n情感分析:'));
        console.log(`  情感倾向: ${result.sentiment.emotionalTone}`);
        console.log(`  情感得分: ${result.sentiment.sentimentScore.toFixed(2)}`);
        if (options.verbose) {
            console.log(chalk.yellow('\n高频词汇 (Top 10):'));
            const topWords = result.vocabulary.topWords.slice(0, 10);
            topWords.forEach((word, i) => {
                console.log(`  ${i + 1}. ${word}`);
            });
        }
        
        // 保存分析结果
        await fs.writeJson(outputPath, result, { spaces: 2 });
        console.log(chalk.gray(`\n✓ 分析结果已保存到: ${chalk.cyan(outputPath)}`));
        console.log(chalk.gray(`  下一步: 在 AI 助手中使用 ${chalk.yellow(`/novel.style-learn clean/...`)} 学习风格`));
    }
    catch (error) {
        console.error(chalk.red('❌ 分析失败:'), error.message);
        process.exit(1);
    }
});

// check-style 命令 - 风格一致性检测
program
    .command('check-style <file> <style-file>')
    .description('检测文本与目标风格的一致性')
    .option('-o, --output <file>', '输出结果到 JSON 文件')
    .action(async (file, styleFile, options) => {
    try {
        const filePath = path.resolve(file);
        const styleFilePath = path.resolve(styleFile);
        if (!await fs.pathExists(filePath)) {
            console.log(chalk.red(`❌ 文件不存在: ${file}`));
            process.exit(1);
        }
        if (!await fs.pathExists(styleFilePath)) {
            console.log(chalk.red(`❌ 风格文件不存在: ${styleFile}`));
            process.exit(1);
        }
        const spinner = ora('正在检测风格一致性...').start();
        const text = await fs.readFile(filePath, 'utf-8');
        const targetStyle = await fs.readJson(styleFilePath);
        const ConsistencyChecker = (await import('./utils/consistency-checker.js')).default;
        const checker = new ConsistencyChecker();
        const result = checker.checkConsistency(text, targetStyle);
        spinner.succeed(chalk.green('检测完成'));
        console.log(chalk.cyan('\n🎯 风格一致性检测结果\n'));
        const scoreColor = result.overall >= 80 ? chalk.green :
                          result.overall >= 60 ? chalk.yellow : chalk.red;
        console.log(`  总体得分: ${scoreColor(result.overall.toFixed(1) + '%')} (${result.overallLevel})`);
        console.log(chalk.yellow('\n各维度得分:'));
        const dims = result.dimensions;
        console.log(`  词汇匹配: ${(dims.vocabulary.score * 100).toFixed(1)}%`);
        console.log(`  句法匹配: ${(dims.syntax.score * 100).toFixed(1)}%`);
        console.log(`  情感匹配: ${(dims.sentiment.score * 100).toFixed(1)}%`);
        console.log(`  节奏匹配: ${(dims.rhythm.score * 100).toFixed(1)}%`);
        if (result.summary.suggestions.length > 0) {
            console.log(chalk.yellow('\n改进建议:'));
            result.summary.suggestions.forEach(s => console.log(`  - ${s}`));
        }
        if (options.output) {
            await fs.writeJson(options.output, result, { spaces: 2 });
            console.log(chalk.gray(`\n结果已保存到: ${options.output}`));
        }
    }
    catch (error) {
        console.error(chalk.red('❌ 检测失败:'), error.message);
        process.exit(1);
    }
});

// ====================================================================
// 风格化改写流水线（v0.23.0 新增）
// 用于「已有整本初稿 → 按目标风格批量重写」场景
// ====================================================================

// ---------- 长记忆系统（v0.24.0 新增） ----------
// 解决批量改写中 AI "失忆"问题：术语漂移、称谓不一、引用断裂

const DEFAULT_MEMORY_PATH = 'memory/rewrite-memory.json';

function createEmptyMemory() {
    return {
        version: '1.0',
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        lastChapterIndex: 0,

        // 术语表：所有专有名词、概念的统一译法
        terminology: {
            // "Transformer": { translation: "...", alternativesRejected: [...], firstAppearance: {...}, usageCount: 0 }
        },

        // 全局风格决策（一旦确定，全书遵守）
        stylisticDecisions: {
            narratorPerson: null,        // 第一/第二/第三人称
            toneRegister: null,          // 通俗/学术/对话感等
            exampleStyle: null,          // 案例处理方式
            codeBlockHandling: '保留原样，不改注释',
            quoteHandling: '保留原文引用，不改字'
        },

        // 章节级关键信息（供后续章节交叉引用使用）
        chapterIndex: {
            // "1": { title, keyClaims: [...], definedTerms: [...], summary }
        },

        // 跨章节引用追踪
        crossReferences: {
            forward: [],   // 前向引用（如"如前所述"）
            backward: []   // 后向引用（如"我们将在第N章..."）
        },

        // 角色/人物追踪（小说传记适用，技术书可忽略）
        characterArcs: {},

        // 改写历史日志
        rewriteLog: []
    };
}

// memory 命令族
const memoryCmd = program
    .command('memory')
    .description('管理改写长记忆库（术语表、风格决策、章节摘要）');

memoryCmd
    .command('init')
    .description('初始化空的记忆库')
    .option('-f, --file <path>', '记忆库路径', DEFAULT_MEMORY_PATH)
    .option('--force', '覆盖已存在的记忆库')
    .action(async (options) => {
        try {
            const memPath = path.resolve(options.file);
            if (await fs.pathExists(memPath) && !options.force) {
                console.log(chalk.yellow(`⚠️  记忆库已存在: ${memPath}`));
                console.log(chalk.gray('   使用 --force 覆盖，或 novel memory show 查看现有内容'));
                process.exit(1);
            }
            await fs.ensureDir(path.dirname(memPath));
            await fs.writeJson(memPath, createEmptyMemory(), { spaces: 2 });
            console.log(chalk.green(`✓ 记忆库已初始化: ${memPath}`));
        } catch (error) {
            console.error(chalk.red('❌ 初始化失败:'), error.message);
            process.exit(1);
        }
    });

memoryCmd
    .command('show')
    .description('查看当前记忆库内容')
    .option('-f, --file <path>', '记忆库路径', DEFAULT_MEMORY_PATH)
    .option('--section <name>', '只显示某个分区: terminology|style|chapters|references|characters')
    .action(async (options) => {
        try {
            const memPath = path.resolve(options.file);
            if (!await fs.pathExists(memPath)) {
                console.log(chalk.red(`❌ 记忆库不存在: ${memPath}`));
                console.log(chalk.gray('   先运行: novel memory init'));
                process.exit(1);
            }
            const mem = await fs.readJson(memPath);

            console.log(chalk.cyan('\n📚 改写长记忆库\n'));
            console.log(chalk.gray(`路径: ${memPath}`));
            console.log(chalk.gray(`最后更新: ${mem.lastUpdated}`));
            console.log(chalk.gray(`已改写章节: ${mem.lastChapterIndex}`));

            const showSection = options.section;

            if (!showSection || showSection === 'terminology') {
                const terms = Object.keys(mem.terminology || {});
                console.log(chalk.yellow(`\n📖 术语表 (${terms.length} 个):`));
                if (terms.length === 0) {
                    console.log(chalk.gray('  (空)'));
                } else {
                    terms.slice(0, 30).forEach(term => {
                        const t = mem.terminology[term];
                        console.log(`  ${chalk.cyan(term)} → ${t.translation}  ${chalk.gray(`(出现 ${t.usageCount || 0} 次, 首现 Ch${t.firstAppearance?.chapter || '?'})`)}`);
                    });
                    if (terms.length > 30) console.log(chalk.gray(`  ... 还有 ${terms.length - 30} 个`));
                }
            }

            if (!showSection || showSection === 'style') {
                console.log(chalk.yellow('\n🎨 全局风格决策:'));
                Object.entries(mem.stylisticDecisions || {}).forEach(([k, v]) => {
                    console.log(`  ${k}: ${v ? chalk.cyan(v) : chalk.gray('(未设定)')}`);
                });
            }

            if (!showSection || showSection === 'chapters') {
                const chapters = Object.keys(mem.chapterIndex || {});
                console.log(chalk.yellow(`\n📑 章节摘要 (${chapters.length} 章):`));
                if (chapters.length === 0) {
                    console.log(chalk.gray('  (空)'));
                } else {
                    chapters.forEach(idx => {
                        const c = mem.chapterIndex[idx];
                        console.log(`  Ch${idx}. ${chalk.cyan(c.title)}`);
                        if (c.summary) console.log(chalk.gray(`     ${c.summary.substring(0, 80)}${c.summary.length > 80 ? '...' : ''}`));
                        if (c.definedTerms?.length) console.log(chalk.gray(`     定义术语: ${c.definedTerms.join(', ')}`));
                    });
                }
            }

            if (!showSection || showSection === 'references') {
                const fwd = mem.crossReferences?.forward?.length || 0;
                const bwd = mem.crossReferences?.backward?.length || 0;
                console.log(chalk.yellow(`\n🔗 交叉引用: 前向 ${fwd} 条 / 后向 ${bwd} 条`));
            }

            if (!showSection || showSection === 'characters') {
                const chars = Object.keys(mem.characterArcs || {});
                if (chars.length > 0) {
                    console.log(chalk.yellow(`\n👤 人物档案 (${chars.length} 位):`));
                    chars.forEach(name => {
                        const c = mem.characterArcs[name];
                        console.log(`  ${chalk.cyan(name)}: ${c.establishedTraits?.join(', ') || '无'}`);
                    });
                }
            }

            console.log('');
        } catch (error) {
            console.error(chalk.red('❌ 读取失败:'), error.message);
            process.exit(1);
        }
    });

memoryCmd
    .command('update')
    .description('合并新记忆条目到记忆库（供 AI 调用）')
    .option('-f, --file <path>', '记忆库路径', DEFAULT_MEMORY_PATH)
    .option('--patch <json>', '记忆补丁（JSON 字符串）')
    .option('--patch-file <path>', '记忆补丁文件')
    .option('--chapter <num>', '本次更新关联的章节序号')
    .action(async (options) => {
        try {
            const memPath = path.resolve(options.file);
            if (!await fs.pathExists(memPath)) {
                await fs.ensureDir(path.dirname(memPath));
                await fs.writeJson(memPath, createEmptyMemory(), { spaces: 2 });
            }
            const mem = await fs.readJson(memPath);

            // 读取补丁
            let patch;
            if (options.patchFile) {
                patch = await fs.readJson(path.resolve(options.patchFile));
            } else if (options.patch) {
                patch = JSON.parse(options.patch);
            } else {
                console.log(chalk.red('❌ 必须提供 --patch <json> 或 --patch-file <path>'));
                process.exit(1);
            }

            // 深度合并术语表
            if (patch.terminology) {
                for (const [term, info] of Object.entries(patch.terminology)) {
                    if (mem.terminology[term]) {
                        // 已存在：累加 usageCount，合并 alternativesRejected
                        mem.terminology[term].usageCount = (mem.terminology[term].usageCount || 0) + (info.usageCount || 1);
                        if (info.alternativesRejected) {
                            mem.terminology[term].alternativesRejected = Array.from(new Set([
                                ...(mem.terminology[term].alternativesRejected || []),
                                ...info.alternativesRejected
                            ]));
                        }
                    } else {
                        // 新增
                        mem.terminology[term] = {
                            translation: info.translation,
                            alternativesRejected: info.alternativesRejected || [],
                            firstAppearance: info.firstAppearance || { chapter: options.chapter || mem.lastChapterIndex + 1 },
                            usageCount: info.usageCount || 1
                        };
                    }
                }
            }

            // 风格决策（首次设定后不轻易覆盖）
            if (patch.stylisticDecisions) {
                for (const [key, value] of Object.entries(patch.stylisticDecisions)) {
                    if (!mem.stylisticDecisions[key] || mem.stylisticDecisions[key] === null) {
                        mem.stylisticDecisions[key] = value;
                    }
                }
            }

            // 章节摘要
            if (patch.chapterIndex) {
                Object.assign(mem.chapterIndex, patch.chapterIndex);
            }

            // 交叉引用追加
            if (patch.crossReferences) {
                if (patch.crossReferences.forward) {
                    mem.crossReferences.forward.push(...patch.crossReferences.forward);
                }
                if (patch.crossReferences.backward) {
                    mem.crossReferences.backward.push(...patch.crossReferences.backward);
                }
            }

            // 人物档案
            if (patch.characterArcs) {
                for (const [name, arc] of Object.entries(patch.characterArcs)) {
                    if (mem.characterArcs[name]) {
                        // 合并特征/关系/状态
                        mem.characterArcs[name].establishedTraits = Array.from(new Set([
                            ...(mem.characterArcs[name].establishedTraits || []),
                            ...(arc.establishedTraits || [])
                        ]));
                        Object.assign(mem.characterArcs[name].relationships || {}, arc.relationships || {});
                        if (arc.knowledgeState) {
                            mem.characterArcs[name].knowledgeState = arc.knowledgeState;
                        }
                    } else {
                        mem.characterArcs[name] = arc;
                    }
                }
            }

            // 更新元信息
            mem.lastUpdated = new Date().toISOString();
            if (options.chapter) {
                const chNum = parseInt(options.chapter, 10);
                mem.lastChapterIndex = Math.max(mem.lastChapterIndex, chNum);
            }
            mem.rewriteLog.push({
                timestamp: new Date().toISOString(),
                chapter: options.chapter ? parseInt(options.chapter, 10) : null,
                changes: {
                    newTerms: Object.keys(patch.terminology || {}).length,
                    newChapters: Object.keys(patch.chapterIndex || {}).length,
                    newReferences: (patch.crossReferences?.forward?.length || 0) + (patch.crossReferences?.backward?.length || 0)
                }
            });

            await fs.writeJson(memPath, mem, { spaces: 2 });
            console.log(chalk.green(`✓ 记忆库已更新`));
            console.log(chalk.gray(`  新增术语: ${Object.keys(patch.terminology || {}).length}`));
            console.log(chalk.gray(`  新增章节: ${Object.keys(patch.chapterIndex || {}).length}`));
            console.log(chalk.gray(`  当前进度: ${mem.lastChapterIndex} 章`));
        } catch (error) {
            console.error(chalk.red('❌ 更新失败:'), error.message);
            process.exit(1);
        }
    });

memoryCmd
    .command('validate <chapter-file>')
    .description('校验某章节是否符合记忆库（术语一致性等）')
    .option('-f, --file <path>', '记忆库路径', DEFAULT_MEMORY_PATH)
    .action(async (chapterFile, options) => {
        try {
            const memPath = path.resolve(options.file);
            const filePath = path.resolve(chapterFile);
            if (!await fs.pathExists(memPath)) {
                console.log(chalk.red(`❌ 记忆库不存在: ${memPath}`));
                process.exit(1);
            }
            if (!await fs.pathExists(filePath)) {
                console.log(chalk.red(`❌ 章节文件不存在: ${chapterFile}`));
                process.exit(1);
            }
            const mem = await fs.readJson(memPath);
            const text = await fs.readFile(filePath, 'utf-8');

            const issues = [];

            // 检查 1：被拒绝的译法是否出现
            for (const [term, info] of Object.entries(mem.terminology)) {
                if (!info.alternativesRejected) continue;
                for (const rejected of info.alternativesRejected) {
                    if (text.includes(rejected)) {
                        // 但要排除：如果文中也出现了正确的译法，可能只是引用比较
                        const correctCount = (text.match(new RegExp(info.translation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
                        const wrongCount = (text.match(new RegExp(rejected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
                        if (wrongCount > 0) {
                            issues.push({
                                type: 'terminology_drift',
                                severity: 'high',
                                term,
                                expected: info.translation,
                                found: rejected,
                                count: wrongCount,
                                hint: `应使用 "${info.translation}"（已在第 ${info.firstAppearance?.chapter || '?'} 章确立）`
                            });
                        }
                    }
                }
            }

            // 检查 2：交叉引用的目标章节是否真的存在该论点
            // （此处简化实现，AI 调用时会做更细的检查）

            console.log(chalk.cyan(`\n🔍 章节一致性校验: ${path.basename(filePath)}\n`));
            if (issues.length === 0) {
                console.log(chalk.green('✓ 通过：未发现术语漂移或引用断裂'));
            } else {
                console.log(chalk.red(`✗ 发现 ${issues.length} 个问题:\n`));
                issues.forEach((issue, i) => {
                    console.log(chalk.yellow(`  [${i + 1}] ${issue.type.toUpperCase()}`));
                    console.log(`      术语: ${issue.term}`);
                    console.log(`      错误: ${chalk.red(issue.found)} (出现 ${issue.count} 次)`);
                    console.log(`      正确: ${chalk.green(issue.expected)}`);
                    console.log(chalk.gray(`      提示: ${issue.hint}\n`));
                });
                console.log(chalk.red.bold('  RESULT: FAIL'));
                process.exit(2);
            }
        } catch (error) {
            console.error(chalk.red('❌ 校验失败:'), error.message);
            process.exit(1);
        }
    });

memoryCmd
    .command('check-all')
    .description('对全书所有改写后章节做一致性扫描')
    .option('-f, --file <path>', '记忆库路径', DEFAULT_MEMORY_PATH)
    .option('-d, --dir <path>', '改写后章节目录', 'output/chapters')
    .action(async (options) => {
        try {
            const memPath = path.resolve(options.file);
            const dir = path.resolve(options.dir);
            if (!await fs.pathExists(memPath)) {
                console.log(chalk.red(`❌ 记忆库不存在`));
                process.exit(1);
            }
            const indexPath = path.join(dir, '_index.json');
            const draftIndexPath = path.join('draft', 'chapters', '_index.json');
            const idxPath = await fs.pathExists(indexPath) ? indexPath :
                            await fs.pathExists(draftIndexPath) ? draftIndexPath : null;
            if (!idxPath) {
                console.log(chalk.red(`❌ 找不到章节索引`));
                process.exit(1);
            }
            const index = await fs.readJson(idxPath);
            const mem = await fs.readJson(memPath);

            console.log(chalk.cyan(`\n🔍 全书一致性扫描\n`));
            console.log(chalk.gray(`目录: ${dir}`));
            console.log(chalk.gray(`待扫描: ${index.chapters.length} 章\n`));

            const allIssues = [];
            for (const ch of index.chapters) {
                const fpath = path.join(dir, ch.file);
                if (!await fs.pathExists(fpath)) continue;
                const text = await fs.readFile(fpath, 'utf-8');

                for (const [term, info] of Object.entries(mem.terminology)) {
                    if (!info.alternativesRejected) continue;
                    for (const rejected of info.alternativesRejected) {
                        const wrongCount = (text.match(new RegExp(rejected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
                        if (wrongCount > 0) {
                            allIssues.push({
                                chapter: ch.index,
                                file: ch.file,
                                term,
                                expected: info.translation,
                                found: rejected,
                                count: wrongCount
                            });
                        }
                    }
                }
            }

            if (allIssues.length === 0) {
                console.log(chalk.green('✅ 全书术语一致性通过\n'));
            } else {
                console.log(chalk.red(`✗ 发现 ${allIssues.length} 处不一致:\n`));
                // 按章节分组
                const byChapter = {};
                allIssues.forEach(i => {
                    byChapter[i.chapter] = byChapter[i.chapter] || [];
                    byChapter[i.chapter].push(i);
                });
                for (const [ch, issues] of Object.entries(byChapter)) {
                    console.log(chalk.yellow(`  Ch${ch}. ${issues[0].file}`));
                    issues.forEach(i => {
                        console.log(`    ${chalk.red(i.found)} (${i.count}次) → 应为 ${chalk.green(i.expected)}`);
                    });
                }
                console.log('');
            }
        } catch (error) {
            console.error(chalk.red('❌ 扫描失败:'), error.message);
            process.exit(1);
        }
    });

// split 命令 - 把整本初稿按章节切分为独立文件
program
    .command('split <file>')
    .description('将整本初稿按章节切分为独立文件')
    .option('-o, --output-dir <dir>', '输出目录', 'draft/chapters')
    .option('--pattern <regex>', '章节标题正则（默认匹配 第X章/节/回 与 # Chapter）',
        '^(第[一二三四五六七八九十百千万零\\d]+[章节回卷篇][\\s\\S]*?$|#{1,3}\\s+(Chapter|第).*$)')
    .action(async (file, options) => {
        try {
            const filePath = path.resolve(file);
            if (!await fs.pathExists(filePath)) {
                console.log(chalk.red(`❌ 文件不存在: ${file}`));
                process.exit(1);
            }
            const text = await fs.readFile(filePath, 'utf-8');
            const lines = text.split(/\r?\n/);
            const chapterRegex = new RegExp(options.pattern);

            const chapters = [];
            let current = { title: '前言', lines: [], startLine: 0 };

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (chapterRegex.test(line.trim())) {
                    if (current.lines.length > 0 && current.lines.some(l => l.trim())) {
                        chapters.push(current);
                    }
                    current = { title: line.trim(), lines: [line], startLine: i };
                } else {
                    current.lines.push(line);
                }
            }
            if (current.lines.length > 0 && current.lines.some(l => l.trim())) {
                chapters.push(current);
            }

            if (chapters.length === 0) {
                console.log(chalk.yellow('⚠️  未识别到任何章节，请检查 --pattern 参数'));
                console.log(chalk.gray('   示例: --pattern "^第[一二三四五六七八九十\\d]+章"'));
                process.exit(1);
            }

            await fs.ensureDir(options.outputDir);

            const index = [];
            for (let i = 0; i < chapters.length; i++) {
                const ch = chapters[i];
                const safeTitle = ch.title
                    .replace(/^#+\s*/, '')
                    .replace(/[\\/:*?"<>|]/g, '_')
                    .slice(0, 40)
                    .trim();
                const fname = `${String(i + 1).padStart(3, '0')}-${safeTitle || 'chapter'}.md`;
                const fpath = path.join(options.outputDir, fname);
                const content = ch.lines.join('\n');
                await fs.writeFile(fpath, content, 'utf-8');

                const wordCount = content.replace(/\s/g, '').length;
                index.push({
                    index: i + 1,
                    title: ch.title.replace(/^#+\s*/, '').trim(),
                    file: fname,
                    wordCount
                });
            }

            const indexPath = path.join(options.outputDir, '_index.json');
            await fs.writeJson(indexPath, {
                source: file,
                pattern: options.pattern,
                createdAt: new Date().toISOString(),
                total: chapters.length,
                totalWords: index.reduce((s, c) => s + c.wordCount, 0),
                chapters: index
            }, { spaces: 2 });

            console.log(chalk.green(`✓ 已切分为 ${chapters.length} 章`));
            console.log(chalk.gray(`  输出目录: ${options.outputDir}`));
            console.log(chalk.gray(`  索引文件: ${indexPath}`));
            console.log(chalk.gray(`  总字数:   ${index.reduce((s, c) => s + c.wordCount, 0).toLocaleString()}`));
            console.log('\n' + chalk.cyan('章节预览（前 10 章）:'));
            index.slice(0, 10).forEach(ch => {
                console.log(chalk.gray(`  ${String(ch.index).padStart(3)}. ${ch.title}  (${ch.wordCount} 字)`));
            });
            if (index.length > 10) {
                console.log(chalk.gray(`  ... 还有 ${index.length - 10} 章`));
            }
            console.log('\n' + chalk.cyan('下一步:'));
            console.log(chalk.yellow(`  novel rewrite-batch --source ${options.outputDir} --style nlp/<你的风格>.json`));
        } catch (error) {
            console.error(chalk.red('❌ 切分失败:'), error.message);
            process.exit(1);
        }
    });

// rewrite-batch 命令 - 生成批量改写工单
program
    .command('rewrite-batch')
    .description('为整本初稿生成批量改写工单（供 AI 助手执行）')
    .option('--source <dir>', '初稿章节目录', 'draft/chapters')
    .option('--style <file>', '目标风格 JSON 文件')
    .option('--output <dir>', '改写输出目录', 'output/chapters')
    .option('--protect <file>', '术语/专有名词保护清单（每行一个词）')
    .option('--threshold <num>', '通过阈值（百分比）', '75')
    .option('--memory <file>', '长记忆库路径', DEFAULT_MEMORY_PATH)
    .option('--window-before <num>', '滑动窗口：参考前 N 章成稿', '2')
    .option('--window-after <num>', '滑动窗口：预读后 N 章原稿', '1')
    .option('--no-memory', '禁用长记忆系统（不推荐）')
    .action(async (options) => {
        try {
            if (!options.style) {
                console.log(chalk.red('❌ 必须通过 --style 指定目标风格 JSON'));
                console.log(chalk.gray('   先运行: novel analyze <样本文件>  生成风格 JSON'));
                process.exit(1);
            }
            const indexPath = path.join(options.source, '_index.json');
            if (!await fs.pathExists(indexPath)) {
                console.log(chalk.red(`❌ 找不到索引文件 ${indexPath}`));
                console.log(chalk.gray('   请先运行: novel split <初稿文件>'));
                process.exit(1);
            }
            const stylePath = path.resolve(options.style);
            if (!await fs.pathExists(stylePath)) {
                console.log(chalk.red(`❌ 风格文件不存在: ${options.style}`));
                process.exit(1);
            }

            const index = await fs.readJson(indexPath);
            await fs.ensureDir(options.output);

            // 读取保护清单
            let protectedTerms = [];
            if (options.protect && await fs.pathExists(options.protect)) {
                const content = await fs.readFile(options.protect, 'utf-8');
                protectedTerms = content.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
            }

            // 自动初始化长记忆库
            const useMemory = options.memory !== false && options.memory !== 'false';
            let memoryPath = null;
            if (useMemory) {
                memoryPath = path.resolve(options.memory);
                if (!await fs.pathExists(memoryPath)) {
                    await fs.ensureDir(path.dirname(memoryPath));
                    await fs.writeJson(memoryPath, createEmptyMemory(), { spaces: 2 });
                    console.log(chalk.gray(`✓ 已自动创建记忆库: ${path.relative(process.cwd(), memoryPath).replace(/\\/g, '/')}`));
                }
            }

            const worklist = {
                version: '2.0',  // 升级到 2.0：增加记忆 + 滑动窗口
                style: path.relative(process.cwd(), stylePath).replace(/\\/g, '/'),
                sourceDir: options.source.replace(/\\/g, '/'),
                outputDir: options.output.replace(/\\/g, '/'),
                threshold: parseInt(options.threshold, 10),
                protectedTerms,
                // 长记忆配置
                memory: useMemory ? {
                    enabled: true,
                    path: path.relative(process.cwd(), memoryPath).replace(/\\/g, '/'),
                    description: '每章改写前必读，改写后必更新（术语表/风格决策/章节摘要/交叉引用）'
                } : { enabled: false },
                // 滑动窗口配置
                slidingWindow: {
                    contextBefore: parseInt(options.windowBefore, 10),
                    contextAfter: parseInt(options.windowAfter, 10),
                    description: '改写第 N 章时，参考第 N-contextBefore..N-1 章的改写成稿 + 第 N+1..N+contextAfter 章的原稿'
                },
                createdAt: new Date().toISOString(),
                tasks: index.chapters.map(ch => ({
                    index: ch.index,
                    title: ch.title,
                    file: ch.file,
                    sourcePath: path.join(options.source, ch.file).replace(/\\/g, '/'),
                    targetPath: path.join(options.output, ch.file).replace(/\\/g, '/'),
                    originalWords: ch.wordCount,
                    status: 'pending',
                    matchScore: null,
                    attempts: 0,
                    notes: ''
                }))
            };

            const worklistPath = 'rewrite-worklist.json';
            await fs.writeJson(worklistPath, worklist, { spaces: 2 });

            console.log(chalk.green(`✓ 已生成改写工单: ${worklistPath}`));
            console.log(chalk.gray(`  目标风格: ${worklist.style}`));
            console.log(chalk.gray(`  待改写章节: ${worklist.tasks.length}`));
            console.log(chalk.gray(`  通过阈值: ${worklist.threshold}%`));
            if (protectedTerms.length > 0) {
                console.log(chalk.gray(`  保护术语: ${protectedTerms.length} 个`));
            }
            if (useMemory) {
                console.log(chalk.cyan(`  📚 长记忆: 已启用 (${worklist.memory.path})`));
                console.log(chalk.cyan(`  🪟 滑动窗口: 前 ${worklist.slidingWindow.contextBefore} 章 + 后 ${worklist.slidingWindow.contextAfter} 章`));
            } else {
                console.log(chalk.yellow(`  ⚠ 长记忆: 已禁用（不推荐，可能导致术语漂移）`));
            }
            console.log('\n' + chalk.cyan('下一步：在 AI 助手中执行改写命令'));
            console.log(chalk.yellow('  Claude Code:  /novel.rewrite-execute'));
            console.log(chalk.yellow('  Cursor:       /rewrite-execute'));
            console.log(chalk.yellow('  Gemini CLI:   /novel:rewrite-execute'));
            console.log(chalk.yellow('  Codex CLI:    /novel-rewrite-execute'));
            console.log(chalk.gray('\nAI 将按工单逐章改写，自动维护长记忆库，确保术语和风格全书一致'));
        } catch (error) {
            console.error(chalk.red('❌ 生成工单失败:'), error.message);
            process.exit(1);
        }
    });

// diff-style 命令 - 对比改写前后的风格变化
program
    .command('diff-style <before> <after>')
    .description('对比改写前后的风格指纹变化')
    .option('--target <file>', '同时对比与目标风格的距离（风格 JSON）')
    .option('-o, --output <file>', '输出 JSON 报告')
    .action(async (before, after, options) => {
        try {
            const beforePath = path.resolve(before);
            const afterPath = path.resolve(after);
            if (!await fs.pathExists(beforePath)) {
                console.log(chalk.red(`❌ 文件不存在: ${before}`));
                process.exit(1);
            }
            if (!await fs.pathExists(afterPath)) {
                console.log(chalk.red(`❌ 文件不存在: ${after}`));
                process.exit(1);
            }

            const NLPAnalyzer = (await import('./utils/nlp-analyzer.js')).default;
            const ConsistencyChecker = (await import('./utils/consistency-checker.js')).default;
            const analyzer = new NLPAnalyzer();
            const checker = new ConsistencyChecker();

            const textBefore = await fs.readFile(beforePath, 'utf-8');
            const textAfter = await fs.readFile(afterPath, 'utf-8');
            const fpBefore = analyzer.analyze(textBefore);
            const fpAfter = analyzer.analyze(textAfter);

            console.log(chalk.cyan('\n📊 风格指纹对比\n'));
            console.log(chalk.yellow('维度                 改写前        改写后        变化'));
            console.log(chalk.gray('─'.repeat(64)));

            const fmtDelta = (a, b) => {
                const delta = b - a;
                const arrow = delta > 0.001 ? chalk.green('↑') :
                              delta < -0.001 ? chalk.red('↓') : chalk.gray('=');
                const sign = delta >= 0 ? '+' : '';
                return `${a.toFixed(3).padStart(10)}    ${b.toFixed(3).padStart(10)}    ${arrow} ${sign}${delta.toFixed(3)}`;
            };

            console.log(`词汇丰富度 TTR       ${fmtDelta(fpBefore.vocabulary.vocabularyRichness, fpAfter.vocabulary.vocabularyRichness)}`);
            console.log(`平均句长             ${fmtDelta(fpBefore.syntax.avgSentenceLength, fpAfter.syntax.avgSentenceLength)}`);
            console.log(`句长标准差           ${fmtDelta(fpBefore.syntax.stdDeviation, fpAfter.syntax.stdDeviation)}`);
            console.log(`情感得分             ${fmtDelta(fpBefore.sentiment.sentimentScore, fpAfter.sentiment.sentimentScore)}`);
            console.log(`总词数(规模变化)     ${fmtDelta(fpBefore.vocabulary.totalTokens, fpAfter.vocabulary.totalTokens)}`);

            const sizeChange = (fpAfter.vocabulary.totalTokens - fpBefore.vocabulary.totalTokens) / fpBefore.vocabulary.totalTokens;
            const sizeWarn = Math.abs(sizeChange) > 0.15
                ? chalk.red(`  ⚠ 规模变化 ${(sizeChange * 100).toFixed(1)}% 超过 ±15%，可能存在过度删减/膨胀`)
                : chalk.gray(`  ✓ 规模变化 ${(sizeChange * 100).toFixed(1)}% 在合理范围内`);
            console.log(sizeWarn);

            const report = {
                before: { file: before, fingerprint: fpBefore },
                after:  { file: after, fingerprint: fpAfter },
                sizeChange
            };

            if (options.target) {
                const targetPath = path.resolve(options.target);
                if (!await fs.pathExists(targetPath)) {
                    console.log(chalk.red(`\n❌ 目标风格文件不存在: ${options.target}`));
                    process.exit(1);
                }
                const target = await fs.readJson(targetPath);
                const matchBefore = checker.checkConsistency(textBefore, target);
                const matchAfter = checker.checkConsistency(textAfter, target);

                console.log(chalk.yellow('\n🎯 与目标风格匹配度\n'));
                const colorOf = s => s >= 80 ? chalk.green : s >= 60 ? chalk.yellow : chalk.red;
                console.log(`改写前: ${colorOf(matchBefore.overall)(matchBefore.overall.toFixed(1) + '%')}  (${matchBefore.overallLevel})`);
                console.log(`改写后: ${colorOf(matchAfter.overall)(matchAfter.overall.toFixed(1) + '%')}  (${matchAfter.overallLevel})`);

                const improvement = matchAfter.overall - matchBefore.overall;
                let verdict;
                if (improvement > 5) verdict = chalk.green(`✓ 显著改善 (+${improvement.toFixed(1)}%)`);
                else if (improvement > 0) verdict = chalk.yellow(`～ 略有提升 (+${improvement.toFixed(1)}%)`);
                else verdict = chalk.red(`✗ 未达预期 (${improvement.toFixed(1)}%)`);
                console.log(`变化:   ${verdict}`);

                console.log(chalk.yellow('\n各维度匹配度（改写后）:'));
                const d = matchAfter.dimensions;
                console.log(`  词汇: ${(d.vocabulary.score * 100).toFixed(1)}%   句法: ${(d.syntax.score * 100).toFixed(1)}%   情感: ${(d.sentiment.score * 100).toFixed(1)}%   节奏: ${(d.rhythm.score * 100).toFixed(1)}%`);

                report.target = options.target;
                report.matchBefore = matchBefore;
                report.matchAfter = matchAfter;
                report.improvement = improvement;

                // 输出 PASS / FAIL（供 AI 自动判断）
                const passed = matchAfter.overall >= 75;
                console.log('\n' + (passed
                    ? chalk.green.bold('  RESULT: PASS')
                    : chalk.red.bold('  RESULT: FAIL  ') + chalk.gray('(建议重写或人工介入)')));
            }

            if (options.output) {
                await fs.writeJson(options.output, report, { spaces: 2 });
                console.log(chalk.gray(`\n报告已保存: ${options.output}`));
            }
        } catch (error) {
            console.error(chalk.red('❌ 对比失败:'), error.message);
            process.exit(1);
        }
    });

// compose 命令 - 合并改写后章节为完整书稿
program
    .command('compose')
    .description('合并改写后的章节为完整书稿')
    .option('--input <dir>', '改写章节目录', 'output/chapters')
    .option('--output <file>', '输出文件', 'output/final.md')
    .option('--separator <str>', '章节间分隔符', '\n\n')
    .action(async (options) => {
        try {
            // 索引文件优先从 source（draft/chapters）找，否则从 input 自身找
            let indexPath = path.join(options.input, '_index.json');
            if (!await fs.pathExists(indexPath)) {
                // 尝试从 draft/chapters 找
                indexPath = path.join('draft', 'chapters', '_index.json');
                if (!await fs.pathExists(indexPath)) {
                    console.log(chalk.red(`❌ 找不到索引文件，请确保已运行过 novel split`));
                    process.exit(1);
                }
            }

            const index = await fs.readJson(indexPath);
            const parts = [];
            const missing = [];

            for (const ch of index.chapters) {
                const fpath = path.join(options.input, ch.file);
                if (await fs.pathExists(fpath)) {
                    parts.push(await fs.readFile(fpath, 'utf-8'));
                } else {
                    missing.push(ch.file);
                }
            }

            if (parts.length === 0) {
                console.log(chalk.red('❌ 没有找到任何改写后的章节文件'));
                process.exit(1);
            }

            await fs.ensureDir(path.dirname(options.output));
            const finalText = parts.join(options.separator);
            await fs.writeFile(options.output, finalText, 'utf-8');

            const finalWords = finalText.replace(/\s/g, '').length;

            console.log(chalk.green(`✓ 合稿完成: ${options.output}`));
            console.log(chalk.gray(`  合并章节: ${parts.length}/${index.chapters.length}`));
            console.log(chalk.gray(`  总字数:   ${finalWords.toLocaleString()}`));
            console.log(chalk.gray(`  原书字数: ${(index.totalWords || 0).toLocaleString()}`));

            if (missing.length > 0) {
                console.log(chalk.yellow(`\n⚠️  缺失 ${missing.length} 章未改写:`));
                missing.slice(0, 10).forEach(f => console.log(chalk.gray(`     - ${f}`)));
                if (missing.length > 10) console.log(chalk.gray(`     ... 还有 ${missing.length - 10} 章`));
            }

            console.log('\n' + chalk.cyan('下一步：'));
            console.log(chalk.yellow(`  novel check-style ${options.output} <目标风格.json>   # 全书风格校验`));
        } catch (error) {
            console.error(chalk.red('❌ 合稿失败:'), error.message);
            process.exit(1);
        }
    });

// 自定义帮助信息
program.on('--help', () => {
    console.log('');
    console.log(chalk.yellow('使用示例:'));
    console.log('');
    console.log('  $ novel init my-story           # 创建新项目');
    console.log('  $ novel init --here              # 在当前目录初始化');
    console.log('  $ novel check                    # 检查环境');
    console.log('  $ novel info                     # 查看写作方法');
    console.log('');
    console.log(chalk.cyan('核心创作命令:'));
    console.log('  /method      - 智能选择写作方法（推荐先执行）');
    console.log('  /style       - 设定创作风格和准则');
    console.log('  /story       - 创建故事大纲（使用选定方法）');
    console.log('  /outline     - 规划章节结构（基于方法模板）');
    console.log('  /track-init  - 初始化追踪系统');
    console.log('  /write       - AI 辅助章节创作（自动更新追踪）');
    console.log('');
    console.log(chalk.cyan('追踪管理命令:'));
    console.log('  /plot-check  - 智能检查情节发展一致性');
    console.log('  /timeline    - 管理和验证时间线');
    console.log('  /relations   - 追踪角色关系变化');
    console.log('  /track       - 综合追踪与智能分析');
    console.log('');
    console.log(chalk.cyan('风格学习工具 (CLI):'));
    console.log('  novel preprocess <file>     - 预处理样本文本');
    console.log('  novel analyze <file>        - NLP 文本分析');
    console.log('  novel check-style <f> <s>   - 风格一致性检测');
    console.log('');
    console.log(chalk.cyan('风格化改写流水线 (v0.23.0+):'));
    console.log('  novel split <file>             - 将整本初稿按章节切分');
    console.log('  novel rewrite-batch --style    - 生成批量改写工单');
    console.log('  novel diff-style <a> <b>       - 对比改写前后风格变化');
    console.log('  novel compose --output         - 合并改写后章节为成稿');
    console.log('');
    console.log(chalk.cyan('长记忆系统 (v0.24.0+):'));
    console.log('  novel memory init              - 初始化记忆库');
    console.log('  novel memory show              - 查看术语表/风格决策/章节摘要');
    console.log('  novel memory update --patch    - 合并新记忆（AI 自动调用）');
    console.log('  novel memory validate <file>   - 校验单章是否符合记忆');
    console.log('  novel memory check-all         - 全书一致性扫描');
    console.log('');
    console.log(chalk.gray('更多信息: https://github.com/wordflowlab/novel-writer'));
});
// 解析命令行参数
program.parse(process.argv);
// 如果没有提供任何命令，显示帮助信息
if (!process.argv.slice(2).length) {
    program.outputHelp();
}
//# sourceMappingURL=cli.js.map