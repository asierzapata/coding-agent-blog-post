import { styleText } from "node:util";
import * as readline from "node:readline/promises";
import ollama from "ollama";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { glob } from "glob";

const execAsync = promisify(exec);

async function executeCommand(command) {
  try {
    const { stdout, stderr } = await execAsync(command);
    if (stderr && !stdout) return { data: null, errorCode: stderr };
    return { data: stdout, errorCode: null };
  } catch (error) {
    return { data: null, errorCode: error.message };
  }
}

const terminal = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const messages = [
  {
    role: "system",
    content: `
      Core Identity: You are an interactive CLI tool that helps with software engineering tasks.

      Key Guidelines:
      - Concise communication: Short, direct responses formatted in GitHub-flavored markdown
      - Professional objectivity: Prioritize technical accuracy over validation; correct mistakes directly
      - Minimal emoji use: Only when explicitly requested
      - Tool preference: Use specialized tools over bash commands for file operations

      Coding Approach:
      - Always read code before modifying it
      - Avoid over-engineering - only make requested changes
      - Don't add unnecessary abstractions, comments, or features
      - Watch for security vulnerabilities (XSS, SQL injection, etc.)
      - Delete unused code completely rather than commenting it out
    `,
  },
];

const availableTools = {
  findFiles,
  searchFileContents,
  readFile,
  createFile,
  editFile,
};

const tools = [
  {
    type: "function",
    function: {
      name: "findFiles",
      description: "Find files in the project matching a pattern",
      parameters: {
        type: "object",
        required: ["pattern"],
        properties: {
          pattern: {
            type: "string",
            description: 'The glob pattern to search for (e.g. "**/*.js")',
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "searchFileContents",
      description: "Search for text patterns within files",
      parameters: {
        type: "object",
        required: ["pattern"],
        properties: {
          pattern: {
            type: "string",
            description: "The text or regex pattern to search for",
          },
          searchPath: {
            type: "string",
            description: 'The directory to search in (default: ".")',
          },
          globPattern: {
            type: "string",
            description: 'File pattern to include (e.g. "*.js")',
          },
          caseInsensitive: {
            type: "boolean",
            description: "Whether to ignore case",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "readFile",
      description: "Read the contents of a file",
      parameters: {
        type: "object",
        required: ["filePath"],
        properties: {
          filePath: {
            type: "string",
            description: "The path to the file",
          },
          offset: {
            type: "integer",
            description: "Line number to start reading from (default: 1)",
          },
          limit: {
            type: "integer",
            description: "Number of lines to read (default: 2000)",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "createFile",
      description: "Create a new file with content",
      parameters: {
        type: "object",
        required: ["filePath", "content"],
        properties: {
          filePath: {
            type: "string",
            description: "The path for the new file",
          },
          content: {
            type: "string",
            description: "The content to write to the file",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "editFile",
      description: "Edit a file by replacing text",
      parameters: {
        type: "object",
        required: ["filePath", "oldString", "newString"],
        properties: {
          filePath: {
            type: "string",
            description: "The path to the file",
          },
          oldString: {
            type: "string",
            description: "The existing text to be replaced",
          },
          newString: {
            type: "string",
            description: "The new text to replace with",
          },
          replaceAll: {
            type: "boolean",
            description: "Whether to replace all occurrences",
          },
        },
      },
    },
  },
];

export async function findFiles({ pattern }) {
  try {
    let files = await glob(pattern, { ignore: "node_modules/**" });
    files = files.map((file) => path.join(process.cwd(), file));
    return JSON.stringify(files);
  } catch (error) {
    return `Error finding files: ${error.message}`;
  }
}

export async function searchFileContents({
  pattern,
  searchPath = ".",
  globPattern,
  caseInsensitive,
}) {
  let flags = "-rn";
  if (caseInsensitive) flags += "i";

  const includeFlag = globPattern ? `--include="${globPattern}"` : "";

  const command = `grep ${flags} ${includeFlag} "${pattern}" "${searchPath}"`;
  const { data, errorCode } = await executeCommand(command);

  if (errorCode && !data) {
    return "No matches found.";
  }
  return data.trim();
}

export async function readFile({ filePath, offset = 1, limit = 2000 }) {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const lines = content.split("\n");
    const selectedLines = lines
      .slice(offset - 1, offset - 1 + limit)
      .map((line, index) => `${offset + index} | ${line}`)
      .join("\n");
    return selectedLines;
  } catch (error) {
    return `Error reading file: ${error.message}`;
  }
}

export async function createFile({ filePath, content }) {
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, "utf-8");
    return `File created successfully at ${filePath}`;
  } catch (error) {
    return `Error creating file: ${error.message}`;
  }
}

export async function editFile({ filePath, oldString, newString, replaceAll }) {
  try {
    const content = await fs.readFile(filePath, "utf-8");

    if (!content.includes(oldString)) {
      return "Error: oldString not found in file. Please ensure exact matching including indentation.";
    }

    const newContent = replaceAll
      ? content.split(oldString).join(newString)
      : content.replace(oldString, newString);

    await fs.writeFile(filePath, newContent, "utf-8");

    return `File edited successfully at ${filePath}`;
  } catch (error) {
    return `Error editing file: ${error.message}`;
  }
}

async function callAgent(messages) {
  process.stdout.write(`${styleText(["yellowBright", "bold"], "Agent")}: `);

  const response = await ollama.chat({
    model: "ministral-3:8b",
    // model: "devstral-small-2:24b",
    messages,
    stream: true,
    tools,
  });

  let fullResponse = "";
  let toolCalls = [];

  for await (const part of response) {
    process.stdout.write(part.message.content);
    fullResponse += part.message.content;

    if (part.message.tool_calls) {
      toolCalls = part.message.tool_calls;
    }
  }
  process.stdout.write("\n");

  messages.push({
    role: "assistant",
    content: fullResponse,
    tool_calls: toolCalls.length ? toolCalls : undefined,
  });

  return toolCalls;
}

async function executeTool(toolCall) {
  const functionName = toolCall.function.name;
  const functionArgs = toolCall.function.arguments;

  console.log(
    `${styleText(["dim"], `[Tool Call: ${functionName}] inputs: ${JSON.stringify(functionArgs)}`)}`,
  );

  const tool = availableTools[functionName];
  if (!tool) {
    return `Error: Tool ${functionName} not found.`;
  }

  try {
    return await tool(functionArgs);
  } catch (err) {
    return `Error executing ${functionName}: ${err.message}`;
  }
}

export async function chat() {
  while (true) {
    const userInput = await terminal.question(
      `${styleText(["blueBright", "bold"], "You")}: `,
    );

    messages.push({ role: "user", content: userInput });

    while (true) {
      const toolCalls = await callAgent(messages);

      if (!toolCalls.length) {
        break;
      }

      for (const toolCall of toolCalls) {
        const result = await executeTool(toolCall);
        messages.push({
          role: "tool",
          content: result,
          name: toolCall.function.name,
        });
      }
    }
  }
}

chat();
