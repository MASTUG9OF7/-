export type NarrativeModel = 'A' | 'B';
export type LanguageStyle = 'colloquial' | 'elegant' | 'humorous' | 'delicate';

export interface Act {
  title: string;
  outline: string;
  content?: string;
}

export interface StoryOutline {
  title: string;
  emotionalCore: string;
  act1: Act;
  act2: Act;
  act3: Act;
  ending: string;
}

export interface GenerationState {
  model: NarrativeModel | null;
  languageStyle: LanguageStyle;
  triggerEvent: string;
  isGenerating: boolean;
  isGeneratingStory: boolean;
  currentGeneratingStep: string | null; // e.g., "第一幕 (1/3)"
  outline: StoryOutline | null;
  fullStory: string | null;
  error: string | null;
}
