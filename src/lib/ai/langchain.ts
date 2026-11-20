import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { RunnableSequence } from "@langchain/core/runnables";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { estimateCost, DEFAULT_MODEL } from "./models";
import { buildPrompt, SYSTEM_PROMPT, taskOutputTokens, taskTemperature } from "./prompts";
import { withRagContext } from "./rag";
import type { AiGenRequest, AiGenResponse, AiUsageMeta } from "./types";

function llm(modelId: string, task: AiGenRequest["task"]) {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured.");
  return new ChatGoogleGenerativeAI({
    model: modelId,
    apiKey: process.env.GEMINI_API_KEY,
    maxOutputTokens: taskOutputTokens(task),
    temperature: taskTemperature(task),
  });
}

/** Non-chat generation: single prompt → structured output via a RunnableSequence chain. */
export async function langchainGenerate(req: AiGenRequest, ragContext = ""): Promise<AiGenResponse> {
  const start = Date.now();
  const modelId = req.model ?? DEFAULT_MODEL;
  const task = req.task;

  const rawPrompt = buildPrompt(task, req.context);
  const augmentedPrompt = ragContext ? withRagContext(rawPrompt, ragContext) : rawPrompt;

  const promptTemplate = ChatPromptTemplate.fromMessages([
    ["system", SYSTEM_PROMPT],
    ["human", "{input}"],
  ]);

  const chain = RunnableSequence.from([
    promptTemplate,
    llm(modelId, task),
    new StringOutputParser(),
  ]);

  const result = await chain.invoke({ input: augmentedPrompt });

  // LangChain StringOutputParser returns a string; token counts are not exposed through it.
  // Estimate from character count (rough: 4 chars ≈ 1 token).
  const promptTokens = Math.ceil(augmentedPrompt.length / 4);
  const completionTokens = Math.ceil(result.length / 4);
  const totalTokens = promptTokens + completionTokens;
  const usage: AiUsageMeta = {
    promptTokens,
    completionTokens,
    totalTokens,
    estimatedCostUsd: estimateCost(modelId, promptTokens, completionTokens),
  };

  return { result, model: modelId, mode: "langchain", usage, durationMs: Date.now() - start };
}

/** Conversational chat with optional RAG context and message history. */
export async function langchainChat(req: AiGenRequest, ragContext = ""): Promise<AiGenResponse> {
  const start = Date.now();
  const modelId = req.model ?? DEFAULT_MODEL;
  const ctx = req.context;

  const userMessage = ctx.question?.trim() || "Hello, how can you help with SEO?";
  const augmentedMessage = ragContext ? withRagContext(userMessage, ragContext) : userMessage;

  const history = (ctx.history ?? []).map((turn) =>
    turn.role === "user" ? new HumanMessage(turn.content) : new AIMessage(turn.content),
  );

  const promptTemplate = ChatPromptTemplate.fromMessages([
    ["system", SYSTEM_PROMPT],
    new MessagesPlaceholder("history"),
    ["human", "{input}"],
  ]);

  const chain = RunnableSequence.from([
    promptTemplate,
    llm(modelId, "chat"),
    new StringOutputParser(),
  ]);

  const result = await chain.invoke({ history, input: augmentedMessage });

  const promptTokens = Math.ceil((SYSTEM_PROMPT.length + history.reduce((s, m) => s + String(m.content).length, 0) + augmentedMessage.length) / 4);
  const completionTokens = Math.ceil(result.length / 4);
  const totalTokens = promptTokens + completionTokens;
  const usage: AiUsageMeta = {
    promptTokens,
    completionTokens,
    totalTokens,
    estimatedCostUsd: estimateCost(modelId, promptTokens, completionTokens),
  };

  return { result, model: modelId, mode: "langchain", usage, durationMs: Date.now() - start };
}

export async function langchainTestConnection(modelId = DEFAULT_MODEL): Promise<{ ok: boolean; error?: string }> {
  try {
    const model = llm(modelId, "chat");
    const result = await model.invoke([new HumanMessage("Reply with the single word: connected")]);
    if (!String(result.content).toLowerCase().includes("connected")) throw new Error("Unexpected response.");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
