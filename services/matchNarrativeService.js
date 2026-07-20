/**
 * Match Narrative Service (Gemini AI)
 * 
 * Generates short natural-language "why you're matched" explanations.
 * Only called on-demand when a user opens a specific profile — never for list views.
 * 
 * Cached in User.matchNarrativeCache (Map keyed by other user's ObjectId string).
 * Uses sourceVersion fingerprint to detect when regeneration is needed.
 * 
 * Exports:
 *   getNarrative(viewerId, vieweeId) → { narrative, score, generatedAt, fromCache }
 */

const User = require("../models/user");
const MatchScore = require("../models/MatchScore");
const { generateSourceVersion } = require("./matchScoringBatchService");
const { MIN_SCORE_THRESHOLD } = require("../config/matching");

// ── Gemini AI Client ────────────────────────────────────────────────────────

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

/**
 * Call Gemini API to generate a match narrative.
 * Falls back to a template-based narrative if API key is not configured or call fails.
 */
async function callGeminiAPI(prompt) {
  if (!GEMINI_API_KEY) {
    // No API key configured — return null to trigger template fallback
    console.log("⚠️  GEMINI_API_KEY not configured, using template-based narrative");
    return null;
  }

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 150,
          topP: 0.9,
        },
      }),
    });

    if (!response.ok) {
      console.error(`❌ Gemini API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return text ? text.trim() : null;
  } catch (error) {
    console.error("❌ Gemini API call failed:", error.message);
    return null;
  }
}

// ── Narrative Generation ────────────────────────────────────────────────────

/**
 * Build structured facts from sub-scores for the AI prompt.
 * Only includes facts that contributed to the score — never invents reasons.
 */
function buildFactsFromScore(subScores, viewer, viewee) {
  const facts = [];

  // Islamic compatibility facts
  if (subScores.islamic && subScores.islamic.available > 0) {
    const ratio = subScores.islamic.earned / subScores.islamic.available;
    if (ratio >= 0.9) {
      facts.push("Strong Islamic compatibility — aligned on sect and prayer practice");
    } else if (ratio >= 0.5) {
      facts.push("Moderate Islamic compatibility — some alignment on faith practices");
    }
  }

  // Age compatibility facts
  if (subScores.age && subScores.age.available > 0) {
    const ratio = subScores.age.earned / subScores.age.available;
    if (ratio >= 0.9) {
      facts.push("Age preferences align well");
    } else if (ratio >= 0.5) {
      facts.push("Age ranges are close to each other's preferences");
    }
  }

  // Height compatibility facts
  if (subScores.height && subScores.height.available > 0) {
    const ratio = subScores.height.earned / subScores.height.available;
    if (ratio >= 0.9) {
      facts.push("Height preferences are a good match");
    }
  }

  // Marital status facts
  if (subScores.maritalFamily && subScores.maritalFamily.available > 0) {
    if (viewer.maritalStatus === "nevermarried" && viewee.maritalStatus === "nevermarried") {
      facts.push("Both are never married");
    }
  }

  // Location facts
  if (subScores.location && subScores.location.available > 0) {
    const ratio = subScores.location.earned / subScores.location.available;
    if (ratio >= 0.9) {
      facts.push(`Both are in ${viewer.city || "the same city"}`);
    } else if (viewer.country === viewee.country) {
      facts.push(`Both are in ${viewer.country || "the same country"}`);
    }
  }

  // Ethnicity facts
  if (subScores.nationalityEthnicity && subScores.nationalityEthnicity.available > 0) {
    if (subScores.nationalityEthnicity.earned === 10) {
      facts.push(`Shared ${viewer.ethnicity || "ethnic"} background`);
    }
  }

  // Education facts
  if (subScores.education && subScores.education.available > 0) {
    const ratio = subScores.education.earned / subScores.education.available;
    if (ratio >= 0.9) {
      facts.push("Similar educational background");
    }
  }

  return facts;
}

/**
 * Generate a template-based narrative as fallback when AI is unavailable.
 * Uses structured facts from the score — no invented claims.
 */
function generateTemplateNarrative(finalScore, subScores, viewer, viewee) {
  const facts = buildFactsFromScore(subScores, viewer, viewee);

  if (facts.length === 0) {
    return `You and ${viewee.name || viewee.username || "this person"} have a ${finalScore}% compatibility score based on the available profile information.`;
  }

  const factList = facts.slice(0, 3).join(". ");
  return `${factList}. Overall compatibility: ${finalScore}%.`;
}

/**
 * Build the AI prompt with structured facts (not raw free-text fields).
 */
function buildAIPrompt(finalScore, subScores, viewer, viewee) {
  const facts = buildFactsFromScore(subScores, viewer, viewee);
  const factText = facts.length > 0 ? facts.join(". ") : "No specific compatibility facts available.";

  // Light context from free-text fields — used for tone only, not as scored reasoning
  const contextNote = (viewer.lookingForASpouseThatIs || viewee.lookingForASpouseThatIs)
    ? "The following free-text context may help with tone but should NOT be used as scored compatibility claims: " +
      (viewer.lookingForASpouseThatIs ? `They are looking for: ${viewer.lookingForASpouseThatIs.slice(0, 100)}. ` : "") +
      (viewee.lookingForASpouseThatIs ? `The other person is looking for: ${viewee.lookingForASpouseThatIs.slice(0, 100)}.` : "")
    : "";

  return `You are a matchmaker on a Muslim matrimonial platform. Write 2-3 friendly, warm sentences explaining why two people are compatible, from the viewer's perspective. Use "you" for the viewer and "they" for the other person.

IMPORTANT: Only use these confirmed compatibility facts. Do not invent or assume anything not listed:

${factText}

${contextNote}

The compatibility score is ${finalScore}%. Write the narrative in a warm, encouraging tone suitable for a Muslim matrimonial context. Keep it under 150 characters.`;
}

/**
 * Get a match narrative for a viewer→viewee pair.
 * 
 * 1. Fetches the MatchScore
 * 2. Computes source version
 * 3. Checks User.matchNarrativeCache for valid cached entry
 * 4. If stale/missing, generates via Gemini (or template fallback)
 * 5. Caches result and returns
 */
async function getNarrative(viewerId, vieweeId) {
  // Fetch the score
  const score = await MatchScore.findOne({
    viewerId,
    vieweeId,
  });

  if (!score || score.finalScore < MIN_SCORE_THRESHOLD) {
    return {
      narrative: null,
      score: score ? score.finalScore : 0,
      generatedAt: null,
      fromCache: false,
      belowThreshold: true,
    };
  }

  // Fetch both users for source version computation
  const [viewer, viewee] = await Promise.all([
    User.findById(viewerId).select([
      "name", "username", "lookingForASpouseThatIs", "aboutMe",
      "maritalStatus", "city", "country", "ethnicity",
    ].concat(
      require("../config/matching").SCORED_FIELDS
    )),
    User.findById(vieweeId).select([
      "name", "username", "lookingForASpouseThatIs", "aboutMe",
      "maritalStatus", "city", "country", "ethnicity",
    ].concat(
      require("../config/matching").SCORED_FIELDS
    )),
  ]);

  if (!viewer || !viewee) {
    return { narrative: null, score: score.finalScore, generatedAt: null, fromCache: false };
  }

  // Compute source version to detect staleness
  const currentVersion = generateSourceVersion(viewer, viewee);

  // Check cache
  const cacheKey = vieweeId.toString();
  const cachedRaw = viewer.matchNarrativeCache?.get?.(cacheKey);

  if (cachedRaw) {
    let cached;
    try {
      cached = typeof cachedRaw === "string" ? JSON.parse(cachedRaw) : cachedRaw;
    } catch {
      cached = null;
    }

    if (cached && cached.sourceVersion === currentVersion && cached.score === score.finalScore) {
      return {
        narrative: cached.text,
        score: score.finalScore,
        generatedAt: cached.generatedAt,
        fromCache: true,
      };
    }
  }

  // Generate new narrative
  const prompt = buildAIPrompt(score.finalScore, score.subScores, viewer, viewee);

  let narrativeText = await callGeminiAPI(prompt);

  // Fallback to template if AI unavailable
  if (!narrativeText) {
    narrativeText = generateTemplateNarrative(score.finalScore, score.subScores, viewer, viewee);
  }

  // Cache result
  const cacheEntry = {
    text: narrativeText,
    score: score.finalScore,
    generatedAt: new Date().toISOString(),
    sourceVersion: currentVersion,
  };

  if (viewer.matchNarrativeCache) {
    viewer.matchNarrativeCache.set(cacheKey, JSON.stringify(cacheEntry));
    await viewer.save();
  }

  return {
    narrative: narrativeText,
    score: score.finalScore,
    generatedAt: cacheEntry.generatedAt,
    fromCache: false,
  };
}

module.exports = {
  getNarrative,
};
