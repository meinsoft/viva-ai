# Viva.AI Testing & Debugging Guide

## ⚠️ CRITICAL: Start Backend First!

The extension WILL NOT WORK without the backend running!

### 1. Start the Backend (REQUIRED!)

```bash
# From the project root
cd /path/to/viva-ai
npm install
npm run dev
```

**Expected output:**
```
Server running on http://localhost:5000
Ready to process AI requests
```

**If you see an error:**
- Make sure you have a `.env` file with `GEMINI_API_KEY=your_key_here`
- Check Node.js version: `node --version` (should be 18 or higher)

### 2. Load the Extension

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the `apps/extension` folder
5. You should see "Viva.AI" in your extensions

### 3. Enable Debug Mode (See What's Happening!)

Open Chrome DevTools Console (F12), then run:

```javascript
localStorage.setItem('viva_debug', '1')
```

Now reload the extension. You'll see detailed logs like:
```
[VIVA] Processing utterance: summarize this page
[VIVA] Calling /ai/intent with memory context
[VIVA] Intent result: { intent: "page_insight", confidence: 0.95 }
```

## Testing Each Feature

### ✅ Test 1: Summarization

**What to do:**
1. Go to any article (e.g., Wikipedia)
2. Click the Viva.AI extension icon
3. Click "🎤 Start Listening"
4. Say: **"summarize this page"**

**What SHOULD happen:**
- Status shows: "🧠 Understanding what you want..."
- Status shows: "📋 Intent: page_insight (95% confident)"
- Status shows: "📝 Planning how to do it..."
- Status shows: "⚙️ Executing 1 action(s)..."
- Status shows: "✅ I'll summarize this page for you"
- You HEAR the summary spoken aloud
- Status shows the summary text

**If it doesn't work:**

**A. Check Backend Console** (where you ran `npm run dev`):
```
Look for:
✓ POST /ai/intent 200 (means it worked)
✓ POST /ai/plan 200
✓ POST /ai/summarize 200

✗ POST /ai/intent 500 (means ERROR - read the error message!)
```

**B. Check Extension Console** (F12 in the popup):
```javascript
// Look for errors like:
"Backend error (500): ..." ← Backend is broken
"Failed to fetch" ← Backend not running!
"No intent detected" ← AI couldn't understand
```

**C. Common Fixes:**
- ❌ "Failed to fetch" → **Backend not running!** Run `npm run dev`
- ❌ "500 error" → Check backend console for Gemini API errors
- ❌ "No content found" → Page might be blocked (try a different site)

### ✅ Test 2: Tab Switching

**What to do:**
1. Open multiple tabs (e.g., YouTube, GitHub, Gmail)
2. Click Viva.AI extension
3. Say: **"switch to YouTube"** or **"go to Gmail"**

**What SHOULD happen:**
- Chrome switches to the matching tab

**If it doesn't work:**
Check debug logs:
```
[VIVA] Executing TAB_SWITCH: youtube
[VIVA] Tab match scores: [...]
[VIVA] Switched to tab: YouTube (score: 95)
```

### ✅ Test 3: Search with Voice Announcements

**What to do:**
1. Click Viva.AI extension
2. Say: **"search for Python programming tutorials"**

**What SHOULD happen:**
1. Google search opens
2. Page loads
3. Wait ~2 seconds
4. You HEAR: "I found several helpful resources. There's a Wikipedia article, tutorial sites, and YouTube videos. I recommend the first tutorial as it's comprehensive. Would you like me to open it?"

**If it doesn't work:**

Check these in order:
1. **Did search happen?** If not, backend might not understand "search" intent
2. **Did page load?** If stuck, check network
3. **Did voice announcement play?** Check:
   - Backend logs for `/ai/search-analyze` call
   - Content script extracted results (check console)
   - TTS is not muted

### ✅ Test 4: Ask Questions (Q&A)

**What to do:**
1. Go to Wikipedia article about Python
2. Say: **"summarize this page"** (wait for summary)
3. Say: **"what is Python used for?"**

**What SHOULD happen:**
- You hear an answer based on the page content

## Debugging Tools

### Check if Backend is Running

```bash
curl http://localhost:5000/health
# Should return: "OK"
```

### Check Backend Endpoints Manually

```bash
# Test intent classification
curl -X POST http://localhost:5000/ai/intent \
  -H "Content-Type: application/json" \
  -d '{"utterance":"summarize this page","pageMap":{},"memory":{},"locale":"en"}'

# Should return JSON with intent
```

### Enable Verbose Logging

In popup, run:
```javascript
// See EVERYTHING
localStorage.setItem('viva_debug', '1')

// Turn off debug mode
localStorage.removeItem('viva_debug')
```

### Check Extension Permissions

Go to `chrome://extensions/`, click "Details" on Viva.AI:
- ✅ "Allow on all sites" should be ON
- ✅ "Storage" permission granted
- ✅ "Access your tabs" permission granted

## Common Issues & Fixes

| Problem | Cause | Fix |
|---------|-------|-----|
| "Failed to fetch" | Backend not running | Run `npm run dev` in terminal |
| Extension icon grayed out | Not loaded properly | Reload extension in chrome://extensions/ |
| No speech recognition | Microphone blocked | Allow microphone in Chrome settings |
| No TTS output | Volume muted | Check system volume and Chrome audio |
| "Backend error (401)" | Missing API key | Add GEMINI_API_KEY to .env file |
| Tab switch does nothing | No matching tabs | Open a tab first, try exact name |
| Search has no voice | Page still loading | Wait 3-5 seconds after search |
| Summarization silent | TTS failed | Check browser console for errors |

## Advanced Debugging

### See Persistent Memory

In popup console:
```javascript
chrome.storage.local.get('viva_persistent_memory', (data) => {
  console.log('Saved articles:', data.viva_persistent_memory?.articles?.length);
  console.log('Saved conversations:', data.viva_persistent_memory?.conversations?.length);
});
```

### Clear Memory

```javascript
chrome.storage.local.remove('viva_persistent_memory');
```

### Test Specific Endpoint

```javascript
fetch('http://localhost:5000/ai/summarize', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    content: 'This is a test article about Python programming.',
    url: 'https://test.com',
    title: 'Test'
  })
}).then(r => r.json()).then(console.log);
```

## Report a Bug

When reporting issues, please include:

1. **What you said:** "summarize this page"
2. **What page:** https://en.wikipedia.org/wiki/Python_(programming_language)
3. **What happened:** "Nothing, just says 'Error: Backend error (500)'"
4. **Backend logs:** Copy the error from terminal
5. **Browser console:** Copy errors from F12 console
6. **Debug logs:** Enable debug mode and copy relevant logs

Example good bug report:
```
ISSUE: Summarization doesn't work
- Said: "summarize this page"
- Page: Wikipedia Python article
- Backend error: "POST /ai/summarize 500 - Error: Gemini API quota exceeded"
- Browser console: "Backend error (500): Error processing request"
```

---

**Remember:**
1. ✅ Backend MUST be running (`npm run dev`)
2. ✅ Enable debug mode to see what's happening
3. ✅ Check both backend terminal AND browser console for errors
4. ✅ Test on simple pages first (Wikipedia works well)
