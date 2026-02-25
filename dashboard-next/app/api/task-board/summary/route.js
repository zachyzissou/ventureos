import { proxyTaskBoardRequest } from "../../../../lib/task-board-proxy.js";

export async function GET(request) {
  return proxyTaskBoardRequest(request, "/api/task-board/summary");
}
