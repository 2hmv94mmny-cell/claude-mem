import { useRef, useState } from "react";
import {
  ActivityIndicator, FlatList, KeyboardAvoidingView, Platform,
  Pressable, SafeAreaView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import * as Speech from "expo-speech";
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL ?? "http://localhost:3000";

type Msg = { role: "user" | "assistant"; content: string };

export default function App() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [listening, setListening] = useState(false);
  const [thinking, setThinking] = useState(false);
  const transcript = useRef("");

  useSpeechRecognitionEvent("result", (e) => {
    transcript.current = e.results[0]?.transcript ?? "";
    setInput(transcript.current);
  });
  useSpeechRecognitionEvent("end", () => {
    setListening(false);
    if (transcript.current.trim()) send(transcript.current);
  });
  useSpeechRecognitionEvent("error", () => setListening(false));

  async function toggleMic() {
    if (listening) return ExpoSpeechRecognitionModule.stop();
    const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!granted) return;
    Speech.stop();
    transcript.current = "";
    setListening(true);
    ExpoSpeechRecognitionModule.start({ lang: "en-US", interimResults: true });
  }

  async function send(text: string) {
    const content = text.trim();
    if (!content || thinking) return;
    const next: Msg[] = [...messages, { role: "user", content }];
    setMessages(next);
    setInput("");
    setThinking(true);
    try {
      const res = await fetch(`${SERVER_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data = await res.json();
      const reply: string = data.reply ?? `Error: ${data.error ?? res.status}`;
      setMessages([...next, { role: "assistant", content: reply }]);
      Speech.speak(reply, { rate: 1.0, pitch: 0.9 });
    } catch {
      setMessages([...next, { role: "assistant", content: "I can't reach the server, sir." }]);
    } finally {
      setThinking(false);
    }
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />
      <Text style={styles.title}>J.A.R.V.I.S.</Text>
      <FlatList
        style={styles.list}
        data={[...messages].reverse()}
        inverted
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item }) => (
          <View style={[styles.bubble, item.role === "user" ? styles.user : styles.bot]}>
            <Text style={styles.text}>{item.content}</Text>
          </View>
        )}
      />
      {thinking && <ActivityIndicator color="#4fc3f7" style={{ margin: 8 }} />}
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.row}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Ask Jarvis..."
            placeholderTextColor="#667"
            onSubmitEditing={() => send(input)}
          />
          <Pressable style={[styles.mic, listening && styles.micOn]} onPress={toggleMic}>
            <Text style={styles.micText}>{listening ? "■" : "🎤"}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0a0f1a", paddingTop: Platform.OS === "android" ? 32 : 0 },
  title: { color: "#4fc3f7", fontSize: 22, fontWeight: "700", textAlign: "center", letterSpacing: 4, marginVertical: 12 },
  list: { flex: 1, paddingHorizontal: 16 },
  bubble: { padding: 12, borderRadius: 14, marginVertical: 4, maxWidth: "85%" },
  user: { alignSelf: "flex-end", backgroundColor: "#1e3a5f" },
  bot: { alignSelf: "flex-start", backgroundColor: "#16202e", borderWidth: 1, borderColor: "#4fc3f7" },
  text: { color: "#e6edf3", fontSize: 16 },
  row: { flexDirection: "row", padding: 12, gap: 8 },
  input: { flex: 1, backgroundColor: "#16202e", color: "#e6edf3", borderRadius: 24, paddingHorizontal: 16, fontSize: 16 },
  mic: { width: 52, height: 52, borderRadius: 26, backgroundColor: "#1e3a5f", alignItems: "center", justifyContent: "center" },
  micOn: { backgroundColor: "#c62828" },
  micText: { fontSize: 22, color: "#fff" },
});
