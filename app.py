import os
import json
import urllib.request
import urllib.error
from flask import Flask, request, jsonify
from flask_cors import CORS
from pypdf import PdfReader

app = Flask(__name__)
CORS(app)

def get_api_key():
    """Manually parse .env file to get the GEMINI_API_KEY"""
    env_path = os.path.join(os.path.dirname(__file__), '.env')
    try:
        with open(env_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line.startswith('GEMINI_API_KEY='):
                    val = line.split('=', 1)[1].strip()
                    if val.startswith('"') and val.endswith('"'):
                        return val[1:len(val)-1]
                    elif val.startswith("'") and val.endswith("'"):
                        return val[1:len(val)-1]
                    return val
    except FileNotFoundError:
        return None
    return None

def extract_text_from_pdf(pdf_file):
    reader = PdfReader(pdf_file)
    text = ""
    for page in reader.pages:
        text += page.extract_text() + "\n"
    return text

@app.route('/api/process_audits', methods=['POST'])
def process_audits():
    if 'main_major' not in request.files or 'target_minor' not in request.files:
        return jsonify({'error': 'Missing main_major or target_minor PDF files'}), 400

    main_major_file = request.files['main_major']
    target_minor_file = request.files['target_minor']

    try:
        main_major_text = extract_text_from_pdf(main_major_file)
        target_minor_text = extract_text_from_pdf(target_minor_file)
    except Exception as e:
        return jsonify({'error': f'Failed to parse PDF files: {str(e)}'}), 400

    api_key = get_api_key()
    if not api_key:
        return jsonify({'error': 'GEMINI_API_KEY not found in .env'}), 500

    prompt = f"""
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
{{
  "audit_summary": {{
    "major": "Computer Science",
    "minor_intent": "Applied Math",
    "credits_remaining": 42
  }},
  "overlap_opportunities": [
    {{
      "code": "CSCI 2820",
      "name": "Linear Algebra",
      "major_category": "Foundation",
      "minor_category": "Elective",
      "efficiency_score": "High"
    }}
  ],
  "semester_plan": [
    {{
      "term": "Fall 2026",
      "courses": [
        {{"code": "CSCI 3104", "credits": 4, "type": "Major_Core"}},
        {{"code": "CSCI 2820", "credits": 3, "type": "Overlap"}}
      ],
      "total_term_credits": 15
    }}
  ],
  "missing_data_warnings": []
}}

RESPOND ONLY WITH THE RAW JSON. DO NOT INCLUDE MARKDOWN BLOCK formatting.

---
Main Major Audit Text:
{main_major_text}

---
Target Minor Audit Text:
{target_minor_text}
"""

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"
    
    data = {"contents": [{"parts": [{"text": prompt}]}]}
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode('utf-8'),
        headers={'Content-Type': 'application/json'}
    )

    try:
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read().decode('utf-8'))
            text_response = result['candidates'][0]['content']['parts'][0]['text']
            
            # Clean up the response in case Gemini includes markdown codes
            text_response = text_response.strip()
            if text_response.startswith('```json'):
                text_response = text_response[7:]
            if text_response.endswith('```'):
                text_response = text_response[:-3]
            text_response = text_response.strip()

            return jsonify(json.loads(text_response))
    except urllib.error.HTTPError as e:
        return jsonify({'error': f'Gemini API error: {e.read().decode("utf-8")}'}), 502
    except urllib.error.URLError as e:
        return jsonify({'error': f'Failed to connect to Gemini API: {e.reason}'}), 502
    except json.JSONDecodeError as e:
        return jsonify({'error': f'Failed to parse Gemini response as JSON: {text_response}'}), 502

if __name__ == '__main__':
    app.run(debug=True, port=5000)
