# TTS 音色克隆工作室

一个完全本地运行的 TTS 音色克隆系统，支持自定义音色、智能剧本解析、多角色配音。

**支持两种 TTS 引擎：**
- **IndexTTS 2.5**（推荐）- 中文效果最好，复用已有模型
- **Coqui TTS (XTTS v2)** - 备选方案，支持多语言

---

## 🚀 快速部署

### 方式一：通过 GitHub（推荐）

#### 1. Fork 或创建仓库

将本项目上传到你的 GitHub 仓库，例如：`your-username/tts-voice-clone`

#### 2. 克隆到本地

```bash
# 打开 PowerShell 或 CMD
cd D:\

# 克隆项目
git clone https://github.com/your-username/tts-voice-clone.git TTS
cd TTS
```

#### 3. 配置 IndexTTS 路径

编辑 `tts-server/.env` 文件：

```env
# 修改为你的 IndexTTS 2.5 实际路径
INDEX_TTS_PATH=D:\IndexTTS2.5
INDEX_TTS_CHECKPOINT=checkpoints
```

#### 4. 安装依赖

```bash
# 安装 Python 依赖
cd D:\TTS\tts-server
pip install -r requirements.txt

# 安装前端依赖
cd D:\TTS
npm install -g pnpm
pnpm install
```

#### 5. 启动服务

双击运行 `D:\TTS\tts-server\start.bat`

或者手动启动：

```powershell
# 终端 1：启动 TTS 后端
cd D:\TTS\tts-server
python main.py

# 终端 2：启动前端
cd D:\TTS
pnpm dev
```

---

### 方式二：下载压缩包

1. 下载 [tts-voice-clone.tar.gz](下载链接)
2. 解压到 `D:\TTS`
3. 按照上述步骤 3-5 操作

---

## 🔧 配置 IndexTTS 2.5

### 检查你的 IndexTTS 目录

根据你提供的截图，你的 IndexTTS 目录应该是这样的：

```
D:\IndexTTS2.5\
├── checkpoints\          ← 模型权重目录
├── indextts\             ← 核心代码
├── webui.py              ← Web UI
├── 一键启动IndexTTS2.5.bat
└── ...
```

### 配置步骤

1. **复制配置模板**

```powershell
cd D:\TTS\tts-server
copy .env.example .env
```

2. **编辑 .env 文件**

```env
# 指向你的 IndexTTS 2.5 目录
INDEX_TTS_PATH=D:\IndexTTS2.5

# checkpoint 目录名
INDEX_TTS_CHECKPOINT=checkpoints
```

3. **验证配置**

启动服务后，访问 http://localhost:8000/api/engine

应该返回：
```json
{
  "success": true,
  "engine": {
    "engine_type": "indextts",
    "cuda_available": true
  }
}
```

---

## 📁 项目结构

```
D:\TTS\
├── src/                    # Next.js 前端
│   └── app/page.tsx        # 主界面
├── tts-server/             # Python 后端
│   ├── main.py             # FastAPI 服务
│   ├── tts_engine.py       # TTS 引擎（支持 IndexTTS）
│   ├── requirements.txt    # Python 依赖
│   ├── .env.example        # 配置模板
│   ├── .env                # 你的配置（需创建）
│   ├── start.bat           # Windows 启动脚本
│   └── data/               # 数据存储
│       ├── voices/         # 音色库
│       └── output/         # 生成的音频
└── package.json
```

---

## 🎯 使用流程

```
┌─────────────────────────────────────────────────────────┐
│  1. 上传音色                                             │
│     上传一段清晰的参考音频（建议 10-30 秒）                 │
│     音频越清晰，克隆效果越好                               │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  2. 输入剧本                                             │
│     支持：角色：台词、[角色]台词、（角色）台词              │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  3. 解析剧本                                             │
│     自动识别角色和台词                                    │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  4. 分配音色                                             │
│     为每个角色选择对应的音色                              │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  5. 生成语音                                             │
│     系统逐句合成，自动合并为完整音频                       │
└─────────────────────────────────────────────────────────┘
```

---

## 📖 剧本格式示例

```
小明：今天天气真好啊！
小红：是啊，我们去公园散步吧。
[旁白] 两人相视一笑，走向远处的公园。
小明：这里的风景真美。
（小红）我们以后常来吧！
```

---

## ⚙️ 环境要求

| 组件 | 要求 |
|------|------|
| Python | 3.8+ (推荐 3.10+) |
| Node.js | 18+ |
| 内存 | 8GB+ (推荐 16GB) |
| 显存 | 8GB+ (用于 IndexTTS) |
| 存储 | 约 5GB |

---

## 🔍 常见问题

### Q: 如何确认 IndexTTS 是否正确配置？

A: 启动服务后访问 http://localhost:8000/api/engine

如果 `"engine_type": "indextts"` 说明正在使用 IndexTTS。

### Q: IndexTTS 加载失败怎么办？

A: 检查以下几点：
1. `.env` 文件中的路径是否正确
2. `checkpoints` 目录是否存在模型文件
3. Python 环境是否能导入 `indextts` 模块

如果仍然失败，系统会自动回退到 Coqui TTS。

### Q: 没有 GPU 怎么办？

A: IndexTTS 2.5 建议有 8GB 显存。如果没有 GPU：
- 可以使用 CPU 模式，但速度会很慢
- 建议使用 Coqui TTS 作为备选

### Q: 如何更新代码？

A: 如果通过 GitHub 部署：
```bash
cd D:\TTS
git pull
pnpm install
cd tts-server
pip install -r requirements.txt
```

---

## 📄 许可证

MIT License
