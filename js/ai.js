/* ============================================
   声音手账 - 多厂商 AI 模块
   支持: 智谱 GLM / Gemini / 通义千问
   ============================================ */

const JOURNAL_PROMPT_WITH_PHOTO = `你是手帐助手。用户说："{TRANSCRIPT}"，并附了照片。
请把用户的话润色成手帐文案（最多比原话多15字），保持口语风格，不要写成散文。
只输出JSON，不要任何解释：
{"title":"手帐标题(6字内)","journal":"润色后的手帐文字","mood":"开心/平静/感动/兴奋/治愈/疲惫/感恩","tags":["标签"],"poem":"一句小诗(5字内)"}`;

const JOURNAL_PROMPT_TEXT_ONLY = `你是手帐助手。用户说："{TRANSCRIPT}"。
请把用户的话润色成手帐文案（最多比原话多15字），保持口语风格，不要写成散文。
只输出JSON，不要任何解释：
{"title":"手帐标题(6字内)","journal":"润色后的手帐文字","mood":"开心/平静/感动/兴奋/治愈/疲惫/感恩","tags":["标签"],"poem":"一句小诗(5字内)"}`;

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
      return {
        model: 'glm-4v-flash',
        messages: [{ role: 'user', content: buildZhipuContent(imageBase64, transcript) }],
        temperature: 0.9, max_tokens: 1024
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
    try {
      const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      return JSON.parse(cleaned);
    } catch (e) {
      try { return JSON.parse(text.trim()); } catch (e2) {
        throw new Error('AI 返回格式异常，请点"换一个"重试');
      }
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
