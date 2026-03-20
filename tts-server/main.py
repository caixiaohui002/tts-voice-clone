"""
TTS 音色克隆服务 - FastAPI 后端
完全本地运行，支持自定义音色克隆
支持 IndexTTS 2.5 和 Coqui TTS
"""

import os
import uuid
import asyncio
import tempfile
from pathlib import Path
from typing import Optional, List
from datetime import datetime

# 加载环境变量
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from tts_engine import tts_engine, OUTPUT_DIR, VOICES_DIR

# 创建 FastAPI 应用
app = FastAPI(
    title="TTS 音色克隆服务",
    description="完全本地运行的 TTS 音色克隆系统，支持自定义音色",
    version="1.0.0",
)

# 配置 CORS（允许前端跨域访问）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 生产环境应限制具体域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 挂载静态文件目录
app.mount("/output", StaticFiles(directory=str(OUTPUT_DIR)), name="output")
app.mount("/voices", StaticFiles(directory=str(VOICES_DIR)), name="voices")


# ==================== 数据模型 ====================

class VoiceCreate(BaseModel):
    name: str
    description: Optional[str] = ""


class SynthesizeRequest(BaseModel):
    text: str
    voice_id: str
    language: Optional[str] = "zh-cn"


class ScriptLine(BaseModel):
    speaker: str
    text: str


class ScriptSynthesizeRequest(BaseModel):
    lines: List[ScriptLine]
    voice_mapping: dict  # {"角色名": "音色ID"}
    language: Optional[str] = "zh-cn"
    gap_ms: Optional[int] = 500


# ==================== API 接口 ====================

@app.get("/")
async def root():
    """服务状态"""
    # 尝试获取引擎信息
    engine_info = None
    try:
        engine_info = tts_engine.get_engine_info()
    except:
        pass
    
    return {
        "status": "running",
        "service": "TTS 音色克隆服务",
        "version": "1.0.0",
        "engine": engine_info,
        "indextts_path": os.environ.get("INDEX_TTS_PATH", "未配置"),
    }


@app.get("/api/engine")
async def get_engine_info():
    """获取 TTS 引擎信息"""
    try:
        info = tts_engine.get_engine_info()
        return {
            "success": True,
            "engine": info,
            "indextts_path": os.environ.get("INDEX_TTS_PATH", "未配置"),
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
        }


@app.get("/api/voices")
async def list_voices():
    """列出所有音色"""
    voices = tts_engine.list_voices()
    return {"voices": voices}


@app.post("/api/voices")
async def create_voice(
    name: str,
    file: UploadFile = File(...),
    description: Optional[str] = "",
):
    """
    上传并创建新音色
    支持 mp3, wav, ogg, m4a 等格式
    """
    # 验证文件类型
    allowed_types = ["audio/mpeg", "audio/wav", "audio/ogg", "audio/mp4", "audio/x-m4a"]
    if file.content_type not in allowed_types:
        # 尝试根据扩展名判断
        ext = Path(file.filename).suffix.lower()
        if ext not in [".mp3", ".wav", ".ogg", ".m4a"]:
            raise HTTPException(
                status_code=400,
                detail="不支持的音频格式，请上传 mp3, wav, ogg 或 m4a 文件"
            )
    
    # 保存上传的文件
    temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=Path(file.filename).suffix)
    try:
        content = await file.read()
        temp_file.write(content)
        temp_file.close()
        
        # 添加音色
        voice_info = tts_engine.add_voice(
            name=name,
            audio_path=temp_file.name,
            description=description or "",
        )
        
        return {"success": True, "voice": voice_info}
    
    finally:
        # 清理临时文件
        if os.path.exists(temp_file.name):
            os.unlink(temp_file.name)


@app.delete("/api/voices/{voice_id}")
async def delete_voice(voice_id: str):
    """删除音色"""
    success = tts_engine.delete_voice(voice_id)
    if not success:
        raise HTTPException(status_code=404, detail="音色不存在")
    return {"success": True}


@app.post("/api/synthesize")
async def synthesize_speech(request: SynthesizeRequest):
    """
    合成单条语音
    """
    try:
        output_file = tts_engine.synthesize(
            text=request.text,
            voice_id=request.voice_id,
            language=request.language,
        )
        
        # 返回音频URL
        filename = Path(output_file).name
        return {
            "success": True,
            "audio_url": f"/output/{filename}",
            "file_path": output_file,
        }
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"合成失败: {str(e)}")


@app.post("/api/synthesize-script")
async def synthesize_script(request: ScriptSynthesizeRequest):
    """
    合成剧本语音（多角色、多台词）
    返回合并后的音频
    """
    try:
        audio_files = []
        
        for i, line in enumerate(request.lines):
            voice_id = request.voice_mapping.get(line.speaker)
            if not voice_id:
                raise ValueError(f"角色 '{line.speaker}' 未分配音色")
            
            # 生成单条语音
            output_file = tts_engine.synthesize(
                text=line.text,
                voice_id=voice_id,
                language=request.language,
            )
            audio_files.append(output_file)
        
        # 合并所有音频
        merged_filename = f"script_{uuid.uuid4().hex}.mp3"
        merged_output = str(OUTPUT_DIR / merged_filename)
        
        tts_engine.merge_audio(
            audio_files=audio_files,
            output_file=merged_output,
            gap_ms=request.gap_ms,
        )
        
        # 清理临时音频文件
        for f in audio_files:
            if os.path.exists(f):
                os.unlink(f)
        
        return {
            "success": True,
            "audio_url": f"/output/{merged_filename}",
            "total_lines": len(request.lines),
        }
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"合成失败: {str(e)}")


@app.post("/api/merge-audio")
async def merge_audio_files(files: List[UploadFile] = File(...), gap_ms: int = 500):
    """
    合并多个音频文件
    """
    temp_files = []
    
    try:
        # 保存上传的文件
        for file in files:
            temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=Path(file.filename).suffix)
            content = await file.read()
            temp_file.write(content)
            temp_file.close()
            temp_files.append(temp_file.name)
        
        # 合并音频
        merged_filename = f"merged_{uuid.uuid4().hex}.mp3"
        merged_output = str(OUTPUT_DIR / merged_filename)
        
        tts_engine.merge_audio(
            audio_files=temp_files,
            output_file=merged_output,
            gap_ms=gap_ms,
        )
        
        return {
            "success": True,
            "audio_url": f"/output/{merged_filename}",
        }
    
    finally:
        # 清理临时文件
        for f in temp_files:
            if os.path.exists(f):
                os.unlink(f)


@app.get("/download/{filename}")
async def download_file(filename: str):
    """下载生成的音频文件"""
    file_path = OUTPUT_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="文件不存在")
    return FileResponse(
        path=file_path,
        filename=filename,
        media_type="audio/mpeg",
    )


# ==================== 启动配置 ====================

if __name__ == "__main__":
    import uvicorn
    
    print("=" * 60)
    print("  TTS 音色克隆服务启动中...")
    print("=" * 60)
    print()
    
    # 显示配置信息
    indextts_path = os.environ.get("INDEX_TTS_PATH", "未配置")
    print(f"  IndexTTS 路径: {indextts_path}")
    
    if indextts_path != "未配置" and Path(indextts_path).exists():
        print("  ✓ IndexTTS 目录存在，将优先使用 IndexTTS 2.5")
    else:
        print("  ⚠ IndexTTS 未配置或路径不存在")
        print("  将尝试使用 Coqui TTS (XTTS v2) 作为备选")
        print("  首次运行会自动下载约 2GB 模型")
    
    print()
    print("=" * 60)
    print(f"  服务地址: http://localhost:8000")
    print(f"  API 文档: http://localhost:8000/docs")
    print("=" * 60)
    print()
    
    uvicorn.run(app, host="0.0.0.0", port=8000)
