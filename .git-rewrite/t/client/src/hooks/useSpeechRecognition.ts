import { useState, useEffect, useRef, useCallback } from 'react';

interface SpeechRecognitionResult {
  transcript: string;
  confidence: number;
  isFinal: boolean;
}

interface UseSpeechRecognitionReturn {
  isListening: boolean;
  transcript: string;
  confidence: number;
  error: string | null;
  isSupported: boolean;
  isPermissionGranted: boolean;
  startListening: () => void;
  stopListening: () => void;
  resetTranscript: () => void;
  requestPermission: () => Promise<boolean>;
}

export function useSpeechRecognition(): UseSpeechRecognitionReturn {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [confidence, setConfidence] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isPermissionGranted, setIsPermissionGranted] = useState(false);
  const recognitionRef = useRef<any>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 检查浏览器是否支持语音识别
  const isSupported = typeof window !== 'undefined' && 
    ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window);

  useEffect(() => {
    if (!isSupported) {
      setError('您的浏览器不支持语音识别功能');
      return;
    }

    // 创建语音识别实例
    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    const recognition = new SpeechRecognition();
    
    // 配置语音识别
    recognition.lang = 'zh-CN'; // 中文识别
    recognition.continuous = false; // 单次识别
    recognition.interimResults = false; // 不需要中间结果
    recognition.maxAlternatives = 1; // 只返回最佳结果

    // 识别结果回调
    recognition.onresult = (event: any) => {
      const result = event.results[0][0];
      setTranscript(result.transcript);
      setConfidence(result.confidence);
      setIsListening(false);
      
      // 清除超时定时器
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };

    // 识别错误回调
    recognition.onerror = (event: any) => {
      console.error('语音识别错误:', event.error);
      
      // 如果是权限错误，更新权限状态
      if (event.error === 'not-allowed') {
        setIsPermissionGranted(false);
        setError('请允许使用麦克风权限');
      } else {
        setError(`识别错误: ${event.error}`);
      }
      
      setIsListening(false);
      
      // 清除超时定时器
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };

    // 识别结束回调
    recognition.onend = () => {
      setIsListening(false);
    };

    // 识别开始回调
    recognition.onstart = () => {
      setIsListening(true);
      setIsPermissionGranted(true);
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [isSupported]);

  // 请求麦克风权限
  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!isSupported || !recognitionRef.current) {
      setError('语音识别不可用');
      return false;
    }

    try {
      // 尝试启动识别来触发权限请求
      recognitionRef.current.start();
      
      // 等待一小段时间让权限对话框出现
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // 立即停止，我们只是为了获取权限
      recognitionRef.current.stop();
      
      setIsPermissionGranted(true);
      return true;
    } catch (err) {
      console.error('请求麦克风权限失败:', err);
      setError('请求麦克风权限失败');
      setIsPermissionGranted(false);
      return false;
    }
  }, [isSupported]);

  const startListening = useCallback(() => {
    if (!isSupported || !recognitionRef.current) {
      setError('语音识别不可用');
      return;
    }

    try {
      setError(null);
      setTranscript('');
      setConfidence(0);
      recognitionRef.current.start();
      setIsListening(true);
      
      // 设置5秒超时，如果没有识别到任何内容则自动重启
      timeoutRef.current = setTimeout(() => {
        if (isListening && transcript === '') {
          console.log('语音识别超时，自动重启...');
          stopListening();
          // 短暂延迟后重新开始
          setTimeout(() => {
            startListening();
          }, 500);
        }
      }, 5000);
    } catch (err: any) {
      console.error('启动语音识别失败:', err);
      
      // 如果是因为已经在运行，先停止再重启
      if (err.message && err.message.includes('already started')) {
        recognitionRef.current.stop();
        setTimeout(() => {
          startListening();
        }, 100);
      } else {
        setError('启动语音识别失败');
      }
    }
  }, [isSupported, isListening, transcript]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
    
    // 清除超时定时器
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, [isListening]);

  const resetTranscript = useCallback(() => {
    setTranscript('');
    setConfidence(0);
    setError(null);
  }, []);

  return {
    isListening,
    transcript,
    confidence,
    error,
    isSupported,
    isPermissionGranted,
    startListening,
    stopListening,
    resetTranscript,
    requestPermission,
  };
}
