# 🚀 Viva.AI - Quick Start

## ONE-MINUTE SETUP

### Step 1: Create API Key File

Create a file called `.env` in this folder with your Gemini API key:

```bash
GEMINI_API_KEY=your_actual_api_key_here
```

### Step 2: Start Backend

```bash
npm install
npm run dev
```

**WAIT** until you see:
```
Server running on http://localhost:5000
```

### Step 3: Load Extension

1. Open Chrome: `chrome://extensions/`
2. Turn on "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the `apps/extension` folder from this project
5. Click the Viva.AI icon in Chrome toolbar

### Step 4: Enable Debug Mode (See What's Happening!)

1. Click the Viva.AI extension icon
2. Press F12 (opens console)
3. In the console, type:
```javascript
localStorage.setItem('viva_debug', '1')
```
4. Reload the extension

Now you'll see detailed logs of everything happening!

## ✅ TEST IT WORKS

1. Go to Wikipedia: https://en.wikipedia.org/wiki/Python_(programming_language)
2. Click Viva.AI icon
3. Click "🎤 Start Listening"
4. Say: **"summarize this page"**

**You should see:**
- Status updates: "🧠 Understanding..." → "📝 Planning..." → "⚙️ Executing..."
- The AI speaks the summary aloud
- Status shows: "✅ I'll summarize this page for you"

**If it doesn't work:**
- Check the backend terminal - is it still running?
- Check the browser console (F12) - any errors?
- See TESTING.md for full debugging guide

## 🎯 Try These Commands

| Say This | What Happens |
|----------|--------------|
| "summarize this page" | Reads and summarizes the article |
| "search for Python tutorials" | Searches Google and announces results |
| "switch to YouTube" | Switches to YouTube tab (if open) |
| "go to Gmail" | Opens Gmail tab |
| "what is Python used for?" | Answers based on current page |

## 🐛 Something Not Working?

**Most common issue:** Backend not running!

**Quick check:**
```bash
curl http://localhost:5000/health
```

If you get an error, the backend isn't running. Start it with:
```bash
npm run dev
```

**Full debugging guide:** See TESTING.md

## 📊 See What's in Memory

In the extension popup console (F12):
```javascript
chrome.storage.local.get('viva_persistent_memory', (data) => {
  console.log('Articles saved:', data.viva_persistent_memory?.articles?.length || 0);
  console.log('Conversations saved:', data.viva_persistent_memory?.conversations?.length || 0);
});
```

## 🔧 Quick Fixes

| Problem | Fix |
|---------|-----|
| "Failed to fetch" | Backend not running → `npm run dev` |
| No speech recognition | Allow microphone in Chrome |
| Nothing happens | Enable debug mode and check console |
| Silent (no voice) | Check volume, check for TTS errors in console |

## 🎤 For Blind Users

This extension is designed for you! Here's what you need to know:

1. **Everything is spoken aloud** - summaries, answers, search results
2. **No need to look at screen** - just listen for the status updates
3. **Memory is permanent** - every article and Q&A is saved forever
4. **Natural conversation** - speak naturally, AI understands context

### Voice Commands That Work:
- "Read this to me" / "Summarize this page"
- "What does this say?" / "What's this about?"
- "Search for [topic]"
- "Switch to [app name]" / "Go to [site]"
- "Tell me more about [topic from page]"

The AI remembers everything, so you can ask:
- "What was that article about carrots I read yesterday?"
- "Did I already summarize this?"

## ⚙️ Advanced: Check Backend Endpoints

```bash
# Test intent classification
curl -X POST http://localhost:5000/ai/intent \
  -H "Content-Type: application/json" \
  -d '{"utterance":"summarize","pageMap":{},"memory":{},"locale":"en"}'

# Test summarization
curl -X POST http://localhost:5000/ai/summarize \
  -H "Content-Type: application/json" \
  -d '{"content":"Test article","url":"http://test","title":"Test"}'

# All should return JSON (not errors)
```

---

**Need Help?**
1. Check TESTING.md for full debugging guide
2. Enable debug mode to see detailed logs
3. Check both backend terminal AND browser console
4. Report bugs with specific error messages from logs
