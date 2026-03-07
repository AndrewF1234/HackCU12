const express = require('express');
const cors = require('cors');
const multer = require('multer');
const pdf = require('pdf-parse');
const axios = require('axios');
require('dotenv').config(); // Replaces the manual .env parser

const app = express();
const port = 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Setup Multer for file uploads (memory storage)
const upload = multer({ storage: multer.memoryStorage() });

/**
 * Helper to extract text from PDF buffer
 */
async function extractTextFromPDF(buffer) {
    const data = await pdf(buffer);
    return data.text;
}

app.post('/api/process_audits', upload.fields([
    { name: 'main_major', maxCount: 1 },
    { name: 'target_minor', maxCount: 1 }
]), async (req, res) => {
    
    // 1. Validation
    if (!req.files || !req.files['main_major'] || !req.files['target_minor']) {
        return res.status(400).json({ error: 'Missing main_major or target_minor PDF files' });
    }

    try {
        // 2. Extract Text
        const mainMajorText = await extractTextFromPDF(req.files['main_major'][0].buffer);
        const targetMinorText = await extractTextFromPDF(req.files['target_minor'][0].buffer);

        // 3. API Key Check
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: 'GEMINI_API_KEY not found in .env' });
        }

        // 4. Construct Prompt
        const prompt = `
Analyze the attached degree audits (Main_Major and Target_Minor).

### Task 1: Extraction
Extract all "Remaining" requirements for both programs. Group them by category (e.g., "Core," "Professional Electives," "Gen Ed").

### Task 2: Intersection Analysis
Identify every course code that appears as an option in BOTH the Main_Major 'Remaining' list and the Target_Minor 'Remaining' list. Label these as "High_Priority_Overlaps".

### Task 3: Scheduling
Generate a semester-by-semester plan for the remaining years. 
- Prioritize "High_Priority_Overlaps" in the earliest possible semesters.
- Maximize 15 credits per semester.
- Flag any "Generic Requirements" (e.g., "Any 3000+ level Humanities") that haven't been assigned a specific course yet.

### Required JSON Structure:
{
  "audit_summary": {
    "major": "Computer Science",
    "minor_intent": "Applied Math",
    "credits_remaining": 42
  },
  "overlap_opportunities": [
    {
      "code": "CSCI 2820",
      "name": "Linear Algebra",
      "major_category": "Foundation",
      "minor_category": "Elective",
      "efficiency_score": "High"
    }
  ],
  "semester_plan": [
    {
      "term": "Fall 2026",
      "courses": [
        {"code": "CSCI 3104", "credits": 4, "type": "Major_Core"},
        {"code": "CSCI 2820", "credits": 3, "type": "Overlap"}
      ],
      "total_term_credits": 15
    }
  ],
  "missing_data_warnings": []
}

RESPOND ONLY WITH THE RAW JSON. DO NOT INCLUDE MARKDOWN BLOCK formatting.

---
Main Major Audit Text:
${mainMajorText}

---
Target Minor Audit Text:
${targetMinorText}
`;

        // 5. Call Gemini API
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
        
        const response = await axios.post(url, {
            contents: [{ parts: [{ text: prompt }] }]
        });

        let textResponse = response.data.candidates[0].content.parts[0].text.trim();

        // 6. Clean Markdown Formatting
        if (textResponse.startsWith('```json')) {
            textResponse = textResponse.replace(/^```json/, '').replace(/```$/, '').trim();
        }

        // 7. Parse and Return
        const jsonResult = JSON.parse(textResponse);
        return res.json(jsonResult);

    } catch (error) {
        console.error(error);
        if (error.response) {
            return res.status(502).json({ error: `Gemini API error: ${JSON.stringify(error.response.data)}` });
        }
        return res.status(500).json({ error: `Server error: ${error.message}` });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});