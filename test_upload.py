import requests
import json
import sys

url = 'http://127.0.0.1:5000/api/process_audits'
files = {
    'main_major': open('example.pdf', 'rb'),
    'target_minor': open('example.pdf', 'rb')
}

print("Sending request to", url)
sys.stdout.flush()
try:
    response = requests.post(url, files=files)
    print("Status Code:", response.status_code)
    sys.stdout.flush()
    with open('output.json', 'w', encoding='utf-8') as f:
        f.write(response.text)
    print("Response written to output.json")
except Exception as e:
    print("Error:", e)
