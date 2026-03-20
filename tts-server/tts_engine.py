"""
TTS 音色克隆引擎 - 支持 IndexTTS 2.5
完全本地运行，复用已有的 IndexTTS 模型
"""

import os
import hashlib
import json
import sys
from pathlib import Path
from typing import Optional, Dict, Any
import logging

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 数据目录
DATA_DIR = Path(__file__).parent / "data"
VOICES_DIR = DATA_DIR / "voices"
OUTPUT_DIR = DATA_DIR / "output"
TEMP_DIR = DATA_DIR / "temp"

# 确保目录存在
for dir_path in [VOICES_DIR, OUTPUT_DIR, TEMP_DIR]:
    dir_path.mkdir(parents=True, exist_ok=True)

# 音色元数据文件
VOICES_META_FILE = VOICES_DIR / "voices_meta.json"

# IndexTTS 路径配置 - 用户需要修改为实际路径
INDEX_TTS_PATH = os.environ.get("INDEX_TTS_PATH", r"D:\IndexTTS2.5")
INDEX_TTS_CHECKPOINT = os.environ.get("INDEX_TTS_CHECKPOINT", r"checkpoints")


class TTSEngine:
    """TTS 音色克隆引擎 - 支持 IndexTTS 2.5"""
    
    def __init__(self):
        self.tts = None
        self._initialized = False
        self._engine_type = None  # 'indextts' or 'coqui'
        
    def _ensure_initialized(self):
        """延迟初始化 TTS 模型，优先使用 IndexTTS 2.5"""
        if self._initialized:
            return
            
        # 尝试加载 IndexTTS 2.5
        if self._init_indextts():
            self._engine_type = 'indextts'
            self._initialized = True
            logger.info("使用 IndexTTS 2.5 引擎")
            return
            
        # 回退到 Coqui TTS
        if self._init_coqui():
            self._engine_type = 'coqui'
            self._initialized = True
            logger.info("使用 Coqui TTS (XTTS v2) 引擎")
            return
            
        raise RuntimeError("无法加载任何 TTS 模型，请检查配置")
    
    def _init_indextts(self) -> bool:
        """初始化 IndexTTS 2.5"""
        try:
            indextts_path = Path(INDEX_TTS_PATH)
            if not indextts_path.exists():
                logger.info(f"IndexTTS 路径不存在: {INDEX_TTS_PATH}")
                return False
            
            # 添加 IndexTTS 到 Python 路径
            if str(indextts_path) not in sys.path:
                sys.path.insert(0, str(indextts_path))
            
            # 尝试导入 IndexTTS
            from indextts.infer import IndexTTS
            
            # 查找 checkpoint
            checkpoint_path = indextts_path / INDEX_TTS_CHECKPOINT
            if checkpoint_path.exists():
                self.tts = IndexTTS(
                    checkpoint_dir=str(checkpoint_path),
                    device="cuda" if self._check_cuda() else "cpu"
                )
                logger.info("IndexTTS 2.5 模型加载成功！")
                return True
            else:
                logger.warning(f"IndexTTS checkpoint 不存在: {checkpoint_path}")
                return False
                
        except ImportError as e:
            logger.info(f"无法导入 IndexTTS: {e}")
            return False
        except Exception as e:
            logger.error(f"IndexTTS 初始化失败: {e}")
            return False
    
    def _init_coqui(self) -> bool:
        """初始化 Coqui TTS (XTTS v2) 作为备选"""
        try:
            from TTS.api import TTS as CoquiTTS
            self.tts = CoquiTTS("tts_models/multilingual/multi-dataset/xtts_v2")
            logger.info("Coqui TTS (XTTS v2) 模型加载成功！")
            return True
        except Exception as e:
            logger.error(f"Coqui TTS 初始化失败: {e}")
            return False
    
    def _check_cuda(self) -> bool:
        """检查 CUDA 是否可用"""
        try:
            import torch
            return torch.cuda.is_available()
        except:
            return False
    
    def _load_voices_meta(self) -> Dict[str, Any]:
        """加载音色元数据"""
        if VOICES_META_FILE.exists():
            with open(VOICES_META_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        return {}
    
    def _save_voices_meta(self, meta: Dict[str, Any]):
        """保存音色元数据"""
        with open(VOICES_META_FILE, "w", encoding="utf-8") as f:
            json.dump(meta, f, ensure_ascii=False, indent=2)
    
    def list_voices(self) -> list:
        """列出所有已上传的音色"""
        meta = self._load_voices_meta()
        voices = []
        for voice_id, info in meta.items():
            voices.append({
                "id": voice_id,
                "name": info.get("name", voice_id),
                "description": info.get("description", ""),
                "duration": info.get("duration", 0),
                "created_at": info.get("created_at", ""),
            })
        return voices
    
    def add_voice(self, name: str, audio_path: str, description: str = "") -> Dict[str, Any]:
        """添加新音色"""
        import shutil
        from datetime import datetime
        
        voice_id = hashlib.md5(f"{name}_{datetime.now().isoformat()}".encode()).hexdigest()[:12]
        duration = self._get_audio_duration(audio_path)
        
        audio_ext = Path(audio_path).suffix
        target_path = VOICES_DIR / f"{voice_id}{audio_ext}"
        shutil.copy(audio_path, target_path)
        
        meta = self._load_voices_meta()
        meta[voice_id] = {
            "name": name,
            "description": description,
            "audio_file": str(target_path),
            "duration": duration,
            "created_at": datetime.now().isoformat(),
        }
        self._save_voices_meta(meta)
        
        logger.info(f"音色添加成功: {name} ({voice_id})")
        return {
            "id": voice_id,
            "name": name,
            "description": description,
            "duration": duration,
        }
    
    def delete_voice(self, voice_id: str) -> bool:
        """删除音色"""
        meta = self._load_voices_meta()
        if voice_id not in meta:
            return False
        
        audio_file = meta[voice_id].get("audio_file")
        if audio_file and Path(audio_file).exists():
            Path(audio_file).unlink()
        
        del meta[voice_id]
        self._save_voices_meta(meta)
        
        logger.info(f"音色已删除: {voice_id}")
        return True
    
    def _get_audio_duration(self, audio_path: str) -> float:
        """获取音频时长（秒）"""
        try:
            import librosa
            duration = librosa.get_duration(path=audio_path)
            return round(duration, 2)
        except:
            return 0.0
    
    def synthesize(
        self,
        text: str,
        voice_id: str,
        language: str = "zh",
        output_file: Optional[str] = None,
    ) -> str:
        """使用指定音色合成语音"""
        self._ensure_initialized()
        
        meta = self._load_voices_meta()
        if voice_id not in meta:
            raise ValueError(f"音色不存在: {voice_id}")
        
        speaker_audio = meta[voice_id].get("audio_file")
        if not speaker_audio or not Path(speaker_audio).exists():
            raise ValueError(f"音色音频文件不存在: {voice_id}")
        
        if not output_file:
            import uuid
            output_file = str(OUTPUT_DIR / f"{uuid.uuid4().hex}.wav")
        
        logger.info(f"正在合成语音: {text[:50]}... (音色: {voice_id})")
        
        if self._engine_type == 'indextts':
            self._synthesize_indextts(text, speaker_audio, output_file)
        else:
            self._synthesize_coqui(text, speaker_audio, language, output_file)
        
        logger.info(f"语音合成完成: {output_file}")
        return output_file
    
    def _synthesize_indextts(self, text: str, speaker_audio: str, output_file: str):
        """使用 IndexTTS 合成"""
        try:
            # IndexTTS 2.5 的 API
            self.tts.infer(
                text=text,
                prompt_audio=speaker_audio,
                output_path=output_file
            )
        except Exception as e:
            logger.error(f"IndexTTS 合成失败: {e}")
            raise
    
    def _synthesize_coqui(self, text: str, speaker_audio: str, language: str, output_file: str):
        """使用 Coqui TTS 合成"""
        self.tts.tts_to_file(
            text=text,
            speaker_wav=speaker_audio,
            language=language,
            file_path=output_file,
        )
    
    def merge_audio(
        self,
        audio_files: list,
        output_file: str,
        gap_ms: int = 500,
    ) -> str:
        """合并多个音频文件"""
        from pydub import AudioSegment
        
        logger.info(f"正在合并 {len(audio_files)} 个音频文件...")
        
        gap_audio = AudioSegment.silent(duration=gap_ms)
        combined = AudioSegment.empty()
        
        for i, audio_file in enumerate(audio_files):
            if not Path(audio_file).exists():
                logger.warning(f"音频文件不存在，跳过: {audio_file}")
                continue
            
            audio = AudioSegment.from_file(audio_file)
            combined += audio
            
            if i < len(audio_files) - 1:
                combined += gap_audio
        
        combined.export(output_file, format="mp3")
        logger.info(f"音频合并完成: {output_file}")
        return output_file
    
    def get_engine_info(self) -> Dict[str, Any]:
        """获取当前引擎信息"""
        self._ensure_initialized()
        return {
            "engine_type": self._engine_type,
            "cuda_available": self._check_cuda(),
        }


# 全局 TTS 引擎实例
tts_engine = TTSEngine()
