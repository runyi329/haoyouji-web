import { describe, it, expect } from "vitest";

describe("DeepSeek API Key Validation", () => {
  it("should have DEEPSEEK_API_KEY configured", () => {
    expect(process.env.DEEPSEEK_API_KEY).toBeDefined();
    expect(process.env.DEEPSEEK_API_KEY).toMatch(/^sk-/);
  });

  it("should successfully call DeepSeek API with the configured key", async () => {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    expect(apiKey).toBeDefined();

    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          {
            role: "user",
            content: "Hello",
          },
        ],
        max_tokens: 10,
      }),
    });

    expect(response.ok).toBe(true);
    const data = await response.json();
    expect(data).toHaveProperty("choices");
    expect(data.choices).toBeInstanceOf(Array);
    expect(data.choices.length).toBeGreaterThan(0);
  }, 30000); // 30秒超时
});
