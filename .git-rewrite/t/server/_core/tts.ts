import { ENV } from "./env";

export interface TTSParams {
  text: string;
  voice?: string; // 语音类型，默认使用儿童友好的声音
  speed?: number; // 语速，0.5-2.0，默认1.0
}

export interface TTSResult {
  audioUrl: string; // 音频文件URL
}

const resolveApiUrl = () =>
  ENV.forgeApiUrl && ENV.forgeApiUrl.trim().length > 0
    ? `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/audio/speech`
    : "https://forge.manus.im/v1/audio/speech";

const assertApiKey = () => {
  if (!ENV.forgeApiKey) {
    throw new Error("FORGE_API_KEY is not configured");
  }
};

/**
 * 将文本转换为语音
 * @param params TTS参数
 * @returns 音频文件URL
 */
export async function textToSpeech(params: TTSParams): Promise<TTSResult> {
  assertApiKey();

  const { text, voice = "alloy", speed = 1.0 } = params;

  const payload = {
    model: "tts-1",
    input: text,
    voice: voice,
    speed: speed,
  };

  const response = await fetch(resolveApiUrl(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ENV.forgeApiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `TTS request failed: ${response.status} ${response.statusText} – ${errorText}`
    );
  }

  // 获取音频数据
  const audioBuffer = await response.arrayBuffer();
  
  // 将音频转换为base64 data URL
  const base64Audio = Buffer.from(audioBuffer).toString('base64');
  const audioUrl = `data:audio/mpeg;base64,${base64Audio}`;

  return { audioUrl };
}
