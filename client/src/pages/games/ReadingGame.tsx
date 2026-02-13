import { useState, useEffect, useRef } from "react";
import { useParams, useLocation, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Volume2, BookOpen, Languages, Play, Pause } from "lucide-react";
import { toast } from "sonner";
import { pinyin } from "pinyin-pro";

export default function ReadingGame() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const storyId = params.id ? parseInt(params.id) : undefined;
  
  const [clickedChar, setClickedChar] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [clickCount, setClickCount] = useState(0);
  const [startTime] = useState(Date.now());
  const [recordId, setRecordId] = useState<number | null>(null);
  const [showPinyin, setShowPinyin] = useState(false);
  const [isAutoReading, setIsAutoReading] = useState(false);
  const [currentReadingIndex, setCurrentReadingIndex] = useState(-1);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const autoReadingRef = useRef<boolean>(false);
  
  // 获取故事详情
  const { data: story, isLoading } = trpc.readingGame.getStory.useQuery(
    { id: storyId! },
    { enabled: !!storyId }
  );
  
  // 创建阅读记录
  const createRecordMutation = trpc.readingGame.createRecord.useMutation();
  const updateRecordMutation = trpc.readingGame.updateRecord.useMutation();
  
  // 将文本转换为可点击的字符（点读模式）
  const renderClickableText = (text: string) => {
    let readableIndex = -1; // 跟踪可读字符的索引
    
    return text.split('').map((char, index) => {
      // 判断是否为汉字或字母数字
      const isReadable = /[\u4e00-\u9fa5a-zA-Z0-9]/.test(char);
      
      if (isReadable) {
        readableIndex++;
        const py = showPinyin ? pinyin(char, { toneType: 'symbol' }) : '';
        const isCurrentReading = isAutoReading && readableIndex === currentReadingIndex;
        
        return (
          <span
            key={index}
            onClick={() => !isAutoReading && handleCharClick(char)}
            className={`inline-block cursor-pointer transition-all rounded px-0.5 ${
              isCurrentReading 
                ? 'bg-orange-400 scale-125 shadow-lg' 
                : 'hover:bg-yellow-200 active:bg-yellow-300'
            }`}
            style={{
              userSelect: 'none',
              WebkitUserSelect: 'none',
              WebkitTouchCallout: 'none',
            }}
          >
            {showPinyin ? (
              <ruby>
                {char}
                <rt style={{ fontSize: '0.5em', color: '#9333ea' }}>{py}</rt>
              </ruby>
            ) : (
              char
            )}
          </span>
        );
      }
      
      // 标点符号和空格不可点击
      return <span key={index}>{char}</span>;
    });
  };
  
  // 连读功能：自动逐字朗读
  const startAutoReading = () => {
    if (!story) return;
    
    setIsAutoReading(true);
    autoReadingRef.current = true;
    setCurrentReadingIndex(0);
    
    // 获取所有可读字符
    const readableChars = story.content.split('').filter(char => 
      /[\u4e00-\u9fa5a-zA-Z0-9]/.test(char)
    );
    
    readNextChar(readableChars, 0);
  };
  
  const stopAutoReading = () => {
    setIsAutoReading(false);
    autoReadingRef.current = false;
    setCurrentReadingIndex(-1);
    window.speechSynthesis.cancel();
    setIsPlaying(false);
  };
  
  const readNextChar = (chars: string[], index: number) => {
    if (!autoReadingRef.current || index >= chars.length) {
      stopAutoReading();
      return;
    }
    
    const char = chars[index];
    setCurrentReadingIndex(index);
    setClickedChar(char);
    
    // 使用语音合成
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      
      setTimeout(() => {
        const utterance = new SpeechSynthesisUtterance(char);
        utterance.lang = 'zh-CN';
        utterance.rate = 0.8; // 连读时语速略慢
        utterance.pitch = 1.1;
        utterance.volume = 1.0;
        
        utterance.onstart = () => {
          setIsPlaying(true);
        };
        
        utterance.onend = () => {
          setIsPlaying(false);
          // 继续下一个字
          setTimeout(() => {
            if (autoReadingRef.current) {
              readNextChar(chars, index + 1);
            }
          }, 300); // 每个字之间间隔300ms
        };
        
        utterance.onerror = () => {
          setIsPlaying(false);
          // 出错时继续下一个
          setTimeout(() => {
            if (autoReadingRef.current) {
              readNextChar(chars, index + 1);
            }
          }, 300);
        };
        
        window.speechSynthesis.speak(utterance);
      }, 50);
    }
  };
  
  // 使用浏览器Web Speech API进行语音合成
  const speakText = (text: string) => {
    if (!text || text.trim().length === 0) {
      toast.error("请选中文字");
      return;
    }
    
    if ('speechSynthesis' in window) {
      try {
        // 停止当前正在播放的语音
        window.speechSynthesis.cancel();
        
        // 等待一小段时间确保取消完成
        setTimeout(() => {
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.lang = 'zh-CN';
          utterance.rate = 0.9; // 语速略慢，适合儿童
          utterance.pitch = 1.1; // 音调略高
          utterance.volume = 1.0; // 最大音量
          
          utterance.onstart = () => {
            console.log("语音开始播放:", text);
            setIsPlaying(true);
          };
          
          utterance.onend = () => {
            console.log("语音播放结束");
            setIsPlaying(false);
          };
          
          utterance.onerror = (event) => {
            console.error("语音播放错误:", event);
            toast.error("语音播放失败：" + event.error);
            setIsPlaying(false);
          };
          
          console.log("开始语音合成:", text);
          window.speechSynthesis.speak(utterance);
          
          // 手机浏览器兼容性处理
          if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
            // 移动设备上可能需要用户交互才能播放
            const resumeSpeech = () => {
              if (window.speechSynthesis.paused) {
                window.speechSynthesis.resume();
              }
            };
            const intervalId = setInterval(resumeSpeech, 100);
            utterance.onend = () => {
              clearInterval(intervalId);
              setIsPlaying(false);
            };
          }
        }, 100);
      } catch (error) {
        console.error("语音功能异常:", error);
        toast.error("语音功能异常");
        setIsPlaying(false);
      }
    } else {
      toast.error("浏览器不支持语音功能");
    }
  };
  
  // 初始化阅读记录
  useEffect(() => {
    if (story && !recordId) {
      createRecordMutation.mutate(
        { kidId: 120013, storyId: story.id }, // TODO: 使用实际的kidId
        {
          onSuccess: (data) => {
            setRecordId(data.recordId);
          },
        }
      );
    }
  }, [story, recordId]);
  
  // 处理字符点击（点读模式）
  const handleCharClick = (char: string) => {
    setClickedChar(char);
    setClickCount((prev) => prev + 1);
    
    // 调用语音播放
    speakText(char);
    
    // 更新阅读记录
    if (recordId) {
      updateRecordMutation.mutate({
        recordId,
        clickCount: clickCount + 1,
      });
    }
  };
  
  // 完成阅读
  const handleComplete = () => {
    if (recordId) {
      const duration = Math.floor((Date.now() - startTime) / 1000);
      updateRecordMutation.mutate({
        recordId,
        readDuration: duration,
        completed: true,
      });
    }
    toast.success("阅读完成！");
    setLocation("/games");
  };
  
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-yellow-50 via-orange-50 to-red-50 flex items-center justify-center">
        <div className="text-2xl text-orange-600">加载中...</div>
      </div>
    );
  }
  
  if (!story) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-yellow-50 via-orange-50 to-red-50 flex items-center justify-center">
        <Card className="p-8 text-center">
          <p className="text-xl text-gray-600 mb-4">故事不存在</p>
          <Link href="/games/reading">
            <Button>返回故事列表</Button>
          </Link>
        </Card>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-50 via-orange-50 to-red-50 p-4">
      {/* 顶部导航 */}
      <div className="max-w-4xl mx-auto mb-6 flex items-center justify-between">
        <Link href="/games/reading">
          <Button variant="ghost" size="lg" className="text-orange-600">
            <ArrowLeft className="w-6 h-6 mr-2" />
            返回
          </Button>
        </Link>
        <div className="flex items-center gap-3">
          <Button
            onClick={() => setShowPinyin(!showPinyin)}
            variant={showPinyin ? "default" : "outline"}
            size="lg"
            className={showPinyin ? "bg-red-500 hover:bg-[#A80000]" : ""}
          >
            <Languages className="w-5 h-5 mr-2" />
            {showPinyin ? "隐藏拼音" : "显示拼音"}
          </Button>
          <Button
            onClick={isAutoReading ? stopAutoReading : startAutoReading}
            variant={isAutoReading ? "default" : "outline"}
            size="lg"
            className={isAutoReading ? "bg-orange-500 hover:bg-orange-600" : ""}
          >
            {isAutoReading ? (
              <>
                <Pause className="w-5 h-5 mr-2" />
                停止连读
              </>
            ) : (
              <>
                <Play className="w-5 h-5 mr-2" />
                连读
              </>
            )}
          </Button>
          <Button
            onClick={handleComplete}
            variant="default"
            size="lg"
            className="bg-green-500 hover:bg-green-600"
          >
            <BookOpen className="w-5 h-5 mr-2" />
            完成阅读
          </Button>
        </div>
      </div>
      
      {/* 故事卡片 */}
      <Card className="max-w-4xl mx-auto overflow-hidden shadow-2xl">
        {/* 封面图片 */}
        {story.coverImageUrl && (
          <div className="w-full h-64 md:h-80 overflow-hidden bg-gradient-to-br from-yellow-50 to-orange-50">
            <img
              src={story.coverImageUrl}
              alt={story.title}
              className="w-full h-full object-cover"
            />
          </div>
        )}
        
        <div className="p-8">
          {/* 标题 */}
          <h1 className="text-4xl font-bold text-center text-orange-600 mb-8">
            {story.title}
          </h1>
        
        {/* 提示信息 */}
        <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4 mb-6 flex items-center gap-3">
          <Volume2 className="w-6 h-6 text-blue-600 flex-shrink-0" />
          <p className="text-blue-800 text-lg">
            点击文字，就能听到读音哦！
          </p>
        </div>
        
        {/* 故事内容 */}
        <div
          className="story-content text-3xl md:text-2xl leading-relaxed text-gray-800"
          style={{
            lineHeight: showPinyin ? "3.5" : "2.5",
            letterSpacing: "0.1em",
            wordBreak: "break-all",
            maxWidth: "100%",
          }}
        >
          <style>{`
            @media (max-width: 768px) {
              .story-content {
                max-width: calc(5em + 0.5em * 4);
                margin: 0 auto;
                font-size: 2rem;
                line-height: ${showPinyin ? "2.2" : "1.6"};
              }
            }
          `}</style>
          {renderClickableText(story.content)}
        </div>
        
        {/* 点击的文字显示 */}
        {clickedChar && (
          <div className="mt-8 p-6 bg-gradient-to-r from-red-100 to-pink-100 rounded-lg border-2 border-red-300">
            <div className="flex items-center gap-3 mb-2">
              <Volume2 className={`w-8 h-8 text-[#A80000] ${isPlaying ? "animate-pulse" : ""}`} />
              <span className="text-xl text-[#8a0000] font-semibold">
                {isPlaying ? "正在播放..." : "点击了"}
              </span>
            </div>
            <p className="text-6xl font-bold text-[#6a0000] text-center">
              {clickedChar}
            </p>
          </div>
        )}
        
        {/* 统计信息 */}
        <div className="mt-8 pt-6 border-t-2 border-gray-200 flex justify-center gap-8">
          <div className="text-center">
            <div className="text-3xl font-bold text-orange-600">{clickCount}</div>
            <div className="text-sm text-gray-600 mt-1">点读次数</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-blue-600">{story.wordCount}</div>
            <div className="text-sm text-gray-600 mt-1">总字数</div>
          </div>
        </div>
        </div>
      </Card>
    </div>
  );
}
