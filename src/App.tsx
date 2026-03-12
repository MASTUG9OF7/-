import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { 
  Sparkles, 
  BookOpen, 
  UserRound, 
  ArrowRight, 
  RotateCcw, 
  CheckCircle2, 
  Flame,
  Heart,
  Zap,
  ChevronRight,
  Loader2,
  FileText,
  Download,
  Share2,
  RefreshCw,
  Edit3,
  Save,
  X,
  Settings,
  Key,
  Eye,
  EyeOff,
  ExternalLink,
  Palette
} from 'lucide-react';
import { NarrativeModel, StoryOutline, GenerationState, LanguageStyle } from './types';
import { generateStoryOutline, generateActSegmentStream, generateTriggers } from './services/ai';

const INITIAL_TRIGGERS = {
  A: [
    "发现丈夫出轨三十年，私生子都成家了",
    "车祸住院，全家人只关心赔偿款没人看护",
    "重生回到分家产那天，我决定一分不给",
    "当了一辈子保姆，婆婆临终前说我只是个外人"
  ],
  B: [
    "被亲家当众羞辱是乡下土包子，其实我是京城首富",
    "在儿媳婚礼上被要求去后厨洗碗，其实酒店是我的",
    "被拜金女儿嫌弃穷酸，其实我是退隐多年的商界大佬",
    "老伴被富二代撞了还被扇耳光，我一个电话叫来直升机"
  ]
};

const LANGUAGE_STYLES: { id: LanguageStyle; title: string; desc: string }[] = [
  { id: 'colloquial', title: '接地气爽文', desc: '口语化、节奏快、打脸狠' },
  { id: 'elegant', title: '优雅知性', desc: '文字优美、从容淡定、富有哲理' },
  { id: 'humorous', title: '幽默讽刺', desc: '辛辣吐槽、反讽、笑中带爽' },
  { id: 'delicate', title: '情感细腻', desc: '内心蜕变、感人至深、文字细腻' }
];

export default function App() {
  const [state, setState] = useState<GenerationState>({
    model: null,
    languageStyle: 'colloquial',
    triggerEvent: '',
    isGenerating: false,
    isGeneratingStory: false,
    currentGeneratingStep: null,
    outline: null,
    fullStory: null,
    error: null
  });

  const [currentTriggers, setCurrentTriggers] = useState<string[]>([]);
  const [isRefreshingTriggers, setIsRefreshingTriggers] = useState(false);
  const [isEditingOutline, setIsEditingOutline] = useState(false);
  const [editedOutline, setEditedOutline] = useState<StoryOutline | null>(null);
  const [customApiKey, setCustomApiKey] = useState<string>(() => localStorage.getItem('custom_gemini_api_key') || '');
  const [showApiKey, setShowApiKey] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const stopGenerationRef = React.useRef(false);

  useEffect(() => {
    localStorage.setItem('custom_gemini_api_key', customApiKey);
  }, [customApiKey]);

  useEffect(() => {
    if (state.model) {
      setCurrentTriggers(INITIAL_TRIGGERS[state.model]);
    }
  }, [state.model]);

  const handleRefreshTriggers = async () => {
    if (!state.model) return;
    setIsRefreshingTriggers(true);
    try {
      const newTriggers = await generateTriggers(state.model, customApiKey);
      setCurrentTriggers(newTriggers);
    } catch (err) {
      console.error("Failed to refresh triggers", err);
    } finally {
      setIsRefreshingTriggers(false);
    }
  };

  const handleStartGeneration = async () => {
    if (!state.model || !state.triggerEvent) return;

    setState(prev => ({ ...prev, isGenerating: true, error: null, outline: null, fullStory: null }));
    try {
      const outline = await generateStoryOutline(state.model, state.triggerEvent, customApiKey);
      setState(prev => ({ ...prev, outline, isGenerating: false }));
      setEditedOutline(outline);
    } catch (err) {
      setState(prev => ({ 
        ...prev, 
        isGenerating: false, 
        error: err instanceof Error ? err.message : '生成失败，请稍后重试' 
      }));
    }
  };

  const handleGenerateStory = async () => {
    const outlineToUse = editedOutline || state.outline;
    if (!outlineToUse) return;

    stopGenerationRef.current = false;
    setState(prev => ({ 
      ...prev, 
      isGeneratingStory: true, 
      currentGeneratingStep: "准备中...",
      error: null,
      fullStory: null
    }));

    let accumulatedStory = "";
    const acts: (1 | 2 | 3)[] = [1, 2, 3];
    const segmentsPerAct = [3, 4, 3]; // Total 10 segments

    try {
      for (let i = 0; i < acts.length; i++) {
        const actNum = acts[i];
        const segmentsCount = segmentsPerAct[i];
        
        for (let s = 0; s < segmentsCount; s++) {
          if (stopGenerationRef.current) break;

          const stepLabel = `第 ${actNum} 幕 (${s + 1}/${segmentsCount})`;
          setState(prev => ({ ...prev, currentGeneratingStep: stepLabel }));
          
          const context = accumulatedStory.slice(-2500); 
          const stream = generateActSegmentStream(
            outlineToUse, 
            actNum, 
            s,
            segmentsCount,
            state.languageStyle,
            context,
            customApiKey
          );
          
          if (s === 0) {
            const actTitle = actNum === 1 ? outlineToUse.act1.title : actNum === 2 ? outlineToUse.act2.title : outlineToUse.act3.title;
            const header = `\n\n# 第 ${actNum} 幕：${actTitle}\n\n`;
            accumulatedStory += header;
            setState(prev => ({ ...prev, fullStory: accumulatedStory }));
          }
          
          let segmentText = "";
          for await (const chunk of stream) {
            if (stopGenerationRef.current) break;
            segmentText += chunk;
            setState(prev => ({ ...prev, fullStory: accumulatedStory + segmentText }));
          }
          
          accumulatedStory += segmentText + "\n\n";
          setState(prev => ({ ...prev, fullStory: accumulatedStory }));
        }
        if (stopGenerationRef.current) break;
      }
      
      setState(prev => ({ ...prev, isGeneratingStory: false, currentGeneratingStep: null }));
    } catch (err) {
      setState(prev => ({ 
        ...prev, 
        isGeneratingStory: false, 
        currentGeneratingStep: null,
        error: err instanceof Error ? err.message : '生成故事失败，请稍后重试' 
      }));
    }
  };

  const handleDownloadTxt = () => {
    if (!state.fullStory) return;
    const content = `# ${state.outline?.title}\n\n情感内核：${state.outline?.emotionalCore}\n\n${state.fullStory}`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${state.outline?.title || '故事全文'}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSaveOutline = () => {
    if (editedOutline) {
      setState(prev => ({ ...prev, outline: editedOutline }));
    }
    setIsEditingOutline(false);
  };

  const reset = () => {
    setState({
      model: null,
      languageStyle: 'colloquial',
      triggerEvent: '',
      isGenerating: false,
      isGeneratingStory: false,
      currentGeneratingStep: null,
      outline: null,
      fullStory: null,
      error: null
    });
    setEditedOutline(null);
    setIsEditingOutline(false);
  };

  return (
    <div className="min-h-screen bg-[#FDF8F3] text-[#4A3F35] font-sans selection:bg-[#E67E22]/20">
      {/* Header */}
      <header className="bg-white border-b border-[#EEDDCC] py-6 px-4 sticky top-0 z-10 shadow-sm">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-[#E67E22] p-2 rounded-xl shadow-lg shadow-[#E67E22]/20">
              <Sparkles className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[#2C241E]">银发爽文生成器</h1>
              <p className="text-xs text-[#8B7E74] font-medium uppercase tracking-widest">Silver Hair Story Engine v1.0</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSettingsOpen(!isSettingsOpen)}
              className={`p-2 rounded-full transition-all ${isSettingsOpen ? 'bg-[#E67E22] text-white' : 'text-[#8B7E74] hover:bg-[#E67E22]/10'}`}
              title="API 设置"
            >
              <Settings size={20} />
            </button>
            {(state.outline || state.fullStory) && (
              <button 
                onClick={reset}
                className="flex items-center gap-2 text-sm font-semibold text-[#E67E22] hover:bg-[#E67E22]/10 px-4 py-2 rounded-full transition-all"
              >
                <RotateCcw size={16} />
                重新开始
              </button>
            )}
          </div>
        </div>

        {/* API Settings Panel */}
        <AnimatePresence>
          {isSettingsOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="max-w-4xl mx-auto overflow-hidden"
            >
              <div className="mt-4 p-6 bg-[#FDF8F3] rounded-2xl border-2 border-[#E67E22]/20 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Key className="text-[#E67E22]" size={18} />
                    <h3 className="font-bold">自定义 Gemini API Key</h3>
                  </div>
                  <a 
                    href="https://aistudio.google.com/app/apikey" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-xs text-[#E67E22] flex items-center gap-1 hover:underline"
                  >
                    获取 API Key <ExternalLink size={12} />
                  </a>
                </div>
                <p className="text-xs text-[#8B7E74]">
                  如果您有自己的 API Key，可以在此处填入。系统将优先使用您的 Key 进行生成，以避免公共配额限制。Key 将保存在您的浏览器本地。
                </p>
                <div className="relative">
                  <input
                    type={showApiKey ? "text" : "password"}
                    value={customApiKey}
                    onChange={(e) => setCustomApiKey(e.target.value)}
                    placeholder="在此输入您的 Gemini API Key..."
                    className="w-full pl-4 pr-12 py-3 rounded-xl border-2 border-[#EEDDCC] focus:border-[#E67E22] outline-none transition-all text-sm font-mono"
                  />
                  <button
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8B7E74] hover:text-[#E67E22]"
                  >
                    {showApiKey ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {customApiKey && (
                  <div className="flex items-center gap-2 text-[10px] text-green-600 font-bold">
                    <CheckCircle2 size={12} />
                    已启用自定义 API Key
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <main className="max-w-4xl mx-auto p-6 pb-24">
        <AnimatePresence mode="wait">
          {!state.outline && !state.fullStory ? (
            <motion.div 
              key="setup"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-12"
            >
              {/* Step 1: Choose Model */}
              <section>
                <div className="flex items-center gap-2 mb-6">
                  <div className="w-8 h-8 rounded-full bg-[#2C241E] text-white flex items-center justify-center text-sm font-bold">1</div>
                  <h2 className="text-xl font-bold">选择故事模型</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { id: 'A', title: '觉醒复仇', desc: '长期奉献的主角觉醒，让旧家庭追悔莫及', icon: <Zap className="text-amber-500" /> },
                    { id: 'B', title: '身份错位', desc: '隐藏大佬身份揭晓，当众打脸逆袭', icon: <Flame className="text-red-500" /> }
                  ].map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setState(prev => ({ ...prev, model: m.id as NarrativeModel }))}
                      className={`p-6 rounded-2xl border-2 text-left transition-all relative overflow-hidden group ${
                        state.model === m.id 
                          ? 'border-[#E67E22] bg-white shadow-xl shadow-[#E67E22]/10' 
                          : 'border-[#EEDDCC] bg-white/50 hover:border-[#E67E22]/50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="p-2 rounded-lg bg-[#FDF8F3] group-hover:scale-110 transition-transform">
                          {m.icon}
                        </div>
                        {state.model === m.id && <CheckCircle2 className="text-[#E67E22]" size={24} />}
                      </div>
                      <h3 className="text-lg font-bold mb-1">{m.title}</h3>
                      <p className="text-sm text-[#8B7E74] leading-relaxed">{m.desc}</p>
                    </button>
                  ))}
                </div>
              </section>

              {/* Step 2: Input Trigger */}
              <section className={!state.model ? 'opacity-30 pointer-events-none' : ''}>
                <div className="flex items-center gap-2 mb-6">
                  <div className="w-8 h-8 rounded-full bg-[#2C241E] text-white flex items-center justify-center text-sm font-bold">2</div>
                  <h2 className="text-xl font-bold">设定导火索事件</h2>
                </div>
                <div className="space-y-4">
                  <div className="relative">
                    <textarea
                      value={state.triggerEvent}
                      onChange={(e) => setState(prev => ({ ...prev, triggerEvent: e.target.value }))}
                      placeholder="输入一个让主角彻底爆发或身份暴露的瞬间..."
                      className="w-full p-5 rounded-2xl border-2 border-[#EEDDCC] bg-white focus:border-[#E67E22] focus:ring-4 focus:ring-[#E67E22]/5 outline-none transition-all min-h-[120px] text-lg"
                    />
                  </div>
                  
                  {state.model && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold text-[#8B7E74] uppercase tracking-widest">灵感推荐</p>
                        <button 
                          onClick={handleRefreshTriggers}
                          disabled={isRefreshingTriggers}
                          className="flex items-center gap-1 text-xs font-bold text-[#E67E22] hover:opacity-80 transition-all disabled:opacity-50"
                        >
                          <RefreshCw size={12} className={isRefreshingTriggers ? 'animate-spin' : ''} />
                          {isRefreshingTriggers ? '正在寻找灵感...' : '换一批灵感'}
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {currentTriggers.map((t, i) => (
                          <button
                            key={i}
                            onClick={() => setState(prev => ({ ...prev, triggerEvent: t }))}
                            className={`text-xs font-medium px-4 py-2 rounded-full border transition-all ${
                              state.triggerEvent === t
                                ? 'bg-[#E67E22] border-[#E67E22] text-white shadow-md'
                                : 'bg-white border-[#EEDDCC] hover:border-[#E67E22] hover:text-[#E67E22]'
                            }`}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </section>

              {/* Generate Button */}
              <div className="pt-8">
                <button
                  disabled={!state.model || !state.triggerEvent || state.isGenerating}
                  onClick={handleStartGeneration}
                  className={`w-full py-5 rounded-2xl font-bold text-xl flex items-center justify-center gap-3 transition-all shadow-lg ${
                    !state.model || !state.triggerEvent || state.isGenerating
                      ? 'bg-[#EEDDCC] text-[#8B7E74] cursor-not-allowed'
                      : 'bg-[#E67E22] text-white hover:bg-[#D35400] active:scale-[0.98] shadow-[#E67E22]/30'
                  }`}
                >
                  {state.isGenerating ? (
                    <>
                      <Loader2 className="animate-spin" />
                      正在构思爽点...
                    </>
                  ) : (
                    <>
                      <Zap size={24} />
                      生成万字长篇大纲
                    </>
                  )}
                </button>
                {state.error && (
                  <p className="text-red-500 text-center mt-4 font-medium">{state.error}</p>
                )}
              </div>
            </motion.div>
          ) : state.fullStory ? (
            <motion.div 
              key="fullStory"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8"
            >
              <div className="bg-white p-8 md:p-12 rounded-3xl shadow-xl border border-[#EEDDCC] relative">
                {state.isGeneratingStory && (
                  <div className="sticky top-24 z-20 mb-8 bg-white/90 backdrop-blur-md p-4 rounded-2xl border border-[#E67E22]/20 shadow-lg">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-[#E67E22]" />
                        <span className="text-sm font-bold text-[#E67E22]">
                          正在生成：{state.currentGeneratingStep}
                        </span>
                      </div>
                      <button 
                        onClick={() => stopGenerationRef.current = true}
                        className="text-xs font-bold text-red-500 hover:bg-red-50 px-3 py-1 rounded-full transition-all"
                      >
                        停止生成
                      </button>
                    </div>
                    <p className="text-[10px] text-[#8B7E74] mt-2 text-center">万字长篇生成中，请保持页面开启...</p>
                  </div>
                )}

                <div className="max-w-2xl mx-auto">
                  <h2 className="text-3xl font-black text-[#2C241E] mb-8 text-center">《{state.outline?.title}》</h2>
                  <div className="prose prose-lg prose-stone max-w-none text-[#4A3F35] leading-relaxed">
                    <ReactMarkdown>{state.fullStory}</ReactMarkdown>
                  </div>
                </div>
                
                <div className="mt-12 pt-8 border-t border-[#EEDDCC] flex flex-col md:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-2 text-[#E67E22] font-bold">
                    {state.isGeneratingStory ? (
                      <><RefreshCw size={20} className="animate-spin" /> 正在努力创作中...</>
                    ) : (
                      <><CheckCircle2 size={20} /> 故事创作完成</>
                    )}
                  </div>
                  <div className="flex gap-3">
                    <button 
                      onClick={handleDownloadTxt}
                      disabled={state.isGeneratingStory && !state.fullStory}
                      className="flex items-center gap-2 px-6 py-3 rounded-full bg-[#2C241E] text-white font-bold hover:bg-black transition-all disabled:opacity-50"
                    >
                      <Download size={18} />
                      下载 TXT
                    </button>
                    {!state.isGeneratingStory && (
                      <button 
                        onClick={reset}
                        className="flex items-center gap-2 px-6 py-3 rounded-full border-2 border-[#EEDDCC] font-bold hover:bg-[#FDF8F3] transition-all"
                      >
                        再写一篇
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="outline"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-8"
            >
              {/* Story Header */}
              <div className="bg-white p-8 rounded-3xl shadow-xl border border-[#EEDDCC] relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                  <BookOpen size={120} />
                </div>
                <div className="relative z-10">
                  <div className="flex justify-between items-start mb-4">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#E67E22]/10 text-[#E67E22] text-xs font-bold">
                      <Heart size={14} />
                      情感内核：
                      {isEditingOutline ? (
                        <input 
                          type="text" 
                          value={editedOutline?.emotionalCore || ''} 
                          onChange={(e) => setEditedOutline(prev => prev ? { ...prev, emotionalCore: e.target.value } : null)}
                          className="bg-white border border-[#EEDDCC] rounded px-2 py-0.5 outline-none focus:border-[#E67E22] ml-1"
                        />
                      ) : (
                        state.outline?.emotionalCore
                      )}
                    </div>
                    <button 
                      onClick={() => {
                        if (isEditingOutline) {
                          handleSaveOutline();
                        } else {
                          setEditedOutline(state.outline);
                          setIsEditingOutline(true);
                        }
                      }}
                      className="flex items-center gap-2 text-sm font-bold text-[#E67E22] hover:bg-[#E67E22]/10 px-3 py-1.5 rounded-full transition-all"
                    >
                      {isEditingOutline ? <><Save size={16} /> 保存修改</> : <><Edit3 size={16} /> 修改大纲</>}
                    </button>
                  </div>
                  
                  {isEditingOutline ? (
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-4xl font-black text-[#2C241E]">《</span>
                      <input 
                        type="text" 
                        value={editedOutline?.title || ''} 
                        onChange={(e) => setEditedOutline(prev => prev ? { ...prev, title: e.target.value } : null)}
                        className="text-4xl font-black text-[#2C241E] bg-white border-b-2 border-[#EEDDCC] focus:border-[#E67E22] outline-none w-full"
                      />
                      <span className="text-4xl font-black text-[#2C241E]">》</span>
                    </div>
                  ) : (
                    <h2 className="text-4xl font-black text-[#2C241E] mb-2 leading-tight">《{state.outline?.title}》</h2>
                  )}
                  <p className="text-[#8B7E74] font-medium italic">—— 一部让千万中老年女性热血沸腾的爽文神作</p>
                </div>
              </div>

              {/* Acts */}
              <div className="space-y-6">
                {[
                  { actKey: 'act1' as const, num: '壹', label: '破局', color: 'bg-blue-500' },
                  { actKey: 'act2' as const, num: '贰', label: '升级', color: 'bg-amber-500' },
                  { actKey: 'act3' as const, num: '叁', label: '爆点', color: 'bg-red-500' }
                ].map((item, idx) => {
                  const act = isEditingOutline ? editedOutline?.[item.actKey] : state.outline?.[item.actKey];
                  return (
                    <motion.div 
                      key={idx}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.1 }}
                      className="bg-white rounded-3xl shadow-md border border-[#EEDDCC] overflow-hidden"
                    >
                      <div className="flex items-stretch">
                        <div className={`w-16 ${item.color} flex flex-col items-center justify-center text-white font-black text-xl py-8`}>
                          <span className="writing-mode-vertical">{item.num}</span>
                          <div className="h-4 w-px bg-white/30 my-2" />
                          <span className="text-xs uppercase tracking-tighter opacity-80">{item.label}</span>
                        </div>
                        <div className="flex-1 p-8">
                          <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                            {isEditingOutline ? (
                              <input 
                                type="text" 
                                value={act?.title || ''} 
                                onChange={(e) => {
                                  if (!editedOutline) return;
                                  const newAct = { ...editedOutline[item.actKey], title: e.target.value };
                                  setEditedOutline({ ...editedOutline, [item.actKey]: newAct });
                                }}
                                className="bg-white border-b border-[#EEDDCC] focus:border-[#E67E22] outline-none w-full font-bold"
                              />
                            ) : (
                              act?.title
                            )}
                            <ChevronRight size={18} className="text-[#EEDDCC]" />
                          </h3>
                          
                          {isEditingOutline ? (
                            <textarea 
                              value={act?.outline || ''} 
                              onChange={(e) => {
                                if (!editedOutline) return;
                                const newAct = { ...editedOutline[item.actKey], outline: e.target.value };
                                setEditedOutline({ ...editedOutline, [item.actKey]: newAct });
                              }}
                              className="w-full p-3 rounded-xl border border-[#EEDDCC] focus:border-[#E67E22] outline-none text-[#4A3F35] leading-relaxed text-sm min-h-[100px]"
                            />
                          ) : (
                            <p className="text-[#4A3F35] leading-relaxed text-sm">
                              {act?.outline}
                            </p>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {/* Ending */}
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="bg-[#2C241E] text-white p-8 rounded-3xl shadow-2xl relative overflow-hidden"
              >
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-500 via-red-500 to-amber-500" />
                <h3 className="text-2xl font-bold mb-4 flex items-center gap-2">
                  <Sparkles className="text-amber-400" />
                  终极爽点与结局
                </h3>
                {isEditingOutline ? (
                  <textarea 
                    value={editedOutline?.ending || ''} 
                    onChange={(e) => setEditedOutline(prev => prev ? { ...prev, ending: e.target.value } : null)}
                    className="w-full p-4 rounded-2xl bg-white/10 border border-white/20 focus:border-amber-400 outline-none text-amber-50/90 leading-relaxed text-lg italic min-h-[100px]"
                  />
                ) : (
                  <p className="text-amber-50/90 leading-relaxed text-lg italic">
                    “{state.outline?.ending}”
                  </p>
                )}
                <div className="mt-8 pt-6 border-t border-white/10 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-amber-400 text-sm font-bold">
                    <UserRound size={16} />
                    晚年新生 · 价值重塑
                  </div>
                  <div className="flex gap-2">
                    {isEditingOutline && (
                      <button 
                        onClick={() => setIsEditingOutline(false)}
                        className="text-xs bg-white/5 hover:bg-white/10 px-4 py-2 rounded-full transition-all"
                      >
                        取消
                      </button>
                    )}
                    <button 
                      onClick={() => window.print()}
                      className="text-xs bg-white/10 hover:bg-white/20 px-4 py-2 rounded-full transition-all"
                    >
                      保存大纲
                    </button>
                  </div>
                </div>
              </motion.div>

              {/* Generate Full Story Button */}
              <div className="pt-4 space-y-6">
                {/* Language Style Selection */}
                <div className="bg-white p-6 rounded-3xl shadow-md border border-[#EEDDCC]">
                  <div className="flex items-center gap-2 mb-4">
                    <Palette className="text-[#E67E22]" size={20} />
                    <h3 className="text-lg font-bold">选择全文语言风格</h3>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {LANGUAGE_STYLES.map((style) => (
                      <button
                        key={style.id}
                        onClick={() => setState(prev => ({ ...prev, languageStyle: style.id }))}
                        className={`p-3 rounded-xl border-2 text-left transition-all ${
                          state.languageStyle === style.id
                            ? 'border-[#E67E22] bg-[#FDF8F3] shadow-sm'
                            : 'border-[#EEDDCC] bg-white hover:border-[#E67E22]/50'
                        }`}
                      >
                        <p className={`text-sm font-bold mb-0.5 ${state.languageStyle === style.id ? 'text-[#E67E22]' : ''}`}>
                          {style.title}
                        </p>
                        <p className="text-[10px] text-[#8B7E74] leading-tight">{style.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  disabled={state.isGeneratingStory || isEditingOutline}
                  onClick={handleGenerateStory}
                  className={`w-full py-6 rounded-3xl font-bold text-xl flex items-center justify-center gap-3 transition-all shadow-xl ${
                    state.isGeneratingStory || isEditingOutline
                      ? 'bg-[#EEDDCC] text-[#8B7E74] cursor-not-allowed'
                      : 'bg-[#2C241E] text-white hover:bg-black shadow-black/20'
                  }`}
                >
                  {state.isGeneratingStory ? (
                    <>
                      <Loader2 className="animate-spin" />
                      正在撰写：{state.currentGeneratingStep}...
                    </>
                  ) : isEditingOutline ? (
                    <>
                      <Loader2 className="animate-pulse" />
                      请先保存大纲修改
                    </>
                  ) : (
                    <>
                      <FileText size={24} />
                      基于此大纲生成万字全文
                    </>
                  )}
                </button>
                {state.error && (
                  <p className="text-red-500 text-center mt-4 font-medium">{state.error}</p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer Info */}
      <footer className="max-w-4xl mx-auto px-6 py-12 text-center border-t border-[#EEDDCC]">
        <p className="text-sm text-[#8B7E74]">
          基于 BNU-Dachuang 项目核心知识库 V1.0 构建
        </p>
        <div className="flex justify-center gap-4 mt-4 opacity-50">
          <Heart size={16} />
          <Zap size={16} />
          <Flame size={16} />
        </div>
      </footer>
    </div>
  );
}
