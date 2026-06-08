// Typed loaders for the JSON the offline pipeline emits. Composition props
// pass these through; staticFile() resolves paths relative to public/.

export type Word = {
  word: string;
  punctuated_word?: string;
  start: number;
  end: number;
  speaker?: number;
};

export type Utterance = {
  start: number;
  end: number;
  transcript: string;
  speaker?: number;
  words: Word[];
};

export type Transcript = {
  metadata: { duration: number; channels: number };
  results: {
    channels: Array<{
      alternatives: Array<{ transcript: string; words: Word[] }>;
      detected_language?: string;
    }>;
    utterances?: Utterance[];
  };
};

export type Profile = {
  username: string;
  fid: number;
  display_name: string;
  pfp_path: string;
};

export type Guest = Profile & {
  intro_id: number;
  start_ms: number;
  end_ms: number;
  candidate_name: string | null;
};

export type Profiles = {
  host: Profile;
  guests: Guest[];
};
