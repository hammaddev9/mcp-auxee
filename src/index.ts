import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3003);

app.use(cors({ origin: true }));
app.use(bodyParser.json());

type Note = {
  id: string;
  title: string;
  content: string;
  tags?: string[];
  createdAt: string;
};

const memory: { notes: Note[] } = {
  notes: [
    {
      id: "n1",
      title: "Welcome to Auxee Notes",
      content: "You can create, list, and view notes from ChatGPT now 🎉",
      tags: ["demo"],
      createdAt: new Date().toISOString(),
    },
    {
      id: "n2",
      title: "Next Actions",
      content: "- Wire bookmarks\n- Add summarize tool\n- Connect org auth if needed",
      tags: ["todo"],
      createdAt: new Date().toISOString(),
    },
  ],
};

const escapeXML = (s: string) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function getBaseUrl(req: express.Request) {
  const env = process.env.MCP_PUBLIC_URL;
  if (env) return env.replace(/\/+$/, "");
  const host = (req.headers["x-forwarded-host"] || req.headers.host || "") as string;
  const proto = (req.headers["x-forwarded-proto"] as string) || "http";
  return `${proto}://${host}`;
}

app.use((req, _res, next) => {
  console.log(`🛰️ ${req.method} ${req.url}`);
  if (Object.keys(req.body || {}).length) {
    console.log("📦", JSON.stringify(req.body, null, 2));
  }
  next();
});

const APP_DIST = process.env.APP_UI_DIR
  ? path.resolve(process.env.APP_UI_DIR)
  : path.resolve(process.cwd(), "../apps-sdk-auxee/dist");

if (fs.existsSync(APP_DIST)) {
  app.use("/app", express.static(APP_DIST, { index: "index.html" }));
  console.log("Apps UI mounted at /app ->", APP_DIST);
} else {
  console.warn("Missing /app UI at:", APP_DIST);
}

app.get("/ping", (_req, res) => res.json({ ok: true }));

app.get("/notes", (_req, res) => res.json({ notes: memory.notes }));

app.get("/notes/ui", (_req, res) => {
  const list = memory.notes
    .map(
      (n) => `
      <div style="border:1px solid #ddd;padding:10px;margin:10px;border-radius:8px;background:#fafafa">
        <h3>${escapeXML(n.title)}</h3>
        <p>${escapeXML(n.content)}</p>
        <small>${n.tags?.join(", ") || ""}</small>
      </div>`
    )
    .join("");
  res.send(`
    <html><head><title>Auxee Notes</title></head>
    <body style="font-family:sans-serif;background:#f0f2f5;padding:20px;">
      <h2>Auxee Notes</h2>
      ${list}
      <p style="margin-top:20px;">
        <a href="/app" style="color:blue;">Open Full App UI</a>
      </p>
    </body></html>`);
});

app.post("/", async (req, res) => {
  const { id, method } = req.body;

  if (method === "initialize") {
    return res.json({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2025-06-18",
        capabilities: { tools: { listChanged: true } },
        serverInfo: { name: "auxee-mcp", version: "2.0.0" },
      },
    });
  }

  if (method === "tools/list") {
    return res.json({
      jsonrpc: "2.0",
      id,
      result: {
        tools: [
          {
            name: "get_notes",
            description: "List notes",
            inputSchema: { type: "object" },
          },
          {
            name: "create_note",
            description: "Create a note",
            inputSchema: {
              type: "object",
              required: ["title", "content"],
              properties: {
                title: { type: "string" },
                content: { type: "string" },
                tags: { type: "array", items: { type: "string" } },
              },
            },
          },
        ],
      },
    });
  }

  if (method === "tools/call") {
    const { name, arguments: args = {} } = req.body.params || {};
    const base = getBaseUrl(req);
    const view = (state: any) => ({
      type: "ui",
      url: `${base}/app/`,
      state,
    });

   if (name === "get_notes") {
  const text =
    memory.notes.map((n) => `- **${n.title}** (${n.id})`).join("\n") || "_(no notes yet)_";
  return res.json({
    jsonrpc: "2.0",
    id,
    result: {
      content: [
        { type: "text", text },
        { type: "ui", url: `${base}/app/`, state: { notes: memory.notes } },
      ],
    },
  });
}


    if (name === "create_note") {
      const { title, content, tags = [] } = args;
      const note: Note = {
        id: `n${Date.now()}`,
        title,
        content,
        tags,
        createdAt: new Date().toISOString(),
      };
      memory.notes.unshift(note);
      return res.json({
        jsonrpc: "2.0",
        id,
        result: {
          content: [
            { type: "text", text: `Created note **${title}** (${note.id})` },
            view({ notes: memory.notes }),
          ],
        },
      });
    }

    return res.json({
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: "Unknown tool" },
    });
  }

  if (method === "notifications/initialized") return res.status(204).end();
  return res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`MCP server running on http://localhost:${PORT}`);
});
