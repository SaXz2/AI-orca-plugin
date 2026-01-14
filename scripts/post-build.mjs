#!/usr/bin/env node

import { existsSync, readFileSync, rmSync, cpSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// 读取本地配置
const configPath = join(rootDir, 'build.config.local.json');

if (!existsSync(configPath)) {
    console.log('⚠️  未找到 build.config.local.json，跳过复制步骤');
    console.log('💡 如需自动复制 dist 到其他位置，请创建 build.config.local.json 文件');
    process.exit(0);
}

try {
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    const { copyTo } = config;

    if (!copyTo) {
        console.log('⚠️  配置文件中未指定 copyTo 路径，跳过复制步骤');
        process.exit(0);
    }

    const sourceDist = join(rootDir, 'dist');
    const targetDist = join(copyTo, 'dist');

    // 检查源目录是否存在
    if (!existsSync(sourceDist)) {
        console.error('❌ 源 dist 文件夹不存在，请先执行构建');
        process.exit(1);
    }

    // 删除目标目录（如果存在）
    if (existsSync(targetDist)) {
        console.log(`🗑️  删除旧的目标目录: ${targetDist}`);
        rmSync(targetDist, { recursive: true, force: true });
    }

    // 复制新的 dist 文件夹
    console.log(`📦 复制 dist 到: ${targetDist}`);
    cpSync(sourceDist, targetDist, { recursive: true });

    console.log('✅ 复制完成!');
} catch (error) {
    console.error('❌ 复制过程中出现错误:', error.message);
    process.exit(1);
}
