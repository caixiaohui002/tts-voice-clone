"use client";

import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  Upload, Play, Pause, Trash2, Mic, FileText, Users, Settings, 
  Volume2, Download, Loader2, Plus, AlertCircle, CheckCircle2,
  AudioWaveform, Sparkles
} from "lucide-react";

// TTS 后端服务地址（本地运行时）
const TTS_SERVER_URL = process.env.NEXT_PUBLIC_TTS_SERVER_URL || "http://localhost:8000";

// 类型定义
interface Voice {
  id: string;
  name: string;
  description: string;
  duration: number;
  created_at: string;
}

interface ScriptLine {
  speaker: string;
  text: string;
}

interface ParsedScript {
  lines: ScriptLine[];
  speakers: string[];
}

export default function Home() {
  // 状态
  const [activeTab, setActiveTab] = useState("voices");
  const [voices, setVoices] = useState<Voice[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [script, setScript] = useState("");
  const [parsedScript, setParsedScript] = useState<ParsedScript | null>(null);
  const [voiceMapping, setVoiceMapping] = useState<Record<string, string>>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 加载音色列表
  const loadVoices = useCallback(async () => {
    try {
      const response = await fetch(`${TTS_SERVER_URL}/api/voices`);
      const data = await response.json();
      setVoices(data.voices || []);
    } catch (err) {
      console.error("加载音色列表失败:", err);
      setError("无法连接到 TTS 服务，请确保后端服务已启动");
    }
  }, []);

  // 上传音色
  const handleUploadVoice = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("name", file.name.replace(/\.[^/.]+$/, ""));

    try {
      const response = await fetch(`${TTS_SERVER_URL}/api/voices`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("上传失败");

      setSuccess("音色上传成功！");
      loadVoices();
    } catch (err) {
      setError("上传失败，请检查文件格式和服务状态");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  // 删除音色
  const handleDeleteVoice = async (voiceId: string) => {
    try {
      const response = await fetch(`${TTS_SERVER_URL}/api/voices/${voiceId}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("删除失败");

      setSuccess("音色已删除");
      loadVoices();
    } catch (err) {
      setError("删除失败");
    }
  };

  // 解析剧本
  const handleParseScript = () => {
    if (!script.trim()) {
      setError("请输入剧本内容");
      return;
    }

    const lines: ScriptLine[] = [];
    const speakers = new Set<string>();

    // 按行解析剧本
    // 支持格式：角色名：台词 或 [角色名] 台词
    const scriptLines = script.split("\n");
    
    for (const line of scriptLines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // 格式1: 角色：台词
      const colonMatch = trimmed.match(/^([^：:]+)[：:](.+)$/);
      if (colonMatch) {
        const speaker = colonMatch[1].trim();
        const text = colonMatch[2].trim();
        lines.push({ speaker, text });
        speakers.add(speaker);
        continue;
      }

      // 格式2: [角色] 台词
      const bracketMatch = trimmed.match(/^\[([^\]]+)\]\s*(.+)$/);
      if (bracketMatch) {
        const speaker = bracketMatch[1].trim();
        const text = bracketMatch[2].trim();
        lines.push({ speaker, text });
        speakers.add(speaker);
        continue;
      }

      // 格式3: （角色）台词
      const parenMatch = trimmed.match(/^（([^）]+)）\s*(.+)$/);
      if (parenMatch) {
        const speaker = parenMatch[1].trim();
        const text = parenMatch[2].trim();
        lines.push({ speaker, text });
        speakers.add(speaker);
        continue;
      }
    }

    if (lines.length === 0) {
      setError("未能解析出有效台词，请检查剧本格式");
      return;
    }

    setParsedScript({ lines, speakers: Array.from(speakers) });
    
    // 初始化音色映射
    const initialMapping: Record<string, string> = {};
    for (const speaker of Array.from(speakers)) {
      initialMapping[speaker] = voices[0]?.id || "";
    }
    setVoiceMapping(initialMapping);
    
    setSuccess(`解析成功！共 ${lines.length} 条台词，${speakers.size} 个角色`);
    setActiveTab("assign");
  };

  // 更新音色映射
  const handleVoiceMappingChange = (speaker: string, voiceId: string) => {
    setVoiceMapping(prev => ({ ...prev, [speaker]: voiceId }));
  };

  // 生成语音
  const handleGenerate = async () => {
    if (!parsedScript || parsedScript.lines.length === 0) {
      setError("请先解析剧本");
      return;
    }

    // 检查所有角色是否已分配音色
    const unassigned = parsedScript.speakers.filter(s => !voiceMapping[s]);
    if (unassigned.length > 0) {
      setError(`以下角色未分配音色：${unassigned.join("、")}`);
      return;
    }

    setIsGenerating(true);
    setError(null);
    setProgress(0);
    setAudioUrl(null);

    try {
      const response = await fetch(`${TTS_SERVER_URL}/api/synthesize-script`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: parsedScript.lines,
          voice_mapping: voiceMapping,
          language: "zh-cn",
          gap_ms: 500,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "生成失败");
      }

      const data = await response.json();
      setAudioUrl(`${TTS_SERVER_URL}${data.audio_url}`);
      setProgress(100);
      setSuccess(`语音生成成功！共 ${data.total_lines} 条台词`);
      setActiveTab("result");
    } catch (err: unknown) {
      setError(`生成失败: ${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // 播放/暂停音频
  const togglePlay = () => {
    if (!audioRef.current) return;
    
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  // 下载音频
  const handleDownload = () => {
    if (!audioUrl) return;
    
    const link = document.createElement("a");
    link.href = audioUrl;
    link.download = `dubbed_audio_${Date.now()}.mp3`;
    link.click();
  };

  // 清除消息
  const clearMessages = () => {
    setError(null);
    setSuccess(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* 头部 */}
      <header className="border-b border-white/10 bg-black/20 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 p-2">
              <AudioWaveform className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">TTS 音色克隆工作室</h1>
              <p className="text-sm text-white/60">完全本地运行 · 自定义音色 · 智能配音</p>
            </div>
          </div>
        </div>
      </header>

      {/* 主内容 */}
      <main className="container mx-auto px-4 py-6">
        {/* 消息提示 */}
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-500/10 p-3 text-red-400 border border-red-500/20">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
            <Button variant="ghost" size="sm" onClick={clearMessages} className="ml-auto text-red-400 hover:text-red-300">
              关闭
            </Button>
          </div>
        )}
        
        {success && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-green-500/10 p-3 text-green-400 border border-green-500/20">
            <CheckCircle2 className="h-4 w-4" />
            <span>{success}</span>
            <Button variant="ghost" size="sm" onClick={clearMessages} className="ml-auto text-green-400 hover:text-green-300">
              关闭
            </Button>
          </div>
        )}

        {/* 工作流程标签页 */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 bg-white/5 border border-white/10">
            <TabsTrigger value="voices" className="data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-300">
              <Mic className="mr-2 h-4 w-4" />
              音色库
            </TabsTrigger>
            <TabsTrigger value="script" className="data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-300">
              <FileText className="mr-2 h-4 w-4" />
              剧本输入
            </TabsTrigger>
            <TabsTrigger value="assign" className="data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-300">
              <Users className="mr-2 h-4 w-4" />
              角色配置
            </TabsTrigger>
            <TabsTrigger value="result" className="data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-300">
              <Volume2 className="mr-2 h-4 w-4" />
              生成结果
            </TabsTrigger>
          </TabsList>

          {/* 音色库 */}
          <TabsContent value="voices" className="space-y-4">
            <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Mic className="h-5 w-5 text-purple-400" />
                  音色管理
                </CardTitle>
                <CardDescription className="text-white/60">
                  上传参考音频创建自定义音色，支持 MP3、WAV、OGG、M4A 格式
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* 上传区域 */}
                <div className="flex items-center gap-4">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".mp3,.wav,.ogg,.m4a,audio/*"
                    onChange={handleUploadVoice}
                    className="hidden"
                    id="voice-upload"
                  />
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="bg-purple-600 hover:bg-purple-700"
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        上传中...
                      </>
                    ) : (
                      <>
                        <Upload className="mr-2 h-4 w-4" />
                        上传音色
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={loadVoices}
                    className="border-white/20 text-white hover:bg-white/10"
                  >
                    刷新列表
                  </Button>
                </div>

                <Separator className="bg-white/10" />

                {/* 音色列表 */}
                <div className="space-y-3">
                  {voices.length === 0 ? (
                    <div className="text-center py-8 text-white/40">
                      <Mic className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>暂无音色，请上传参考音频创建音色</p>
                    </div>
                  ) : (
                    voices.map((voice) => (
                      <div
                        key={voice.id}
                        className="flex items-center justify-between rounded-lg bg-white/5 p-4 border border-white/10"
                      >
                        <div className="flex items-center gap-3">
                          <div className="rounded-full bg-purple-500/20 p-2">
                            <Mic className="h-4 w-4 text-purple-400" />
                          </div>
                          <div>
                            <h4 className="font-medium text-white">{voice.name}</h4>
                            <p className="text-sm text-white/40">
                              {voice.duration > 0 ? `${voice.duration}s` : "未知时长"} · {voice.id}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const audio = new Audio(`${TTS_SERVER_URL}/voices/${voice.id}.mp3`);
                              audio.play();
                            }}
                            className="text-white/60 hover:text-white hover:bg-white/10"
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteVoice(voice.id)}
                            className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 剧本输入 */}
          <TabsContent value="script" className="space-y-4">
            <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <FileText className="h-5 w-5 text-purple-400" />
                  剧本内容
                </CardTitle>
                <CardDescription className="text-white/60">
                  输入剧本内容，系统将自动识别角色和台词。支持以下格式：
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg bg-white/5 p-3 text-sm text-white/60 border border-white/10">
                  <p className="mb-2 font-medium text-white/80">支持的格式：</p>
                  <ul className="space-y-1">
                    <li><code className="text-purple-400">角色名：台词内容</code> - 中文冒号</li>
                    <li><code className="text-purple-400">角色名: 台词内容</code> - 英文冒号</li>
                    <li><code className="text-purple-400">[角色名] 台词内容</code> - 方括号</li>
                    <li><code className="text-purple-400">（角色名）台词内容</code> - 中文括号</li>
                  </ul>
                </div>
                
                <Textarea
                  placeholder="示例：
小明：今天天气真好啊！
小红：是啊，我们去公园散步吧。
[旁白] 两人相视一笑，走向远处的公园。"
                  value={script}
                  onChange={(e) => setScript(e.target.value)}
                  className="min-h-[300px] bg-white/5 border-white/10 text-white placeholder:text-white/30"
                />
                
                <div className="flex justify-end gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setScript("")}
                    className="border-white/20 text-white hover:bg-white/10"
                  >
                    清空
                  </Button>
                  <Button
                    onClick={handleParseScript}
                    className="bg-purple-600 hover:bg-purple-700"
                  >
                    <Sparkles className="mr-2 h-4 w-4" />
                    解析剧本
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 角色配置 */}
          <TabsContent value="assign" className="space-y-4">
            <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Users className="h-5 w-5 text-purple-400" />
                  角色音色分配
                </CardTitle>
                <CardDescription className="text-white/60">
                  为每个角色分配合适的音色
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!parsedScript ? (
                  <div className="text-center py-8 text-white/40">
                    <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>请先在「剧本输入」中解析剧本</p>
                  </div>
                ) : (
                  <>
                    {/* 角色列表 */}
                    <div className="space-y-3">
                      {parsedScript.speakers.map((speaker) => (
                        <div
                          key={speaker}
                          className="flex items-center justify-between rounded-lg bg-white/5 p-4 border border-white/10"
                        >
                          <div className="flex items-center gap-3">
                            <div className="rounded-full bg-gradient-to-r from-purple-500 to-pink-500 p-2">
                              <span className="text-sm font-bold text-white">
                                {speaker.charAt(0)}
                              </span>
                            </div>
                            <div>
                              <h4 className="font-medium text-white">{speaker}</h4>
                              <p className="text-sm text-white/40">
                                {parsedScript.lines.filter(l => l.speaker === speaker).length} 条台词
                              </p>
                            </div>
                          </div>
                          <Select
                            value={voiceMapping[speaker] || ""}
                            onValueChange={(value) => handleVoiceMappingChange(speaker, value)}
                          >
                            <SelectTrigger className="w-48 bg-white/5 border-white/10 text-white">
                              <SelectValue placeholder="选择音色" />
                            </SelectTrigger>
                            <SelectContent>
                              {voices.map((voice) => (
                                <SelectItem key={voice.id} value={voice.id}>
                                  {voice.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>

                    {/* 台词预览 */}
                    <Separator className="bg-white/10" />
                    
                    <div>
                      <h4 className="mb-3 font-medium text-white">台词预览</h4>
                      <ScrollArea className="h-[200px] rounded-lg bg-white/5 p-4 border border-white/10">
                        <div className="space-y-2">
                          {parsedScript.lines.map((line, index) => (
                            <div key={index} className="flex gap-2">
                              <Badge variant="outline" className="border-purple-500/30 text-purple-300 shrink-0">
                                {line.speaker}
                              </Badge>
                              <span className="text-white/80">{line.text}</span>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>

                    {/* 生成按钮 */}
                    <div className="flex justify-end pt-4">
                      <Button
                        onClick={handleGenerate}
                        disabled={isGenerating || voices.length === 0}
                        className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                      >
                        {isGenerating ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            正在生成...
                          </>
                        ) : (
                          <>
                            <Sparkles className="mr-2 h-4 w-4" />
                            开始生成语音
                          </>
                        )}
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* 生成结果 */}
          <TabsContent value="result" className="space-y-4">
            <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Volume2 className="h-5 w-5 text-purple-400" />
                  生成结果
                </CardTitle>
                <CardDescription className="text-white/60">
                  试听并下载生成的音频
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!audioUrl ? (
                  <div className="text-center py-8 text-white/40">
                    <Volume2 className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>尚未生成音频，请先完成角色配置并生成</p>
                  </div>
                ) : (
                  <>
                    {/* 播放器 */}
                    <div className="rounded-xl bg-gradient-to-r from-purple-500/20 to-pink-500/20 p-6 border border-purple-500/20">
                      <div className="flex items-center justify-center gap-4">
                        <Button
                          onClick={togglePlay}
                          size="lg"
                          className="h-16 w-16 rounded-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                        >
                          {isPlaying ? (
                            <Pause className="h-6 w-6" />
                          ) : (
                            <Play className="h-6 w-6 ml-1" />
                          )}
                        </Button>
                        
                        <div className="flex-1">
                          <div className="h-2 rounded-full bg-white/10">
                            <div 
                              className="h-full rounded-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all"
                              style={{ width: "0%" }}
                            />
                          </div>
                          <div className="mt-2 flex justify-between text-sm text-white/40">
                            <span>0:00</span>
                            <span>--:--</span>
                          </div>
                        </div>
                      </div>
                      
                      <audio
                        ref={audioRef}
                        src={audioUrl}
                        onEnded={() => setIsPlaying(false)}
                        onPlay={() => setIsPlaying(true)}
                        onPause={() => setIsPlaying(false)}
                      />
                    </div>

                    {/* 操作按钮 */}
                    <div className="flex justify-center gap-3">
                      <Button
                        onClick={handleDownload}
                        variant="outline"
                        className="border-white/20 text-white hover:bg-white/10"
                      >
                        <Download className="mr-2 h-4 w-4" />
                        下载音频
                      </Button>
                      <Button
                        onClick={() => {
                          setAudioUrl(null);
                          setActiveTab("script");
                        }}
                        variant="outline"
                        className="border-white/20 text-white hover:bg-white/10"
                      >
                        重新生成
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* 使用说明 */}
        <Card className="mt-6 bg-white/5 border-white/10 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-white text-lg flex items-center gap-2">
              <Settings className="h-5 w-5 text-purple-400" />
              使用说明
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-6 text-sm text-white/60">
              <div>
                <h4 className="font-medium text-white mb-2">1. 启动后端服务</h4>
                <pre className="rounded-lg bg-black/30 p-3 overflow-x-auto">
{`cd tts-server
pip install -r requirements.txt
python main.py`}
                </pre>
                <p className="mt-2 text-white/40">首次运行会下载约 2GB 的模型文件</p>
              </div>
              <div>
                <h4 className="font-medium text-white mb-2">2. 上传音色</h4>
                <p>上传一段清晰的参考音频（建议 10-30 秒）作为音色模板。音频越清晰，克隆效果越好。</p>
              </div>
              <div>
                <h4 className="font-medium text-white mb-2">3. 输入剧本</h4>
                <p>按格式输入剧本，系统会自动识别角色和台词。支持多种剧本格式。</p>
              </div>
              <div>
                <h4 className="font-medium text-white mb-2">4. 生成语音</h4>
                <p>为每个角色分配音色后，点击生成。系统会逐句合成并自动合并为完整音频。</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
