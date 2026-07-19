import { createMockServer } from "./server.js";

const port = Number(process.env.PORT ?? 4000);
const { app } = createMockServer();

app.listen(port, () => {
  console.log(`[mock] Coinflow oracle on http://localhost:${port}`);
  console.log("[mock] real surface : POST /api/checkout/{zero-authorization/:m | card-on-file | token/:m | card/:m}");
  console.log("[mock] control plane: GET /__mock__/health | POST /__mock__/{reset,config} | GET /__mock__/log");
});
