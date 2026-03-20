@echo off
chcp 65001 >nul
echo ========================================
echo   TTS 音色克隆系统 - Windows 启动脚本
echo ========================================
echo.

REM 切换到脚本所在目录
cd /d "%~dp0"

REM 加载环境变量
if exist .env (
    echo 加载配置文件 .env ...
    for /f "usebackq tokens=1,* delims==" %%a in (".env") do (
        REM 跳过注释行
        echo %%a | findstr /r "^#" >nul || set "%%a=%%b"
    )
)

REM 显示配置
if defined INDEX_TTS_PATH (
    echo IndexTTS 路径: %INDEX_TTS_PATH%
) else (
    echo [警告] 未配置 INDEX_TTS_PATH，将使用默认路径
)

echo.
echo 步骤 1/2: 启动 TTS 后端服务 (端口 8000)...
start "TTS Server" cmd /k "cd /d %~dp0 && python main.py"

echo 等待 TTS 服务启动...
timeout /t 5 /nobreak >nul

echo.
echo 步骤 2/2: 启动前端服务 (端口 5000)...
cd ..
start "Frontend" cmd /k "pnpm dev"

echo.
echo ========================================
echo   服务启动完成！
echo ========================================
echo.
echo 前端界面: http://localhost:5000
echo TTS 服务: http://localhost:8000
echo API 文档: http://localhost:8000/docs
echo.
echo 首次使用请确保：
echo 1. 已配置 .env 文件指向 IndexTTS 目录
echo 2. 或已安装 Coqui TTS 作为备选
echo.
echo 关闭窗口即可停止服务
echo.
pause
