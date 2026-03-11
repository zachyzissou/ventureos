import { proxyTaskBoardRequest } from "../../../../lib/task-board-proxy.js";

export async function PATCH(request, { params }) {
  const taskId = String(params?.taskId ?? "").trim();
  if (!taskId) {
    return Response.json({ ok: false, error: "Task id is required" }, { status: 400 });
  }
  const encodedTaskId = encodeURIComponent(taskId);
  return proxyTaskBoardRequest(request, `/api/task-board/${encodedTaskId}`);
}
