# Quick Start Guide - Standalone Backend

**If you're getting `workspace:*` errors, follow these steps:**

## Step 1: Navigate to backend
```cmd
cd apps/backend
```

## Step 2: Copy shared files into backend
```cmd
mkdir prompts
mkdir schemas
mkdir utils

xcopy ..\..\packages\prompts\*.js prompts\ /Y
xcopy ..\..\packages\schemas\*.js schemas\ /Y
xcopy ..\..\packages\utils\*.js utils\ /Y
```

## Step 3: Use standalone package.json
```cmd
del package.json
ren package-standalone.json package.json
```

## Step 4: Update imports in server.js and routes/ai.js

Change:
```js
import { intentPrompt } from '@viva-ai/prompts/intent_prompt.js';
```

To:
```js
import { intentPrompt } from './prompts/intent_prompt.js';
```

Do this for all imports from `@viva-ai/`

## Step 5: Install and run
```cmd
npm install
node server.js
```

---

**OR use the full monorepo approach:**

From root directory:
```cmd
npm install
npm run dev
```

This should work with npm 7+
