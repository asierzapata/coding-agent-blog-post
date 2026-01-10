import { styleText } from "node:util";
import * as readline from "node:readline/promises";

const terminal = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const messages = [];

async function callChat(messages) {
  const response = await fetch("http://localhost:11434/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "ministral-3:8b",
      messages: messages,
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama API Error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.message.content;
}

export async function chat() {
  while (true) {
    const userInput = await terminal.question(
      `${styleText(["blueBright", "bold"], "You")}: `,
    );

    messages.push({ role: "user", content: userInput });

    const response = await callChat(messages);
    messages.push({ role: "assistant", content: response });

    console.log(`${styleText(["yellowBright", "bold"], "Agent")}: ${response}`);
  }
}

chat();
