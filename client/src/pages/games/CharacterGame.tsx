import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Volume2, Star, RotateCcw, Settings } from "lucide-react";
import ListeningGame from "./ListeningGame";

// 音效URLs
const SOUND_CORRECT = "/sounds/correct.mp3";
const SOUND_WRONG = "/sounds/wrong.mp3";
const SOUND_WIN = "/sounds/win.mp3";

// 语音播报设置类型
type VoiceSettings = "off" | "once" | "twice" | "thrice";

interface GameQuestion {
  id: number;
  character: string;
  pinyin: string;
  imageUrl: string;
  options: string[]; // 4个选项
}

export default function CharacterGame() {
  // 从 URL 读取模式参数
  const urlParams = new URLSearchParams(window.location.search);
  const modeParam = urlParams.get('mode') as 'picture' | 'flashcard' | null;
  
  // 根据URL路径自动选择游戏模式
  const pathname = window.location.pathname;
  let initialMode: 'select' | 'picture' | 'flashcard' | 'listening' = 'select';
  if (pathname.includes('/games/character') && !pathname.includes('flashcard')) {
    initialMode = 'picture'; // /games/character -> 看图识字
  } else if (pathname.includes('/games/flashcard')) {
    initialMode = 'flashcard'; // /games/flashcard -> 快闪识字
  } else if (modeParam) {
    initialMode = modeParam;
  }
  
  // 游戏状态
  const [gameMode, setGameMode] = useState<'select' | 'picture' | 'flashcard' | 'listening'>(initialMode); // select=选择模式, picture=看图识字, flashcard=快闪识字, listening=听音辨字
  const [gameStarted, setGameStarted] = useState(false);
  const [questionCount, setQuestionCount] = useState(10);
  const [category, setCategory] = useState<string | undefined>(undefined);
  const [difficulty, setDifficulty] = useState<number | undefined>(undefined);
  const [reviewMode, setReviewMode] = useState(false); // 错题复习模式
  
  // 题目和答案
  const [questions, setQuestions] = useState<GameQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [score, setScore] = useState(0);
  const [timer, setTimer] = useState(0);
  
  // 语音播报设置
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>("once");
  const [isPlaying, setIsPlaying] = useState(false);
  
  // 快闪识字状态
  const [flashcardCharacters, setFlashcardCharacters] = useState<any[]>([]); // 待学习的汉字列表
  const [currentFlashcard, setCurrentFlashcard] = useState<any | null>(null); // 当前显示的汉字
  const [flashcardRecords, setFlashcardRecords] = useState<Map<number, { knownCount: number, forgottenCount: number }>>(new Map()); // 记录统计
  const [knownCharacters, setKnownCharacters] = useState<Set<number>>(new Set()); // 已认识的汉字ID
  
  // 听音辨字状态
  const [listeningDifficulty, setListeningDifficulty] = useState<2 | 4 | 9 | 16>(4); // 难度：2选1/4选1/9选1/16选1
  const [listeningVoiceMode, setListeningVoiceMode] = useState<'single' | 'hint'>('hint'); // 语音模式：单字/带提示
  const [listeningQuestions, setListeningQuestions] = useState<any[]>([]); // 题目列表
  const [listeningCurrentIndex, setListeningCurrentIndex] = useState(0); // 当前题目索引
  const [listeningScore, setListeningScore] = useState(0); // 得分
  
  // 获取随机汉字
  const { data: characters, refetch } = trpc.character.getRandomCharacters.useQuery(
    { count: questionCount, category, difficulty },
    { enabled: false }
  );
  
  // 获取错题列表
  const { data: wrongQuestions, refetch: refetchWrongQuestions } = trpc.wrongQuestions.list.useQuery(
    {
      kidId: parseInt(localStorage.getItem('selectedKidId') || '0', 10),
      gameType: 'character',
    },
    { enabled: false }
  );
  
  // 标记已复习
  const markReviewed = trpc.wrongQuestions.markReviewed.useMutation();
  
  // 快闪识字API
  const recordKnown = trpc.character.recordKnown.useMutation();
  const recordForgotten = trpc.character.recordForgotten.useMutation();
  const { data: allFlashcardRecords } = trpc.character.getAllFlashcardRecords.useQuery(
    { kidId: parseInt(localStorage.getItem('selectedKidId') || '0', 10) },
    { enabled: gameMode === 'flashcard' }
  );
  
  // 计时器
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (gameStarted && currentIndex < questions.length) {
      interval = setInterval(() => {
        setTimer((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [gameStarted, currentIndex, questions.length]);
  
  // 开始游戏
  const startGame = async () => {
    // 错题复习模式
    if (reviewMode) {
      const wrongResult = await refetchWrongQuestions();
      if (!wrongResult.data || wrongResult.data.length === 0) {
        alert('🎉 太棒了！你还没有看图识字的错题，或者已经全部复习完成了！');
        return;
      }
      
      // 从错题中提取汉字ID
      const wrongCharacterIds = wrongResult.data.map(q => {
        try {
          const data = JSON.parse(q.questionData);
          return data.characterId;
        } catch {
          return null;
        }
      }).filter(id => id !== null);
      
      // 获取错题对应的汉字
      const utils = trpc.useUtils();
      const allCharacters = await utils.character.getAll.fetch({ limit: 1000 });
      const wrongCharacters = allCharacters.filter((c: any) => wrongCharacterIds.includes(c.id));
      
      if (wrongCharacters.length === 0) {
        alert('错题数据加载失败，请重试');
        return;
      }
      
      // 生成错题复习题目
      const reviewQuestions: GameQuestion[] = wrongCharacters.slice(0, Math.min(questionCount, wrongCharacters.length)).map((char: any) => {
        // 生成3个干扰项
        const wrongOptions = allCharacters
          .filter((c: any) => c.id !== char.id)
          .sort(() => Math.random() - 0.5)
          .slice(0, 3)
          .map((c: any) => c.character);
        
        // 混合正确答案和干扰项
        const options = [char.character, ...wrongOptions].sort(() => Math.random() - 0.5);
        
        return {
          id: char.id,
          character: char.character,
          pinyin: char.pinyin,
          imageUrl: char.imageUrl,
          options,
        };
      });
      
      setQuestions(reviewQuestions);
      setCurrentIndex(0);
      setScore(0);
      setTimer(0);
      setGameStarted(true);
      setSelectedAnswer(null);
      setIsCorrect(null);
      
      // 自动播报第一题
      setTimeout(() => speakCharacter(reviewQuestions[0]), 500);
      return;
    }
    
    // 正常模式
    const result = await refetch();
    if (result.data && result.data.length > 0) {
      // 生成题目
      const gameQuestions: GameQuestion[] = result.data.map((char) => {
        // 生成3个干扰项
        const wrongOptions = result.data
          .filter((c) => c.id !== char.id)
          .sort(() => Math.random() - 0.5)
          .slice(0, 3)
          .map((c) => c.character);
        
        // 混合正确答案和干扰项
        const options = [char.character, ...wrongOptions].sort(() => Math.random() - 0.5);
        
        return {
          id: char.id,
          character: char.character,
          pinyin: char.pinyin,
          imageUrl: char.imageUrl,
          options,
        };
      });
      
      setQuestions(gameQuestions);
      setCurrentIndex(0);
      setScore(0);
      setTimer(0);
      setGameStarted(true);
      setSelectedAnswer(null);
      setIsCorrect(null);
      
      // 自动播报第一题
      setTimeout(() => speakCharacter(gameQuestions[0]), 500);
    } else {
      alert("题库不足：当前题库中的汉字数量不足，请联系管理员添加更多汉字");
    }
  };
  
  // 语音播报
  const speakCharacter = (question: GameQuestion) => {
    if (voiceSettings === "off" || isPlaying) return;
    
    setIsPlaying(true);
    const utterance = new SpeechSynthesisUtterance();
    utterance.lang = "zh-CN";
    utterance.rate = 0.8;
    
    const repeatCount = voiceSettings === "once" ? 1 : voiceSettings === "twice" ? 2 : 3;
    let currentRepeat = 0;
    
    const speak = () => {
      if (currentRepeat < repeatCount) {
        utterance.text = question.character;
        speechSynthesis.speak(utterance);
        currentRepeat++;
      } else {
        setIsPlaying(false);
      }
    };
    
    utterance.onend = () => {
      if (currentRepeat < repeatCount) {
        setTimeout(speak, 1000);
      } else {
        setIsPlaying(false);
      }
    };
    
    speak();
  };
  
  // 手动播放
  const handleManualPlay = () => {
    if (questions[currentIndex]) {
      speakCharacter(questions[currentIndex]);
    }
  };
  
  // 播放音效
  const playSound = (url: string) => {
    const audio = new Audio(url);
    audio.play().catch(() => {});
  };
  
  // 错题记录mutation
  const addWrongQuestion = trpc.wrongQuestions.add.useMutation();
  
  // 选择答案
  const handleSelectAnswer = (answer: string) => {
    if (selectedAnswer !== null) return; // 已经选择过了
    
    const currentQuestion = questions[currentIndex];
    const correct = answer === currentQuestion.character;
    
    setSelectedAnswer(answer);
    setIsCorrect(correct);
    
    if (correct) {
      setScore((prev) => prev + 1);
      playSound(SOUND_CORRECT);
      
      // 复习模式：答对后标记为已复习
      if (reviewMode && wrongQuestions) {
        const wrongQuestion = wrongQuestions.find(q => {
          try {
            const data = JSON.parse(q.questionData);
            return data.characterId === currentQuestion.id;
          } catch {
            return false;
          }
        });
        if (wrongQuestion) {
          markReviewed.mutate({ id: wrongQuestion.id });
        }
      }
    } else {
      playSound(SOUND_WRONG);
      
      // 记录错题
      const kidIdStr = localStorage.getItem('selectedKidId');
      if (kidIdStr) {
        const kidId = parseInt(kidIdStr, 10);
        addWrongQuestion.mutate({
          kidId,
          gameType: 'character',
          questionData: JSON.stringify({
            characterId: currentQuestion.id,
            character: currentQuestion.character,
            pinyin: currentQuestion.pinyin,
            imageUrl: currentQuestion.imageUrl,
            category: category || '全部',
          }),
          userAnswer: answer,
          correctAnswer: currentQuestion.character,
        });
      }
    }
    
    // 1秒后自动进入下一题
    setTimeout(() => {
      if (currentIndex < questions.length - 1) {
        setCurrentIndex((prev) => prev + 1);
        setSelectedAnswer(null);
        setIsCorrect(null);
        
        // 自动播报下一题
        setTimeout(() => speakCharacter(questions[currentIndex + 1]), 300);
      } else {
        // 游戏结束
        finishGame();
      }
    }, 1500);
  };
  
  // 结束游戏
  const finishGame = () => {
    setGameStarted(false);
    playSound(SOUND_WIN);
    
    // 计算得分率
    const scoreRate = (score / questions.length) * 100;
    
    // 根据得分率显示不同的庆祝消息
    let message = "";
    if (scoreRate >= 80) {
      message = "🎉 太棒了！";
    } else if (scoreRate >= 60) {
      message = "👍 不错哦！";
    } else {
      message = "💪 加油！";
    }
    
    // 计算获得的星星
    const stars = Math.ceil((score / questions.length) * 5);
    
    alert(`${message}\n\n你答对了 ${score}/${questions.length} 题，获得 ${stars} 颗星星！`);
  };
  
  // 重新开始
  const resetGame = () => {
    setGameMode('select');
    setGameStarted(false);
    setQuestions([]);
    setCurrentIndex(0);
    setSelectedAnswer(null);
    setIsCorrect(null);
    setScore(0);
    setTimer(0);
  };
  
  // 格式化时间
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };
  
  // 游戏模式选择页面
  if (gameMode === 'select') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-yellow-50 p-4">
        <div className="max-w-2xl mx-auto pt-8">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-purple-600 mb-2">📚 识字游戏</h1>
            <p className="text-gray-600">选择你喜欢的学习方式！</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* 看图识字模式 */}
            <Card 
              className="p-8 bg-white/80 backdrop-blur cursor-pointer hover:shadow-lg transition-all hover:scale-105"
              onClick={() => setGameMode('picture')}
            >
              <div className="text-center">
                <div className="text-6xl mb-4">🖼️</div>
                <h2 className="text-2xl font-bold text-purple-600 mb-3">看图识字</h2>
                <p className="text-gray-600 mb-4">看图片选汉字，语音播报，快乐学习！</p>
                <Button className="w-full bg-gradient-to-r from-purple-400 to-purple-600 text-white">
                  开始游戏
                </Button>
              </div>
            </Card>
            
            {/* 快闪识字模式 */}
            <Card 
              className="p-8 bg-white/80 backdrop-blur cursor-pointer hover:shadow-lg transition-all hover:scale-105"
              onClick={() => setGameMode('flashcard')}
            >
              <div className="text-center">
                <div className="text-6xl mb-4">⚡</div>
                <h2 className="text-2xl font-bold text-amber-600 mb-3">快闪识字</h2>
                <p className="text-gray-600 mb-4">田字格展示，认识忘记，快速记忆！</p>
                <Button className="w-full bg-gradient-to-r from-amber-400 to-amber-600 text-white">
                  开始游戏
                </Button>
              </div>
            </Card>
            
            {/* 听音辨字模式 */}
            <Card 
              className="p-8 bg-white/80 backdrop-blur cursor-pointer hover:shadow-lg transition-all hover:scale-105"
              onClick={() => setGameMode('listening')}
            >
              <div className="text-center">
                <div className="text-6xl mb-4">🎧</div>
                <h2 className="text-2xl font-bold text-blue-600 mb-3">听音辨字</h2>
                <p className="text-gray-600 mb-4">听语音选汉字，训练听力，加深记忆！</p>
                <Button className="w-full bg-gradient-to-r from-blue-400 to-blue-600 text-white">
                  开始游戏
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    );
  }
  
  // 看图识字游戏设置页面
  if (gameMode === 'picture' && !gameStarted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-yellow-50 p-4">
        <div className="max-w-2xl mx-auto pt-8">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-purple-600 mb-2">📚 看图识字</h1>
            <p className="text-gray-600">看图片，选汉字，快乐学习！</p>
          </div>
          
          <Card className="p-8 bg-white/80 backdrop-blur">
            {/* 语音设置 */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                🔊 语音播报设置
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { value: "off" as VoiceSettings, label: "关闭" },
                  { value: "once" as VoiceSettings, label: "播放1次" },
                  { value: "twice" as VoiceSettings, label: "播放2次" },
                  { value: "thrice" as VoiceSettings, label: "播放3次" },
                ].map((option) => (
                  <Button
                    key={option.value}
                    variant={voiceSettings === option.value ? "default" : "outline"}
                    className={voiceSettings === option.value ? "bg-purple-500" : ""}
                    onClick={() => setVoiceSettings(option.value)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                💡 提示：选择自动播放后，每道题会自动朗读汉字的拼音和读音
              </p>
            </div>
            
            {/* 题目数量 */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                选择题目数量：<span className="text-purple-600 font-bold">{questionCount}题</span>
              </label>
              <div className="px-2">
                <input
                  type="range"
                  min="0"
                  max="4"
                  step="1"
                  value={[10, 20, 30, 40, 50].indexOf(questionCount)}
                  onChange={(e) => {
                    const counts = [10, 20, 30, 40, 50];
                    setQuestionCount(counts[parseInt(e.target.value)]);
                  }}
                  className="w-full h-2 bg-purple-200 rounded-lg appearance-none cursor-pointer slider"
                  style={{
                    background: `linear-gradient(to right, rgb(168, 85, 247) 0%, rgb(168, 85, 247) ${([10, 20, 30, 40, 50].indexOf(questionCount) / 4) * 100}%, rgb(233, 213, 255) ${([10, 20, 30, 40, 50].indexOf(questionCount) / 4) * 100}%, rgb(233, 213, 255) 100%)`
                  }}
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1 px-1">
                  <span>10</span>
                  <span>20</span>
                  <span>30</span>
                  <span>40</span>
                  <span>50</span>
                </div>
              </div>
            </div>
            
            {/* 模式选择 */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                游戏模式
              </label>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant={!reviewMode ? "default" : "outline"}
                  className={!reviewMode ? "bg-green-500 hover:bg-green-600" : ""}
                  onClick={() => setReviewMode(false)}
                >
                  🎯 正常练习
                </Button>
                <Button
                  variant={reviewMode ? "default" : "outline"}
                  className={reviewMode ? "bg-orange-500 hover:bg-orange-600" : ""}
                  onClick={() => setReviewMode(true)}
                >
                  📖 错题复习
                </Button>
              </div>
              {reviewMode && (
                <p className="text-xs text-orange-600 mt-2">
                  💡 复习模式：只会出现你答错过的汉字，答对后从错题本移除
                </p>
              )}
            </div>
            
            {/* 分类选择 */}
            {!reviewMode && (
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                选择分类（可选）
              </label>
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                {[
                  { value: undefined, label: "全部" },
                  { value: "数字", label: "数字" },
                  { value: "动物", label: "动物" },
                  { value: "自然", label: "自然" },
                  { value: "身体", label: "身体" },
                  { value: "水果", label: "水果" },
                  { value: "日常", label: "日常" },
                  { value: "颜色", label: "颜色" },
                ].map((option) => (
                  <Button
                    key={option.label}
                    variant={category === option.value ? "default" : "outline"}
                    className={category === option.value ? "bg-purple-500" : ""}
                    onClick={() => setCategory(option.value)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>
            )}
            
            <Button
              onClick={startGame}
              className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-bold py-6 text-lg"
            >
              开始游戏 🚀
            </Button>
          </Card>
        </div>
      </div>
    );
  }
  
  // 快闪识字游戏设置页面
  if (gameMode === 'flashcard' && !gameStarted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-50 p-4">
        <div className="max-w-2xl mx-auto pt-8">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-amber-600 mb-2">⚡ 快闪识字</h1>
            <p className="text-gray-600">田字格展示，快速记忆汉字！</p>
          </div>
          
          <Card className="p-8 bg-white/80 backdrop-blur">
            {/* 题目数量 */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                选择题目数量：<span className="text-amber-600 font-bold">{questionCount}题</span>
              </label>
              <div className="px-2">
                <input
                  type="range"
                  min="0"
                  max="4"
                  step="1"
                  value={[10, 20, 30, 40, 50].indexOf(questionCount)}
                  onChange={(e) => {
                    const counts = [10, 20, 30, 40, 50];
                    setQuestionCount(counts[parseInt(e.target.value)]);
                  }}
                  className="w-full h-2 bg-amber-200 rounded-lg appearance-none cursor-pointer slider"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1 px-1">
                  <span>10</span>
                  <span>20</span>
                  <span>30</span>
                  <span>40</span>
                  <span>50</span>
                </div>
              </div>
            </div>
            
            {/* 分类选择 */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                选择分类：
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { value: undefined, label: "全部" },
                  { value: "数字", label: "数字" },
                  { value: "动物", label: "动物" },
                  { value: "水果", label: "水果" },
                  { value: "自然", label: "自然" },
                  { value: "身体", label: "身体" },
                  { value: "日常", label: "日常" },
                  { value: "颜色", label: "颜色" },
                  { value: "家庭", label: "家庭" },
                  { value: "动作", label: "动作" },
                  { value: "其他", label: "其他" },
                ].map((option) => (
                  <Button
                    key={option.label}
                    variant={category === option.value ? "default" : "outline"}
                    className={category === option.value ? "bg-amber-500" : ""}
                    onClick={() => setCategory(option.value)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>
            
            <Button
              onClick={async () => {
                const result = await refetch();
                if (result.data && result.data.length > 0) {
                  // 初始化快闪识字数据
                  const chars = result.data.slice(0, questionCount);
                  setFlashcardCharacters(chars);
                  setCurrentFlashcard(chars[0]);
                  
                  // 初始化记录
                  const records = new Map();
                  chars.forEach((char: any) => {
                    const existing = allFlashcardRecords?.find(r => r.characterId === char.id);
                    records.set(char.id, {
                      knownCount: existing?.knownCount || 0,
                      forgottenCount: existing?.forgottenCount || 0,
                    });
                  });
                  setFlashcardRecords(records);
                  setKnownCharacters(new Set());
                  
                  setGameStarted(true);
                  setTimer(0);
                } else {
                  alert('没有找到符合条件的汉字，请重新选择！');
                }
              }}
              className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold py-6 text-lg"
            >
              开始游戏 🚀
            </Button>
          </Card>
        </div>
      </div>
    );
  }
  
  // 快闪识字游戏页面
  if (gameMode === 'flashcard' && gameStarted && currentFlashcard) {
    const record = flashcardRecords.get(currentFlashcard.id) || { knownCount: 0, forgottenCount: 0 };
    const remainingCount = flashcardCharacters.length - knownCharacters.size;
    
    // 处理认识
    const handleKnown = async () => {
      await recordKnown.mutateAsync({
        kidId: parseInt(localStorage.getItem('selectedKidId') || '0', 10),
        characterId: currentFlashcard.id,
      });
      
      // 更新记录
      const newRecords = new Map(flashcardRecords);
      newRecords.set(currentFlashcard.id, {
        knownCount: record.knownCount + 1,
        forgottenCount: record.forgottenCount,
      });
      setFlashcardRecords(newRecords);
      
      // 添加到已认识列表
      const newKnown = new Set(knownCharacters);
      newKnown.add(currentFlashcard.id);
      setKnownCharacters(newKnown);
      
      // 显示下一个
      showNextFlashcard(newKnown);
    };
    
    // 处理忘记
    const handleForgotten = async () => {
      await recordForgotten.mutateAsync({
        kidId: parseInt(localStorage.getItem('selectedKidId') || '0', 10),
        characterId: currentFlashcard.id,
      });
      
      // 更新记录
      const newRecords = new Map(flashcardRecords);
      newRecords.set(currentFlashcard.id, {
        knownCount: record.knownCount,
        forgottenCount: record.forgottenCount + 1,
      });
      setFlashcardRecords(newRecords);
      
      // 显示下一个
      showNextFlashcard(knownCharacters);
    };
    
    // 显示下一个汉字
    const showNextFlashcard = (known: Set<number>) => {
      // 过滤掉已认识的
      const remaining = flashcardCharacters.filter(c => !known.has(c.id));
      
      if (remaining.length === 0) {
        // 全部完成
        alert(`🎉 太棒了！你已经认识了所有 ${flashcardCharacters.length} 个汉字！`);
        resetGame();
      } else {
        // 随机选一个，但避免连续重复当前的字
        let candidates = remaining;
        if (remaining.length > 1 && currentFlashcard) {
          // 如果还有多个选项，排除当前的字
          candidates = remaining.filter(c => c.id !== currentFlashcard.id);
        }
        const nextIndex = Math.floor(Math.random() * candidates.length);
        setCurrentFlashcard(candidates[nextIndex]);
      }
    };
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-50 p-4">
        <div className="max-w-4xl mx-auto pt-8">
          {/* 顶部信息栏 */}
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-4">
              <div className="text-lg font-semibold text-amber-600">
                剩余 {remainingCount} / {flashcardCharacters.length} 个
              </div>
              <div className="text-lg font-semibold text-gray-600">
                ⏱️ {formatTime(timer)}
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={resetGame}
              className="flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              重新开始
            </Button>
          </div>
          
          {/* 汉字卡片 */}
          <Card className="p-12 bg-white/90 backdrop-blur mb-6">
            <div className="text-center">
                 {/* 汉字卡片 */}
              <div className="relative inline-block mb-8 w-full max-w-sm">
                {/* 田字格 */}
                <div className="tian-zi-ge w-full aspect-square relative">
                  {/* 汉字 */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-[8rem] sm:text-[12rem]" style={{ fontFamily: "'KaiTi', 'STKaiti', 'BiauKai', 'FangSong', serif", fontWeight: "normal" }}>
                      {currentFlashcard.character}
                    </span>
                  </div>
                  
                  {/* 右上角：认识次数 */}
                  <div className="absolute top-2 right-2 bg-green-500 text-white px-3 py-1 rounded-full text-sm font-bold">
                    认识: {record.knownCount}
                  </div>
                  
                  {/* 右下角：忘记次数 */}
                  <div className="absolute bottom-2 right-2 bg-red-500 text-white px-3 py-1 rounded-full text-sm font-bold">
                    忘记: {record.forgottenCount}
                  </div>
                </div>
                
                {/* 拼音 */}
                <div className="text-3xl font-bold text-amber-600 mt-4">
                  {currentFlashcard.pinyin}
                </div>
              </div>
              
              {/* 按钮 */}
              <div className="grid grid-cols-2 gap-6 max-w-md mx-auto">
                <Button
                  onClick={handleKnown}
                  className="h-20 text-2xl font-bold bg-gradient-to-r from-green-400 to-green-600 hover:from-green-500 hover:to-green-700 text-white"
                >
                  <span className="text-yellow-300 text-3xl mr-2">✅</span> 认识
                </Button>
                <Button
                  onClick={handleForgotten}
                  className="h-20 text-2xl font-bold bg-gradient-to-r from-red-400 to-red-600 hover:from-red-500 hover:to-red-700 text-white"
                >
                  <span className="text-yellow-100 text-3xl mr-2">❌</span> 忘记
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    );
  }
  
  // 听音辨字游戏
  if (gameMode === 'listening') {
    return <ListeningGame onBack={() => setGameMode('select')} />;
  }
  
  // 看图识字游戏页面
  const currentQuestion = questions[currentIndex];
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-yellow-50 p-4">
      <div className="max-w-4xl mx-auto pt-8">
        {/* 顶部信息栏 */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-4">
            <div className="text-lg font-semibold text-purple-600">
              第 {currentIndex + 1} / {questions.length} 题
            </div>
            <div className="text-lg font-semibold text-gray-600">
              ⏱️ {formatTime(timer)}
            </div>
            <div className="text-lg font-semibold text-green-600">
              ⭐ {score} 分
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={resetGame}
            className="flex items-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            重新开始
          </Button>
        </div>
        
        {/* 题目卡片 */}
        <Card className="p-8 bg-white/90 backdrop-blur mb-6">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">
              请选出图片对应的汉字
            </h2>
            
            {/* 图片 */}
            <div className="relative inline-block">
              <img
                src={currentQuestion.imageUrl}
                alt="汉字图片"
                className="w-64 h-64 object-contain rounded-lg shadow-lg mx-auto"
              />
              
              {/* 手动播放按钮 */}
              <Button
                onClick={handleManualPlay}
                disabled={isPlaying}
                className="absolute top-2 right-2 rounded-full w-12 h-12 bg-purple-500 hover:bg-purple-600"
                size="icon"
              >
                <Volume2 className="w-6 h-6" />
              </Button>
            </div>
          </div>
          
          {/* 选项 */}
          <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
            {currentQuestion.options.map((option, index) => {
              let buttonClass = "h-20 text-3xl font-bold";
              
              if (selectedAnswer === option) {
                if (isCorrect) {
                  buttonClass += " bg-green-500 text-white hover:bg-green-500";
                } else {
                  buttonClass += " bg-red-500 text-white hover:bg-red-500";
                }
              } else if (selectedAnswer !== null && option === currentQuestion.character) {
                buttonClass += " bg-green-500 text-white hover:bg-green-500";
              }
              
              return (
                <Button
                  key={index}
                  onClick={() => handleSelectAnswer(option)}
                  disabled={selectedAnswer !== null}
                  className={buttonClass}
                  variant={selectedAnswer === null ? "outline" : "default"}
                >
                  {option}
                </Button>
              );
            })}
          </div>
          
          {/* 反馈信息 */}
          {selectedAnswer !== null && (
            <div className="text-center mt-6">
              {isCorrect ? (
                <div className="text-2xl font-bold text-green-600">
                  ✓ 回答正确！{currentQuestion.pinyin}
                </div>
              ) : (
                <div className="text-2xl font-bold text-red-600">
                  ✗ 回答错误！正确答案是：{currentQuestion.character} ({currentQuestion.pinyin})
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
