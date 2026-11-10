import { z } from "zod";

export const decisionSchema = z.object({
  requestId: z.string().min(1),
  decision: z.enum(["approve", "reject"]),
  note: z.string().max(500).optional(),
}).strict();
