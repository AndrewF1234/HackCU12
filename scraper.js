import fs from "fs/promises";
import fsSync from "fs";
import fetch from "node-fetch";

function getApiKey() {
  const envPath = "./.env";

  try {
    const envContent = fsSync.readFileSync(envPath, "utf-8");

    for (const line of envContent.split("\n")) {
      const trimmed = line.trim();

      if (trimmed.startsWith("GEMINI_API_KEY=")) {
        const parts = trimmed.split("=");

        if (parts.length >= 2) {
          let val = parts.slice(1).join("=").trim();

          if (val.startsWith('"') && val.endsWith('"')) {
            val = val.slice(1, -1);
          } else if (val.startsWith("'") && val.endsWith("'")) {
            val = val.slice(1, -1);
          }

          return val;
        }
      }
    }
  } catch (e) {
    console.error("Unable to read .env file:", e.message);
  }

  return null;
}

async function main() {
  const major = process.argv[2];

  if (!major) {
    console.error("Usage: node scraper.js <major>");
    process.exit(1);
  }

  const key = getApiKey();

  if (!key) {
    console.error("GEMINI_API_KEY not found in .env");
    process.exit(1);
  }

  const prompt = `
Act as a precise university academic data extractor. 

TASK:
1. Use the Google Search tool to find the official degree requirements for a major in ${major}.
2. Research a reputable university's current academic catalog for CU boulder to ensure
 the data reflects real course codes and credit hours.
3. Identify ALL requirements for graduation, including:
   - Specific Core Major courses.
   - Required foundational math/science courses.
   - General Education / Core Curriculum requirements (e.g., Arts & Sciences, Writing, Diversity).

JSON STRUCTURE RULES:
- If a requirement is a single mandatory course, provide it as: {"class": ["DEPT 1000"], "credits": 3}.
- If a requirement allows a choice between multiple courses (a selective list where only one is needed), group them in a single array: {"class": ["DEPT 1000", "DEPT 1001"], "credits": 3}.
- Return ONLY a raw JSON array of these objects.

CONSTRAINTS:
- Use only REAL course codes (e.g., "MATH 1300", not "Calculus 1").
- Do not include electives that have infinite choices (e.g., "Any 3000-level elective"). Only include specific named courses or defined selective lists.
- No markdown formatting (no json blocks). 
- No preamble, no explanations, no text outside the JSON.

MAJOR TO RESEARCH: ${major}
`;

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }]
          }
        ],
        tools: [
          {
            google_search: {}
          }
        ],
        generationConfig: {
          temperature: 0

        }
      })
    }
  );

  if (!resp.ok) {
    const err = await resp.text();
    console.error("Gemini API error:", err);
    process.exit(1);
  }

  const data = await resp.json();

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    console.error("No response from Gemini.");
    process.exit(1);
  }

  let courses;

  try {
    // Extract JSON from code blocks if present
    let jsonText = text.trim();
    if (jsonText.includes('```')) {
      const match = jsonText.match(/```\w*\s*([\s\S]*?)\s*```/);
      if (match) {
        jsonText = match[1].trim();
      }
    }
    courses = JSON.parse(jsonText);
  } catch (err) {
    console.error("Failed to parse JSON:");
    console.error(text);
    process.exit(1);
  }

  await fs.writeFile(
    `${major}_requirements.json`,
    JSON.stringify(courses, null, 2)
  );

  console.log(`Saved ${major}_requirements.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});