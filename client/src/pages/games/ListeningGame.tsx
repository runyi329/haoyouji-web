import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Volume2, RotateCcw, Play } from "lucide-react";
import confetti from "canvas-confetti";

// 音效功能已移除，只保留语音播报

interface ListeningGameProps {
  onBack?: () => void;
}

type GameMode = 'setup' | 'practice' | 'test' | 'finished';

export default function ListeningGame(props: any) {
  const { onBack } = props;
  // 游戏设置
  const [cardCount, setCardCount] = useState(3); // 1-5张卡片
  const [charsPerCard, setCharsPerCard] = useState<9 | 16>(16); // 每张卡9或16个字
  
  // 游戏状态
  const [gameMode, setGameMode] = useState<GameMode>('setup');
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [cards, setCards] = useState<any[][]>([]); // 每张卡是一个汉字数组
  const [correctChars, setCorrectChars] = useState<Set<number>>(new Set()); // 已答对的汉字ID
  const [currentTestChar, setCurrentTestChar] = useState<any | null>(null); // 当前测试的汉字
  const [testQueue, setTestQueue] = useState<any[]>([]); // 测试队列
  const [timer, setTimer] = useState(0);
  const [totalScore, setTotalScore] = useState(0);
  const [wrongCharId, setWrongCharId] = useState<number | null>(null); // 答错的汉字ID，用于触发摇动动画
  
  // 获取随机汉字
  const { data: characters, refetch } = trpc.character.getRandomCharacters.useQuery(
    { count: cardCount * charsPerCard },
    { enabled: false }
  );
  
  // 计时器
  useEffect(() => {
    if (gameMode === 'practice' || gameMode === 'test') {
      const interval = setInterval(() => {
        setTimer(t => t + 1);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [gameMode]);
  
  // 格式化时间
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  // 音效功能已移除，只保留语音播报
  
  // 语音播报汉字
  const speakCharacter = (char: any) => {
    if (!char) return;
    
    const utterance = new SpeechSynthesisUtterance();
    utterance.lang = 'zh-CN';
    utterance.rate = 0.9; // 稍快一点
    utterance.text = char.character;
    
    speechSynthesis.speak(utterance);
  };
  
  // 语音播报"真棒"
  const speakGreat = () => {
    const utterance = new SpeechSynthesisUtterance();
    utterance.lang = 'zh-CN';
    utterance.rate = 1.0;
    utterance.text = "真棒！";
    utterance.pitch = 1.2; // 提高音调，更欢快
    
    speechSynthesis.speak(utterance);
  };
  
  // 语音播报"再想想吧"
  const speakTryAgain = () => {
    const utterance = new SpeechSynthesisUtterance();
    utterance.lang = 'zh-CN';
    utterance.rate = 0.9;
    utterance.text = "再想想吧";
    utterance.pitch = 0.9; // 降低音调，更温柔
    
    speechSynthesis.speak(utterance);
  };
  
  // 开始游戏
  const startGame = async () => {
    const result = await refetch();
    if (result.data && result.data.length >= charsPerCard) {
      // 将汉字分成多张卡片
      const newCards: any[][] = [];
      const chars = result.data;
      
      for (let i = 0; i < cardCount; i++) {
        const shuffled = [...chars].sort(() => Math.random() - 0.5);
        const cardChars = shuffled.slice(0, charsPerCard);
        newCards.push(cardChars);
      }
      
      setCards(newCards);
      setCurrentCardIndex(0);
      setCorrectChars(new Set());
      setTimer(0);
      setTotalScore(0);
      setGameMode('practice');
    } else {
      alert(`汉字数量不足！至少需要${charsPerCard}个汉字，当前只有${result.data?.length || 0}个。`);
    }
  };
  
  // 练习模式：点击汉字播放读音
  const handlePracticeClick = (char: any) => {
    speakCharacter(char);
  };
  
  // 开始测试
  const startTest = () => {
    const currentCard = cards[currentCardIndex];
    if (!currentCard) return;
    
    // 创建测试队列（随机顺序）
    const queue = [...currentCard].sort(() => Math.random() - 0.5);
    setTestQueue(queue);
    setCorrectChars(new Set());
    setGameMode('test');
    
    // 播报第一个字
    setTimeout(() => {
      if (queue[0]) {
        setCurrentTestChar(queue[0]);
        speakCharacter(queue[0]);
      }
    }, 500);
  };
  
  // 测试模式：点击答题
  const handleTestClick = (char: any) => {
    
    if (!currentTestChar) return;
    
    if (char.id === currentTestChar.id) {
      // 答对了
      speakGreat();
      
      const newCorrectChars = new Set(correctChars);
      newCorrectChars.add(char.id);
      setCorrectChars(newCorrectChars);
      setTotalScore(totalScore + 1);
      
      // 找到下一个未答对的字
      const nextChar = testQueue.find(c => !newCorrectChars.has(c.id));
      
      if (nextChar) {
        // 还有字没答对，继续测试
        setTimeout(() => {
          setCurrentTestChar(nextChar);
          speakCharacter(nextChar);
        }, 2000);
      } else {
        // 本张卡全部答对
        setCurrentTestChar(null);
        
        if (currentCardIndex < cards.length - 1) {
          // 还有下一张卡
          setTimeout(() => {
            confetti({
              particleCount: 100,
              spread: 70,
              origin: { y: 0.6 }
            });
            
            // 进入下一张卡的练习模式
            setCurrentCardIndex(currentCardIndex + 1);
            setCorrectChars(new Set());
            setGameMode('practice');
          }, 1500);
        } else {
          // 所有卡片完成
          setTimeout(() => {
            confetti({
              particleCount: 200,
              spread: 100,
              origin: { y: 0.6 }
            });
            setGameMode('finished');
          }, 1500);
        }
      }
    } else {
      // 答错了
      speakTryAgain();
      
      // 触发摇动动画
      setWrongCharId(char.id);
      setTimeout(() => {
        setWrongCharId(null);
      }, 500); // 0.5秒后移除摇动效果
    }
  };
  
  // 重新开始
  const handleRestart = () => {
    setGameMode('setup');
    setCurrentCardIndex(0);
    setCards([]);
    setCorrectChars(new Set());
    setTimer(0);
    setTotalScore(0);
  };
  
  // 设置页面
  if (gameMode === 'setup') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-cyan-50 to-teal-50 p-4">
        <div className="max-w-2xl mx-auto pt-8">
          <div className="flex items-center gap-4 mb-8">
            <Button variant="ghost" onClick={onBack}>
              <RotateCcw className="w-5 h-5" />
            </Button>
            <h1 className="text-3xl font-bold text-blue-600">听音辨字</h1>
          </div>
          
          <Card className="p-8 bg-white/90 backdrop-blur">
            <div className="text-center mb-8">
              <div className="text-6xl mb-4">🎧</div>
              <h2 className="text-2xl font-bold text-blue-600 mb-2">练习+测试模式</h2>
              <p className="text-gray-600">先练习，再测试，全部答对进入下一张卡</p>
            </div>
            
            {/* 卡片数量选择 */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                选择卡片数量：<span className="text-blue-600 font-bold">{cardCount}张</span>
              </label>
              <div className="px-2">
                <input
                  type="range"
                  min="1"
                  max="5"
                  step="1"
                  value={cardCount}
                  onChange={(e) => setCardCount(parseInt(e.target.value))}
                  className="w-full h-2 bg-blue-200 rounded-lg appearance-none cursor-pointer slider"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>1张</span>
                  <span>2张</span>
                  <span>3张</span>
                  <span>4张</span>
                  <span>5张</span>
                </div>
              </div>
            </div>
            
            {/* 每张卡字数选择 */}
            <div className="mb-8">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                每张卡字数：<span className="text-blue-600 font-bold">{charsPerCard}个字</span>
              </label>
              <div className="grid grid-cols-2 gap-4">
                <Button
                  variant={charsPerCard === 9 ? "default" : "outline"}
                  className={charsPerCard === 9 ? "bg-blue-500" : ""}
                  onClick={() => setCharsPerCard(9)}
                >
                  9个字 (3×3)
                </Button>
                <Button
                  variant={charsPerCard === 16 ? "default" : "outline"}
                  className={charsPerCard === 16 ? "bg-blue-500" : ""}
                  onClick={() => setCharsPerCard(16)}
                >
                  16个字 (4×4)
                </Button>
              </div>
            </div>
            
            <Button
              onClick={startGame}
              className="w-full bg-gradient-to-r from-blue-500 to-cyan-500 text-white text-lg py-6"
            >
              开始游戏 🚀
            </Button>
            
            <Button
              variant="outline"
              onClick={onBack}
              className="w-full mt-4"
            >
              返回模式选择
            </Button>
          </Card>
        </div>
      </div>
    );
  }
  
  // 游戏结束页面
  if (gameMode === 'finished') {
    const accuracy = Math.round((totalScore / (cardCount * charsPerCard)) * 100);
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-cyan-50 to-teal-50 p-4">
        <div className="max-w-2xl mx-auto pt-8">
          <Card className="p-12 bg-white/90 backdrop-blur text-center">
            <div className="text-8xl mb-6">🎉</div>
            <h2 className="text-4xl font-bold text-blue-600 mb-4">挑战完成！</h2>
            
            <div className="grid grid-cols-3 gap-6 my-8">
              <div className="bg-blue-50 p-6 rounded-xl">
                <div className="text-3xl font-bold text-blue-600">{totalScore}</div>
                <div className="text-gray-600 mt-2">答对次数</div>
              </div>
              <div className="bg-cyan-50 p-6 rounded-xl">
                <div className="text-3xl font-bold text-cyan-600">{accuracy}%</div>
                <div className="text-gray-600 mt-2">正确率</div>
              </div>
              <div className="bg-teal-50 p-6 rounded-xl">
                <div className="text-3xl font-bold text-teal-600">{formatTime(timer)}</div>
                <div className="text-gray-600 mt-2">用时</div>
              </div>
            </div>
            
            <div className="flex gap-4">
              <Button
                onClick={handleRestart}
                className="flex-1 bg-gradient-to-r from-blue-500 to-cyan-500 text-white text-lg py-6"
              >
                再玩一次
              </Button>
              <Button
                variant="outline"
                onClick={onBack}
                className="flex-1 text-lg py-6"
              >
                返回首页
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }
  
  // 游戏进行中（练习或测试模式）
  const currentCard = cards[currentCardIndex];
  if (!currentCard) return null;
  
  const gridCols = charsPerCard === 9 ? 'grid-cols-3' : 'grid-cols-4';
  const isPracticeMode = gameMode === 'practice';
  const isTestMode = gameMode === 'test';
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-cyan-50 to-teal-50 p-4">
      <div className="max-w-4xl mx-auto pt-8">
        {/* 顶部信息栏 */}
        <div className="flex justify-between items-center mb-2 text-sm" style={{ fontFamily: "'KaiTi', 'STKaiti', 'BiauKai', serif" }}>
          <div className="flex items-center gap-2">
            <span className="text-blue-600 font-semibold">第{currentCardIndex + 1}/{cardCount}张</span>
            <span className="text-gray-600">⏱️{formatTime(timer)}</span>
            <span className="text-green-600">✅{correctChars.size}/{charsPerCard}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onBack}
            className="h-7 px-3 text-xs"
            style={{ fontFamily: "'KaiTi', 'STKaiti', 'BiauKai', serif" }}
          >
            退出
          </Button>
        </div>
        
        {/* 题目卡片 */}
        <Card className="p-4 bg-white/90 backdrop-blur mb-3">
          <div className="text-center mb-3" style={{ fontFamily: "'KaiTi', 'STKaiti', 'BiauKai', serif" }}>
            {isPracticeMode && (
              <>
                <div className="text-3xl mb-1">✋</div>
                <h2 className="text-lg font-bold text-blue-600 mb-1">练习模式</h2>
                <p className="text-sm text-gray-600">点击任意汉字，听听它的读音</p>
              </>
            )}
            {isTestMode && (
              <>
                <div className="text-3xl mb-1">🎧</div>
                <h2 className="text-lg font-bold text-blue-600 mb-1">测试模式</h2>
                <p className="text-sm text-gray-600">请听语音，点击正确的汉字</p>
              </>
            )}
          </div>
          
          {/* 汉字网格 */}
          <div className={`grid ${gridCols} gap-2 max-w-3xl mx-auto mb-3`}>
            {currentCard.map((char: any) => {
              const isCorrect = correctChars.has(char.id);
              const isWrong = wrongCharId === char.id;
              
              return (
                <button
                  key={char.id}
                  onClick={() => {
                    if (isPracticeMode) {
                      handlePracticeClick(char);
                    } else if (isTestMode) {
                      handleTestClick(char);
                    }
                  }}
                  className={`
                    relative p-3 rounded-xl border-2 transition-all 
                    text-5xl font-bold aspect-square flex items-center justify-center
                    ${isCorrect ? 'bg-green-100 border-green-500' : 'bg-white border-gray-200'}
                    ${!isCorrect && 'hover:border-blue-400 hover:scale-105 cursor-pointer'}
                    ${isWrong && 'animate-shake border-red-400'}
                  `}
                  style={{ fontFamily: "'KaiTi', 'STKaiti', 'BiauKai', serif" }}
                >
                  {char.character}
                </button>
              );
            })}
          </div>
          
          {/* 操作按钮 */}
          {isPracticeMode && (
            <Button
              onClick={startTest}
              className="w-full bg-gradient-to-r from-green-500 to-emerald-500 text-white text-base py-4"
              style={{ fontFamily: "'KaiTi', 'STKaiti', 'BiauKai', serif" }}
            >
              <Play className="w-5 h-5 mr-2" />
              开始测试
            </Button>
          )}
          
          {isTestMode && currentTestChar && (
            <div className="text-center">
              <Button
                onClick={() => speakCharacter(currentTestChar)}
                variant="outline"
                className="flex items-center gap-2"
                style={{ fontFamily: "'KaiTi', 'STKaiti', 'BiauKai', serif" }}
              >
                <Volume2 className="w-4 h-4" />
                重新播放
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
