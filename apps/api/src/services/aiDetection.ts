import Groq from "groq-sdk";

type AiDetectionResult = {
  authenticityScore: number;
  isSpam: boolean;
  reason: string;
};

const AI_SYSTEM_PROMPT =
  "You are an authenticity checker for social media posts. Analyze the given post content and return ONLY valid JSON: { authenticityScore: number (0-1), isSpam: boolean, reason: string } Score 0.8+ = genuine, 0.5-0.8 = questionable, below 0.5 = likely AI/spam";

const groqApiKey = process.env.GROQ_API_KEY;
const groqModel = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";
const groq = groqApiKey ? new Groq({ apiKey: groqApiKey }) : null;

function parseAiJson(content: string): AiDetectionResult {
  const trimmed = content.trim();
  const jsonCandidate = trimmed.startsWith("```")
    ? trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
    : trimmed;

  const parsed = JSON.parse(jsonCandidate) as Partial<AiDetectionResult>;

  const authenticityScore = Number(parsed.authenticityScore);
  const isSpam = Boolean(parsed.isSpam);
  const reason =
    typeof parsed.reason === "string" ? parsed.reason : "No reason provided";

  if (
    !Number.isFinite(authenticityScore) ||
    authenticityScore < 0 ||
    authenticityScore > 1
  ) {
    throw new Error("Invalid authenticity score in AI response");
  }

  return {
    authenticityScore,
    isSpam,
    reason,
  };
}

async function runAiDetection(postContent: string): Promise<AiDetectionResult> {
  if (!groq) {
    throw new Error("GROQ_API_KEY is not configured");
  }

  const response = await groq.chat.completions.create({
    model: groqModel,
    messages: [
      {
        role: "system",
        content: AI_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: postContent.slice(0, 7000),
      },
    ],
    temperature: 0,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Empty AI response");
  }

  return parseAiJson(content);
}

export { runAiDetection };
