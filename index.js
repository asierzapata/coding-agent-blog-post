import { styleText } from "node:util";
import * as readline from "node:readline/promises";
import ollama from "ollama";

const terminal = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const messages = [];

export async function chat() {
  while (true) {
    const userInput = await terminal.question(
      `${styleText(["blueBright", "bold"], "You")}: `,
    );

    messages.push({ role: "user", content: userInput });

    process.stdout.write(`${styleText(["yellowBright", "bold"], "Agent")}: `);

    const response = await ollama.chat({
      model: "ministral-3:8b",
      messages: messages,
      stream: true,
    });

    let fullResponse = "";
    for await (const part of response) {
      process.stdout.write(part.message.content);
      fullResponse += part.message.content;
    }
    process.stdout.write("\n");

    messages.push({ role: "assistant", content: fullResponse });
  }
}

chat();
