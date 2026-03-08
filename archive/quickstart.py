import urllib.request
import urllib.error
import json
import os

def get_api_key():
    """Manually parse .env file to get the GEMINI_API_KEY without needing dotenv"""
    env_path = os.path.join(os.path.dirname(__file__), '.env')
    try:
        with open(env_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line.startswith('GEMINI_API_KEY='):
                    # Extract the value and remove quotes
                    val = line.split('=', 1)[1].strip()
                    if val.startswith('"') and val.endswith('"'):
                        val = val[1:len(val)-1]
                    elif val.startswith("'") and val.endswith("'"):
                        val = val[1:len(val)-1]
                    return val
    except FileNotFoundError:
        print("Warning: .env file not found.")
    return None

def main():
    api_key = get_api_key()
    
    if not api_key:
        print("Error: Could not find GEMINI_API_KEY in the .env file.")
        return

    print("Successfully read API key from your .env file!\n")
    
    # Use the Gemini REST API via Python's built-in urllib (no pip needed!)
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"
    
    question = "When is HackCU 12? Please give a simple and short response to this question."
    print(f"Question: {question}")
    print("Waiting for Gemini response...\n")
    
    data = {
        "contents": [{
            "parts": [{"text": question}]
        }]
    }
    
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode('utf-8'),
        headers={'Content-Type': 'application/json'}
    )
    
    try:
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read().decode('utf-8'))
            text_response = result['candidates'][0]['content']['parts'][0]['text']
            print("Response:")
            print(text_response)
    except urllib.error.HTTPError as e:
        print(f"Failed to connect to the Gemini API (HTTP Error): {e}")
        print(e.read().decode('utf-8'))
    except urllib.error.URLError as e:
        print(f"Failed to connect to the Gemini API (URL Error): {e.reason}")

if __name__ == "__main__":
    main()
