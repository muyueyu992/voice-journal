/* ============================================
   声音手账 - 多厂商 AI 模块
   支持: 智谱 GLM / Gemini / 通义千问
   ============================================ */

const JOURNAL_PROMPT_WITH_PHOTO = `根据用户原话和照片，生成手帐。原话："{TRANSCRIPT}"
要求：保持原话的口语风格，微调通顺即可，最多新增15字。输出纯JSON对象：
{"title":"标题≤6字","journal":"润色文字","mood":"开心|平静|感动|兴奋|治愈|疲惫|感恩","tags":["标签1","标签2"],"poem":"短诗≤5字"}`;

const JOURNAL_PROMPT_TEXT_ONLY = `根据用户原话生成手帐。原话："{TRANSCRIPT}"
要求：保持原话的口语风格，微调通顺即可，最多新增15字。输出纯JSON对象：
{"title":"标题≤6字","journal":"润色文字","mood":"开心|平静|感动|兴奋|治愈|疲惫|感恩","tags":["标签1","标签2"],"poem":"短诗≤5字"}`;

function buildZhipuContent(imageBase64, transcript) {
  const t = transcript || '（用户没有说话）';
  const hasImage = !!imageBase64;
  const prompt = (hasImage ? JOURNAL_PROMPT_WITH_PHOTO : JOURNAL_PROMPT_TEXT_ONLY).replace('{TRANSCRIPT}', t);
  const content = [{ type: 'text', text: prompt }];
  if (hasImage) content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } });
  return content;
}

function buildGeminiParts(imageBase64, transcript) {
  const t = transcript || '（用户没有说话）';
  const hasImage = !!imageBase64;
  const prompt = (hasImage ? JOURNAL_PROMPT_WITH_PHOTO : JOURNAL_PROMPT_TEXT_ONLY).replace('{TRANSCRIPT}', t);
  const parts = [{ text: prompt }];
  if (hasImage) parts.push({ inline_data: { mime_type: 'image/jpeg', data: imageBase64 } });
  return parts;
}

const PROVIDERS = {
  zhipu: {
    name: '智谱 GLM-4V',
    endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    buildRequest(imageBase64, transcript) {
      const hasImage = !!imageBase64;
      return {
        model: hasImage ? 'glm-4v-flash' : 'glm-4-flash',
        messages: [{ role: 'user', content: buildZhipuContent(imageBase64, transcript) }],
        temperature: 0.9, max_tokens: 1024,
        response_format: { type: 'json_object' }
      };
    },
    parseResponse(data) {
      if (!data.choices?.length) throw new Error('无AI返回内容');
      return data.choices[0].message.content;
    }
  },
  gemini: {
    name: 'Gemini 1.5 Flash',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent',
    buildRequest(imageBase64, transcript) {
      return {
        contents: [{ parts: buildGeminiParts(imageBase64, transcript) }],
        generationConfig: { temperature: 0.9, maxOutputTokens: 1024 }
      };
    },
    parseResponse(data) {
      if (!data.candidates?.length) throw new Error('无AI返回内容');
      return data.candidates[0].content.parts[0].text;
    }
  },
  qwen: {
    name: '通义千问 Qwen-VL',
    endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    buildRequest(imageBase64, transcript) {
      return {
        model: 'qwen-vl-plus',
        messages: [{ role: 'user', content: buildZhipuContent(imageBase64, transcript) }],
        temperature: 0.9, max_tokens: 1024
      };
    },
    parseResponse(data) {
      if (!data.choices?.length) throw new Error('无AI返回内容');
      return data.choices[0].message.content;
    }
  }
};

class AIClient {
  constructor(provider, apiKey) {
    this.provider = provider;
    this.apiKey = apiKey;
    this.config = PROVIDERS[provider];
    if (!this.config) throw new Error(`Unknown provider: ${provider}`);
  }

  async generateJournal(imageBase64, transcript) {
    const body = this.config.buildRequest(imageBase64 || null, transcript);

    let url = this.config.endpoint;
    const headers = { 'Content-Type': 'application/json' };

    if (this.provider === 'gemini') {
      url += `?key=${this.apiKey}`;
    } else {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`${this.config.name} 错误 (${response.status}): ${err.substring(0, 200)}`);
    }

    const data = await response.json();
    const text = this.config.parseResponse(data);
    return this.parseJournalJSON(text);
  }

  parseJournalJSON(text) {
    // Extract JSON from possibly mixed Chinese+JSON response
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try { return JSON.parse(m[0]); } catch (e) {}
    }
    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    try { return JSON.parse(cleaned); } catch (e) {
      throw new Error('AI 返回格式异常，请点"换一个"重试');
    }
  }

  static getProviders() {
    return Object.keys(PROVIDERS).map(k => ({ id: k, name: PROVIDERS[k].name }));
  }

  static async testConnection(provider, apiKey) {
    const client = new AIClient(provider, apiKey);
    await client.generateJournal(null, 'test');
    return true;
  }
}
