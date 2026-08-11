const fs = require("fs");

const configs = [
  {
    file: "D:/mhartian/project/ai_agent_lsp/project.config.json",
    data: {
      name: "AI Agent LSP",
      type: "python",
      start: "venv\\Scripts\\python.exe app.py",
      port: 5000,
      cwd: ".",
    },
  },
  {
    file: "D:/mhartian/project/api-dmsedu-id/project.config.json",
    data: {
      name: "API DMS Edu",
      type: "python",
      start: "venv\\Scripts\\python.exe app.py",
      port: 5559,
      cwd: ".",
    },
  },
  {
    file: "D:/mhartian/gass/monitoring/examples/project.config.python.json",
    data: {
      name: "API Example",
      type: "python",
      start: "venv\\Scripts\\python.exe app.py",
      port: 5000,
      cwd: ".",
    },
  },
];

for (const { file, data } of configs) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  console.log(file, "=>", parsed.start);
}
