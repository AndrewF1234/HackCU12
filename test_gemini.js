import fsSync from 'fs';
import fetch from 'node-fetch';

function getApiKey() {
  const envPath = './.env';
  try {
    const envContent = fsSync.readFileSync(envPath, 'utf-8');
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('GEMINI_API_KEY=')) {
        const parts = trimmed.split('=');
        if (parts.length >= 2) {
          let val = parts.slice(1).join('=').trim();
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
    console.error('Unable to read .env file:', e.message);
  }
  return null;
}

async function testGemini() {
  const key = getApiKey();
  console.log('API key found:', key ? 'YES' : 'NO');
  if (!key) return;

  const prompt = 'Say hello world';

  console.log('Making Gemini API call...');
  try {
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }]
      }),
    });

    console.log('Response status:', resp.status);
    const data = await resp.json();
    console.log('Response:', JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Error:', e);
  }
}

testGemini();