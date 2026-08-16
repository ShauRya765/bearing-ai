// The judge's transport. Kept apart from judge.ts on purpose: everything that
// decides the faithfulness NUMBER — the prompt, the parsing, the arithmetic —
// lives in judge.ts and is pure, unit tested, and importable without an API key.
// This file is the one part that needs the network, and it holds no logic worth
// testing.
//
// It is also why judge.ts takes a `generate` function rather than calling Gemini
// itself: the tests drive it with a fake, including the failure paths that a
// live model would only produce occasionally and at random.

import { GoogleGenAI } from "@google/genai";
import { JUDGE_MODEL } from "@/lib/eval/judge";

let client: GoogleGenAI | null = null;

function genAI(): GoogleGenAI {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is required to run the judge.");
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

export async function judgeGenerate(prompt: string): Promise<string> {
  const response = await genAI().models.generateContent({
    model: JUDGE_MODEL,
    contents: prompt,
    config: {
      // Ask for JSON at the API level as well as in the prompt. The parser still
      // strips fences and prose, because this setting is a strong hint rather
      // than a guarantee across model versions.
      responseMimeType: "application/json",
      // Judging is a classification task, not a creative one. Low temperature
      // makes the verdicts reproducible enough that a faithfulness delta between
      // two runs is more likely to be the answers changing than the judge's mood.
      temperature: 0,
      // Generous: a long answer decomposes into many claims, and a truncated
      // reply is unparseable, which shows up as a judge failure rather than as
      // the partial result it actually is.
      maxOutputTokens: 8192,
    },
  });
  return response.text ?? "";
}
