import { GoogleGenAI, Type } from "@google/genai";
import { NarrativeModel, StoryOutline, LanguageStyle } from "../types";

const SYSTEM_INSTRUCTION = `你是一位深谙中老年读者心理的网络爽文创作专家，尤其擅长构建以“价值补偿”和“权力反转”为核心的情感体验。
你必须严格遵循以下【核心知识库】：

1. 三大核心情感内核:
- 价值补偿: 主人公一生的付出最终得到权威承认。
- 权力反转: 从弱势转为主导，对打压者进行降维打击。
- 晚年新生: 人生下半场充满无限可能。

2. 两大核心叙事模型:
- 模型 A [觉醒复仇-价值重估]: 长期奉献的主角在觉醒事件后转为“利己”，实现自我价值，让旧家庭/旧关系追悔莫及。
- 模型 B [身份错位-豪门逆袭]: 平凡主角在关键时刻揭示隐藏的强大身份，完成打脸逆袭。

3. 三幕式爽文结构:
- 第一幕：破局 (10-15%): 快速建立矛盾，触发觉醒。
- 第二幕：升级 (60-70%): 连续小高潮冲突（拒绝、反击、打脸）。
- 第三幕：爆点 (15-20%): 终极对决，释放爽感，晚年新生。

约束：
- 主角年龄约60岁左右。
- 在生成大纲阶段，请客观、清晰地描述事件和人物关系，不要过度渲染语言风格。
- 必须返回符合指定JSON格式的内容。`;

export async function generateStoryOutline(
  model: NarrativeModel, 
  trigger: string, 
  protagonistName: string,
  protagonistGender: 'male' | 'female',
  customApiKey?: string
): Promise<StoryOutline> {
  const ai = new GoogleGenAI({ apiKey: customApiKey || process.env.GEMINI_API_KEY || "" });
  
  const genderText = protagonistGender === 'female' ? '女性' : '男性';
  const prompt = `基于模型 ${model === 'A' ? 'A（觉醒复仇）' : 'B（身份错位）'} 和导火索事件“${trigger}”，创作一个详细的三幕式爽文大纲。
  主角姓名：${protagonistName}
  主角性别：${genderText}
  
  每一幕都需要提供极其详尽的情节走向，以便后续能扩展成数千字的文字。`;

  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: prompt,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          emotionalCore: { type: Type.STRING },
          act1: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              outline: { type: Type.STRING }
            },
            required: ["title", "outline"]
          },
          act2: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              outline: { type: Type.STRING }
            },
            required: ["title", "outline"]
          },
          act3: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              outline: { type: Type.STRING }
            },
            required: ["title", "outline"]
          },
          ending: { type: Type.STRING }
        },
        required: ["title", "emotionalCore", "act1", "act2", "act3", "ending"]
      }
    }
  });

  try {
    return JSON.parse(response.text || "{}");
  } catch (e) {
    throw new Error("解析故事大纲失败，请重试。");
  }
}

export async function* generateActSegmentStream(
  outline: StoryOutline, 
  actNumber: 1 | 2 | 3,
  segmentIndex: number,
  totalSegments: number,
  style: LanguageStyle,
  protagonistName: string,
  protagonistGender: 'male' | 'female',
  previousContext: string = "",
  customApiKey?: string
): AsyncGenerator<string> {
  const ai = new GoogleGenAI({ apiKey: customApiKey || process.env.GEMINI_API_KEY || "" });
  
  const genderText = protagonistGender === 'female' ? '女性' : '男性';
  const stylePrompts: Record<LanguageStyle, string> = {
    colloquial: `语言风格口语化、接地气，符合60岁左右${genderText}的口吻，节奏快，打脸狠。`,
    elegant: `语言风格优雅知性，文字优美且富有哲理，展现主角${protagonistName}从容淡定的气质。`,
    humorous: "语言风格幽默讽刺，多用辛辣的吐槽 and 反讽，让读者在笑声中感到爽快。",
    delicate: "语言风格情感细腻，重点刻画主角内心的挣扎与蜕变，文字感人至深。"
  };

  const act = actNumber === 1 ? outline.act1 : actNumber === 2 ? outline.act2 : outline.act3;
  
  const prompt = `你正在创作长篇爽文《${outline.title}》。
  
  主角姓名：${protagonistName}
  主角性别：${genderText}
  情感内核：${outline.emotionalCore}
  
  当前任务：创作 第 ${actNumber} 幕 - ${act.title} (第 ${segmentIndex + 1} / ${totalSegments} 段)
  本幕大纲：${act.outline}
  
  ${previousContext ? `【前情提要 - 严禁重复以下情节】：\n${previousContext}\n` : ""}
  
  写作要求：
  1. 请为本段创作约 1000 字左右的详细内容（确保全书总字数在 5000 字左右）。
  2. 使用第一人称（“我”）叙述，多用心理独白。
  3. ${stylePrompts[style]}
  4. 重点突出“价值补偿”和“权力反转”的爽感。
  5. **极其重要**：必须紧接“前情提要”的最后一句内容继续向下创作。绝对禁止重复“前情提要”中已经出现过的对话、场景、动作或心理描述。
  6. 保持情节连贯，确保与前文衔接自然。
  7. 如果是该幕的最后一段，请做好向下一幕的过渡。`;

  const response = await ai.models.generateContentStream({
    model: "gemini-3.1-pro-preview",
    contents: prompt,
    config: {
      systemInstruction: "你是一位顶级网络爽文作家，擅长创作让中老年女性读者欲罢不能的世情爽文。你的文字充满情感张力，节奏紧凑，爽点密集。",
    }
  });

  for await (const chunk of response) {
    if (chunk.text) {
      yield chunk.text;
    }
  }
}
export async function generateTriggers(
  model: NarrativeModel, 
  protagonistGender: 'male' | 'female',
  customApiKey?: string
): Promise<string[]> {
  const ai = new GoogleGenAI({ apiKey: customApiKey || process.env.GEMINI_API_KEY || "" });
  
  const genderText = protagonistGender === 'female' ? '女性' : '男性';
  const prompt = `请为中老年向网络爽文生成4个新的“导火索事件”。
  当前模型：${model === 'A' ? 'A（觉醒复仇 - 强调长期奉献后的背叛与觉醒）' : 'B（身份错位 - 强调平凡外表下的强大背景与当众羞辱）'}
  主角性别：${genderText}
  
  要求：
  1. 每个事件约20-40字。
  2. 冲突感极强，能瞬间激起读者的愤怒或期待。
  3. 符合50-70岁${genderText}主角的视角。
  4. 必须返回JSON数组格式，例如：["事件1", "事件2", "事件3", "事件4"]`;

  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: { type: Type.STRING }
      }
    }
  });

  try {
    return JSON.parse(response.text || "[]");
  } catch (e) {
    return PRESET_TRIGGERS[model];
  }
}

const PRESET_TRIGGERS = {
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
