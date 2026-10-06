# Jarvis

A voice + text AI assistant for your phone, powered by Claude.

- `server/`: a small Node server that holds your Anthropic API key and talks to Claude.
- `app/`: an Expo (React Native) mobile app. Tap the mic to talk; Jarvis speaks its replies.

## Run it

1. **Server** (on your computer):
   ```bash
   cd server && npm install
   ANTHROPIC_API_KEY=sk-ant-... npm start
   ```
2. **App**:
   ```bash
   cd app && npm install
   cp .env.example .env   # set EXPO_PUBLIC_SERVER_URL to your computer's LAN IP:3000
   npx expo run:android   # or: npx expo run:ios
   ```
   Speech recognition is a native module, so it needs a development build (`expo run:*` or EAS Build). It doesn't work in Expo Go.
