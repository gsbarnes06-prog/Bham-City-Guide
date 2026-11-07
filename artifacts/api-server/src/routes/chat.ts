import { GoogleGenAI } from "@google/genai";
import { Router, type IRouter } from "express";
import {
  GetCityChatSystemPromptResponse,
  SendCityChatBody,
  SendCityChatResponse,
} from "@workspace/api-zod";
import { DEFAULT_CHAT_SETTINGS, getCitySystemPrompt } from "../city";

const router: IRouter = Router();
const DEFAULT_MODEL = "gemini-3.5-flash-lite";

router.get("/chat/system-prompt", (_req, res): void => {
  res.json(
    GetCityChatSystemPromptResponse.parse({
      systemPrompt: getCitySystemPrompt(),
    }),
  );
});

router.post("/chat", async (req, res): Promise<void> => {
  const parsed = SendCityChatBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.flatten() }, "Invalid city chat request");
    res.status(400).json({ error: "Enter a question and check the Prompt Lab settings." });
    return;
  }

  const message = parsed.data.message.trim();
  if (!message) {
    res.status(400).json({ error: "Enter a question to ask the city guide." });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    res.status(503).json({
      error: "Add a GEMINI_API_KEY secret to enable the Birmingham city guide.",
    });
    return;
  }

  const settings = {
    temperature:
      parsed.data.settings?.temperature ?? DEFAULT_CHAT_SETTINGS.temperature,
    topP: parsed.data.settings?.topP ?? DEFAULT_CHAT_SETTINGS.topP,
    maxOutputTokens:
      parsed.data.settings?.maxOutputTokens ??
      DEFAULT_CHAT_SETTINGS.maxOutputTokens,
  };
  const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
  const history = (parsed.data.history ?? []).map((entry) => ({
    role: entry.role === "assistant" ? ("model" as const) : ("user" as const),
    parts: [{ text: entry.content }],
  }));

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model,
      contents: [
        ...history,
        { role: "user", parts: [{ text: message }] },
      ],
      config: {
        systemInstruction: getCitySystemPrompt(),
        temperature: settings.temperature,
        topP: settings.topP,
        maxOutputTokens: settings.maxOutputTokens,
      },
    });

    const reply =
      response.text?.trim() ||
      "I’m not sure about that one. I can help with Birmingham’s barbecue, the city facts on this page, or the yellowhammer.";
    const tokenUsage = response.usageMetadata;
    const finishReason = String(response.candidates?.[0]?.finishReason ?? "");
    const result = SendCityChatResponse.parse({
      reply,
      usage: {
        promptTokens: tokenUsage?.promptTokenCount ?? 0,
        outputTokens: tokenUsage?.candidatesTokenCount ?? 0,
        totalTokens: tokenUsage?.totalTokenCount ?? 0,
      },
      settings,
      model,
      truncated: finishReason.includes("MAX_TOKENS"),
    });

    res.json(result);
  } catch (err) {
    req.log.error({ err, model }, "Gemini city chat request failed");
    res.status(502).json({
      error: "The city guide could not answer just now. Please try again.",
    });
  }
});

export default router;
