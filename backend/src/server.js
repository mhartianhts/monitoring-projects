import { appConfig } from "./config/app.js";
import { createApp } from "./app.js";

const { httpServer } = createApp();

httpServer.listen(appConfig.port, "0.0.0.0", () => {
  console.log(`[lpm] backend listening on http://127.0.0.1:${appConfig.port}`);
  console.log(`[lpm] projects root: ${appConfig.projectsRoot}`);
});
