#!/bin/bash

# TTS 音色克隆系统启动脚本

echo "========================================"
echo "  TTS 音色克隆系统 - 本地启动脚本"
echo "========================================"
echo ""

# 检查 Python
if ! command -v python3 &> /dev/null; then
    echo "错误: 未找到 Python3，请先安装 Python 3.8+"
    exit 1
fi

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "错误: 未找到 Node.js，请先安装 Node.js 18+"
    exit 1
fi

echo "步骤 1/4: 安装 Python 依赖..."
cd "$(dirname "$0")"
pip3 install -r requirements.txt

echo ""
echo "步骤 2/4: 安装前端依赖..."
cd ..
pnpm install

echo ""
echo "步骤 3/4: 启动 TTS 后端服务 (端口 8000)..."
cd tts-server
python3 main.py &
TTS_PID=$!
cd ..

echo ""
echo "步骤 4/4: 启动前端服务 (端口 5000)..."
pnpm dev &

echo ""
echo "========================================"
echo "  服务启动完成！"
echo "========================================"
echo ""
echo "前端界面: http://localhost:5000"
echo "TTS 服务: http://localhost:8000"
echo "API 文档: http://localhost:8000/docs"
echo ""
echo "首次运行会自动下载 TTS 模型（约 2GB）"
echo "按 Ctrl+C 停止所有服务"
echo ""

# 等待子进程
wait
