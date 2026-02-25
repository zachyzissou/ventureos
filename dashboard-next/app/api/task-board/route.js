import { proxyTaskBoardRequest } from "../../../lib/task-board-proxy.js";

export async function GET(request) {
  return proxyTaskBoardRequest(request, "/api/task-board");
}

export async function POST(request) {
  return proxyTaskBoardRequest(request, "/api/task-board");
}
