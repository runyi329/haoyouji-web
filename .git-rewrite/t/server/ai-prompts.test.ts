import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { getPromptsConfig, updatePromptsConfig, resetPromptsConfig, DEFAULT_PROMPTS_CONFIG } from './ai-prompts';

const TEST_CONFIG_PATH = path.join(__dirname, 'ai-prompts-config.json');

describe('AI Prompts Management', () => {
  beforeEach(() => {
    // 清理测试配置文件
    if (fs.existsSync(TEST_CONFIG_PATH)) {
      fs.unlinkSync(TEST_CONFIG_PATH);
    }
  });

  it('should return default config when no config file exists', async () => {
    const config = await getPromptsConfig();
    expect(config).toEqual(DEFAULT_PROMPTS_CONFIG);
  });

  it('should update prompts config', async () => {
    const newConfig = {
      systemPrompt: 'Test system prompt',
      userPromptTemplate: 'Test user prompt template',
      temperature: 0.5,
      maxTokens: 1000,
    };

    await updatePromptsConfig(newConfig);
    const config = await getPromptsConfig();

    expect(config.systemPrompt).toBe(newConfig.systemPrompt);
    expect(config.userPromptTemplate).toBe(newConfig.userPromptTemplate);
    expect(config.temperature).toBe(newConfig.temperature);
    expect(config.maxTokens).toBe(newConfig.maxTokens);
  });

  it('should reset prompts config to default', async () => {
    // 先更新配置
    const newConfig = {
      systemPrompt: 'Test system prompt',
      userPromptTemplate: 'Test user prompt template',
      temperature: 0.5,
      maxTokens: 1000,
    };
    await updatePromptsConfig(newConfig);

    // 然后重置
    await resetPromptsConfig();
    const config = await getPromptsConfig();

    expect(config).toEqual(DEFAULT_PROMPTS_CONFIG);
  });

  it('should validate temperature range', async () => {
    const config = await getPromptsConfig();
    expect(config.temperature).toBeGreaterThanOrEqual(0);
    expect(config.temperature).toBeLessThanOrEqual(2);
  });

  it('should validate maxTokens range', async () => {
    const config = await getPromptsConfig();
    expect(config.maxTokens).toBeGreaterThan(0);
    expect(config.maxTokens).toBeLessThanOrEqual(4000);
  });
});
